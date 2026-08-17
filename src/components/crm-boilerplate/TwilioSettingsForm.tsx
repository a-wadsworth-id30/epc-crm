"use client";

import {
  ReactNode,
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import {
  configureTwilioMessagingAction,
  configureTwilioVoiceAppAction,
  importTwilioConfigurationAction,
  purchaseTwilioCrmNumberAction,
  searchTwilioCrmNumbersAction,
  type TwilioAvailableNumberOption,
  type TwilioNumberSearchState,
  updateTwilioIntegrationAction,
} from "@/lib/actions/integrations";
import type { TwilioConfig } from "@/lib/integrations/twilio";

export type TwilioSettings = Partial<TwilioConfig>;

type TwilioFieldHelp = {
  title: string;
  steps: string[];
  note?: string;
  href?: string;
};

const twilioApiKeySidLabel = "SID";
const twilioApiKeySecretLabel = "Client Secret";

const twilioHelp: Record<string, TwilioFieldHelp> = {
  accountSid: {
    title: "Where to find the account SID",
    steps: [
      "Open the Twilio Console and select the client account or subaccount.",
      "Go to Account Dashboard or Account > General settings.",
      "Copy the Account SID. It normally starts with AC.",
    ],
    note: "Use a client-specific subaccount where possible so billing, logs, numbers, and permissions stay isolated.",
    href: "https://www.twilio.com/docs/iam/api/account",
  },
  authToken: {
    title: "Where to find the auth token",
    steps: [
      "Open the same Twilio account used for the Account SID.",
      "Go to Account Dashboard or Account > General settings.",
      "Reveal and copy the Auth Token.",
    ],
    note: "The CRM encrypts this before saving it. Leave this field blank later to keep the saved value.",
    href: "https://www.twilio.com/docs/iam/api/account",
  },
  apiKeySid: {
    title: "Where to find the SID",
    steps: [
      "In Twilio Console, open Account > API keys & tokens.",
      "Create an API key for this CRM.",
      "Copy the SID from the key result. It normally starts with SK.",
    ],
    note: "You can leave this blank and save; the CRM will create a dedicated API key automatically when the Auth Token is valid.",
    href: "https://www.twilio.com/docs/iam/api-keys",
  },
  apiKeySecret: {
    title: "Where to find the Client Secret",
    steps: [
      "Create the API key in Account > API keys & tokens.",
      "Copy the Client Secret from the final key screen.",
      "Paste it here immediately; Twilio will not show the Client Secret again.",
    ],
    note: "This is not the master Auth Token. Leave this blank and save to let the CRM create or keep its encrypted API key.",
    href: "https://www.twilio.com/docs/iam/api-keys",
  },
  twimlAppSid: {
    title: "Where to find the TwiML App SID",
    steps: [
      "In Twilio Console, open Voice > Manage > TwiML apps.",
      "Create or open the TwiML App used by this CRM softphone.",
      "Set its Voice request URL to <Webhook base URL>/api/webhooks/twilio/voice.",
      "Copy the App SID. It normally starts with AP.",
    ],
    note: "The browser softphone needs this SID so Twilio knows which webhook to call when an agent dials.",
    href: "https://www.twilio.com/docs/voice/sdks/javascript/twiliodevice",
  },
  voiceIntelligenceServiceSid: {
    title: "Where to find the Voice Intelligence Service SID",
    steps: [
      "Use the CRM-managed voice setup button to create or update the service automatically.",
      "The CRM saves the Service SID after Twilio returns it.",
      "If you already created one manually, paste the existing Service SID here. It normally starts with GA.",
    ],
    note: "This enables post-call transcript requests from stored Twilio recording SIDs. The CRM controls when transcripts are queued.",
    href: "https://www.twilio.com/docs/voice/intelligence",
  },
  messagingServiceSid: {
    title: "Where to find the messaging service SID",
    steps: [
      "In Twilio Console, open Messaging > Services.",
      "Create or open the Messaging Service used for CRM outbound messages.",
      "Copy the Service SID. It normally starts with MG.",
    ],
    note: "Use one Messaging Service per client CRM so SMS sender pools, compliance, and status callbacks stay separate.",
    href: "https://www.twilio.com/docs/messaging/services",
  },
  smsFromNumber: {
    title: "Where to find the SMS from number",
    steps: [
      "In Twilio Console, open Phone Numbers > Manage > Active numbers.",
      "Choose an SMS-capable number assigned to this CRM.",
      "Copy the number in E.164 format, for example +447000000000.",
    ],
    note: "If a Messaging Service is configured, Twilio can select a sender from that service instead of using this exact number.",
    href: "https://www.twilio.com/docs/phone-numbers",
  },
  whatsappFromNumber: {
    title: "Where to find the WhatsApp sender",
    steps: [
      "In Twilio Console, open Messaging > Senders > WhatsApp senders.",
      "Use an approved WhatsApp sender for production, or the sandbox sender for development.",
      "Enter it with the whatsapp: prefix, for example whatsapp:+14155238886.",
    ],
    note: "Production WhatsApp senders require Meta/Twilio approval before customer conversations can be handled reliably.",
    href: "https://www.twilio.com/docs/whatsapp",
  },
  voiceCallerId: {
    title: "Where to find the voice caller ID",
    steps: [
      "In Twilio Console, open Phone Numbers > Manage > Active numbers.",
      "Choose a voice-capable number assigned to this CRM.",
      "Copy the number in E.164 format, for example +447000000000.",
    ],
    note: "This is the outbound caller ID agents will normally present when using CRM click-to-call.",
    href: "https://www.twilio.com/docs/voice",
  },
  webhookBaseUrl: {
    title: "What webhook base URL should be",
    steps: [
      "Use the public HTTPS domain for the deployed CRM.",
      "Do not include a trailing slash.",
      "Configure Twilio Messaging and Voice callbacks to use the generated CRM webhook paths.",
    ],
    note: "Localhost will not receive live Twilio webhooks unless it is exposed through a secure tunnel.",
    href: "https://www.twilio.com/docs/usage/webhooks",
  },
  capabilities: {
    title: "What capabilities control",
    steps: [
      "Enable Telephony when the CRM should support click-to-call and call status tracking.",
      "Enable SMS when the CRM should send or receive text messages.",
      "Enable WhatsApp when the CRM should send or receive WhatsApp conversations.",
    ],
    note: "These switches control what this CRM exposes in the UI. Twilio still needs the matching products, numbers, and webhooks configured.",
  },
  webhooks: {
    title: "Where webhook paths are used",
    steps: [
      "Use the messaging path for inbound SMS, inbound WhatsApp, and delivery status callbacks.",
      "Use the voice path for call status and voice webhook events.",
      "Use the transcript path for Voice Intelligence transcript-complete callbacks.",
      "Combine each path with the webhook base URL above.",
    ],
    note: "Webhook handlers are listed here so client-specific Twilio setup can be completed without code changes.",
    href: "https://www.twilio.com/docs/messaging/guides/webhook-request",
  },
};

function TwilioHelpPopover({ help }: { help: TwilioFieldHelp }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement | null>(null);
  const close = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        close();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        close();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [close, isOpen]);

  return (
    <span ref={containerRef} className="relative inline-flex">
      <button
        type="button"
        aria-label={`Help: ${help.title}`}
        aria-expanded={isOpen}
        className="ml-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-gray-300 text-[11px] leading-none font-semibold text-gray-500 transition hover:border-gray-400 hover:bg-gray-100 hover:text-gray-700 focus:ring-2 focus:ring-brand-500/30 focus:outline-none dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
        onClick={() => setIsOpen((current) => !current)}
      >
        ?
      </button>
      {isOpen && (
        <div
          role="dialog"
          aria-label={help.title}
          className="absolute top-full left-0 z-99999 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-gray-200 bg-white p-4 text-sm shadow-lg dark:border-gray-800 dark:bg-gray-900"
        >
          <p className="font-medium text-gray-800 dark:text-white/90">
            {help.title}
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs leading-5 text-gray-600 dark:text-gray-300">
            {help.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          {help.note && (
            <p className="mt-3 text-xs leading-5 text-gray-500 dark:text-gray-400">
              {help.note}
            </p>
          )}
          {help.href && (
            <a
              href={help.href}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
            >
              Open Twilio docs
            </a>
          )}
          <span className="absolute -top-1.5 left-3 h-3 w-3 rotate-45 border-t border-l border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900" />
        </div>
      )}
    </span>
  );
}

function FieldLabel({
  htmlFor,
  children,
  help,
}: {
  htmlFor: string;
  children: ReactNode;
  help: TwilioFieldHelp;
}) {
  return (
    <div className="mb-1.5 flex items-center">
      <Label htmlFor={htmlFor} className="mb-0">
        {children}
      </Label>
      <TwilioHelpPopover help={help} />
    </div>
  );
}

function SetupStep({
  detail,
  status,
  title,
}: {
  detail: string;
  status: "done" | "needed";
  title: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-gray-800 dark:text-white/90">
          {title}
        </p>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            status === "done"
              ? "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300"
              : "bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300"
          }`}
        >
          {status === "done" ? "Ready" : "Needed"}
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
        {detail}
      </p>
    </div>
  );
}

function WebhookPath({
  baseUrl,
  label,
  path,
}: {
  baseUrl?: string;
  label: string;
  path: string;
}) {
  const value = baseUrl ? `${baseUrl.replace(/\/$/, "")}${path}` : path;

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-white/[0.03]">
      <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <code className="mt-1 block break-all text-xs text-gray-700 dark:text-gray-300">
        {value}
      </code>
    </div>
  );
}

function serviceSid(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "";
  }

  const sid = (value as { sid?: unknown }).sid;
  return typeof sid === "string" ? sid : "";
}

function serviceNumberCount(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return 0;
  }

  const numbers = (value as { numbers?: unknown }).numbers;
  return Array.isArray(numbers) ? numbers.length : 0;
}

function numberPurchasePayload(
  number: TwilioAvailableNumberOption,
  fallbackCountry: string,
) {
  return JSON.stringify({
    phoneNumber: number.phoneNumber,
    country: number.country ?? fallbackCountry,
    numberType: number.numberType,
  });
}

function TwilioOperationRow({
  action,
  busy,
  busyLabel,
  buttonLabel,
  canRun,
  detail,
  label,
  ready,
  state,
}: {
  action: (payload: FormData) => void;
  busy: boolean;
  busyLabel: string;
  buttonLabel: string;
  canRun: boolean;
  detail: string;
  label: string;
  ready: boolean;
  state?: { ok: boolean; message: string; savedAt: number | null; connected: boolean };
}) {
  return (
    <form
      action={action}
      className="rounded-xl border border-gray-200 bg-white p-4 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
              {label}
            </p>
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                ready
                  ? "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300"
                  : "bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300"
              }`}
            >
              {ready ? "Ready" : "Needs attention"}
            </span>
          </div>
          <p className="mt-1 text-sm leading-5 text-gray-500 dark:text-gray-400">
            {detail}
          </p>
        </div>
        <button
          type="submit"
          disabled={!canRun || busy}
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
        >
          {busy ? busyLabel : buttonLabel}
        </button>
      </div>
      <ActionStateMessage state={state} />
    </form>
  );
}

