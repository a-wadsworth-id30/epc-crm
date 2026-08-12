export const leadSourceOptions = [
  { value: "Website", label: "Website" },
  { value: "Google Ads", label: "Google Ads" },
  { value: "Bing Ads", label: "Bing Ads" },
  { value: "Meta Ads", label: "Meta Ads" },
  { value: "LinkedIn Ads", label: "LinkedIn Ads" },
  { value: "Organic search", label: "Organic search" },
  { value: "Referral", label: "Referral" },
  { value: "Phone call", label: "Phone call" },
  { value: "Email", label: "Email" },
  { value: "Social media", label: "Social media" },
  { value: "Event / exhibition", label: "Event / exhibition" },
  { value: "Offline campaign", label: "Offline campaign" },
  { value: "Existing customer", label: "Existing customer" },
  { value: "Other", label: "Other" },
] as const;

export type LeadSourceValue = (typeof leadSourceOptions)[number]["value"];

const leadSourceValues = new Set<string>(
  leadSourceOptions.map((option) => option.value),
);

export function isLeadSourceValue(value: string): value is LeadSourceValue {
  return leadSourceValues.has(value);
}

export function leadSourceValueFromText(
  value: string | null | undefined,
): LeadSourceValue | null {
  const text = value?.trim().toLowerCase();
  if (!text) return null;

  const exactMatch = leadSourceOptions.find(
    (option) => option.value.toLowerCase() === text,
  );
  if (exactMatch) return exactMatch.value;

  if (/\b(google ads|adwords|gclid|gbraid|wbraid)\b/.test(text)) {
    return "Google Ads";
  }
  if (/\b(bing|microsoft ads|msclkid)\b/.test(text)) return "Bing Ads";
  if (/\b(meta|facebook|instagram|fbclid)\b/.test(text)) return "Meta Ads";
  if (/\b(linkedin|li_fat_id)\b/.test(text)) return "LinkedIn Ads";
  if (/\b(referral|referred|friend|recommendation)\b/.test(text)) {
    return "Referral";
  }
  if (/\b(phone|call|telephone)\b/.test(text)) return "Phone call";
  if (/\b(email|newsletter)\b/.test(text)) return "Email";
  if (/\b(social|tiktok|x.com|twitter)\b/.test(text)) return "Social media";
  if (/\b(event|exhibition|trade show|expo)\b/.test(text)) {
    return "Event / exhibition";
  }
  if (/\b(offline|print|flyer|leaflet|poster|radio|qr)\b/.test(text)) {
    return "Offline campaign";
  }
  if (/\b(existing customer|repeat customer|client)\b/.test(text)) {
    return "Existing customer";
  }
  if (/\b(organic|search|seo|google)\b/.test(text)) return "Organic search";
  if (/\b(website|web|site|form)\b/.test(text)) return "Website";

  return null;
}
