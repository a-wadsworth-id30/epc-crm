import { NextResponse, type NextRequest } from "next/server";

const enabled = process.env.PERFORMANCE_WEB_VITALS_LOGGING_ENABLED === "true";
const allowedMetricNames = new Set(["CLS", "FCP", "FID", "INP", "LCP", "TTFB"]);
const allowedRatings = new Set(["good", "needs-improvement", "poor"]);

function cleanString(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  return trimmed.slice(0, maxLength);
}

function cleanNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeWebVital(body: unknown) {
  if (!body || typeof body !== "object") return null;

  const record = body as Record<string, unknown>;
  const name = cleanString(record.name, 16);
  const pathname = cleanString(record.pathname, 180);
  const value = cleanNumber(record.value);

  if (!name || !allowedMetricNames.has(name) || !pathname || value === null) {
    return null;
  }

  const rating = cleanString(record.rating, 32);

  return {
    buildCommit: cleanString(record.buildCommit, 64) ?? "unknown",
    delta: cleanNumber(record.delta),
    id: cleanString(record.id, 120),
    label: cleanString(record.label, 32),
    name,
    navigationType: cleanString(record.navigationType, 64),
    pathname,
    rating: rating && allowedRatings.has(rating) ? rating : null,
    value,
  };
}

export async function POST(request: NextRequest) {
  if (!enabled) {
    return NextResponse.json({ ok: true, logged: false });
  }

  const contentLength = Number.parseInt(
    request.headers.get("content-length") ?? "0",
    10,
  );

  if (Number.isFinite(contentLength) && contentLength > 4096) {
    return NextResponse.json(
      { error: "Performance payload is too large." },
      { status: 413 },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid performance payload." },
      { status: 400 },
    );
  }

  const metric = normalizeWebVital(body);

  if (!metric) {
    return NextResponse.json(
      { error: "Unsupported performance metric." },
      { status: 400 },
    );
  }

  console.info(`[performance:web-vital] ${JSON.stringify(metric)}`);

  return NextResponse.json({ ok: true, logged: true });
}
