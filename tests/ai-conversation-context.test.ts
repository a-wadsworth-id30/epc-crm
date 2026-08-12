import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAIConversationContext } from "../src/lib/ai/conversation-context";
import { buildCustomerConversationBrief } from "../src/lib/ai/customer-conversation-brief";

describe("AI conversation context", () => {
  it("uses the latest inbound message as the reply focus", () => {
    const context = buildAIConversationContext({
      currentDate: new Date("2026-07-10T09:00:00Z"),
      events: [
        {
          body: "Can you do tomorrow?",
          channel: "SMS",
          direction: "OUTBOUND",
          occurredAt: "2026-07-10T08:00:00Z",
        },
        {
          body: "Tuesday works for a meeting",
          channel: "SMS",
          direction: "INBOUND",
          occurredAt: "2026-07-10T09:00:00Z",
        },
      ],
    });

    assert.equal(context.replyFocus?.body, "Tuesday works for a meeting");
    assert.deepEqual(context.replyFocus?.temporalContext.mentionedWeekdays, [
      "Tuesday",
    ]);
    assert.equal(
      context.replyFocus?.temporalContext.requestedDateOptions[0]?.date,
      "2026-07-14",
    );
    assert.equal(context.replyFocus?.commercialContext.mentionsMeeting, true);
    assert.equal(
      context.replyFocus?.commercialContext.mentionsPositiveIntent,
      true,
    );
  });
});

describe("customer conversation brief", () => {
  it("keeps website activity in the chronology without making it the reply target", () => {
    const brief = buildCustomerConversationBrief({
      currentDate: new Date("2026-07-10T09:00:00Z"),
      customer: { name: "David Moffat" },
      documents: [
        {
          createdAt: "2026-07-09T12:00:00Z",
          fileName: "proposal.pdf",
          summary: "Proposal document sent to the customer.",
        },
      ],
      events: [
        {
          body: "Tuesday works for a meeting",
          channel: "SMS",
          direction: "INBOUND",
          occurredAt: "2026-07-10T09:00:00Z",
        },
        {
          body: "https://id30.com/contact",
          channel: "WEBSITE",
          direction: "INBOUND",
          occurredAt: "2026-07-10T09:30:00Z",
          replyEligible: false,
          summary: "Website visit",
        },
      ],
      lead: { nextStep: "Book discovery call", title: "Website enquiry" },
      task: "Draft a customer reply.",
    });

    assert.equal(
      brief.conversationIntelligence.replyFocus?.body,
      "Tuesday works for a meeting",
    );
    assert.match(brief.conversationDocument, /Chronological Conversation/);
    assert.match(brief.conversationDocument, /Website visit/);
    assert.match(brief.conversationDocument, /proposal\.pdf/);
    assert.match(brief.conversationDocument, /Latest Inbound Customer Message/);
  });
});
