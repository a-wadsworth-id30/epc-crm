import "server-only";

import crypto from "node:crypto";
import { z } from "zod";
import { decryptSecret } from "@/lib/crypto/secrets";
import { prisma } from "@/lib/prisma";

export const mailerSendProvider = "mailersend";
export const mailerSendWebhookTestSecret = "test_Am3L1GuOIc4blLUuHqAPxxwkZaJyEk8G";

type MailerSendDnsRecord = {
  host: string;
  type: string;
  value: string;
};

type MailerSendVerification = {
  spf: boolean;
  dkim: boolean;
  mx: boolean;
  tracking: boolean;
  cname: boolean;
  rp_cname: boolean;
};

function nullishToEmptyString(value: unknown) {
  return value === null || value === undefined ? "" : value;
}

const requiredTrimmedString = (message: string) =>
  z.preprocess(nullishToEmptyString, z.string().trim().min(1, message));

const optionalTrimmedString = z
  .preprocess(nullishToEmptyString, z.string().trim().optional())
  .transform((value) => value || "");

const optionalEmail = z
  .preprocess(nullishToEmptyString, z.string().trim().optional())
  .transform((value) => value || "")
  .pipe(z.string().email().or(z.literal("")));

const optionalUrl = z.preprocess(
  nullishToEmptyString,
  z.string().trim().url().optional().or(z.literal("")),
);

export const mailerSendConfigSchema = z.object({
  domainName: requiredTrimmedString("Domain name is required."),
  domainId: optionalTrimmedString,
  fromName: optionalTrimmedString,
  fromEmail: optionalEmail,
  replyToEmail: optionalEmail,
  inboundDomain: optionalTrimmedString,
  inboundRouteId: optionalTrimmedString,
  inboundRouteName: optionalTrimmedString,
  inboundCatchRecipient: optionalTrimmedString,
  webhookBaseUrl: optionalUrl,
  spfHost: optionalTrimmedString,
  spfValue: optionalTrimmedString,
  dkimHost: optionalTrimmedString,
  dkimValue: optionalTrimmedString,
  returnPathHost: optionalTrimmedString,
  returnPathValue: optionalTrimmedString,
  trackingHost: optionalTrimmedString,
  trackingValue: optionalTrimmedString,
  inboundMxHost: optionalTrimmedString,
  inboundMxValue: optionalTrimmedString,
  inboundMxPriority: z.coerce.number().int().min(0).max(100).optional().catch(10),
  spfVerified: z.boolean().optional(),
  dkimVerified: z.boolean().optional(),
  returnPathVerified: z.boolean().optional(),
  trackingVerified: z.boolean().optional(),
  inboundVerified: z.boolean().optional(),
  domainStatus: optionalTrimmedString,
  lastCheckedAt: optionalTrimmedString,
});

export const mailerSendSettingsFormSchema = mailerSendConfigSchema.pick({
  domainName: true,
  domainId: true,
  fromName: true,
  fromEmail: true,
  replyToEmail: true,
  inboundDomain: true,
  inboundRouteId: true,
  inboundRouteName: true,
  inboundCatchRecipient: true,
  webhookBaseUrl: true,
});

const mailerSendStoredCredentialsSchema = z.object({
  apiToken: z.string().min(1).optional(),
  inboundSecret: z.string().min(1).optional(),
  savedAt: z.string().datetime().optional(),
});

export const mailerSendStoredConfigSchema = mailerSendConfigSchema.extend({
  credentials: mailerSendStoredCredentialsSchema.optional(),
});

export type MailerSendConfig = z.infer<typeof mailerSendConfigSchema>;
export type MailerSendStoredConfig = z.infer<typeof mailerSendStoredConfigSchema>;

export function hasStoredMailerSendCredentials(config: unknown) {
  const parsed = mailerSendStoredConfigSchema.safeParse(config ?? {});
  return Boolean(
    parsed.success &&
      (parsed.data.credentials?.apiToken || parsed.data.credentials?.inboundSecret),
  );
}

export function mailerSendInboundWebhookPath() {
  return "/api/webhooks/mailersend/inbound";
}

export function mailerSendInboundWebhookUrl(baseUrl?: string | null) {
  return baseUrl
    ? `${baseUrl.replace(/\/$/, "")}${mailerSendInboundWebhookPath()}`
    : mailerSendInboundWebhookPath();
}

