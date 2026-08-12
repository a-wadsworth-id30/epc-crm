export const customerUploadMegabyte = 1024 * 1024;
export const customerUploadChunkedDefaultMaxUploadMb = 100;
export const customerUploadChunkedHardMaxUploadMb = 500;
export const customerUploadMultipartPartSizeBytes = 5 * customerUploadMegabyte;
export const customerUploadMultipartThresholdBytes = 20 * customerUploadMegabyte;

export function customerUploadEffectiveMaxUploadMb(
  configuredMaxUploadMb?: number | null,
) {
  const parsedMaxUploadMb = Number(configuredMaxUploadMb);

  if (!Number.isSafeInteger(parsedMaxUploadMb) || parsedMaxUploadMb <= 0) {
    return customerUploadChunkedDefaultMaxUploadMb;
  }

  return Math.min(
    Math.max(parsedMaxUploadMb, customerUploadChunkedDefaultMaxUploadMb),
    customerUploadChunkedHardMaxUploadMb,
  );
}
