import { Prisma } from "@prisma/client";

type OptionalSchemaTarget = {
  columnName?: string;
  modelName?: string;
  tableName?: string;
};

type PrismaErrorMeta = Record<string, unknown>;

const missingTableRawCodes = new Set(["42P01"]);
const missingColumnRawCodes = new Set(["42703"]);

function stringValue(value: unknown) {
  return typeof value === "string" ? value : null;
}

function errorMeta(error: Prisma.PrismaClientKnownRequestError) {
  return (error.meta ?? {}) as PrismaErrorMeta;
}

function normalizeTarget(value: string) {
  return value
    .replace(/^public\./, "")
    .replaceAll('"', "")
    .toLowerCase();
}

function schemaTargetMatches(
  error: Prisma.PrismaClientKnownRequestError,
  target: OptionalSchemaTarget = {},
) {
  const expected = [target.modelName, target.tableName, target.columnName]
    .filter((value): value is string => Boolean(value))
    .map(normalizeTarget);

  if (!expected.length) return true;

  const meta = errorMeta(error);
  const haystack = [
    error.message,
    stringValue(meta.modelName),
    stringValue(meta.table),
    stringValue(meta.column),
    stringValue(meta.message),
  ]
    .filter((value): value is string => Boolean(value))
    .map(normalizeTarget)
    .join(" ");

  return expected.some((value) => haystack.includes(value));
}

export function isPrismaKnownRequestError(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError;
}

export function isPrismaMissingTableError(
  error: unknown,
  target?: OptionalSchemaTarget,
) {
  if (!isPrismaKnownRequestError(error)) return false;

  if (error.code === "P2021") {
    return schemaTargetMatches(error, target);
  }

  if (error.code !== "P2010") return false;

  const rawCode = stringValue(errorMeta(error).code);

  return Boolean(
    rawCode &&
      missingTableRawCodes.has(rawCode) &&
      schemaTargetMatches(error, target),
  );
}

export function isPrismaMissingColumnError(
  error: unknown,
  target?: OptionalSchemaTarget,
) {
  if (!isPrismaKnownRequestError(error)) return false;

  if (error.code === "P2022") {
    return schemaTargetMatches(error, target);
  }

  if (error.code !== "P2010") return false;

  const rawCode = stringValue(errorMeta(error).code);

  return Boolean(
    rawCode &&
      missingColumnRawCodes.has(rawCode) &&
      schemaTargetMatches(error, target),
  );
}

export function isPrismaMissingSchemaError(
  error: unknown,
  target?: OptionalSchemaTarget,
) {
  return (
    isPrismaMissingTableError(error, target) ||
    isPrismaMissingColumnError(error, target)
  );
}

export function isPrismaDatabaseUnavailableError(error: unknown) {
  const candidate = error as {
    code?: string;
    errorCode?: string;
    message?: string;
  };
  const message = candidate.message ?? "";

  return (
    candidate.code === "P1001" ||
    candidate.code === "P1002" ||
    candidate.errorCode === "P1001" ||
    candidate.errorCode === "P1002" ||
    candidate.errorCode === "P1012" ||
    candidate.errorCode === "P1013" ||
    message.includes("Environment variable not found: DATABASE_URL") ||
    message.includes("You must provide a nonempty URL") ||
    message.includes("resolved to an empty string") ||
    message.includes("the URL must start with the protocol") ||
    message.includes("Can't reach database server") ||
    (message.includes("DATABASE_URL") && message.includes("Invalid value"))
  );
}
