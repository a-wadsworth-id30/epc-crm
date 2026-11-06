export function shouldRetainGmailAttachmentDuringSync({
  attachmentId,
  inlineData,
}: {
  attachmentId: string | null;
  inlineData: string | null;
}) {
  return !attachmentId && Boolean(inlineData);
}
