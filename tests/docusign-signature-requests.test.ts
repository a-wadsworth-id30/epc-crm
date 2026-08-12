import assert from "node:assert/strict";
import crypto from "node:crypto";
import { describe, it } from "node:test";
import {
  docuSignSignableDocumentLabel,
  isDocuSignSignableMimeType,
} from "../src/lib/docusign/signable-documents";
import {
  buildDocuSignEnvelopeDefinition,
  docuSignDefaultApiBaseUri,
  mapDocuSignEnvelopeStatus,
  mapDocuSignRecipientStatus,
  normaliseDocuSignBaseUri,
  verifyDocuSignHmacSignature,
} from "../src/lib/integrations/docusign-utils";

describe("DocuSign signature requests", () => {
  it("builds a signed-envelope payload with CRM correlation and HMAC callbacks", () => {
    const envelope = buildDocuSignEnvelopeDefinition({
      crmSignatureRequestId: "sig_123",
      documentBase64: Buffer.from("document").toString("base64"),
      documentExtension: "pdf",
      documentName: "Proposal.pdf",
      emailBlurb: "Please review and sign.",
      emailSubject: "Please sign Proposal.pdf",
      includeHmac: true,
      recipients: [
        {
          email: "alex@example.com",
          name: "Alex Client",
          recipientId: "1",
          routingOrder: 1,
        },
      ],
      webhookUrl: "https://crm.id30.com/api/webhooks/docusign",
    }) as {
      customFields: {
        textCustomFields: Array<{ name: string; value: string }>;
      };
      documents: Array<{ documentBase64: string; fileExtension: string }>;
      eventNotification: {
        events: string[];
        includeHMAC: string;
        url: string;
      };
      recipients: { signers: Array<{ tabs: { signHereTabs: unknown[] } }> };
      status: string;
    };

    assert.equal(envelope.status, "sent");
    assert.equal(envelope.documents[0]?.fileExtension, "pdf");
    assert.equal(envelope.eventNotification.includeHMAC, "true");
    assert.equal(
      envelope.eventNotification.url,
      "https://crm.id30.com/api/webhooks/docusign",
    );
    assert.ok(envelope.eventNotification.events.includes("envelope-completed"));
    assert.equal(
      envelope.customFields.textCustomFields[0]?.name,
      "crmSignatureRequestId",
    );
    assert.equal(envelope.customFields.textCustomFields[0]?.value, "sig_123");
    assert.equal(envelope.recipients.signers[0]?.tabs.signHereTabs.length, 1);
  });

  it("normalises DocuSign API base URIs without accepting OAuth hosts", () => {
    assert.equal(
      normaliseDocuSignBaseUri("", "demo"),
      docuSignDefaultApiBaseUri("demo"),
    );
    assert.equal(
      normaliseDocuSignBaseUri("https://account-d.docusign.com", "demo"),
      docuSignDefaultApiBaseUri("demo"),
    );
    assert.equal(
      normaliseDocuSignBaseUri("https://demo.docusign.net/restapi/", "demo"),
      "https://demo.docusign.net/restapi",
    );
  });

  it("maps provider envelope and recipient statuses to CRM statuses", () => {
    assert.equal(mapDocuSignEnvelopeStatus("completed"), "COMPLETED");
    assert.equal(mapDocuSignEnvelopeStatus("voided"), "VOIDED");
    assert.equal(mapDocuSignEnvelopeStatus("unknown"), null);
    assert.equal(
      mapDocuSignRecipientStatus("authenticationfailed"),
      "AUTHENTICATION_FAILED",
    );
    assert.equal(
      mapDocuSignRecipientStatus("auto-responded"),
      "AUTO_RESPONDED",
    );
  });

  it("verifies DocuSign Connect HMAC signatures", () => {
    const body = JSON.stringify({ event: "envelope-completed" });
    const secret = "test-connect-secret";
    const signature = crypto
      .createHmac("sha256", secret)
      .update(body, "utf8")
      .digest("base64");

    assert.equal(
      verifyDocuSignHmacSignature({ body, secret, signature }),
      true,
    );
    assert.equal(
      verifyDocuSignHmacSignature({
        body,
        secret,
        signature: signature.replace(/.$/, "x"),
      }),
      false,
    );
  });

  it("limits signable source documents to PDF and Word formats", () => {
    assert.equal(isDocuSignSignableMimeType("application/pdf"), true);
    assert.equal(isDocuSignSignableMimeType("application/msword"), true);
    assert.equal(
      isDocuSignSignableMimeType(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
      true,
    );
    assert.equal(isDocuSignSignableMimeType("image/png"), false);
    assert.equal(docuSignSignableDocumentLabel(), "PDF or Word document");
  });
});
