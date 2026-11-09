import crypto from "node:crypto";

export class GmailSendError extends Error {
  internetMessageId: string;
  operationId: string;

  constructor(
    message: string,
    identity: { internetMessageId: string; operationId: string },
  ) {
    super(message);
    this.name = "GmailSendError";
    this.internetMessageId = identity.internetMessageId;
    this.operationId = identity.operationId;
  }
}

export function gmailSendIdentity(
  domain: string,
  id: string = crypto.randomUUID(),
) {
  return {
    internetMessageId: `<${id}@${domain}>`,
    operationId: `gmail-send:${id}`,
  };
}
