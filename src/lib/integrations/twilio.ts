import { z } from "zod";

export const twilioProvider = "twilio";

export const twilioCapabilities = ["voice", "sms", "whatsapp"] as const;

const optionalTrimmedString = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || "");

const importedTwilioInventorySchema = z.object({
  lastImportedAt: z.string().datetime(),
  addresses: z.array(z.record(z.string(), z.unknown())).default([]),
  bundles: z.array(z.record(z.string(), z.unknown())).default([]),
  messagingServices: z.array(z.record(z.string(), z.unknown())).default([]),
  phoneNumbers: z.array(z.record(z.string(), z.unknown())).default([]),
});

export const twilioRecordingSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  transcriptEnabled: z.boolean().default(true),
  aiAnalysisEnabled: z.boolean().default(true),
  retentionDays: z.number().int().min(1).max(3650).default(180),
  notice: z
    .string()
    .trim()
    .optional()
    .transform(
      (value) =>
        value || "This call may be recorded for quality, training and follow-up.",
    ),
});

export const twilioConfigSchema = z.object({
  accountSid: z.string().trim().min(1, "Twilio Account SID is required."),
  apiKeySid: optionalTrimmedString,
  twimlAppSid: optionalTrimmedString,
  voiceIntelligenceServiceSid: optionalTrimmedString,
  messagingServiceSid: optionalTrimmedString,
  smsFromNumber: optionalTrimmedString,
  whatsappFromNumber: optionalTrimmedString,
  voiceCallerId: optionalTrimmedString,
  webhookBaseUrl: z.string().trim().url().optional().or(z.literal("")),
  capabilities: z
    .array(z.enum(twilioCapabilities))
    .default(["voice", "sms", "whatsapp"]),
  importedInventory: importedTwilioInventorySchema.optional(),
  recording: twilioRecordingSettingsSchema.default({
    enabled: true,
    transcriptEnabled: true,
    aiAnalysisEnabled: true,
    retentionDays: 180,
    notice: "This call may be recorded for quality, training and follow-up.",
  }),
});

const twilioStoredCredentialsSchema = z.object({
  authToken: z.string().min(1),
  apiKeySecret: z.string().optional(),
  savedAt: z.string().datetime().optional(),
});

export const twilioStoredConfigSchema = twilioConfigSchema.extend({
  credentials: twilioStoredCredentialsSchema.optional(),
});

export type TwilioConfig = z.infer<typeof twilioConfigSchema>;
export type TwilioStoredConfig = z.infer<typeof twilioStoredConfigSchema>;

export function hasStoredTwilioCredentials(config: unknown) {
  const parsed = twilioStoredConfigSchema.safeParse(config ?? {});
  return Boolean(parsed.success && parsed.data.credentials?.authToken);
}
