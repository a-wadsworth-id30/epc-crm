"use client";

import { useActionState, useEffect, useMemo, useState, type ReactNode } from "react";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import LazyHelpTooltip from "@/components/crm-boilerplate/LazyHelpTooltip";
import ResponsiveDataList, {
  ResponsiveDataField,
} from "@/components/crm-boilerplate/ResponsiveDataList";
import SummaryMetricTile from "@/components/crm-boilerplate/SummaryMetricTile";
import {
  generateTwilioGbMobileBundleFromExistingAction,
  generateTwilioGbMobileBundleAction,
  purchaseBusinessPhoneNumberAction,
  releaseBusinessPhoneNumberAction,
  searchTwilioCrmNumbersAction,
  type TwilioComplianceBundleState,
  type TwilioAvailableNumberOption,
  type TwilioNumberSearchState,
} from "@/lib/actions/integrations";

type RoutingStatus = "DEFAULT" | "CONFIGURED" | "NEEDS_ROUTING" | "RELEASED";

export type BusinessNumberRow = {
  id: string;
  phoneNumber: string;
  label: string | null;
  twilioPhoneNumberSid: string | null;
  country: string | null;
  numberType: string | null;
  status: "ACTIVE" | "RELEASED";
  capabilities: {
    voice?: boolean;
    sms?: boolean;
    mms?: boolean;
  } | null;
  createdAt: string;
  releasedAt: string | null;
  routingStatus: RoutingStatus;
  routingLabel: string;
};

type IntegrationActionState = {
  ok: boolean;
  message: string;
  savedAt: number | null;
  connected: boolean;
};

const initialActionState: IntegrationActionState = {
  ok: false,
  message: "",
  savedAt: null,
  connected: false,
};

const initialBundleState: TwilioComplianceBundleState = {
  ok: false,
  message: "",
  savedAt: null,
  connected: false,
  bundleSid: null,
  status: null,
};

