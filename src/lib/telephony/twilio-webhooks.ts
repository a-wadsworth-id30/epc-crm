import "server-only";

import twilio from "twilio";
import { NextResponse } from "next/server";
import { decryptSecret } from "@/lib/crypto/secrets";
import { getStoredTwilioConfig } from "@/lib/integrations/twilio-server";

type TwilioWebhookVerification =
  | { ok: true }
  | { ok: false; response: NextResponse };

type TwilioFormParams = Record<string, string | string[]>;

function formDataToParams(formData: FormData): TwilioFormParams {
  const params: TwilioFormParams = {};

  for (const [key, value] of formData.entries()) {
    if (value instanceof File) continue;

    const text = String(value);
    const current = params[key];

    if (Array.isArray(current)) {
      current.push(text);
    } else if (typeof current === "string") {
      params[key] = [current, text];
    } else {
      params[key] = text;
    }
  }

  return params;
}

function validationUrls(request: Request, webhookBaseUrl?: string | null) {
  const requestUrl = new URL(request.url);
  const pathAndSearch = `${requestUrl.pathname}${requestUrl.search}`;
  const baseUrls = [
    webhookBaseUrl,
    process.env.APP_BASE_URL,
    requestUrl.origin,
  ].filter((value): value is string => Boolean(value?.trim()));
  const urls: string[] = [];

  for (const baseUrl of baseUrls) {
    const url = new URL(pathAndSearch, baseUrl.replace(/\/+$/, ""));
    const value = url.toString();

    if (!urls.includes(value)) {
      urls.push(value);
    }
  }

  return urls;
}

function unauthorized(message: string, status = 403) {
  return NextResponse.json(
    {
      ok: false,
      message,
    },
    { status },
  );
}

export async function verifyTwilioWebhookRequest(
  request: Request,
  input?: {
    formData?: FormData;
    rawBody?: string;
  },
): Promise<TwilioWebhookVerification> {
  const signature = request.headers.get("x-twilio-signature") ?? "";

  if (!signature) {
    return {
      ok: false,
      response: unauthorized("Twilio signature is missing."),
    };
  }

  const config = await getStoredTwilioConfig();
  const encryptedAuthToken = config?.credentials?.authToken;

  if (!encryptedAuthToken) {
    return {
      ok: false,
      response: unauthorized("Twilio webhook validation is not configured.", 503),
    };
  }

  const authToken = decryptSecret(encryptedAuthToken);
  const urls = validationUrls(request, config.webhookBaseUrl);
  const hasBodyHash = new URL(request.url).searchParams.has("bodySHA256");
  const params = input?.formData ? formDataToParams(input.formData) : {};

  const valid = urls.some((url) =>
    hasBodyHash && input?.rawBody !== undefined
      ? twilio.validateRequestWithBody(authToken, signature, url, input.rawBody)
      : twilio.validateRequest(authToken, signature, url, params),
  );

  if (!valid) {
    return {
      ok: false,
      response: unauthorized("Twilio signature is invalid."),
    };
  }

  return { ok: true };
}
