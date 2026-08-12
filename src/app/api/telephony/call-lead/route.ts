import { NextResponse } from "next/server";
import { z } from "zod";
import {
  normalizeCallableNumber,
  normalizedContactPhone,
} from "@/lib/phone-normalization";
import { prisma } from "@/lib/prisma";
import {
  lifecycleOpportunityDataForPipelineStage,
  recordSalesOpportunityCreated,
} from "@/lib/sales/lifecycle";
import { userCanAccessCallLogRecord } from "@/lib/crm-resource-access";
import {
  parseSalesDefaults,
  resolveSalesDefaultOwnerId,
} from "@/lib/sales/defaults";
import { getCrmSettings } from "@/lib/settings";
import { requireBrowserSoftphoneUser } from "@/lib/telephony/authorization";
import { parseWorkspaceDefaults } from "@/lib/workspace-defaults";

const payloadSchema = z.object({
  callLogId: z.string().trim().min(1).optional(),
  phone: z.string().trim().min(3).optional(),
  callerName: z.string().trim().max(160).optional(),
});

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function displayPhone(phone: string | null | undefined) {
  return phone?.trim() || "unknown caller";
}

function isGenericCallerName(value: string | null | undefined) {
  const text = value?.trim().toLowerCase();
  return !text || text === "incoming call" || text === "unknown caller";
}

function contactName(callerName: string | null | undefined) {
  const cleanCallerName = callerName?.trim();

  if (cleanCallerName && !isGenericCallerName(cleanCallerName)) {
    const parts = cleanCallerName.split(/\s+/).filter(Boolean);
    return {
      firstName: parts[0] ?? "Phone",
      lastName: parts.slice(1).join(" ") || "Lead",
    };
  }

  return {
    firstName: "Phone",
    lastName: "Lead",
  };
}

export async function POST(request: Request) {
  const authorization = await requireBrowserSoftphoneUser();

  if (!authorization.ok) {
    return authorization.response;
  }

  const parsed = payloadSchema.safeParse(await request.json().catch(() => ({})));

  if (!parsed.success) {
    return jsonError("Provide the call or caller number to generate a lead.", 400);
  }

  const callLog = parsed.data.callLogId
    ? await prisma.callLog.findUnique({
        where: { id: parsed.data.callLogId },
        select: {
          id: true,
          callSid: true,
          direction: true,
          fromNumber: true,
          toNumber: true,
          contactId: true,
          opportunityId: true,
          opportunity: {
            select: {
              ownerId: true,
            },
          },
          queueEntries: {
            select: {
              assignedUserId: true,
            },
          },
          attribution: true,
          metadata: true,
          startedAt: true,
          userId: true,
        },
      })
    : null;

  if (parsed.data.callLogId && !callLog) {
    return jsonError("The selected call could not be found.", 404);
  }

  if (callLog && !(await userCanAccessCallLogRecord(callLog, authorization.user))) {
    return jsonError("The selected call could not be found.", 404);
  }

  if (callLog?.opportunityId) {
    return NextResponse.json({
      ok: true,
      contactId: callLog.contactId,
      opportunityId: callLog.opportunityId,
      saleProfileHref: `/sales/${callLog.opportunityId}`,
      existing: true,
    });
  }

  const rawPhone =
    parsed.data.phone ||
    (callLog?.direction === "OUTBOUND" ? callLog.toNumber : callLog?.fromNumber) ||
    callLog?.toNumber ||
    "";
  const phone = normalizeCallableNumber(rawPhone) ?? rawPhone.trim();

  if (!phone) {
    return jsonError("The caller number is missing.", 400);
  }

  const occurredAt = new Date();
  const names = contactName(parsed.data.callerName);
  const title = `Phone enquiry from ${displayPhone(phone)}`;
  const settings = await getCrmSettings();
  const workspaceDefaults = parseWorkspaceDefaults(settings.workspaceDefaults);
  const salesDefaults = parseSalesDefaults(settings.salesDefaults);

  const result = await prisma.$transaction(async (tx) => {
    const contact = callLog?.contactId
      ? await tx.contact.findUnique({
          where: { id: callLog.contactId },
          select: { id: true, companyId: true },
        })
      : null;
    const leadContact =
      contact ??
      (await tx.contact.create({
        data: {
          ...names,
          createdByUserId: authorization.user.id,
          phone,
          phoneNormalized: normalizedContactPhone(phone),
          leadSource: "Phone call",
          role: "Inbound phone lead",
        },
        select: { id: true, companyId: true },
      }));
    const lifecycleData = await lifecycleOpportunityDataForPipelineStage(
      tx,
      salesDefaults.defaultSalesPipelineStageId,
      "LEAD",
      occurredAt,
    );
    const opportunity = await tx.salesOpportunity.create({
      data: {
        title,
        ...lifecycleData,
        valueCents: 0,
        currency: workspaceDefaults.currency,
        source: "Phone call",
        nextStep: "Run discovery, assign products and qualify the enquiry.",
        ownerId: resolveSalesDefaultOwnerId({
          fallbackUserId: authorization.user.id,
          salesDefaults,
        }),
        contactId: leadContact.id,
        companyId: leadContact.companyId,
        attribution: callLog?.attribution ?? undefined,
      },
      select: { id: true },
    });

    await recordSalesOpportunityCreated(tx, {
      opportunityId: opportunity.id,
      occurredAt,
      salesPipelineStageId: lifecycleData.salesPipelineStageId,
      source: "softphone-call-lead",
      stage: lifecycleData.stage,
      userId: authorization.user.id,
    });

    const communication = await tx.salesCommunication.create({
      data: {
        opportunityId: opportunity.id,
        contactId: leadContact.id,
        userId: authorization.user.id,
        channel: "PHONE",
        direction: callLog?.direction === "OUTBOUND" ? "OUTBOUND" : "INBOUND",
        subject: "Phone call lead generated",
        summary: `Lead generated from phone call with ${displayPhone(phone)}.`,
        fromAddress: callLog?.fromNumber ?? phone,
        toAddress: callLog?.toNumber ?? null,
        externalId: callLog?.callSid ?? null,
        metadata: {
          source: "softphone-call-lead",
          callLogId: callLog?.id ?? null,
        },
        occurredAt: callLog?.startedAt ?? occurredAt,
      },
      select: { id: true },
    });

    if (callLog) {
      await tx.callLog.update({
        where: { id: callLog.id },
        data: {
          contactId: leadContact.id,
          opportunityId: opportunity.id,
          userId: authorization.user.id,
          metadata: {
            ...(callLog.metadata && typeof callLog.metadata === "object"
              ? callLog.metadata
              : {}),
            generatedLead: true,
            generatedLeadAt: occurredAt.toISOString(),
            generatedLeadByUserId: authorization.user.id,
            generatedLeadCommunicationId: communication.id,
          },
        },
      });

      await tx.callQueueEntry.updateMany({
        where: {
          OR: [{ callLogId: callLog.id }, ...(callLog.callSid ? [{ callSid: callLog.callSid }] : [])],
        },
        data: {
          contactId: leadContact.id,
          opportunityId: opportunity.id,
        },
      });

      await tx.attributionRecord.updateMany({
        where: { callLogId: callLog.id },
        data: {
          contactId: leadContact.id,
          opportunityId: opportunity.id,
        },
      });
    }

    return {
      contactId: leadContact.id,
      opportunityId: opportunity.id,
    };
  });

  return NextResponse.json({
    ok: true,
    ...result,
    saleProfileHref: `/sales/${result.opportunityId}`,
    existing: false,
  });
}