export default function BusinessNumbersManager({
  numbers,
  twilioReady,
}: {
  numbers: BusinessNumberRow[];
  twilioReady: boolean;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [numberLabel, setNumberLabel] = useState("");
  const [releaseTarget, setReleaseTarget] = useState<BusinessNumberRow | null>(null);
  const [searchState, searchAction, isSearching] =
    useActionState<TwilioNumberSearchState, FormData>(searchTwilioCrmNumbersAction, {
      ok: false,
      message: "",
      numbers: [],
    });
  const [purchaseState, purchaseAction, isPurchasing] = useActionState(
    purchaseBusinessPhoneNumberAction,
    initialActionState,
  );
  const [releaseState, releaseAction, isReleasing] = useActionState(
    releaseBusinessPhoneNumberAction,
    initialActionState,
  );
  const [bundleState, bundleAction, isGeneratingBundle] = useActionState(
    generateTwilioGbMobileBundleAction,
    initialBundleState,
  );
  const [reuseBundleState, reuseBundleAction, isReusingBundle] = useActionState(
    generateTwilioGbMobileBundleFromExistingAction,
    initialBundleState,
  );
  const activeNumbers = numbers.filter((number) => number.status === "ACTIVE");
  const routedNumbers = numbers.filter(
    (number) => number.routingStatus === "CONFIGURED" || number.routingStatus === "DEFAULT",
  );
  const releasedNumbers = numbers.filter((number) => number.status === "RELEASED");

  useEffect(() => {
    if (purchaseState.ok && purchaseState.savedAt) {
      queueMicrotask(() => {
        setAddOpen(false);
        setNumberLabel("");
      });
    }
  }, [purchaseState.ok, purchaseState.savedAt]);

  useEffect(() => {
    if (releaseState.ok && releaseState.savedAt) {
      queueMicrotask(() => setReleaseTarget(null));
    }
  }, [releaseState.ok, releaseState.savedAt]);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <SummaryMetricTile label="Active numbers" value={String(activeNumbers.length)} />
        <SummaryMetricTile
          label="Routing coverage"
          value={`${routedNumbers.length}/${activeNumbers.length}`}
        />
        <SummaryMetricTile label="Released numbers" value={String(releasedNumbers.length)} />
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-col gap-3 border-b border-gray-200 px-5 py-4 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
                Phone numbers
              </h2>
              <LazyHelpTooltip content="Manages owned Twilio phone numbers used for main lines, teams and regions; routing is configured separately." />
            </div>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Purchase and own operational Twilio numbers. Choose the number purpose before searching.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            disabled={!twilioReady}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-gray-900 px-4 text-sm font-semibold text-white shadow-theme-xs transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100 dark:disabled:bg-white/10 dark:disabled:text-gray-500"
          >
            Add phone number
          </button>
        </div>

        {!twilioReady ? (
          <div className="border-b border-warning-200 bg-warning-50 px-5 py-3 text-sm text-warning-800 dark:border-warning-900/50 dark:bg-warning-900/20 dark:text-warning-200">
            Save Twilio Account SID, Auth Token and webhook base URL before buying numbers.
          </div>
        ) : null}

        <ResponsiveDataList
          breakpoint="lg"
          cardListClassName="divide-y divide-gray-100 dark:divide-gray-800"
          empty={<BusinessNumbersEmptyState />}
          getKey={(number) => number.id}
          items={numbers}
          renderCard={(number) => (
            <BusinessNumberMobileCard
              number={number}
              onRelease={() => setReleaseTarget(number)}
            />
          )}
          table={
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-white/[0.02] dark:text-gray-400">
                  <tr>
                    <th className="px-5 py-3">Number</th>
                    <th className="px-5 py-3">Capabilities</th>
                    <th className="px-5 py-3">Routing</th>
                    <th className="px-5 py-3">Ownership</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {numbers.length ? (
                    numbers.map((number) => (
                      <tr key={number.id} className="text-sm text-gray-700 dark:text-gray-300">
                        <td className="px-5 py-4">
                          <div className="font-semibold text-gray-800 dark:text-white/90">
                            {number.label || "Business number"}
                          </div>
                          <div className="mt-1 font-mono text-xs text-gray-500 dark:text-gray-400">
                            {number.phoneNumber}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <CapabilityPills capabilities={number.capabilities} />
                        </td>
                        <td className="px-5 py-4">
                          <RoutingBadge status={number.routingStatus} />
                          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {number.routingLabel}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <OwnershipStatus number={number} />
                        </td>
                        <td className="px-5 py-4 text-right">
                          <BusinessNumberActions
                            number={number}
                            onRelease={() => setReleaseTarget(number)}
                          />
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-5 py-12 text-center">
                        <BusinessNumbersEmptyState />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          }
        />
      </div>

      <ActionStateMessage state={purchaseState.message && !purchaseState.ok ? purchaseState : undefined} />
      <ActionStateMessage state={releaseState.message && !releaseState.ok ? releaseState : undefined} />

      {addOpen ? (
        <AddNumberModal
          isPurchasing={isPurchasing}
          isSearching={isSearching}
          numberLabel={numberLabel}
          onClose={() => setAddOpen(false)}
          onLabelChange={setNumberLabel}
          purchaseAction={purchaseAction}
          purchaseState={purchaseState}
          bundleAction={bundleAction}
          bundleState={bundleState}
          isGeneratingBundle={isGeneratingBundle}
          reuseBundleAction={reuseBundleAction}
          reuseBundleState={reuseBundleState}
          isReusingBundle={isReusingBundle}
          searchAction={searchAction}
          searchState={searchState}
        />
      ) : null}

      {releaseTarget ? (
        <ReleaseNumberModal
          isReleasing={isReleasing}
          onClose={() => setReleaseTarget(null)}
          releaseAction={releaseAction}
          releaseState={releaseState}
          target={releaseTarget}
        />
      ) : null}
    </div>
  );
}

function BusinessNumberMobileCard({
  number,
  onRelease,
}: {
  number: BusinessNumberRow;
  onRelease: () => void;
}) {
  return (
    <article className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-gray-800 dark:text-white/90">
            {number.label || "Business number"}
          </p>
          <p className="mt-1 truncate font-mono text-xs text-gray-500 dark:text-gray-400">
            {number.phoneNumber}
          </p>
        </div>
        <BusinessNumberActions number={number} onRelease={onRelease} />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3">
        <ResponsiveDataField label="Capabilities">
          <CapabilityPills capabilities={number.capabilities} />
        </ResponsiveDataField>
        <ResponsiveDataField label="Routing">
          <RoutingBadge status={number.routingStatus} />
        </ResponsiveDataField>
        <ResponsiveDataField label="Route" className="col-span-2">
          <span className="block truncate">{number.routingLabel}</span>
        </ResponsiveDataField>
        <ResponsiveDataField label="Ownership" className="col-span-2">
          <OwnershipStatus number={number} />
        </ResponsiveDataField>
      </dl>
    </article>
  );
}

function OwnershipStatus({ number }: { number: BusinessNumberRow }) {
  return (
    <>
      <span
        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
          number.status === "ACTIVE"
            ? "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300"
            : "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-400"
        }`}
      >
        {number.status === "ACTIVE" ? "Twilio active" : "Released"}
      </span>
      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        {number.status === "ACTIVE"
          ? "Rental charges continue in Twilio."
          : `Released ${formatDate(number.releasedAt)}`}
      </div>
    </>
  );
}

function BusinessNumberActions({
  number,
  onRelease,
}: {
  number: BusinessNumberRow;
  onRelease: () => void;
}) {
  if (number.status !== "ACTIVE") {
    return <span className="text-xs text-gray-400">No actions</span>;
  }

  return (
    <div className="flex shrink-0 flex-wrap justify-end gap-2">
      <a
        href="/telephony/routing"
        className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
      >
        Routing
      </a>
      <button
        type="button"
        onClick={onRelease}
        className="inline-flex h-9 items-center justify-center rounded-lg border border-error-200 bg-error-50 px-3 text-xs font-semibold text-error-700 hover:bg-error-100 dark:border-error-900/50 dark:bg-error-900/20 dark:text-error-300"
      >
        Release
      </button>
    </div>
  );
}

function BusinessNumbersEmptyState() {
  return (
    <div className="mx-auto max-w-md px-5 py-12 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-900/20 dark:text-brand-300">
        <PhoneGlyph />
      </div>
      <h3 className="mt-4 text-base font-semibold text-gray-800 dark:text-white/90">
        No phone numbers yet
      </h3>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Add Voice + SMS capable Twilio numbers for main lines, regions or teams. Tracking pool numbers stay in Call Tracking.
      </p>
    </div>
  );
}

function AddNumberModal({
  isPurchasing,
  isSearching,
  numberLabel,
  onClose,
  onLabelChange,
  purchaseAction,
  purchaseState,
  bundleAction,
  bundleState,
  isGeneratingBundle,
  reuseBundleAction,
  reuseBundleState,
  isReusingBundle,
  searchAction,
  searchState,
}: {
  isPurchasing: boolean;
  isSearching: boolean;
  isGeneratingBundle: boolean;
  isReusingBundle: boolean;
  numberLabel: string;
  onClose: () => void;
  onLabelChange: (value: string) => void;
  purchaseAction: (payload: FormData) => void;
  purchaseState: IntegrationActionState;
  bundleAction: (payload: FormData) => void;
  bundleState: TwilioComplianceBundleState;
  reuseBundleAction: (payload: FormData) => void;
  reuseBundleState: TwilioComplianceBundleState;
  searchAction: (payload: FormData) => void;
  searchState: TwilioNumberSearchState;
}) {
  const [numberPurpose, setNumberPurpose] = useState<"business" | "tracking">("business");

  return (
    <ModalShell title="Add phone number" onClose={onClose}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <NumberPurposeButton
            active={numberPurpose === "business"}
            detail="Main lines, team lines and SMS replies."
            label="Business number"
            meta="Voice + SMS capable"
            onClick={() => setNumberPurpose("business")}
          />
          <NumberPurposeButton
            active={numberPurpose === "tracking"}
            detail="Marketing attribution and DNI pools."
            label="Call tracking number"
            meta="Managed in Call Tracking"
            onClick={() => setNumberPurpose("tracking")}
          />
        </div>

        {numberPurpose === "business" ? (
          <>
            <div className="rounded-xl border border-warning-200 bg-warning-50 p-3 text-sm text-warning-800 dark:border-warning-900/50 dark:bg-warning-900/20 dark:text-warning-200">
              Buying a number starts Twilio number rental charges. Business number search is filtered to numbers that support both Voice and SMS.
            </div>
            <form action={searchAction} className="grid gap-3 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                  Label
                </label>
                <input
                  value={numberLabel}
                  onChange={(event) => onLabelChange(event.target.value)}
                  placeholder="Main line, Liverpool team, Support"
                  className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-4">
                <NumberField label="Country" name="numberCountry" placeholder="GB" defaultValue="GB" />
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                    Number format
                  </label>
                  <select
                    name="numberType"
                    defaultValue="any"
                    className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                  >
                    <option value="any">Any format</option>
                    <option value="local">Local</option>
                    <option value="national">National</option>
                    <option value="mobile">Mobile - may need compliance</option>
                    <option value="tollFree">Toll-free</option>
                  </select>
                </div>
                <NumberField label="Area code" name="numberAreaCode" placeholder="01484" />
                <NumberField label="Contains" name="numberContains" placeholder="Optional" />
              </div>
              <button
                type="submit"
                disabled={isSearching}
                className="inline-flex h-10 items-center justify-center rounded-lg bg-gray-900 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-gray-900"
              >
                {isSearching ? "Searching..." : "Search business numbers"}
              </button>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                UK mobile numbers require an approved Twilio regulatory bundle before purchase. Local or national numbers are the normal choice for quick setup.
              </p>
            </form>
            <details className="rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-white/[0.03]">
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-gray-800 dark:text-white/90">
                Generate UK mobile compliance bundle
              </summary>
              <div className="space-y-4 border-t border-gray-200 p-4 dark:border-gray-800">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Reuse an existing Twilio bundle where possible. If no reusable End User and supporting documents exist, enter the details manually once.
                </p>
                <form action={reuseBundleAction} className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                        Use existing Twilio compliance details
                      </p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Copies the End User and documents from an existing submitted bundle into the GB mobile bundle.
                      </p>
                    </div>
                    <button
                      type="submit"
                      disabled={isReusingBundle}
                      className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-gray-900 px-4 text-sm font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
                    >
                      {isReusingBundle ? "Checking Twilio..." : "Reuse existing details"}
                    </button>
                  </div>
                  <ActionStateMessage state={reuseBundleState.message ? reuseBundleState : undefined} />
                </form>
                <form action={bundleAction} className="space-y-4">
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Manual details
                  </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <ComplianceField label="Registered business name" name="businessName" placeholder="Acme Ltd" />
                  <ComplianceField label="Company registration number" name="businessRegistrationNumber" placeholder="12345678" />
                  <ComplianceField label="Business website" name="businessWebsite" placeholder="https://example.com" />
                  <ComplianceField label="Compliance email" name="complianceEmail" placeholder="compliance@example.com" type="email" />
                  <ComplianceField label="Address line 1" name="addressLine1" placeholder="1 Example Street" />
                  <ComplianceField label="Address line 2" name="addressLine2" placeholder="Optional" required={false} />
                  <ComplianceField label="City" name="city" placeholder="London" />
                  <ComplianceField label="County / region" name="region" placeholder="Greater London" />
                  <ComplianceField label="Postcode" name="postalCode" placeholder="SW1A 1AA" />
                  <ComplianceField label="Authorised person" name="representativeName" placeholder="Jane Smith" />
                  <ComplianceField label="Authorised email" name="representativeEmail" placeholder="jane@example.com" type="email" />
                  <ComplianceField label="Authorised phone" name="representativePhone" placeholder="+447700900123" />
                </div>
                <ActionStateMessage state={bundleState.message ? bundleState : undefined} />
                <button
                  type="submit"
                  disabled={isGeneratingBundle}
                  className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isGeneratingBundle ? "Generating bundle..." : "Generate and submit bundle"}
                </button>
              </form>
              </div>
            </details>
          </>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.03]">
            <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
              Call tracking numbers are managed separately.
            </p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Use Call Tracking for attribution pools, DNI rules and campaign-specific tracking numbers.
            </p>
            <a
              href="/telephony/call-tracking/numbers"
              className="mt-4 inline-flex h-10 items-center justify-center rounded-lg bg-gray-900 px-4 text-sm font-semibold text-white shadow-theme-xs hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
            >
              Open Call Tracking numbers
            </a>
          </div>
        )}

        {numberPurpose === "business" ? (
          <>
            <ActionStateMessage state={searchState.message ? searchState : undefined} />
            <ActionStateMessage state={purchaseState.message ? purchaseState : undefined} />

            {searchState.numbers.length ? (
              <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
                {searchState.numbers.map((number) => (
                  <AvailableNumberRow
                    key={number.phoneNumber}
                    isPurchasing={isPurchasing}
                    number={number}
                    numberLabel={numberLabel}
                    purchaseAction={purchaseAction}
                  />
                ))}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </ModalShell>
  );
}

function NumberPurposeButton({
  active,
  detail,
  label,
  meta,
  onClick,
}: {
  active: boolean;
  detail: string;
  label: string;
  meta: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border p-4 text-left transition ${
        active
          ? "border-brand-300 bg-brand-50 ring-2 ring-brand-500/10 dark:border-brand-500/60 dark:bg-brand-900/20"
          : "border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-800 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
      }`}
      aria-pressed={active}
    >
      <span className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-gray-800 dark:text-white/90">{label}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            active
              ? "bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-200"
              : "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400"
          }`}
        >
          {meta}
        </span>
      </span>
      <span className="mt-2 block text-sm text-gray-500 dark:text-gray-400">{detail}</span>
    </button>
  );
}

function AvailableNumberRow({
  isPurchasing,
  number,
  numberLabel,
  purchaseAction,
}: {
  isPurchasing: boolean;
  number: TwilioAvailableNumberOption;
  numberLabel: string;
  purchaseAction: (payload: FormData) => void;
}) {
  const payload = useMemo(() => JSON.stringify(number), [number]);

  return (
    <form
      action={purchaseAction}
      className="flex flex-col gap-3 rounded-xl border border-gray-200 p-3 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between"
    >
      <input type="hidden" name="numberPayload" value={payload} />
      <input type="hidden" name="numberLabel" value={numberLabel || number.friendlyName || "Business number"} />
      <div>
        <div className="font-semibold text-gray-800 dark:text-white/90">{number.phoneNumber}</div>
        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {[number.locality, number.region, number.country, number.numberType]
            .filter(Boolean)
            .join(" / ") || "Twilio number"}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <CapabilityPills capabilities={number.capabilities} />
        <button
          type="submit"
          disabled={isPurchasing}
          className="inline-flex h-9 items-center justify-center rounded-lg bg-brand-500 px-3 text-xs font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPurchasing ? "Buying..." : "Buy number"}
        </button>
      </div>
    </form>
  );
}

function ReleaseNumberModal({
  isReleasing,
  onClose,
  releaseAction,
  releaseState,
  target,
}: {
  isReleasing: boolean;
  onClose: () => void;
  releaseAction: (payload: FormData) => void;
  releaseState: IntegrationActionState;
  target: BusinessNumberRow;
}) {
  return (
    <ModalShell title="Release business number" onClose={onClose}>
      <form action={releaseAction} className="space-y-4">
        <input type="hidden" name="businessNumberId" value={target.id} />
        <div className="rounded-xl border border-error-200 bg-error-50 p-4 text-sm text-error-800 dark:border-error-900/50 dark:bg-error-900/20 dark:text-error-200">
          <p className="font-semibold">This releases {target.phoneNumber} from Twilio.</p>
          <p className="mt-2">
            Calls and messages to this number will stop. The customer will no longer own the number, and Twilio may not be able to recover it later.
          </p>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
            Type the full number to confirm
          </label>
          <input
            name="confirmationNumber"
            placeholder={target.phoneNumber}
            className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 font-mono text-sm text-gray-800 shadow-theme-xs focus:border-error-300 focus:outline-hidden focus:ring-3 focus:ring-error-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          />
        </div>
        <ActionStateMessage state={releaseState.message ? releaseState : undefined} />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isReleasing}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-error-600 px-4 text-sm font-semibold text-white hover:bg-error-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isReleasing ? "Releasing..." : "Release from Twilio"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function ModalShell({
  children,
  onClose,
  title,
}: {
  children: ReactNode;
  onClose: () => void;
  title: string;
}) {
  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-gray-950/50 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-950">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/10"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function NumberField({
  defaultValue,
  label,
  name,
  placeholder,
}: {
  defaultValue?: string;
  label: string;
  name: string;
  placeholder: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
        {label}
      </label>
      <input
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
      />
    </div>
  );
}

function ComplianceField({
  label,
  name,
  placeholder,
  required = true,
  type = "text",
}: {
  label: string;
  name: string;
  placeholder: string;
  required?: boolean;
  type?: "email" | "text" | "url";
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
        {label}
      </label>
      <input
        name={name}
        placeholder={placeholder}
        required={required}
        type={type}
        className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
      />
    </div>
  );
}

function CapabilityPills({
  capabilities,
}: {
  capabilities: BusinessNumberRow["capabilities"];
}) {
  const entries = [
    ["Voice", Boolean(capabilities?.voice)],
    ["SMS", Boolean(capabilities?.sms)],
    ["MMS", Boolean(capabilities?.mms)],
  ] as const;

  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([label, enabled]) => (
        <span
          key={label}
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            enabled
              ? "bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-300"
              : "bg-gray-100 text-gray-400 dark:bg-white/10 dark:text-gray-500"
          }`}
        >
          {label}
        </span>
      ))}
    </div>
  );
}

function RoutingBadge({ status }: { status: RoutingStatus }) {
  const styles: Record<RoutingStatus, string> = {
    CONFIGURED: "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300",
    DEFAULT: "bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-300",
    NEEDS_ROUTING: "bg-warning-50 text-warning-800 dark:bg-warning-900/20 dark:text-warning-200",
    RELEASED: "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400",
  };
  const labels: Record<RoutingStatus, string> = {
    CONFIGURED: "Configured",
    DEFAULT: "Default route",
    NEEDS_ROUTING: "Needs routing",
    RELEASED: "Released",
  };

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function PhoneGlyph() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1.5 1.5 0 0 1 1.5-.4c1.6.5 3.2.8 4.9.8a1.5 1.5 0 0 1 1.5 1.5v3.5a1.5 1.5 0 0 1-1.5 1.5A20.5 20.5 0 0 1 1.9 1.6 1.5 1.5 0 0 1 3.4.1h3.5a1.5 1.5 0 0 1 1.5 1.5c0 1.7.3 3.3.8 4.9.2.5 0 1.1-.4 1.5l-2.2 2.8Z" />
    </svg>
  );
}

function formatDate(value: string | null) {
  if (!value) return "not recorded";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Europe/London",
  }).format(new Date(value));
}
