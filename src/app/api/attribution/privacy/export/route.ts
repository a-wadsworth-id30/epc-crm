import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const exportSchema = z.object({
  identityType: z.enum(["visitorId", "sessionId"]),
  identityValue: z.string().trim().min(3),
});

const streamBatchSize = 250;
const idBatchSize = 100;

type WriteChunk = (value: string) => void;

type IdentityType = "visitorId" | "sessionId";

function identityWhere(identityType: IdentityType, identityValue: string) {
  return identityType === "visitorId"
    ? { visitorId: identityValue }
    : { sessionId: identityValue };
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function* splitIntoBatches<T>(items: T[], size = idBatchSize) {
  for (let index = 0; index < items.length; index += size) {
    yield items.slice(index, index + size);
  }
}

function jsonResponseStream(build: (write: WriteChunk) => Promise<void>) {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (value: string) => controller.enqueue(encoder.encode(value));

      try {
        await build(write);
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

async function writeArray<T>(
  write: WriteChunk,
  rows: AsyncIterable<T>,
) {
  let count = 0;
  let first = true;

  write("[");
  for await (const row of rows) {
    if (!first) {
      write(",");
    }
    write(JSON.stringify(row));
    first = false;
    count += 1;
  }
  write("]");

  return count;
}

async function* cursorPages<T extends { id: string }>(
  loadPage: (cursorId: string | null) => Promise<T[]>,
) {
  let cursorId: string | null = null;

  while (true) {
    const page = await loadPage(cursorId);
    if (!page.length) {
      break;
    }

    for (const row of page) {
      yield row;
    }

    cursorId = page[page.length - 1]?.id ?? null;
    if (page.length < streamBatchSize || !cursorId) {
      break;
    }
  }
}

async function* snapshotRows(where: Prisma.AttributionSnapshotWhereInput) {
  yield* cursorPages((cursorId) =>
    prisma.attributionSnapshot.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: streamBatchSize,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      select: {
        id: true,
        visitorId: true,
        sessionId: true,
        firstTouch: true,
        lastTouch: true,
        timeline: true,
        landingPage: true,
        currentPage: true,
        referrer: true,
        attributionSource: true,
        attributionMedium: true,
        attributionCampaign: true,
        attributionAdProvider: true,
        attributionClickId: true,
        attributionClickIdType: true,
        userAgent: true,
        ipAddress: true,
        location: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  );
}

async function* recordRows(where: Prisma.AttributionRecordWhereInput) {
  yield* cursorPages((cursorId) =>
    prisma.attributionRecord.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: streamBatchSize,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      select: {
        id: true,
        source: true,
        attributionSnapshotId: true,
        trackingPhoneNumberId: true,
        offlineCampaignId: true,
        visitorId: true,
        sessionId: true,
        contactId: true,
        opportunityId: true,
        callLogId: true,
        callQueueEntryId: true,
        firstTouch: true,
        lastTouch: true,
        timeline: true,
        landingPage: true,
        currentPage: true,
        referrer: true,
        trackingPhoneNumber: true,
        metadata: true,
        createdAt: true,
      },
    }),
  );
}

async function* assignmentRows(where: Prisma.AttributionNumberAssignmentWhereInput) {
  yield* cursorPages((cursorId) =>
    prisma.attributionNumberAssignment.findMany({
      where,
      orderBy: [{ lastSeenAt: "desc" }, { id: "desc" }],
      take: streamBatchSize,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      select: {
        id: true,
        phoneNumberId: true,
        attributionSnapshotId: true,
        visitorId: true,
        sessionId: true,
        assignedAt: true,
        expiresAt: true,
        lastSeenAt: true,
        metadata: true,
        phoneNumber: {
          select: {
            id: true,
            phoneNumber: true,
            label: true,
            destinationNumber: true,
            offlineCampaignId: true,
            isActive: true,
            priority: true,
            metadata: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    }),
  );
}

async function* debugEventRows(where: Prisma.AttributionDebugEventWhereInput) {
  yield* cursorPages((cursorId) =>
    prisma.attributionDebugEvent.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: streamBatchSize,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      select: {
        id: true,
        eventType: true,
        level: true,
        message: true,
        hostname: true,
        origin: true,
        path: true,
        visitorId: true,
        sessionId: true,
        attributionSnapshotId: true,
        metadata: true,
        userAgent: true,
        ipAddress: true,
        createdAt: true,
      },
    }),
  );
}

async function collectRecordLinks(where: Prisma.AttributionRecordWhereInput) {
  const contactIds = new Set<string>();
  const opportunityIds = new Set<string>();
  const callLogIds = new Set<string>();
  const callQueueEntryIds = new Set<string>();

  for await (const record of cursorPages((cursorId) =>
    prisma.attributionRecord.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: streamBatchSize,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      select: {
        id: true,
        contactId: true,
        opportunityId: true,
        callLogId: true,
        callQueueEntryId: true,
      },
    }),
  )) {
    if (record.contactId) contactIds.add(record.contactId);
    if (record.opportunityId) opportunityIds.add(record.opportunityId);
    if (record.callLogId) callLogIds.add(record.callLogId);
    if (record.callQueueEntryId) callQueueEntryIds.add(record.callQueueEntryId);
  }

  return {
    directContactIds: [...contactIds],
    directOpportunityIds: [...opportunityIds],
    directCallLogIds: [...callLogIds],
    directCallQueueEntryIds: [...callQueueEntryIds],
  };
}

async function collectOpportunityIds(
  opportunityFilters: Prisma.SalesOpportunityWhereInput[],
) {
  if (!opportunityFilters.length) return [];

  const ids: string[] = [];
  for await (const opportunity of cursorPages((cursorId) =>
    prisma.salesOpportunity.findMany({
      where: { OR: opportunityFilters },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      take: streamBatchSize,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      select: { id: true },
    }),
  )) {
    ids.push(opportunity.id);
  }

  return uniqueStrings(ids);
}

async function collectCallLogIds(callFilters: Prisma.CallLogWhereInput[]) {
  if (!callFilters.length) return [];

  const ids: string[] = [];
  for await (const callLog of cursorPages((cursorId) =>
    prisma.callLog.findMany({
      where: { OR: callFilters },
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      take: streamBatchSize,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      select: { id: true },
    }),
  )) {
    ids.push(callLog.id);
  }

  return uniqueStrings(ids);
}

async function collectQueueEntryIds(queueFilters: Prisma.CallQueueEntryWhereInput[]) {
  if (!queueFilters.length) return [];

  const ids: string[] = [];
  for await (const queueEntry of cursorPages((cursorId) =>
    prisma.callQueueEntry.findMany({
      where: { OR: queueFilters },
      orderBy: [{ queuedAt: "desc" }, { id: "desc" }],
      take: streamBatchSize,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      select: { id: true },
    }),
  )) {
    ids.push(queueEntry.id);
  }

  return uniqueStrings(ids);
}

async function countByIdBatches(
  ids: string[],
  countBatch: (ids: string[]) => Promise<number>,
) {
  let count = 0;
  for (const batch of splitIntoBatches(ids)) {
    count += await countBatch(batch);
  }
  return count;
}

async function* contactRows(contactIds: string[]) {
  for (const ids of splitIntoBatches(contactIds)) {
    const rows = await prisma.contact.findMany({
      where: { id: { in: ids } },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      select: {
        additionalEmails: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            label: true,
            email: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        additionalPhones: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            label: true,
            phone: true,
            phoneNormalized: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        role: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        county: true,
        postcode: true,
        country: true,
        companyId: true,
        companyName: true,
        attribution: true,
        aiGuidance: true,
        aiGuidanceGeneratedAt: true,
        createdAt: true,
        updatedAt: true,
        company: {
          select: {
            id: true,
            name: true,
            domain: true,
            status: true,
          },
        },
      },
    });
    yield* rows;
  }
}

async function* contactTagAssignmentRows(contactIds: string[]) {
  for (const ids of splitIntoBatches(contactIds)) {
    const rows = await prisma.contactTagAssignment.findMany({
      where: { contactId: { in: ids } },
      orderBy: { createdAt: "desc" },
      select: {
        contactId: true,
        tagId: true,
        createdAt: true,
        tag: { select: { id: true, name: true, slug: true } },
      },
    });
    yield* rows;
  }
}

async function* contactNoteRows(contactIds: string[]) {
  for (const ids of splitIntoBatches(contactIds)) {
    const rows = await prisma.note.findMany({
      where: { contactId: { in: ids } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        contactId: true,
        body: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { id: true, name: true, email: true } },
      },
    });
    yield* rows;
  }
}

