import crypto from "node:crypto";

export type DocuSignEnvironment = "demo" | "production";

export type DocuSignEnvelopeRecipient = {
  email: string;
  name: string;
  recipientId: string;
  routingOrder?: number;
};

export type DocuSignEnvelopeDefinitionInput = {
  crmSignatureRequestId: string;
  documentBase64: string;
  documentExtension: string;
  documentName: string;
  emailBlurb?: string | null;
  emailSubject: string;
  includeHmac: boolean;
  recipients: DocuSignEnvelopeRecipient[];
  webhookUrl: string;
};

export function docuSignAuthBaseUrl(environment: DocuSignEnvironment) {
  return environment === "production"
    ? "https://account.docusign.com"
    : "https://account-d.docusign.com";
}

export function docuSignDefaultApiBaseUri(environment: DocuSignEnvironment) {
  return environment === "production"
    ? "https://www.docusign.net/restapi"
    : "https://demo.docusign.net/restapi";
}

export function normaliseDocuSignBaseUri(
  value: string,
  environment: DocuSignEnvironment,
) {
  const fallback = docuSignDefaultApiBaseUri(environment);
  const candidate = value.trim() || fallback;

  try {
    const url = new URL(candidate);
    if (
      url.origin === "https://account.docusign.com" ||
      url.origin === "https://account-d.docusign.com"
    ) {
      return fallback;
    }

    if (url.hostname.endsWith(".docusign.net") && url.pathname === "/") {
      return `${url.origin}/restapi`;
    }

    return candidate.replace(/\/+$/, "");
  } catch {
    return fallback;
  }
}

export function docuSignConsentUrl({
  environment,
  integrationKey,
  redirectUri = "https://www.docusign.com",
}: {
  environment: DocuSignEnvironment;
  integrationKey: string;
  redirectUri?: string;
}) {
  const url = new URL(`${docuSignAuthBaseUrl(environment)}/oauth/auth`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "signature impersonation");
  url.searchParams.set("client_id", integrationKey);
  url.searchParams.set("redirect_uri", redirectUri);
  return url.toString();
}

export function docuSignDocumentExtension(fileName: string, mimeType: string) {
  const extension = fileName.split(".").pop()?.toLowerCase();

  if (extension && extension !== fileName.toLowerCase()) {
    return extension.replace(/[^a-z0-9]/g, "") || "pdf";
  }

  if (mimeType === "application/pdf") return "pdf";
  if (mimeType === "application/msword") return "doc";
  if (
    mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "docx";
  }

  return "pdf";
}

export function buildDocuSignEnvelopeDefinition({
  crmSignatureRequestId,
  documentBase64,
  documentExtension,
  documentName,
  emailBlurb,
  emailSubject,
  includeHmac,
  recipients,
  webhookUrl,
}: DocuSignEnvelopeDefinitionInput) {
  return {
    customFields: {
      textCustomFields: [
        {
          name: "crmSignatureRequestId",
          required: "false",
          show: "false",
          value: crmSignatureRequestId,
        },
      ],
    },
    documents: [
      {
        documentBase64,
        documentId: "1",
        fileExtension: documentExtension,
        name: documentName,
      },
    ],
    emailBlurb: emailBlurb || undefined,
    emailSubject,
    eventNotification: {
      deliveryMode: "SIM",
      eventData: {
        format: "json",
        includeData: ["custom_fields", "recipients"],
        version: "restv2.1",
      },
      events: [
        "envelope-sent",
        "envelope-delivered",
        "envelope-completed",
        "envelope-declined",
        "envelope-voided",
        "recipient-delivered",
        "recipient-completed",
        "recipient-declined",
        "recipient-authenticationfailed",
        "recipient-autoresponded",
      ],
      includeHMAC: includeHmac ? "true" : "false",
      loggingEnabled: "true",
      requireAcknowledgment: "true",
      url: webhookUrl,
    },
    recipients: {
      signers: recipients.map((recipient, index) => ({
        email: recipient.email,
        name: recipient.name,
        recipientId: recipient.recipientId,
        routingOrder: String(recipient.routingOrder ?? index + 1),
        tabs: {
          dateSignedTabs: [
            {
              documentId: "1",
              pageNumber: "1",
              recipientId: recipient.recipientId,
              xPosition: "90",
              yPosition: "720",
            },
          ],
          signHereTabs: [
            {
              documentId: "1",
              pageNumber: "1",
              recipientId: recipient.recipientId,
              xPosition: "360",
              yPosition: "720",
            },
          ],
        },
      })),
    },
    status: "sent",
  };
}

export function mapDocuSignEnvelopeStatus(status: string | null | undefined) {
  const normalized = status?.trim().toLowerCase() ?? "";

  if (normalized === "completed") return "COMPLETED" as const;
  if (normalized === "delivered") return "DELIVERED" as const;
  if (normalized === "declined") return "DECLINED" as const;
  if (normalized === "voided") return "VOIDED" as const;
  if (normalized === "expired") return "EXPIRED" as const;
  if (normalized === "sent") return "SENT" as const;
  if (normalized === "signed") return "COMPLETED" as const;

  return null;
}

export function mapDocuSignRecipientStatus(status: string | null | undefined) {
  const normalized =
    status
      ?.trim()
      .toLowerCase()
      .replace(/[-\s]+/g, "_") ?? "";

  if (normalized === "completed") return "COMPLETED" as const;
  if (normalized === "delivered") return "DELIVERED" as const;
  if (normalized === "declined") return "DECLINED" as const;
  if (normalized === "sent") return "SENT" as const;
  if (
    normalized === "authentication_failed" ||
    normalized === "authenticationfailed"
  ) {
    return "AUTHENTICATION_FAILED" as const;
  }
  if (normalized === "auto_responded" || normalized === "autoresponded") {
    return "AUTO_RESPONDED" as const;
  }

  return null;
}

export function verifyDocuSignHmacSignature({
  body,
  secret,
  signature,
}: {
  body: string;
  secret: string;
  signature: string | null;
}) {
  if (!signature) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(body, "utf8")
    .digest("base64");
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);

  return (
    expectedBuffer.length === actualBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, actualBuffer)
  );
}
