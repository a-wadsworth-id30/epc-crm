import { normalizedContactPhone } from "@/lib/phone-normalization";

export type ContactEmailMethod = {
  id?: string;
  label: string;
  email: string;
};

export type ContactPhoneMethod = {
  id?: string;
  label: string;
  phone: string;
  phoneNormalized: string | null;
};

export const contactEmailLabelOptions = ["Work", "Personal", "Accounts", "Other"] as const;
export const contactPhoneLabelOptions = ["Mobile", "Work", "Home", "Other"] as const;
export const maxAdditionalContactMethods = 10;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ParseResult<T> =
  | { ok: true; items: T[] }
  | { ok: false; message: string };

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function cleanString(value: unknown, maxLength: number) {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, maxLength)
    : "";
}

function cleanLabel(value: unknown, fallback: string) {
  return cleanString(value, 40) || fallback;
}

function parseJsonArray(raw: string | null | undefined): ParseResult<unknown> {
  if (!raw) {
    return { ok: true, items: [] };
  }

  let decoded: unknown;

  try {
    decoded = JSON.parse(raw);
  } catch {
    return { ok: false, message: "Check the additional contact methods." };
  }

  if (!Array.isArray(decoded)) {
    return { ok: false, message: "Check the additional contact methods." };
  }

  if (decoded.length > maxAdditionalContactMethods) {
    return {
      ok: false,
      message: `Use up to ${maxAdditionalContactMethods} additional contact methods.`,
    };
  }

  return { ok: true, items: decoded };
}

export function normalizeContactEmailMethods(
  value: unknown,
  primaryEmail: string | null | undefined,
): ContactEmailMethod[] {
  const rows = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const primaryKey = primaryEmail?.trim().toLowerCase();
  if (primaryKey) {
    seen.add(primaryKey);
  }

  const methods: ContactEmailMethod[] = [];

  for (const item of rows) {
    const record = objectValue(item);
    const email = cleanString(record.email ?? record.value ?? item, 254);
    const key = email.toLowerCase();

    if (!email || seen.has(key)) {
      continue;
    }

    const id = cleanString(record.id, 120);
    const method: ContactEmailMethod = {
      label: cleanLabel(record.label, "Other"),
      email,
    };

    if (id) {
      method.id = id;
    }

    seen.add(key);
    methods.push(method);

    if (methods.length >= maxAdditionalContactMethods) {
      break;
    }
  }

  return methods;
}

export function normalizeContactPhoneMethods(
  value: unknown,
  primaryPhone: string | null | undefined,
): ContactPhoneMethod[] {
  const rows = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const primaryKey = phoneDedupKey(primaryPhone);
  if (primaryKey) {
    seen.add(primaryKey);
  }

  const methods: ContactPhoneMethod[] = [];

  for (const item of rows) {
    const record = objectValue(item);
    const phone = cleanString(record.phone ?? record.value ?? item, 80);
    const key = phoneDedupKey(phone);

    if (!phone || !key || seen.has(key)) {
      continue;
    }

    const id = cleanString(record.id, 120);
    const method: ContactPhoneMethod = {
      label: cleanLabel(record.label, "Other"),
      phone,
      phoneNormalized: normalizedContactPhone(phone),
    };

    if (id) {
      method.id = id;
    }

    seen.add(key);
    methods.push(method);

    if (methods.length >= maxAdditionalContactMethods) {
      break;
    }
  }

  return methods;
}

export function parseContactEmailMethodsFormValue(
  raw: string | null | undefined,
  primaryEmail: string | null | undefined,
): ParseResult<ContactEmailMethod> {
  const decoded = parseJsonArray(raw);
  if (!decoded.ok) return decoded;

  const methods = normalizeContactEmailMethods(decoded.items, primaryEmail);
  const invalidEmail = methods.find((method) => !emailPattern.test(method.email));

  if (invalidEmail) {
    return { ok: false, message: "Enter valid additional email addresses." };
  }

  return { ok: true, items: methods };
}

export function parseContactPhoneMethodsFormValue(
  raw: string | null | undefined,
  primaryPhone: string | null | undefined,
): ParseResult<ContactPhoneMethod> {
  const decoded = parseJsonArray(raw);
  if (!decoded.ok) return decoded;

  return {
    ok: true,
    items: normalizeContactPhoneMethods(decoded.items, primaryPhone),
  };
}

export function mergeContactEmailMethods({
  duplicateEmail,
  duplicateMethods,
  mergedPrimaryEmail,
  primaryMethods,
}: {
  duplicateEmail: string | null | undefined;
  duplicateMethods: unknown;
  mergedPrimaryEmail: string | null | undefined;
  primaryMethods: unknown;
}) {
  return normalizeContactEmailMethods(
    [
      ...normalizeContactEmailMethods(primaryMethods, mergedPrimaryEmail),
      ...(duplicateEmail ? [{ label: "Other", email: duplicateEmail }] : []),
      ...normalizeContactEmailMethods(duplicateMethods, mergedPrimaryEmail),
    ],
    mergedPrimaryEmail,
  );
}

export function mergeContactPhoneMethods({
  duplicateMethods,
  duplicatePhone,
  mergedPrimaryPhone,
  primaryMethods,
}: {
  duplicateMethods: unknown;
  duplicatePhone: string | null | undefined;
  mergedPrimaryPhone: string | null | undefined;
  primaryMethods: unknown;
}) {
  return normalizeContactPhoneMethods(
    [
      ...normalizeContactPhoneMethods(primaryMethods, mergedPrimaryPhone),
      ...(duplicatePhone ? [{ label: "Other", phone: duplicatePhone }] : []),
      ...normalizeContactPhoneMethods(duplicateMethods, mergedPrimaryPhone),
    ],
    mergedPrimaryPhone,
  );
}

export function contactEmailValues(
  primaryEmail: string | null | undefined,
  additionalEmails: unknown,
) {
  return [
    primaryEmail ?? null,
    ...normalizeContactEmailMethods(additionalEmails, primaryEmail).map(
      (method) => method.email,
    ),
  ].filter((value): value is string => Boolean(value));
}

export function contactPhoneValues(
  primaryPhone: string | null | undefined,
  primaryPhoneNormalized: string | null | undefined,
  additionalPhones: unknown,
) {
  return [
    primaryPhone ?? null,
    primaryPhoneNormalized ?? null,
    ...normalizeContactPhoneMethods(additionalPhones, primaryPhone).flatMap(
      (method) => [method.phone, method.phoneNormalized],
    ),
  ].filter((value): value is string => Boolean(value));
}

function phoneDedupKey(value: string | null | undefined) {
  const normalized = normalizedContactPhone(value);
  return normalized ?? value?.replace(/\s+/g, "").trim().toLowerCase() ?? "";
}