async function* contactTaskRows(contactIds: string[]) {
  for (const ids of splitIntoBatches(contactIds)) {
    const rows = await prisma.task.findMany({
      where: { contactId: { in: ids } },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        dueDate: true,
        metadata: true,
        contactId: true,
        createdAt: true,
        updatedAt: true,
        assignee: { select: { id: true, name: true, email: true } },
        creator: { select: { id: true, name: true, email: true } },
      },
    });
    yield* rows;
  }
}

async function* opportunityRows(
  opportunityFilters: Prisma.SalesOpportunityWhereInput[],
) {
  if (!opportunityFilters.length) return;

  yield* cursorPages((cursorId) =>
    prisma.salesOpportunity.findMany({
      where: { OR: opportunityFilters },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      take: streamBatchSize,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      select: {
        id: true,
        title: true,
        stage: true,
        salesPipelineStageId: true,
        valueCents: true,
        currency: true,
        probability: true,
        source: true,
        nextStep: true,
        expectedCloseDate: true,
        ownerId: true,
        companyId: true,
        contactId: true,
        attribution: true,
        leadScope: true,
        score: true,
        scoreUpdatedAt: true,
        aiGuidance: true,
        aiGuidanceGeneratedAt: true,
        firstContactedAt: true,
        stageChangedAt: true,
        closedAt: true,
        lostReason: true,
        lostReasonNotes: true,
        createdAt: true,
        updatedAt: true,
        owner: { select: { id: true, name: true, email: true } },
        company: {
          select: {
            id: true,
            name: true,
            domain: true,
            status: true,
          },
        },
        contact: {
          select: {
            additionalEmails: {
              orderBy: { createdAt: "asc" },
              select: { id: true, label: true, email: true },
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
          },
        },
      },
    }),
  );
}

async function* lifecycleEventRows(opportunityIds: string[]) {
  for (const ids of splitIntoBatches(opportunityIds)) {
    const rows = await prisma.salesLifecycleEvent.findMany({
      where: { opportunityId: { in: ids } },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        opportunityId: true,
        eventType: true,
        fromStage: true,
        toStage: true,
        fromPipelineStageId: true,
        toPipelineStageId: true,
        lostReason: true,
        note: true,
        occurredAt: true,
        metadata: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true } },
      },
    });
    yield* rows;
  }
}

