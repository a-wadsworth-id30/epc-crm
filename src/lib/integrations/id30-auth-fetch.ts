type AuthBrokerMethod = "DELETE" | "GET" | "POST";

type CircuitState = {
  failures: number;
  openUntil: number;
};

type ResilientFetchOptions = {
  circuitFailureThreshold?: number;
  circuitOpenMs?: number;
  fetchImpl?: typeof fetch;
  maxAttempts?: number;
  method: AuthBrokerMethod;
  requestInit: (signal: AbortSignal) => RequestInit;
  retryDelayMs?: number;
  timeoutMs?: number;
  url: URL;
};

const circuitByOrigin = new Map<string, CircuitState>();

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed)
    ? Math.min(maximum, Math.max(minimum, parsed))
    : fallback;
}

function retryableStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function retryableMethod(method: AuthBrokerMethod) {
  return method === "GET";
}

function wait(milliseconds: number) {
  return milliseconds > 0
    ? new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
    : Promise.resolve();
}

function recordSuccess(origin: string) {
  circuitByOrigin.delete(origin);
}

function recordFailure(
  origin: string,
  now: number,
  threshold: number,
  openMs: number,
) {
  const current = circuitByOrigin.get(origin) ?? { failures: 0, openUntil: 0 };
  const failures = current.failures + 1;
  circuitByOrigin.set(origin, {
    failures,
    openUntil: failures >= threshold ? now + openMs : 0,
  });
}

export function resetId30AuthCircuitForTests() {
  circuitByOrigin.clear();
}

export async function fetchId30AuthWithResilience({
  circuitFailureThreshold = boundedInteger(
    process.env.ID30_AUTH_CIRCUIT_FAILURE_THRESHOLD,
    5,
    2,
    20,
  ),
  circuitOpenMs = boundedInteger(
    process.env.ID30_AUTH_CIRCUIT_OPEN_MS,
    30_000,
    1_000,
    300_000,
  ),
  fetchImpl = fetch,
  maxAttempts = boundedInteger(
    process.env.ID30_AUTH_GET_MAX_ATTEMPTS,
    2,
    1,
    3,
  ),
  method,
  requestInit,
  retryDelayMs = 200,
  timeoutMs = boundedInteger(
    process.env.ID30_AUTH_REQUEST_TIMEOUT_MS,
    8_000,
    1_000,
    30_000,
  ),
  url,
}: ResilientFetchOptions): Promise<
  | { ok: true; attempts: number; response: Response }
  | {
      ok: false;
      attempts: number;
      message: string;
      reason: "circuit-open" | "network" | "timeout";
      status: 503;
    }
> {
  const origin = url.origin;
  const now = Date.now();
  const circuit = circuitByOrigin.get(origin);

  if (circuit?.openUntil && circuit.openUntil > now) {
    return {
      ok: false,
      attempts: 0,
      message: "iD30 Auth is temporarily unavailable after repeated failures.",
      reason: "circuit-open",
      status: 503,
    };
  }

  if (circuit?.openUntil && circuit.openUntil <= now) {
    circuitByOrigin.delete(origin);
  }

  const attemptsAllowed = retryableMethod(method) ? maxAttempts : 1;
  let finalReason: "network" | "timeout" = "network";

  for (let attempt = 1; attempt <= attemptsAllowed; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(url, {
        ...requestInit(controller.signal),
        method,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!retryableStatus(response.status)) {
        recordSuccess(origin);
        return { ok: true, attempts: attempt, response };
      }

      if (attempt < attemptsAllowed) {
        await response.body?.cancel().catch(() => undefined);
        await wait(retryDelayMs * 2 ** (attempt - 1));
        continue;
      }

      recordFailure(
        origin,
        Date.now(),
        circuitFailureThreshold,
        circuitOpenMs,
      );
      return { ok: true, attempts: attempt, response };
    } catch {
      clearTimeout(timeout);
      finalReason = controller.signal.aborted ? "timeout" : "network";

      if (attempt < attemptsAllowed) {
        await wait(retryDelayMs * 2 ** (attempt - 1));
        continue;
      }
    }
  }

  recordFailure(
    origin,
    Date.now(),
    circuitFailureThreshold,
    circuitOpenMs,
  );
  return {
    ok: false,
    attempts: attemptsAllowed,
    message:
      finalReason === "timeout"
        ? "iD30 Auth did not respond before the request timeout."
        : "iD30 Auth could not be reached.",
    reason: finalReason,
    status: 503,
  };
}
