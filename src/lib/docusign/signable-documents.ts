export const docusignSignableMimeTypes = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export function isDocuSignSignableMimeType(mimeType: string) {
  return docusignSignableMimeTypes.includes(
    mimeType.toLowerCase() as (typeof docusignSignableMimeTypes)[number],
  );
}

export function docuSignSignableDocumentLabel() {
  return "PDF or Word document";
}