async function* discoveryAnswerRows(opportunityIds: string[]) {
  for (const ids of splitIntoBatches(opportunityIds)) {
    const rows = await prisma.opportunityDiscoveryAnswer.findMany({
      where: { opportunityId: { in: ids } },
      orderBy: [{ answeredAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        opportunityId: true,
        questionId: true,
        productId: true,
        categoryId: true,
        value: true,
        questionLabelSnapshot: true,
        questionHelpTextSnapshot: true,
        questionAnswerTypeSnapshot: true,
        questionAnswerModeSnapshot: true,
        questionVersionSnapshot: true,
        questionOptionsSnapshot: true,
        source: true,
        confidence: true,
        answeredAt: true,
        confirmedAt: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
        answeredByUser: { select: { id: true, name: true, email: true } },
      },
    });
    yield* rows;
  }
}

async function* opportunityProductRows(opportunityIds: string[]) {
  for (const ids of splitIntoBatches(opportunityIds)) {
    const rows = await prisma.opportunityProduct.findMany({
      where: { opportunityId: { in: ids } },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        opportunityId: true,
        productId: true,
        status: true,
        quantity: true,
        estimatedValueCents: true,
        source: true,
        confidence: true,
        notes: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            type: true,
          },
        },
      },
    });
    yield* rows;
  }
}

