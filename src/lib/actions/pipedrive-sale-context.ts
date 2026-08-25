"use server";

import { requireUser } from "@/lib/auth";
import { salesOpportunityWhereWithAccess } from "@/lib/crm-resource-access";
import {
  getPipedriveReadOnlyClient,
  PipedriveApiError,
  pipedriveProvider,
} from "@/lib/integrations/pipedrive";
import {
  buildPipedriveSaleContext,
  type PipedriveSaleContextField,
  type PipedriveSaleContextItem,
} from "@/lib/integrations/pipedrive-sale-context";
import { prisma } from "@/lib/prisma";

export type PipedriveSaleContextStatus =
  | "missing-sale"
  | "not-configured"
  | "not-linked"
  | "provider-error"
  | "ready";

export type PipedriveSaleContextState = {
  customFields: PipedriveSaleContextField[];
  fetchedAt: string | null;
  leadId: string | null;
  leadTitle: string | null;
  leadUrl: string | null;
  message: string;
  ok: boolean;
  status: PipedriveSaleContextStatus;
  summary: PipedriveSaleContextItem[];
};

const pipedriveLeadExternalType = "lead";
const salesOpportunityExternalType = "salesOpportunity";

export async function readPipedriveSaleContextAction(
  saleId: string,
): Promise<PipedriveSaleContextState> {
  const user = await requireUser();
  const normalizedSaleId = String(saleId ?? "").trim();

  if (!normalizedSaleId) {
    return pipedriveContextState({
      message: "Sale record was not found.",
      ok: false,
      status: "missing-sale",
    });
  }

  const sale = await prisma.salesOpportunity.findFirst({
    where: salesOpportunityWhereWithAccess(user, { id: normalizedSaleId }),
    select: { id: true },
  });

  if (!sale) {
    return pipedriveContextState({
      message: "Sale record was not found.",
      ok: false,
      status: "missing-sale",
    });
  }

  const leadLink = await prisma.externalRecordLink.findFirst({
    where: {
      externalType: pipedriveLeadExternalType,
      internalId: sale.id,
      internalType: salesOpportunityExternalType,
      provider: pipedriveProvider,
    },
    select: { externalId: true },
  });

  if (!leadLink?.externalId) {
    return pipedriveContextState({
      message: "This sale is not linked to a Pipedrive lead.",
      ok: true,
      status: "not-linked",
    });
  }

  const client = await getPipedriveReadOnlyClient();
  if (!client) {
    return pipedriveContextState({
      leadId: leadLink.externalId,
      message: "Pipedrive is not configured.",
      ok: true,
      status: "not-configured",
    });
  }

  try {
    const [lead, leadFields, currentUser] = await Promise.all([
      client.getLead(leadLink.externalId),
      client.listLeadFields({ limit: 500 }),
      client.getCurrentUser(),
    ]);
    const context = buildPipedriveSaleContext({
      fields: leadFields.data,
      lead,
    });

    return pipedriveContextState({
      customFields: context.customFields,
      fetchedAt: new Date().toISOString(),
      leadId: leadLink.externalId,
      leadTitle: context.leadTitle,
      leadUrl: pipedriveLeadUrl(
        leadLink.externalId,
        currentUser.company_domain,
      ),
      message: "Pipedrive context loaded.",
      ok: true,
      status: "ready",
      summary: context.summary,
    });
  } catch (error) {
    return pipedriveContextState({
      leadId: leadLink.externalId,
      message: providerErrorMessage(error),
      ok: false,
      status: "provider-error",
    });
  }
}

function pipedriveContextState(
  state: Partial<PipedriveSaleContextState> &
    Pick<PipedriveSaleContextState, "message" | "ok" | "status">,
): PipedriveSaleContextState {
  return {
    customFields: state.customFields ?? [],
    fetchedAt: state.fetchedAt ?? null,
    leadId: state.leadId ?? null,
    leadTitle: state.leadTitle ?? null,
    leadUrl: state.leadUrl ?? null,
    message: state.message,
    ok: state.ok,
    status: state.status,
    summary: state.summary ?? [],
  };
}

function pipedriveLeadUrl(leadId: string, companyDomain: unknown) {
  const domain = String(companyDomain ?? "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/\.pipedrive\.com$/i, "");

  if (!domain || !/^[a-z0-9-]+$/i.test(domain)) return null;

  return `https://${domain}.pipedrive.com/leads/inbox/${encodeURIComponent(leadId)}`;
}

function providerErrorMessage(error: unknown) {
  if (error instanceof PipedriveApiError) {
    if (error.status === 404) return "Pipedrive lead was not found.";
    if (error.status === 401 || error.status === 403) {
      return "Pipedrive rejected the read request.";
    }

    return `Pipedrive read failed (${error.status}).`;
  }

  return "Pipedrive read failed.";
}