export async function getMailerSendStoredConfig() {
  const integration = await prisma.integrationConnection.findUnique({
    where: { provider: mailerSendProvider },
  });
  const parsed = mailerSendStoredConfigSchema.safeParse(integration?.config ?? {});

  return parsed.success ? parsed.data : null;
}

export async function getMailerSendInboundSecret() {
  const config = await getMailerSendStoredConfig();
  const encryptedSecret = config?.credentials?.inboundSecret;

  return encryptedSecret ? decryptSecret(encryptedSecret) : null;
}

export async function getMailerSendApiToken() {
  const config = await getMailerSendStoredConfig();
  const encryptedToken = config?.credentials?.apiToken;

  return encryptedToken ? decryptSecret(encryptedToken) : null;
}

export async function getMailerSendInboundReplyAddress() {
  const config = await getMailerSendStoredConfig();
  return mailerSendInboundReplyAddress(config);
}

export function mailerSendInboundReplyAddress(
  config: Pick<
    MailerSendStoredConfig,
    "inboundCatchRecipient" | "inboundDomain"
  > | null,
) {
  const recipient = config?.inboundCatchRecipient?.trim();
  const domain = config?.inboundDomain?.trim();

  if (!recipient || !domain) return null;
  if (recipient.includes("@")) return recipient;

  return `${recipient}@${domain}`;
}

export type SendMailerSendEmailInput = {
  subject: string;
  text: string;
  html?: string | null;
  to: {
    email: string;
    name?: string | null;
  };
  replyToEmail?: string | null;
  tags?: string[];
};

export async function sendMailerSendEmail(input: SendMailerSendEmailInput) {
  const config = await getMailerSendStoredConfig();
  const apiToken = await getMailerSendApiToken();

  if (!config || !apiToken) {
    throw new Error("MailerSend is not connected.");
  }

  if (!config.fromEmail) {
    throw new Error("MailerSend sender email is not configured.");
  }

  const response = await fetch("https://api.mailersend.com/v1/email", {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: {
        email: config.fromEmail,
        name: config.fromName || undefined,
      },
      to: [
        {
          email: input.to.email,
          name: input.to.name || undefined,
        },
      ],
      subject: input.subject,
      text: input.text,
      html: input.html || textToHtml(input.text),
      reply_to: {
        email: input.replyToEmail || config.replyToEmail || config.fromEmail,
        name: config.fromName || undefined,
      },
      tags: input.tags?.length ? input.tags.slice(0, 5) : undefined,
    }),
  });
  const body = await response.text();

  if (!response.ok) {
    throw new Error(
      `MailerSend send failed with status ${response.status}${
        body ? `: ${body.slice(0, 240)}` : ""
      }`,
    );
  }

  return {
    fromEmail: config.fromEmail,
    messageId: response.headers.get("x-message-id"),
    replyToEmail: input.replyToEmail || config.replyToEmail || config.fromEmail,
    statusCode: response.status,
  };
}

export async function refreshMailerSendDomainValidationConfig() {
  const integration = await prisma.integrationConnection.findUnique({
    where: { provider: mailerSendProvider },
  });
  const parsed = mailerSendStoredConfigSchema.safeParse(integration?.config ?? {});

  if (!integration || !parsed.success) {
    throw new Error("Save MailerSend settings before refreshing domain validation.");
  }

  if (!parsed.data.credentials?.apiToken) {
    throw new Error("Save a MailerSend API token before refreshing domain validation.");
  }

  if (!parsed.data.domainId) {
    throw new Error("Add the MailerSend domain ID before refreshing domain validation.");
  }

  const [records, verification] = await Promise.all([
    fetchMailerSendDnsRecords(parsed.data.domainId),
    verifyMailerSendDomain(parsed.data.domainId),
  ]);
  const config = {
    ...parsed.data,
    ...mailerSendDnsConfigFromRecords(records),
    ...mailerSendVerificationConfig(verification),
  };
  const isConnected = hasStoredMailerSendCredentials(config);

  await prisma.integrationConnection.update({
    where: { provider: mailerSendProvider },
    data: {
      status: isConnected ? "CONNECTED" : "NOT_CONNECTED",
      config,
    },
  });

  return { config, connected: isConnected };
}

export async function fetchMailerSendDnsRecords(domainId: string) {
  const response = await mailerSendRequest<{ data?: unknown }>(
    `/domains/${domainId}/dns-records`,
  );

  return normalizeDnsRecords(response.data);
}

