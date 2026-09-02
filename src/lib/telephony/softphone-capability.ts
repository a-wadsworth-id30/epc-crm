const browserSoftphoneRoutingModes = new Set(["BROWSER", "FLEX"]);

export type BrowserSoftphoneCapabilityInput = {
  status?: string | null;
  voiceExtension?: string | null;
  voiceRoutingMode?: string | null;
};

export function usesBrowserSoftphoneRoutingMode(
  voiceRoutingMode: string | null | undefined,
) {
  return browserSoftphoneRoutingModes.has(voiceRoutingMode ?? "");
}

export function isBrowserSoftphoneCapable(
  user: BrowserSoftphoneCapabilityInput,
) {
  if (user.status && user.status !== "ACTIVE") {
    return false;
  }

  return (
    usesBrowserSoftphoneRoutingMode(user.voiceRoutingMode) &&
    Boolean(user.voiceExtension?.trim())
  );
}
