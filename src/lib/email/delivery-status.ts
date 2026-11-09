export type EmailDeliveryStatus = {
  at: string | null;
  detail: string | null;
  label: string;
  state: "accepted" | "failed" | "provider-sent";
};

function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function emailDeliveryStatus({
  direction,
  metadata,
  provider,
}: {
  direction: string;
  metadata: unknown;
  provider: string | null | undefined;
}): EmailDeliveryStatus | null {
  if (direction !== "OUTBOUND") return null;

  const values = metadataObject(metadata);
  const sendState = stringValue(values.sendState)?.toLowerCase();

  if (sendState === "failed") {
    return {
      at: stringValue(values.failedAt),
      detail:
        stringValue(values.failureReason) ??
        "Gmail rejected this send before it was accepted.",
      label: "Send failed",
      state: "failed",
    };
  }

  if (
    provider?.toLowerCase() === "gmail" &&
    (sendState === "accepted" || sendState === "sent")
  ) {
    return {
      at: stringValue(values.acceptedAt),
      detail:
        "Gmail accepted the message. Final recipient delivery is not reported by this integration.",
      label: "Accepted by Gmail",
      state: "accepted",
    };
  }

  if (provider?.toLowerCase() === "gmail") {
    return {
      at: null,
      detail: "This outbound message is present in the connected Gmail mailbox.",
      label: "In Gmail Sent",
      state: "provider-sent",
    };
  }

  return null;
}