export default function TwilioSettingsForm({
  config,
  hasStoredCredentials,
  hasEncryptionKey,
  canEdit,
  mode = "full",
  onSaved,
  showWebhookPaths = true,
  showNumberTools = true,
}: {
  config: TwilioSettings;
  hasStoredCredentials: boolean;
  hasEncryptionKey: boolean;
  canEdit: boolean;
  mode?: "advanced" | "connection" | "full" | "operations";
  onSaved?: (connected: boolean) => void;
  showWebhookPaths?: boolean;
  showNumberTools?: boolean;
}) {
  const [, setIsDirty] = useState(false);
  const { showToast } = useToast();
  const [numberCountry, setNumberCountry] = useState("GB");
  const [numberType, setNumberType] = useState("any");
  const [numberAreaCode, setNumberAreaCode] = useState("");
  const [numberContains, setNumberContains] = useState("");
  const [state, formAction, isPending] = useActionState(
    updateTwilioIntegrationAction,
    {
      ok: false,
      message: "",
      savedAt: null,
      connected: false,
    },
  );
  const [numberSearchState, numberSearchAction, isNumberSearching] =
    useActionState<TwilioNumberSearchState, FormData>(
      searchTwilioCrmNumbersAction,
      {
        ok: false,
        message: "",
        numbers: [],
      },
    );
  const [numberPurchaseState, numberPurchaseAction, isNumberPurchasing] =
    useActionState(purchaseTwilioCrmNumberAction, {
      ok: false,
      message: "",
      savedAt: null,
      connected: false,
    });
  const [setupState, setupAction, isSetupPending] = useActionState(
    configureTwilioVoiceAppAction,
    {
      ok: false,
      message: "",
      savedAt: null,
      connected: false,
    },
  );
  const [smsSetupState, smsSetupAction, isSmsSetupPending] = useActionState(
    configureTwilioMessagingAction,
    {
      ok: false,
      message: "",
      savedAt: null,
      connected: false,
    },
  );
  const [importState, importAction, isImportPending] = useActionState(
    importTwilioConfigurationAction,
    {
      ok: false,
      message: "",
      savedAt: null,
      connected: false,
      imported: undefined,
    },
  );
  const capabilities = config.capabilities ?? ["voice", "sms", "whatsapp"];
  const hasAccountCredentials = Boolean(config.accountSid && hasStoredCredentials);
  const importedInventory = config.importedInventory;
  const selectedMessagingService = importedInventory?.messagingServices.find(
    (service) => serviceSid(service) === config.messagingServiceSid,
  );
  const selectedMessagingServiceSenderCount = serviceNumberCount(
    selectedMessagingService,
  );
  const hasKnownMessagingServiceSender = Boolean(
    config.messagingServiceSid && selectedMessagingServiceSenderCount > 0,
  );
  const hasSmsSender = config.messagingServiceSid
    ? hasKnownMessagingServiceSender
    : Boolean(config.smsFromNumber);
  const hasVoiceSetup = Boolean(
    capabilities.includes("voice") &&
      config.twimlAppSid &&
      config.voiceCallerId &&
      config.webhookBaseUrl,
  );
  const hasSmsSetup = Boolean(
    capabilities.includes("sms") &&
      hasSmsSender &&
      config.webhookBaseUrl,
  );
  const importedInventoryDetail = importedInventory
    ? `${importedInventory.phoneNumbers.length} phone ${
        importedInventory.phoneNumbers.length === 1 ? "number" : "numbers"
      }, ${importedInventory.messagingServices.length} messaging ${
        importedInventory.messagingServices.length === 1 ? "service" : "services"
      } and ${importedInventory.bundles.length} regulatory ${
        importedInventory.bundles.length === 1 ? "record" : "records"
      } imported.`
    : "Pull existing Twilio numbers, messaging services and regulatory records into the CRM.";

  useEffect(() => {
    if (!state.ok || state.savedAt === null) {
      return;
    }

    showToast(state.message || "Twilio settings saved.");
    queueMicrotask(() => {
      setIsDirty(false);
      onSaved?.(state.connected);
    });
  }, [
    onSaved,
    showToast,
    state.connected,
    state.message,
    state.ok,
    state.savedAt,
  ]);

  useEffect(() => {
    if (!numberPurchaseState.ok || numberPurchaseState.savedAt === null) {
      return;
    }

    showToast(numberPurchaseState.message || "Twilio number configured.");
    onSaved?.(numberPurchaseState.connected);
  }, [
    numberPurchaseState.connected,
    numberPurchaseState.message,
    numberPurchaseState.ok,
    numberPurchaseState.savedAt,
    onSaved,
    showToast,
  ]);

  useEffect(() => {
    if (!setupState.ok || setupState.savedAt === null) {
      return;
    }

    showToast(setupState.message || "Twilio voice setup updated.");
    onSaved?.(setupState.connected);
  }, [
    onSaved,
    setupState.connected,
    setupState.message,
    setupState.ok,
    setupState.savedAt,
    showToast,
  ]);

  useEffect(() => {
    if (!smsSetupState.ok || smsSetupState.savedAt === null) {
      return;
    }

    showToast(smsSetupState.message || "Twilio SMS setup updated.");
    onSaved?.(smsSetupState.connected);
  }, [
    onSaved,
    smsSetupState.connected,
    smsSetupState.message,
    smsSetupState.ok,
    smsSetupState.savedAt,
    showToast,
  ]);

  useEffect(() => {
    if (!importState.ok || importState.savedAt === null) {
      return;
    }

    showToast(importState.message || "Twilio configuration imported.");
    onSaved?.(importState.connected);
  }, [
    importState.connected,
    importState.message,
    importState.ok,
    importState.savedAt,
    onSaved,
    showToast,
  ]);

  if (mode === "operations") {
    return (
      <div className="space-y-3">
        <TwilioOperationRow
          action={importAction}
          busy={isImportPending}
          buttonLabel="Import"
          busyLabel="Importing..."
          canRun={canEdit && hasStoredCredentials}
          detail={importedInventoryDetail}
          label="Sync Twilio inventory"
          ready={Boolean(importedInventory)}
          state={importState.ok ? undefined : importState}
        />
        <TwilioOperationRow
          action={setupAction}
          busy={isSetupPending}
          buttonLabel="Configure"
          busyLabel="Configuring..."
          canRun={canEdit && hasStoredCredentials}
          detail="Creates or repairs the TwiML App, Voice Intelligence service and voice webhook."
          label="Voice and transcripts"
          ready={Boolean(hasVoiceSetup && config.voiceIntelligenceServiceSid)}
          state={setupState.ok ? undefined : setupState}
        />
        <TwilioOperationRow
          action={smsSetupAction}
          busy={isSmsSetupPending}
          buttonLabel="Configure"
          busyLabel="Configuring..."
          canRun={canEdit && hasStoredCredentials}
          detail={
            hasKnownMessagingServiceSender
              ? `${selectedMessagingServiceSenderCount} SMS sender${selectedMessagingServiceSenderCount === 1 ? "" : "s"} attached to the Messaging Service.`
              : "Creates or repairs the Messaging Service and attaches an SMS-capable sender when available."
          }
          label="SMS messaging"
          ready={hasSmsSetup}
          state={smsSetupState.ok ? undefined : smsSetupState}
        />
        {config.messagingServiceSid && importedInventory && !hasKnownMessagingServiceSender && (
          <div className="rounded-lg border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-800 dark:border-warning-900/50 dark:bg-warning-900/20 dark:text-warning-200">
            The selected Messaging Service has no SMS sender attached. Twilio
            will accept messages, then fail delivery.
          </div>
        )}
      </div>
    );
  }

  if (mode === "advanced") {
    return (
      <form
        action={formAction}
        onChangeCapture={() => setIsDirty(true)}
        className="space-y-5"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <FieldLabel htmlFor="twilio-account-sid" help={twilioHelp.accountSid}>
              Account SID
            </FieldLabel>
            <Input
              id="twilio-account-sid"
              name="accountSid"
              defaultValue={config.accountSid ?? ""}
              placeholder="AC..."
              disabled={!canEdit}
              required
            />
          </div>
          <div>
            <FieldLabel htmlFor="twilio-auth-token" help={twilioHelp.authToken}>
              Auth Token
            </FieldLabel>
            <Input
              id="twilio-auth-token"
              name="authToken"
              type="password"
              autoComplete="new-password"
              placeholder={hasStoredCredentials ? "Saved - leave blank to keep" : ""}
              disabled={!canEdit}
            />
          </div>
          <div>
            <FieldLabel htmlFor="twilio-api-key-sid" help={twilioHelp.apiKeySid}>
              {twilioApiKeySidLabel}
            </FieldLabel>
            <Input
              id="twilio-api-key-sid"
              name="apiKeySid"
              defaultValue={config.apiKeySid ?? ""}
              placeholder="SK..."
              disabled={!canEdit}
            />
          </div>
          <div>
            <FieldLabel
              htmlFor="twilio-api-key-secret"
              help={twilioHelp.apiKeySecret}
            >
              {twilioApiKeySecretLabel}
            </FieldLabel>
            <Input
              id="twilio-api-key-secret"
              name="apiKeySecret"
              type="password"
              autoComplete="new-password"
              placeholder={hasStoredCredentials ? "Saved - leave blank to keep" : ""}
              disabled={!canEdit}
            />
          </div>
          <div>
            <FieldLabel htmlFor="twilio-twiml-app-sid" help={twilioHelp.twimlAppSid}>
              TwiML App SID
            </FieldLabel>
            <Input
              id="twilio-twiml-app-sid"
              name="twimlAppSid"
              defaultValue={config.twimlAppSid ?? ""}
              placeholder="AP..."
              disabled={!canEdit}
            />
          </div>
          <div>
            <FieldLabel
              htmlFor="twilio-voice-intelligence-service"
              help={twilioHelp.voiceIntelligenceServiceSid}
            >
              Voice Intelligence Service SID
            </FieldLabel>
            <Input
              id="twilio-voice-intelligence-service"
              name="voiceIntelligenceServiceSid"
              defaultValue={config.voiceIntelligenceServiceSid ?? ""}
              placeholder="GA..."
              disabled={!canEdit}
            />
          </div>
          <div>
            <FieldLabel htmlFor="twilio-messaging-service" help={twilioHelp.messagingServiceSid}>
              Messaging Service SID
            </FieldLabel>
            <Input
              id="twilio-messaging-service"
              name="messagingServiceSid"
              defaultValue={config.messagingServiceSid ?? ""}
              placeholder="MG..."
              disabled={!canEdit}
            />
          </div>
          <div>
            <FieldLabel htmlFor="twilio-sms-from" help={twilioHelp.smsFromNumber}>
              SMS from number
            </FieldLabel>
            <Input
              id="twilio-sms-from"
              name="smsFromNumber"
              defaultValue={config.smsFromNumber ?? ""}
              placeholder="+447..."
              disabled={!canEdit}
            />
          </div>
          <div>
            <FieldLabel htmlFor="twilio-whatsapp-from" help={twilioHelp.whatsappFromNumber}>
              WhatsApp sender
            </FieldLabel>
            <Input
              id="twilio-whatsapp-from"
              name="whatsappFromNumber"
              defaultValue={config.whatsappFromNumber ?? ""}
              placeholder="whatsapp:+14155238886"
              disabled={!canEdit}
            />
          </div>
          <div>
            <FieldLabel htmlFor="twilio-voice-caller-id" help={twilioHelp.voiceCallerId}>
              Voice caller ID
            </FieldLabel>
            <Input
              id="twilio-voice-caller-id"
              name="voiceCallerId"
              defaultValue={config.voiceCallerId ?? ""}
              placeholder="+447..."
              disabled={!canEdit}
            />
          </div>
          <div className="md:col-span-2">
            <FieldLabel htmlFor="twilio-webhook-base-url" help={twilioHelp.webhookBaseUrl}>
              Webhook base URL
            </FieldLabel>
            <Input
              id="twilio-webhook-base-url"
              name="webhookBaseUrl"
              type="url"
              defaultValue={config.webhookBaseUrl ?? ""}
              placeholder="https://crm.example.com"
              disabled={!canEdit}
            />
          </div>
        </div>

        <fieldset className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <legend className="px-1">
            <span className="inline-flex items-center text-sm font-medium text-gray-800 dark:text-white/90">
              Capabilities
              <TwilioHelpPopover help={twilioHelp.capabilities} />
            </span>
          </legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {[
              ["voice", "Telephony"],
              ["sms", "SMS"],
              ["whatsapp", "WhatsApp"],
            ].map(([value, label]) => (
              <label
                key={value}
                className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 dark:border-gray-800 dark:text-gray-300"
              >
                <input
                  type="checkbox"
                  name={`capability-${value}`}
                  defaultChecked={capabilities.includes(
                    value as TwilioConfig["capabilities"][number],
                  )}
                  disabled={!canEdit}
                  className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 dark:border-gray-700"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <ActionStateMessage state={state.ok ? undefined : state} />
        <button
          type="submit"
          disabled={!canEdit || isPending}
          className="inline-flex w-full items-center justify-center rounded-lg bg-brand-500 px-4 py-3 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Saving..." : "Save advanced Twilio settings"}
        </button>
      </form>
    );
  }

  if (mode === "connection") {
    return (
      <form
        action={formAction}
        onChangeCapture={() => setIsDirty(true)}
        className="space-y-5"
      >
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.02]">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                Credential storage
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Only connection credentials live here. Telephony behaviour is configured under Telephony.
              </p>
            </div>
            <span
              className={`inline-flex w-fit rounded-full px-2.5 py-0.5 text-xs font-medium ${
                hasStoredCredentials
                  ? "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300"
                  : "bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300"
              }`}
            >
              {hasStoredCredentials ? "Credentials saved" : "Credentials missing"}
            </span>
          </div>
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
            {hasEncryptionKey ? (
              "Leave secret fields blank to keep existing credentials."
            ) : (
              <>
                Set <code>CREDENTIAL_ENCRYPTION_KEY</code> before saving
                credentials.
              </>
            )}
          </p>
        </div>

        <input type="hidden" name="twimlAppSid" value={config.twimlAppSid ?? ""} />
        <input
          type="hidden"
          name="voiceIntelligenceServiceSid"
          value={config.voiceIntelligenceServiceSid ?? ""}
        />
        <input
          type="hidden"
          name="messagingServiceSid"
          value={config.messagingServiceSid ?? ""}
        />
        <input type="hidden" name="smsFromNumber" value={config.smsFromNumber ?? ""} />
        <input
          type="hidden"
          name="whatsappFromNumber"
          value={config.whatsappFromNumber ?? ""}
        />
        <input type="hidden" name="voiceCallerId" value={config.voiceCallerId ?? ""} />
        <input type="hidden" name="webhookBaseUrl" value={config.webhookBaseUrl ?? ""} />

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <FieldLabel htmlFor="twilio-account-sid" help={twilioHelp.accountSid}>
              Account SID
            </FieldLabel>
            <Input
              id="twilio-account-sid"
              name="accountSid"
              defaultValue={config.accountSid ?? ""}
              placeholder="AC..."
              disabled={!canEdit}
              required
            />
          </div>
          <div>
            <FieldLabel htmlFor="twilio-auth-token" help={twilioHelp.authToken}>
              Auth Token
            </FieldLabel>
            <Input
              id="twilio-auth-token"
              name="authToken"
              type="password"
              autoComplete="new-password"
              placeholder={hasStoredCredentials ? "Saved - leave blank to keep" : ""}
              disabled={!canEdit}
            />
          </div>
          <div>
            <FieldLabel htmlFor="twilio-api-key-sid" help={twilioHelp.apiKeySid}>
              {twilioApiKeySidLabel}
            </FieldLabel>
            <Input
              id="twilio-api-key-sid"
              name="apiKeySid"
              defaultValue={config.apiKeySid ?? ""}
              placeholder="SK..."
              disabled={!canEdit}
            />
          </div>
          <div>
            <FieldLabel
              htmlFor="twilio-api-key-secret"
              help={twilioHelp.apiKeySecret}
            >
              {twilioApiKeySecretLabel}
            </FieldLabel>
            <Input
              id="twilio-api-key-secret"
              name="apiKeySecret"
              type="password"
              autoComplete="new-password"
              placeholder={hasStoredCredentials ? "Saved - leave blank to keep" : ""}
              disabled={!canEdit}
            />
          </div>
        </div>

        <fieldset className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <legend className="px-1">
            <span className="inline-flex items-center text-sm font-medium text-gray-800 dark:text-white/90">
              Enabled products
              <TwilioHelpPopover help={twilioHelp.capabilities} />
            </span>
          </legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {[
              ["voice", "Telephony"],
              ["sms", "SMS"],
              ["whatsapp", "WhatsApp"],
            ].map(([value, label]) => (
              <label
                key={value}
                className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 dark:border-gray-800 dark:text-gray-300"
              >
                <input
                  type="checkbox"
                  name={`capability-${value}`}
                  defaultChecked={capabilities.includes(
                    value as TwilioConfig["capabilities"][number],
                  )}
                  disabled={!canEdit}
                  className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 dark:border-gray-700"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="space-y-4">
          <ActionStateMessage state={state.ok ? undefined : state} />
          <button
            type="submit"
            disabled={!canEdit || isPending}
            className="inline-flex w-full items-center justify-center rounded-lg bg-brand-500 px-4 py-3 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Saving..." : "Save Twilio connection"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form
      action={formAction}
      onChangeCapture={() => setIsDirty(true)}
      className="space-y-5"
    >
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.02]">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-gray-800 dark:text-white/90">
              Credential storage
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Twilio secrets are entered here and encrypted before being saved.
            </p>
          </div>
          <span
            className={`inline-flex w-fit rounded-full px-2.5 py-0.5 text-xs font-medium ${
              hasStoredCredentials
                ? "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300"
                : "bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300"
            }`}
          >
            {hasStoredCredentials ? "Credentials saved" : "Credentials missing"}
          </span>
        </div>
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          {hasEncryptionKey ? (
            "Leave secret fields blank to keep existing credentials."
          ) : (
            <>
              Set <code>CREDENTIAL_ENCRYPTION_KEY</code> before saving
              credentials.
            </>
          )}
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.02]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
              Twilio setup guide
            </p>
            <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
              Complete these in order. The CRM can import existing Twilio objects so customers
              do not need to understand every SID.
            </p>
          </div>
          <button
            type="submit"
            formAction={importAction}
            disabled={!canEdit || !hasStoredCredentials || isImportPending}
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
          >
            {isImportPending ? "Importing..." : "Import from Twilio"}
          </button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <SetupStep
            title="1. Connect account"
            detail="Account SID and Auth Token saved in the CRM."
            status={hasAccountCredentials ? "done" : "needed"}
          />
          <SetupStep
            title="2. Import Twilio"
            detail="Pull services, numbers, addresses and bundles into CRM records."
            status={importedInventory ? "done" : "needed"}
          />
          <SetupStep
            title="3. Enable SMS"
            detail="Messaging Service with a sender pool plus messaging webhooks."
            status={hasSmsSetup ? "done" : "needed"}
          />
          <SetupStep
            title="4. Enable voice"
            detail="Voice App, caller ID and voice webhook for the softphone."
            status={hasVoiceSetup ? "done" : "needed"}
          />
          <SetupStep
            title="5. Enable transcripts"
            detail="Voice Intelligence Service SID and transcript webhook."
            status={config.voiceIntelligenceServiceSid && config.webhookBaseUrl ? "done" : "needed"}
          />
        </div>
        {importedInventory && (
          <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-white/[0.03]">
            <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
              Last Twilio import
            </p>
            <div className="mt-2 grid gap-2 text-xs text-gray-600 dark:text-gray-300 sm:grid-cols-2 lg:grid-cols-4">
              <p>{importedInventory.phoneNumbers.length} phone numbers</p>
              <p>{importedInventory.messagingServices.length} messaging services</p>
              <p>{importedInventory.addresses.length} addresses</p>
              <p>{importedInventory.bundles.length} regulatory bundles</p>
            </div>
          </div>
        )}
        <div className="mt-3">
          <ActionStateMessage state={importState.ok ? undefined : importState} />
        </div>
      </div>

      {showNumberTools && (
      <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.02]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
              CRM phone number
            </p>
            <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
              Find, buy and wire a Twilio number without leaving the CRM.
            </p>
          </div>
          <div className="grid gap-2 text-xs text-gray-600 dark:text-gray-300 sm:grid-cols-3 lg:min-w-[460px]">
            <SetupStep
              title="Voice"
              detail={config.voiceCallerId || "No caller ID saved."}
              status={config.voiceCallerId ? "done" : "needed"}
            />
            <SetupStep
              title="SMS"
              detail={config.smsFromNumber || "No SMS sender saved."}
              status={hasSmsSender ? "done" : "needed"}
            />
            <SetupStep
              title="Service"
              detail={`${selectedMessagingServiceSenderCount} sender${selectedMessagingServiceSenderCount === 1 ? "" : "s"}`}
              status={hasKnownMessagingServiceSender ? "done" : "needed"}
            />
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[120px_150px_1fr_1fr_auto] lg:items-end">
          <div>
            <FieldLabel htmlFor="twilio-number-country" help={twilioHelp.smsFromNumber}>
              Country
            </FieldLabel>
            <Input
              id="twilio-number-country"
              name="numberCountry"
              value={numberCountry}
              onChange={(event) => setNumberCountry(event.target.value.toUpperCase())}
              maxLength={2}
              disabled={!canEdit}
            />
          </div>
          <div>
            <FieldLabel htmlFor="twilio-number-type" help={twilioHelp.smsFromNumber}>
              Type
            </FieldLabel>
            <select
              id="twilio-number-type"
              name="numberType"
              value={numberType}
              onChange={(event) => setNumberType(event.target.value)}
              disabled={!canEdit}
              className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 outline-none focus:border-brand-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-white/90"
            >
              <option value="any">Any</option>
              <option value="local">Local</option>
              <option value="national">National</option>
              <option value="mobile">Mobile</option>
              <option value="tollFree">Toll-free</option>
            </select>
          </div>
          <div>
            <FieldLabel htmlFor="twilio-number-area" help={twilioHelp.smsFromNumber}>
              Area code
            </FieldLabel>
            <Input
              id="twilio-number-area"
              name="numberAreaCode"
              value={numberAreaCode}
              onChange={(event) => setNumberAreaCode(event.target.value)}
              placeholder="01484"
              disabled={!canEdit}
            />
          </div>
          <div>
            <FieldLabel htmlFor="twilio-number-contains" help={twilioHelp.smsFromNumber}>
              Contains
            </FieldLabel>
            <Input
              id="twilio-number-contains"
              name="numberContains"
              value={numberContains}
              onChange={(event) => setNumberContains(event.target.value)}
              placeholder="Optional"
              disabled={!canEdit}
            />
          </div>
          <button
            type="submit"
            formAction={numberSearchAction}
            disabled={!canEdit || !hasStoredCredentials || isNumberSearching}
            className="inline-flex h-11 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
          >
            {isNumberSearching ? "Searching..." : "Find numbers"}
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <ActionStateMessage state={numberSearchState} />
          <ActionStateMessage
            state={numberPurchaseState.ok ? undefined : numberPurchaseState}
          />
          {numberSearchState.numbers.length > 0 && (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {numberSearchState.numbers.map((number) => (
                <div
                  key={number.phoneNumber}
                  className="rounded-lg border border-gray-200 p-3 dark:border-gray-800"
                >
                  <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                    {number.phoneNumber}
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {[number.locality, number.region, number.country]
                      .filter(Boolean)
                      .join(", ") || number.friendlyName || "CRM number"}
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Voice + SMS / {number.numberType}
                  </p>
                  <button
                    type="submit"
                    formAction={numberPurchaseAction}
                    name="numberPayload"
                    value={numberPurchasePayload(number, numberCountry)}
                    disabled={!canEdit || isNumberPurchasing}
                    className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-lg bg-success-600 px-3 text-sm font-medium text-white hover:bg-success-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isNumberPurchasing ? "Buying..." : "Buy and configure"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <FieldLabel htmlFor="twilio-account-sid" help={twilioHelp.accountSid}>
            Account SID
          </FieldLabel>
          <Input
            id="twilio-account-sid"
            name="accountSid"
            defaultValue={config.accountSid ?? ""}
            placeholder="AC..."
            disabled={!canEdit}
            required
          />
        </div>
        <div>
          <FieldLabel htmlFor="twilio-auth-token" help={twilioHelp.authToken}>
            Auth Token
          </FieldLabel>
          <Input
            id="twilio-auth-token"
            name="authToken"
            type="password"
            autoComplete="new-password"
            placeholder={
              hasStoredCredentials ? "Saved - leave blank to keep" : ""
            }
            disabled={!canEdit}
          />
        </div>
        <div>
          <FieldLabel htmlFor="twilio-api-key-sid" help={twilioHelp.apiKeySid}>
            {twilioApiKeySidLabel}
          </FieldLabel>
          <Input
            id="twilio-api-key-sid"
            name="apiKeySid"
            defaultValue={config.apiKeySid ?? ""}
            placeholder="SK..."
            disabled={!canEdit}
          />
        </div>
        <div>
          <FieldLabel
            htmlFor="twilio-api-key-secret"
            help={twilioHelp.apiKeySecret}
          >
            {twilioApiKeySecretLabel}
          </FieldLabel>
          <Input
            id="twilio-api-key-secret"
            name="apiKeySecret"
            type="password"
            autoComplete="new-password"
            placeholder={
              hasStoredCredentials ? "Saved - leave blank to keep" : ""
            }
            disabled={!canEdit}
          />
        </div>
        <div>
          <FieldLabel
            htmlFor="twilio-twiml-app-sid"
            help={twilioHelp.twimlAppSid}
          >
            TwiML App SID
          </FieldLabel>
          <Input
            id="twilio-twiml-app-sid"
            name="twimlAppSid"
            defaultValue={config.twimlAppSid ?? ""}
            placeholder="AP..."
            disabled={!canEdit}
          />
        </div>
        <div>
          <FieldLabel
            htmlFor="twilio-voice-intelligence-service"
            help={twilioHelp.voiceIntelligenceServiceSid}
          >
            Voice Intelligence Service SID
          </FieldLabel>
          <Input
            id="twilio-voice-intelligence-service"
            name="voiceIntelligenceServiceSid"
            defaultValue={config.voiceIntelligenceServiceSid ?? ""}
            placeholder="GA..."
            disabled={!canEdit}
          />
        </div>
        <div>
          <FieldLabel
            htmlFor="twilio-messaging-service"
            help={twilioHelp.messagingServiceSid}
          >
            Messaging Service SID
          </FieldLabel>
          <Input
            id="twilio-messaging-service"
            name="messagingServiceSid"
            defaultValue={config.messagingServiceSid ?? ""}
            placeholder="MG..."
            disabled={!canEdit}
          />
        </div>
        <div>
          <FieldLabel htmlFor="twilio-sms-from" help={twilioHelp.smsFromNumber}>
            SMS from number
          </FieldLabel>
          <Input
            id="twilio-sms-from"
            name="smsFromNumber"
            defaultValue={config.smsFromNumber ?? ""}
            placeholder="+447..."
            disabled={!canEdit}
          />
        </div>
        <div>
          <FieldLabel
            htmlFor="twilio-whatsapp-from"
            help={twilioHelp.whatsappFromNumber}
          >
            WhatsApp sender
          </FieldLabel>
          <Input
            id="twilio-whatsapp-from"
            name="whatsappFromNumber"
            defaultValue={config.whatsappFromNumber ?? ""}
            placeholder="whatsapp:+14155238886"
            disabled={!canEdit}
          />
        </div>
        <div>
          <FieldLabel
            htmlFor="twilio-voice-caller-id"
            help={twilioHelp.voiceCallerId}
          >
            Voice caller ID
          </FieldLabel>
          <Input
            id="twilio-voice-caller-id"
            name="voiceCallerId"
            defaultValue={config.voiceCallerId ?? ""}
            placeholder="+447..."
            disabled={!canEdit}
          />
        </div>
        <div className="md:col-span-2">
          <FieldLabel
            htmlFor="twilio-webhook-base-url"
            help={twilioHelp.webhookBaseUrl}
          >
            Webhook base URL
          </FieldLabel>
          <Input
            id="twilio-webhook-base-url"
            name="webhookBaseUrl"
            type="url"
            defaultValue={config.webhookBaseUrl ?? ""}
            placeholder="https://crm.example.com"
            disabled={!canEdit}
          />
          <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
            Twilio webhooks should point to this CRM domain when deployed.
          </p>
        </div>
      </div>

      <fieldset className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
        <legend className="px-1">
          <span className="inline-flex items-center text-sm font-medium text-gray-800 dark:text-white/90">
            Capabilities
            <TwilioHelpPopover help={twilioHelp.capabilities} />
          </span>
        </legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {[
            ["voice", "Telephony"],
            ["sms", "SMS"],
            ["whatsapp", "WhatsApp"],
          ].map(([value, label]) => (
            <label
              key={value}
              className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 dark:border-gray-800 dark:text-gray-300"
            >
              <input
                type="checkbox"
                name={`capability-${value}`}
                defaultChecked={capabilities.includes(
                  value as TwilioConfig["capabilities"][number],
                )}
                disabled={!canEdit}
                className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 dark:border-gray-700"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.02]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-gray-800 dark:text-white/90">
              SMS readiness
            </p>
            <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
              The CRM can create or repair the Messaging Service, attach an
              SMS-capable number, and point callbacks at this system.
            </p>
          </div>
          <button
            type="submit"
            formAction={smsSetupAction}
            disabled={!canEdit || !hasStoredCredentials || isSmsSetupPending}
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
          >
            {isSmsSetupPending ? "Configuring..." : "Configure SMS"}
          </button>
        </div>
        {config.messagingServiceSid && importedInventory && !hasKnownMessagingServiceSender && (
          <div className="mt-3 rounded-lg border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-800 dark:border-warning-900/50 dark:bg-warning-900/20 dark:text-warning-200">
            The selected Messaging Service has no SMS sender attached. Twilio
            will accept messages, then fail delivery.
          </div>
        )}
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <SetupStep
            title="Sender pool"
            detail={
              config.messagingServiceSid
                ? `${selectedMessagingServiceSenderCount} sender numbers attached.`
                : "Messaging Service with at least one SMS-capable number."
            }
            status={hasSmsSender ? "done" : "needed"}
          />
          <SetupStep
            title="Webhook"
            detail="Inbound replies and delivery status need the CRM webhook base URL."
            status={config.webhookBaseUrl ? "done" : "needed"}
          />
          <SetupStep
            title="Compliance"
            detail="US/Canada senders need A2P or toll-free verification; many international numbers need regulatory records."
            status={
              (importedInventory?.bundles.length ?? 0) > 0 ||
              (importedInventory?.phoneNumbers.length ?? 0) > 0
                ? "done"
                : "needed"
            }
          />
        </div>
        <div className="mt-3">
          <ActionStateMessage
            state={smsSetupState.ok ? undefined : smsSetupState}
          />
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.02]">
        <p className="text-sm font-medium text-gray-800 dark:text-white/90">
          Recording and transcript readiness
        </p>
        <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
          Call replay works from the recording callback. Transcripts need a Twilio Voice
          Intelligence Service and the CRM transcript webhook.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <SetupStep
            title="Recording callback"
            detail="Stored recordings are proxied through the CRM for playback."
            status={config.webhookBaseUrl ? "done" : "needed"}
          />
          <SetupStep
            title="Voice Intelligence"
            detail="Service SID used to request post-call transcripts."
            status={config.voiceIntelligenceServiceSid ? "done" : "needed"}
          />
          <SetupStep
            title="AI summaries"
            detail="Generated when transcripts arrive and OpenAI is configured."
            status={config.voiceIntelligenceServiceSid ? "done" : "needed"}
          />
        </div>
      </div>

      {showWebhookPaths && (
      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.02]">
        <p className="inline-flex items-center text-sm font-medium text-gray-800 dark:text-white/90">
          Planned webhook paths
          <TwilioHelpPopover help={twilioHelp.webhooks} />
        </p>
        <div className="mt-3 grid gap-2">
          <WebhookPath
            label="Messaging inbound/status"
            baseUrl={config.webhookBaseUrl}
            path="/api/webhooks/twilio/messaging"
          />
          <WebhookPath
            label="Voice inbound/status"
            baseUrl={config.webhookBaseUrl}
            path="/api/webhooks/twilio/voice"
          />
          <WebhookPath
            label="Voice Intelligence transcript"
            baseUrl={config.webhookBaseUrl}
            path="/api/webhooks/twilio/voice/transcript"
          />
        </div>
      </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.02]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-gray-800 dark:text-white/90">
              CRM-managed voice setup
            </p>
            <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
              Creates or updates the Twilio TwiML App and Voice Intelligence
              service with this CRM&apos;s voice and transcript webhooks.
            </p>
          </div>
          <button
            type="submit"
            formAction={setupAction}
            disabled={!canEdit || isSetupPending}
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
          >
            {isSetupPending ? "Configuring..." : "Configure voice setup"}
          </button>
        </div>
        <ActionStateMessage state={setupState.ok ? undefined : setupState} />
      </div>

      <div className="space-y-4">
        <ActionStateMessage state={state.ok ? undefined : state} />
        <button
          type="submit"
          disabled={!canEdit || isPending}
          className="inline-flex w-full items-center justify-center rounded-lg bg-brand-500 px-4 py-3 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Saving..." : "Save Twilio settings"}
        </button>
      </div>
    </form>
  );
}
