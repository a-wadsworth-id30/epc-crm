import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  normalizeContactEmailMethods,
  normalizeContactPhoneMethods,
} from "@/lib/contact-methods";
import {
  contactIdAccessWhere,
  salesOpportunityIdAccessWhere,
  userCanAccessCallLogRecord,
} from "@/lib/crm-resource-access";
import { prisma } from "@/lib/prisma";
import { findContactContext } from "@/lib/telephony/twilio-voice";
import type { CurrentUser } from "@/lib/auth";

function contactDisplayName(contact: {
  firstName: string;
  lastName: string;
} | null) {
  if (!contact) {
    return null;
  }

  return `${contact.firstName} ${contact.lastName}`.trim() || null;
}

function userDisplayName(user: {
  name: string;
  firstName: string | null;
  lastName: string | null;
} | null) {
  if (!user) {
    return null;
  }

  return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.name;
}

async function loadOpportunityContext(
  opportunityId: string | null,
  user: CurrentUser,
) {
  if (!opportunityId) {
    return null;
  }

  return prisma.salesOpportunity.findFirst({
    where: salesOpportunityIdAccessWhere(opportunityId, user),
    select: {
      id: true,
      title: true,
      stage: true,
      valueCents: true,
      currency: true,
      probability: true,
      source: true,
      nextStep: true,
      expectedCloseDate: true,
      owner: {
        select: {
          name: true,
          firstName: true,
          lastName: true,
        },
      },
      company: {
        select: {
          name: true,
        },
      },
      contact: {
        select: {
          additionalEmails: {
            orderBy: { createdAt: "asc" },
            select: { email: true, id: true, label: true },
          },
          additionalPhones: {
            orderBy: { createdAt: "asc" },
            select: { id: true, label: true, phone: true, phoneNormalized: true },
          },
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          role: true,
          companyName: true,
          company: {
            select: {
              name: true,
            },
          },
        },
      },
      communications: {
        orderBy: { occurredAt: "desc" },
        take: 1,
        select: {
          channel: true,
          direction: true,
          summary: true,
          occurredAt: true,
        },
      },
    },
  });
}

async function loadContactContext(contactId: string | null, user: CurrentUser) {
  if (!contactId) {
    return null;
  }

  return prisma.contact.findFirst({
    where: contactIdAccessWhere(contactId, user),
    select: {
      id: true,
      additionalEmails: {
        orderBy: { createdAt: "asc" },
        select: { email: true, id: true, label: true },
      },
      additionalPhones: {
        orderBy: { createdAt: "asc" },
        select: { id: true, label: true, phone: true, phoneNormalized: true },
      },
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      role: true,
      companyName: true,
      company: {
        select: {
          name: true,
        },
      },
    },
  });
}

function callerContextResponse({
  phone,
  contact,
  opportunity,
}: {
  phone: string;
  contact: Awaited<ReturnType<typeof loadContactContext>>;
  opportunity: Awaited<ReturnType<typeof loadOpportunityContext>>;
}) {
  const resolvedContact = opportunity?.contact ?? contact;
  const latestActivity = opportunity?.communications[0] ?? null;
  const secondaryEmails = resolvedContact
    ? normalizeContactEmailMethods(
        resolvedContact.additionalEmails,
        resolvedContact.email,
      )
    : [];
  const secondaryPhones = resolvedContact
    ? normalizeContactPhoneMethods(
        resolvedContact.additionalPhones,
        resolvedContact.phone,
      )
    : [];

  return NextResponse.json({
    matched: Boolean(resolvedContact?.id || opportunity?.id),
    displayName: contactDisplayName(resolvedContact),
    phone: resolvedContact?.phone ?? secondaryPhones[0]?.phone ?? phone,
    contactId: resolvedContact?.id ?? null,
    contactProfileHref: resolvedContact?.id ? `/contacts/${resolvedContact.id}` : null,
    email: resolvedContact?.email ?? secondaryEmails[0]?.email ?? null,
    role: resolvedContact?.role ?? null,
    companyName:
      opportunity?.company?.name ??
      resolvedContact?.company?.name ??
      resolvedContact?.companyName ??
      null,
    opportunityId: opportunity?.id ?? null,
    opportunityName: opportunity?.title ?? null,
    saleProfileHref: opportunity?.id ? `/sales/${opportunity.id}` : null,
    saleSummary: opportunity
      ? {
          title: opportunity.title,
          stage: opportunity.stage,
          valueCents: opportunity.valueCents,
          currency: opportunity.currency,
          probability: opportunity.probability,
          source: opportunity.source,
          nextStep: opportunity.nextStep,
          expectedCloseDate: opportunity.expectedCloseDate?.toISOString() ?? null,
          ownerName: userDisplayName(opportunity.owner),
          latestActivity: latestActivity
            ? {
                channel: latestActivity.channel,
                direction: latestActivity.direction,
                summary: latestActivity.summary,
                occurredAt: latestActivity.occurredAt.toISOString(),
              }
            : null,
        }
      : null,
  });
}

export async function GET(request: NextRequest) {
  const user = await requireUser();

  const phone = request.nextUrl.searchParams.get("phone") ?? "";
  const callLogId = request.nextUrl.searchParams.get("callLogId") ?? "";
  const contactId = request.nextUrl.searchParams.get("contactId") ?? "";
  const opportunityId = request.nextUrl.searchParams.get("opportunityId") ?? "";

  if (contactId || opportunityId) {
    const opportunity = await loadOpportunityContext(opportunityId || null, user);
    const contact = await loadContactContext(
      contactId || opportunity?.contact?.id || null,
      user,
    );

    return callerContextResponse({
      phone,
      contact,
      opportunity,
    });
  }

  if (callLogId) {
    const callLog = await prisma.callLog.findUnique({
      where: { id: callLogId },
      select: {
        fromNumber: true,
        toNumber: true,
        contactId: true,
        opportunityId: true,
        contact: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
        opportunity: {
          select: {
            ownerId: true,
            id: true,
            title: true,
          },
        },
        queueEntries: {
          select: {
            assignedUserId: true,
          },
        },
        userId: true,
      },
    });

    if (callLog && !(await userCanAccessCallLogRecord(callLog, user))) {
      return NextResponse.json({ matched: false, displayName: null });
    }

    if (callLog?.contact || callLog?.opportunityId) {
      const opportunity = await loadOpportunityContext(callLog.opportunityId, user);
      const contact = await loadContactContext(
        callLog.contactId || opportunity?.contact?.id || null,
        user,
      );

      return callerContextResponse({
        phone: callLog.fromNumber ?? callLog.toNumber ?? phone,
        contact,
        opportunity,
      });
    }
  }

  if (!phone) {
    return NextResponse.json({ matched: false, displayName: null });
  }

  const { contact, opportunity } = await findContactContext(phone);
  const detailedOpportunity = await loadOpportunityContext(
    opportunity?.id ?? null,
    user,
  );
  const detailedContact = await loadContactContext(
    contact?.id ?? detailedOpportunity?.contact?.id ?? null,
    user,
  );

  return callerContextResponse({
    phone,
    contact: detailedContact,
    opportunity: detailedOpportunity,
  });
}
