import { emailMessagesAreDuplicates } from "../../src/lib/email/deduplication";
import { prisma } from "../../src/lib/prisma";

function argumentValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() || null : null;
}

async function main() {
  const saleId = argumentValue("--sale");
  if (!saleId) {
    throw new Error(
      "Provide a sale ID: npm run maintenance:email-dedupe-audit -- --sale <id>",
    );
  }

  const messages = await prisma.salesCommunication.findMany({
    where: { channel: "EMAIL", opportunityId: saleId },
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    select: {
      body: true,
      direction: true,
      fromAddress: true,
      id: true,
      occurredAt: true,
      subject: true,
      toAddress: true,
      emailMessage: {
        select: {
          headers: true,
          id: true,
          internetMessageId: true,
          metadata: true,
          provider: true,
        },
      },
    },
  });
  const duplicatePairs: Array<Record<string, unknown>> = [];

  for (let leftIndex = 0; leftIndex < messages.length; leftIndex += 1) {
    const left = messages[leftIndex];
    if (!left) continue;

    for (
      let rightIndex = leftIndex + 1;
      rightIndex < messages.length;
      rightIndex += 1
    ) {
      const right = messages[rightIndex];
      if (!right) continue;
      if (
        !emailMessagesAreDuplicates(
          {
            ...left,
            headers: left.emailMessage?.headers,
            internetMessageId: left.emailMessage?.internetMessageId,
            metadata: left.emailMessage?.metadata,
          },
          {
            ...right,
            headers: right.emailMessage?.headers,
            internetMessageId: right.emailMessage?.internetMessageId,
            metadata: right.emailMessage?.metadata,
          },
        )
      ) {
        continue;
      }

      duplicatePairs.push({
        direction: left.direction,
        leftCommunicationId: left.id,
        leftEmailMessageId: left.emailMessage?.id ?? null,
        leftOccurredAt: left.occurredAt.toISOString(),
        leftProvider: left.emailMessage?.provider ?? null,
        rightCommunicationId: right.id,
        rightEmailMessageId: right.emailMessage?.id ?? null,
        rightOccurredAt: right.occurredAt.toISOString(),
        rightProvider: right.emailMessage?.provider ?? null,
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        applyMode: false,
        duplicatePairCount: duplicatePairs.length,
        duplicatePairs,
        emailCount: messages.length,
        saleId,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
