import "server-only";

import { decryptSecret } from "@/lib/crypto/secrets";
import {
  twilioProvider,
  twilioStoredConfigSchema,
  type TwilioStoredConfig,
} from "@/lib/integrations/twilio";
import { normalizeCallableNumber } from "@/lib/phone-normalization";
import { prisma } from "@/lib/prisma";

export type TwilioVoiceRuntime = {
  accountSid: string;
  authToken: string;
  apiKeySid: string;
  apiKeySecret: string;
  twimlAppSid: string;
  voiceCallerId: string;
  webhookBaseUrl: string;
};

export type TwilioMessagingRuntime = {
  accountSid: string;
  authToken: string;
  messagingServiceSid: string;
  smsFromNumber: string;
  webhookBaseUrl: string;
};

export { normalizeCallableNumber };

export async function getStoredTwilioConfig() {
  const connection = await prisma.integrationConnection.findUnique({
    where: { provider: twilioProvider },
  });

  const parsed = twilioStoredConfigSchema.safeParse(connection?.config ?? {});

  if (!parsed.success) {
    return null;
  }

  return parsed.data;
}

export function getTwilioVoiceRuntime(
  config: TwilioStoredConfig | null,
): TwilioVoiceRuntime {
  if (!config?.credentials?.authToken) {
    throw new Error("Twilio credentials are not connected.");
  }

  if (!config.apiKeySid || !config.credentials.apiKeySecret) {
    throw new Error("Add a Twilio API Key SID and API Key Secret.");
  }

  if (!config.twimlAppSid) {
    throw new Error("Add the Twilio TwiML App SID for browser calling.");
  }

  if (!config.voiceCallerId) {
    throw new Error("Add the Twilio voice caller ID.");
  }

  const voiceEnabled = config.capabilities.includes("voice");

  if (!voiceEnabled) {
    throw new Error("Enable Telephony in the Twilio integration.");
  }

  return {
    accountSid: config.accountSid,
    authToken: decryptSecret(config.credentials.authToken),
    apiKeySid: config.apiKeySid,
    apiKeySecret: decryptSecret(config.credentials.apiKeySecret),
    twimlAppSid: config.twimlAppSid,
    voiceCallerId: config.voiceCallerId,
    webhookBaseUrl: config.webhookBaseUrl ?? "",
  };
}

export function getTwilioMessagingRuntime(
  config: TwilioStoredConfig | null,
): TwilioMessagingRuntime {
  if (!config?.credentials?.authToken) {
    throw new Error("Twilio credentials are not connected.");
  }

  if (!config.capabilities.includes("sms")) {
    throw new Error("Enable SMS in the Twilio integration.");
  }

  if (!config.messagingServiceSid && !config.smsFromNumber) {
    throw new Error("Add a Twilio Messaging Service SID or SMS from number.");
  }

  return {
    accountSid: config.accountSid,
    authToken: decryptSecret(config.credentials.authToken),
    messagingServiceSid: config.messagingServiceSid,
    smsFromNumber: normalizeCallableNumber(config.smsFromNumber),
    webhookBaseUrl: config.webhookBaseUrl ?? "",
  };
}
