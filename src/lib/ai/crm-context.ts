export const crmAIToneOptions = [
  "consultative",
  "friendly",
  "soft-sell",
  "direct",
  "technical",
  "executive",
  "educational",
] as const;

export type CrmAIToneOption = (typeof crmAIToneOptions)[number];

export type CrmAIContext = {
  profile?: string;
  productsServices?: string;
  idealCustomers?: string;
  valueProposition?: string;
  proofPoints?: string;
  competitors?: string;
  objections?: string;
  doSay?: string;
  dontSay?: string;
  complianceNotes?: string;
  tone?: CrmAIToneOption;
  customTone?: string;
};

export function getCrmAIContext(value: unknown): CrmAIContext {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const raw = value as Record<string, unknown>;
  const tone =
    typeof raw.tone === "string" &&
    crmAIToneOptions.includes(raw.tone as CrmAIToneOption)
      ? (raw.tone as CrmAIToneOption)
      : undefined;

  return {
    profile: stringValue(raw.profile),
    productsServices: stringValue(raw.productsServices),
    idealCustomers: stringValue(raw.idealCustomers),
    valueProposition: stringValue(raw.valueProposition),
    proofPoints: stringValue(raw.proofPoints),
    competitors: stringValue(raw.competitors),
    objections: stringValue(raw.objections),
    doSay: stringValue(raw.doSay),
    dontSay: stringValue(raw.dontSay),
    complianceNotes: stringValue(raw.complianceNotes),
    tone,
    customTone: stringValue(raw.customTone),
  };
}

export function formatCrmAIContextForPrompt(context: CrmAIContext) {
  const lines = [
    ["Tone", context.customTone || context.tone],
    ["CRM/company profile", context.profile],
    ["Products/services", context.productsServices],
    ["Ideal customers", context.idealCustomers],
    ["Value proposition", context.valueProposition],
    ["Proof points", context.proofPoints],
    ["Competitors/alternatives", context.competitors],
    ["Common objections", context.objections],
    ["Language to use", context.doSay],
    ["Language to avoid", context.dontSay],
    ["Compliance notes", context.complianceNotes],
  ]
    .filter(([, value]) => Boolean(value))
    .map(([label, value]) => `${label}: ${value}`);

  return lines.length ? lines.join("\n") : "";
}

export function crmAIContextHasContent(context: CrmAIContext) {
  return Boolean(formatCrmAIContextForPrompt(context));
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