async function* leadScoreEventRows(opportunityIds: string[]) {
  for (const ids of splitIntoBatches(opportunityIds)) {
    const rows = await prisma.leadScoreEvent.findMany({
      where: { opportunityId: { in: ids } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        opportunityId: true,
        delta: true,
        scoreAfter: true,
        reason: true,
        source: true,
        metadata: true,
        createdAt: true,
      },
    });
    yield* rows;
  }
}

async function* communicationRows(
  communicationFilters: Prisma.SalesCommunicationWhereInput[],
) {
  if (!communicationFilters.length) return;

  yield* cursorPages((cursorId) =>
    prisma.salesCommunication.findMany({
      where: { OR: communicationFilters },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: streamBatchSize,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      select: {
        id: true,
        opportunityId: true,
        channel: true,
        direction: true,
        subject: true,
        summary: true,
        body: true,
        fromAddress: true,
        toAddress: true,
        externalId: true,
        metadata: true,
        occurredAt: true,
        contactId: true,
        userId: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  );
}

async function* emailMessageRows(communicationFilters: Prisma.EmailMessageWhereInput[]) {
  if (!communicationFilters.length) return;

  yield* cursorPages((cursorId) =>
    prisma.emailMessage.findMany({
      where: { OR: communicationFilters },
      orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
      take: streamBatchSize,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      select: {
        id: true,
        provider: true,
        providerMessageId: true,
        inboundRouteId: true,
        status: true,
        direction: true,
        fromName: true,
        fromAddress: true,
        toAddress: true,
        ccAddresses: true,
        subject: true,
        summary: true,
        textBody: true,
        htmlBody: true,
        attachments: true,
        metadata: true,
        receivedAt: true,
        readAt: true,
        contactId: true,
        opportunityId: true,
        salesCommunicationId: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  );
}

async function* callLogRows(callFilters: Prisma.CallLogWhereInput[]) {
  if (!callFilters.length) return;

  yield* cursorPages((cursorId) =>
    prisma.callLog.findMany({
      where: { OR: callFilters },
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      take: streamBatchSize,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      select: {
        id: true,
        direction: true,
        status: true,
        fromNumber: true,
        toNumber: true,
        fromIdentity: true,
        toIdentity: true,
        callSid: true,
        parentCallSid: true,
        conferenceSid: true,
        conferenceName: true,
        recordingSid: true,
        recordingUrl: true,
        recordingConsent: true,
        durationSeconds: true,
        provider: true,
        metadata: true,
        attribution: true,
        startedAt: true,
        answeredAt: true,
        endedAt: true,
        userId: true,
        contactId: true,
        opportunityId: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  );
}

async function* queueEntryRows(queueFilters: Prisma.CallQueueEntryWhereInput[]) {
  if (!queueFilters.length) return;

  yield* cursorPages((cursorId) =>
    prisma.callQueueEntry.findMany({
      where: { OR: queueFilters },
      orderBy: [{ queuedAt: "desc" }, { id: "desc" }],
      take: streamBatchSize,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      select: {
        id: true,
        status: true,
        callSid: true,
        conferenceName: true,
        fromNumber: true,
        toNumber: true,
        assignedUserId: true,
        callLogId: true,
        contactId: true,
        opportunityId: true,
        queuedAt: true,
        answeredAt: true,
        missedAt: true,
        completedAt: true,
        metadata: true,
        attribution: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  );
}

async function* fileAssetRows(fileAssetFilters: Prisma.FileAssetWhereInput[]) {
  if (!fileAssetFilters.length) return;

  yield* cursorPages((cursorId) =>
    prisma.fileAsset.findMany({
      where: { OR: fileAssetFilters },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: streamBatchSize,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      select: {
        id: true,
        storageProvider: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        checksum: true,
        entityType: true,
        entityId: true,
        visibility: true,
        uploadedById: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  );
}

export async function GET(request: Request) {
  const admin = await requireAdmin();

  const url = new URL(request.url);
  const parsed = exportSchema.safeParse({
    identityType: url.searchParams.get("identityType"),
    identityValue: url.searchParams.get("identityValue"),
  });

  if (!parsed.success) {
    return Response.json({ error: "Enter a visitor or session ID." }, { status: 400 });
  }

  const where = identityWhere(parsed.data.identityType, parsed.data.identityValue);
  const {
    directContactIds,
    directOpportunityIds,
    directCallLogIds,
    directCallQueueEntryIds,
  } = await collectRecordLinks(where);

  const contactIds = uniqueStrings(directContactIds);
  const opportunityFilters = [
    ...(directOpportunityIds.length ? [{ id: { in: directOpportunityIds } }] : []),
    ...(contactIds.length ? [{ contactId: { in: contactIds } }] : []),
  ];
  const opportunityIds = await collectOpportunityIds(opportunityFilters);
  const communicationFilters = [
    ...(opportunityIds.length ? [{ opportunityId: { in: opportunityIds } }] : []),
    ...(contactIds.length ? [{ contactId: { in: contactIds } }] : []),
  ];
  const callFilters = [
    ...(directCallLogIds.length ? [{ id: { in: directCallLogIds } }] : []),
    ...(opportunityIds.length ? [{ opportunityId: { in: opportunityIds } }] : []),
    ...(contactIds.length ? [{ contactId: { in: contactIds } }] : []),
  ];
  const queueFilters = [
    ...(directCallQueueEntryIds.length ? [{ id: { in: directCallQueueEntryIds } }] : []),
    ...(opportunityIds.length ? [{ opportunityId: { in: opportunityIds } }] : []),
    ...(contactIds.length ? [{ contactId: { in: contactIds } }] : []),
  ];
  const callLogIds = await collectCallLogIds(callFilters);
  const callQueueEntryIds = await collectQueueEntryIds(queueFilters);
  const fileAssetFilters = [
    ...contactIds.map((contactId) => ({
      entityType: "Contact",
      entityId: contactId,
    })),
    ...opportunityIds.map((opportunityId) => ({
      entityType: "SalesOpportunity",
      entityId: opportunityId,
    })),
    ...callLogIds.map((callLogId) => ({
      entityType: "CallLog",
      entityId: callLogId,
    })),
  ];

  const [
    snapshotsCount,
    recordsCount,
    assignmentsCount,
    debugEventsCount,
    contactsCount,
    contactTagAssignmentsCount,
    contactNotesCount,
    contactTasksCount,
    lifecycleEventsCount,
    discoveryAnswersCount,
    opportunityProductsCount,
    leadScoreEventsCount,
    communicationsCount,
    emailMessagesCount,
    fileAssetsCount,
  ] = await Promise.all([
    prisma.attributionSnapshot.count({ where }),
    prisma.attributionRecord.count({ where }),
    prisma.attributionNumberAssignment.count({ where }),
    prisma.attributionDebugEvent.count({ where }),
    countByIdBatches(contactIds, (ids) =>
      prisma.contact.count({ where: { id: { in: ids } } }),
    ),
    countByIdBatches(contactIds, (ids) =>
      prisma.contactTagAssignment.count({ where: { contactId: { in: ids } } }),
    ),
    countByIdBatches(contactIds, (ids) =>
      prisma.note.count({ where: { contactId: { in: ids } } }),
    ),
    countByIdBatches(contactIds, (ids) =>
      prisma.task.count({ where: { contactId: { in: ids } } }),
    ),
    countByIdBatches(opportunityIds, (ids) =>
      prisma.salesLifecycleEvent.count({ where: { opportunityId: { in: ids } } }),
    ),
    countByIdBatches(opportunityIds, (ids) =>
      prisma.opportunityDiscoveryAnswer.count({ where: { opportunityId: { in: ids } } }),
    ),
    countByIdBatches(opportunityIds, (ids) =>
      prisma.opportunityProduct.count({ where: { opportunityId: { in: ids } } }),
    ),
    countByIdBatches(opportunityIds, (ids) =>
      prisma.leadScoreEvent.count({ where: { opportunityId: { in: ids } } }),
    ),
    communicationFilters.length
      ? prisma.salesCommunication.count({ where: { OR: communicationFilters } })
      : Promise.resolve(0),
    communicationFilters.length
      ? prisma.emailMessage.count({ where: { OR: communicationFilters } })
      : Promise.resolve(0),
    fileAssetFilters.length
      ? prisma.fileAsset.count({ where: { OR: fileAssetFilters } })
      : Promise.resolve(0),
  ]);

  const counts = {
    snapshots: snapshotsCount,
    records: recordsCount,
    assignments: assignmentsCount,
    debugEvents: debugEventsCount,
    contacts: contactsCount,
    contactTagAssignments: contactTagAssignmentsCount,
    contactNotes: contactNotesCount,
    contactTasks: contactTasksCount,
    opportunities: opportunityIds.length,
    lifecycleEvents: lifecycleEventsCount,
    discoveryAnswers: discoveryAnswersCount,
    opportunityProducts: opportunityProductsCount,
    leadScoreEvents: leadScoreEventsCount,
    communications: communicationsCount,
    emailMessages: emailMessagesCount,
    callLogs: callLogIds.length,
    queueEntries: callQueueEntryIds.length,
    fileAssets: fileAssetsCount,
  };

  await prisma.auditLog.create({
    data: {
      action: "attribution.privacy.exported",
      actorId: admin.id,
      entity: "AttributionIdentity",
      entityId: parsed.data.identityValue,
      metadata: {
        identityType: parsed.data.identityType,
        streamed: true,
        batchSize: streamBatchSize,
        counts,
      },
    },
  });

  const exportedAt = new Date().toISOString();
  const filename = `attribution-privacy-${parsed.data.identityType}-${exportedAt.slice(0, 10)}.json`;

  const stream = jsonResponseStream(async (write) => {
    write("{");
    write(`"exportedAt":${JSON.stringify(exportedAt)},`);
    write(`"identity":${JSON.stringify(parsed.data)},`);
    write(`"metadata":${JSON.stringify({ streamed: true, batchSize: streamBatchSize, counts })},`);
    write(
      `"coverage":${JSON.stringify({
        scope:
          "Attribution data plus CRM records directly linked from matching attribution records.",
        crmLinkedBy: {
          contactIds,
          opportunityIds,
          callLogIds,
          callQueueEntryIds,
        },
        linkedRelationFormat:
          "Large one-to-many CRM relations are exported as sibling arrays keyed by contactId or opportunityId.",
        exclusions: [
          "Does not delete or export unrelated CRM records that only match by similar name, email or phone.",
          "File export includes file metadata only, not binary file contents.",
          "Email transport headers and raw provider payloads are excluded from linked CRM email exports.",
        ],
      })},`,
    );

    write('"snapshots":');
    await writeArray(write, snapshotRows(where));
    write(',"records":');
    await writeArray(write, recordRows(where));
    write(',"assignments":');
    await writeArray(write, assignmentRows(where));
    write(',"debugEvents":');
    await writeArray(write, debugEventRows(where));
    write(',"linkedCrm":{');
    write('"contacts":');
    await writeArray(write, contactRows(contactIds));
    write(',"contactTagAssignments":');
    await writeArray(write, contactTagAssignmentRows(contactIds));
    write(',"contactNotes":');
    await writeArray(write, contactNoteRows(contactIds));
    write(',"contactTasks":');
    await writeArray(write, contactTaskRows(contactIds));
    write(',"opportunities":');
    await writeArray(write, opportunityRows(opportunityFilters));
    write(',"salesLifecycleEvents":');
    await writeArray(write, lifecycleEventRows(opportunityIds));
    write(',"discoveryAnswers":');
    await writeArray(write, discoveryAnswerRows(opportunityIds));
    write(',"opportunityProducts":');
    await writeArray(write, opportunityProductRows(opportunityIds));
    write(',"leadScoreEvents":');
    await writeArray(write, leadScoreEventRows(opportunityIds));
    write(',"communications":');
    await writeArray(write, communicationRows(communicationFilters));
    write(',"emailMessages":');
    await writeArray(write, emailMessageRows(communicationFilters));
    write(',"callLogs":');
    await writeArray(write, callLogRows(callFilters));
    write(',"queueEntries":');
    await writeArray(write, queueEntryRows(queueFilters));
    write(',"fileAssets":');
    await writeArray(write, fileAssetRows(fileAssetFilters));
    write("}}");
  });

  return new Response(stream, {
    headers: {
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