export async function verifyMailerSendDomain(domainId: string) {
  const response = await mailerSendRequest<{
    data?: Partial<MailerSendVerification>;
  }>(`/domains/${domainId}/verify`);
  const data = response.data ?? {};

  return {
    spf: Boolean(data.spf),
    dkim: Boolean(data.dkim),
    mx: Boolean(data.mx),
    tracking: Boolean(data.tracking),
    cname: Boolean(data.cname),
    rp_cname: Boolean(data.rp_cname),
  };
}

export function mailerSendDnsConfigFromRecords(records: MailerSendDnsRecord[]) {
  const spf = findRecord(
    records,
    (record) => record.type === "TXT" && /spf|mailersend/i.test(record.value),
  );
  const dkim = findRecord(
    records,
    (record) => record.type === "CNAME" && /domainkey|dkim/i.test(record.host),
  );
  const returnPath = findRecord(
    records,
    (record) => record.type === "CNAME" && /mta|return/i.test(record.host),
  );
  const tracking = findRecord(
    records,
    (record) => record.type === "CNAME" && /email|track|click/i.test(record.host),
  );
  const inbound = findRecord(
    records,
    (record) => record.type === "MX" || /inbound/i.test(record.host),
  );
  const inboundMx = parseMxRecord(inbound?.value);

  return {
    spfHost: spf?.host ?? "",
    spfValue: spf?.value ?? "",
    dkimHost: dkim?.host ?? "",
    dkimValue: dkim?.value ?? "",
    returnPathHost: returnPath?.host ?? "",
    returnPathValue: returnPath?.value ?? "",
    trackingHost: tracking?.host ?? "",
    trackingValue: tracking?.value ?? "",
    inboundMxHost: inbound?.host ?? "",
    inboundMxValue: inboundMx.value,
    inboundMxPriority: inboundMx.priority,
  };
}

export function mailerSendVerificationConfig(
  verification: MailerSendVerification,
) {
  const returnPathVerified = verification.rp_cname;
  const trackingVerified = verification.tracking || verification.cname;

  return {
    spfVerified: verification.spf,
    dkimVerified: verification.dkim,
    returnPathVerified,
    trackingVerified,
    inboundVerified: verification.mx,
    domainStatus:
      verification.spf && verification.dkim && returnPathVerified
        ? "VERIFIED"
        : "VERIFYING",
    lastCheckedAt: new Date().toISOString(),
  };
}

export function verifyMailerSendSignature({
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
    .update(body)
    .digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(signature, "utf8");

  return (
    expectedBuffer.length === receivedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}

async function mailerSendRequest<T>(path: string) {
  const apiToken = await getMailerSendApiToken();

  if (!apiToken) {
    throw new Error("MailerSend API token is not configured.");
  }

  const response = await fetch(`https://api.mailersend.com/v1${path}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiToken}`,
    },
    cache: "no-store",
  });
  const body = await response.text();
  const payload = body ? (JSON.parse(body) as T) : ({} as T);

  if (!response.ok) {
    throw new Error(`MailerSend request failed with status ${response.status}.`);
  }

  return payload;
}

function normalizeDnsRecords(input: unknown) {
  const candidates = Array.isArray(input)
    ? input
    : input && typeof input === "object"
      ? Object.values(input)
      : [];
  const records: MailerSendDnsRecord[] = [];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;

    const record = candidate as Record<string, unknown>;
    const host =
      stringValue(record.host) ??
      stringValue(record.name) ??
      stringValue(record.hostname);
    const type = stringValue(record.type)?.toUpperCase();
    const value =
      stringValue(record.value) ??
      stringValue(record.record) ??
      stringValue(record.target);

    if (host && type && value) {
      records.push({ host, type, value });
    }
  }

  return dedupeRecords(records);
}

function textToHtml(text: string) {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map(
      (paragraph) =>
        `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function findRecord(
  records: MailerSendDnsRecord[],
  predicate: (record: MailerSendDnsRecord) => boolean,
) {
  return records.find(predicate);
}

function parseMxRecord(value?: string) {
  const raw = value?.trim() ?? "";
  const match = raw.match(/^(\d+)\s+(.+)$/);

  if (!match) return { priority: 10, value: raw };

  return {
    priority: Number(match[1]),
    value: match[2]?.trim() ?? raw,
  };
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function dedupeRecords(records: MailerSendDnsRecord[]) {
  const seen = new Set<string>();

  return records.filter((record) => {
    const key = `${record.type}:${record.host}:${record.value}`;
    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}
