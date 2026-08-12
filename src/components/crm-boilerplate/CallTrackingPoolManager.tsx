"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import type { ReactNode } from "react";
import {
  activateImportedAttributionNumberAction,
  deleteTrackingPoolAction,
  deactivateAttributionNumberAction,
  generateTwilioTrackingNumberPoolAction,
  listTwilioAddressesAction,
  listTwilioRegulatoryBundlesAction,
  purchaseTwilioTrackingNumberAction,
  releaseAttributionNumberFromTwilioAction,
  refreshTwilioBundleComplianceStatusAction,
  searchTwilioTrackingNumbersAction,
  updateTrackingPoolAction,
  type NumberPoolActionState,
  type NumberPoolGenerationState,
  type NumberSearchState,
  type TwilioAddressSearchState,
  type TwilioBundleComplianceStatus,
  type TwilioRegulatoryBundleSearchState,
} from "@/lib/actions/attribution";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import LazyHelpTooltip from "@/components/crm-boilerplate/LazyHelpTooltip";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";

type PoolNumber = {
  id: string;
  phoneNumber: string;
  label: string | null;
  destinationNumber: string | null;
  isActive: boolean;
  priority: number;
  metadata: unknown;
  createdAt: string;
  assignments: number;
  records: number;
};

type ImportedAddress = {
  sid: string;
  label: string;
  country: string | null;
  city: string | null;
  region: string | null;
};

type ImportedBundle = {
  sid: string;
  label: string;
  country: string | null;
  numberType: string | null;
  status: string | null;
};

type TrackingNumberSearchType = "any" | "local" | "national" | "mobile" | "tollFree";

type TrackingPoolSummary = {
  key: string;
  rawLabel: string | null;
  label: string;
  numbers: PoolNumber[];
  total: number;
  active: number;
  assignments: number;
  records: number;
  destinationNumber: string | null;
  routeAsLabel: string | null;
};

type PoolPressure = {
  available: number;
  detail: string;
  label: string;
  level: "healthy" | "warning" | "critical";
  utilization: number;
};

export default function CallTrackingPoolManager({
  importedAddresses = [],
  importedBundles = [],
  importedAt = null,
  mode = "all",
  numberPool,
  twilioReady,
}: {
  importedAddresses?: ImportedAddress[];
  importedBundles?: ImportedBundle[];
  importedAt?: string | null;
  mode?: "all" | "pools" | "numbers";
  numberPool: PoolNumber[];
  twilioReady: boolean;
}) {
  const { showToast } = useToast();
  const [, startBundleRefreshTransition] = useTransition();
  const [country, setCountry] = useState("GB");
  const [numberType, setNumberType] = useState<TrackingNumberSearchType>("any");
  const [areaCode, setAreaCode] = useState("");
  const [contains, setContains] = useState("");
  const [label, setLabel] = useState("Website tracking pool");
  const [addressSid, setAddressSid] = useState("");
  const [bundleSid, setBundleSid] = useState("");
  const [peakVisitors, setPeakVisitors] = useState(4);
  const [drawerMode, setDrawerMode] = useState<"create" | "edit" | null>(null);
  const [editingPoolKey, setEditingPoolKey] = useState<string | null>(null);
  const [releaseTarget, setReleaseTarget] = useState<PoolNumber | null>(null);
  const [pendingCompliance, setPendingCompliance] =
    useState<TwilioBundleComplianceStatus | null>(null);
  const recommendedSize = Math.min(10, Math.max(2, Math.ceil(peakVisitors)));
  const [quantity, setQuantity] = useState(recommendedSize);
  const [searchState, searchAction, isSearching] = useActionState<
    NumberSearchState,
    FormData
  >(searchTwilioTrackingNumbersAction, {
    ok: false,
    message: "",
    numbers: [],
  });
  const [generateState, generateAction, isGenerating] = useActionState<
    NumberPoolGenerationState,
    FormData
  >(generateTwilioTrackingNumberPoolAction, {
    ok: false,
    message: "",
    savedAt: null,
    purchasedNumbers: [],
  });
  const [purchaseState, purchaseAction, isPurchasing] = useActionState<
    NumberPoolActionState,
    FormData
  >(purchaseTwilioTrackingNumberAction, {
    ok: false,
    message: "",
    savedAt: null,
  });
  const [addressState, addressAction, isLoadingAddresses] = useActionState<
    TwilioAddressSearchState,
    FormData
  >(listTwilioAddressesAction, {
    ok: false,
    message: "",
    addresses: [],
  });
  const [bundleState, bundleAction, isLoadingBundles] = useActionState<
    TwilioRegulatoryBundleSearchState,
    FormData
  >(listTwilioRegulatoryBundlesAction, {
    ok: false,
    message: "",
    bundles: [],
  });
  const [deactivateState, deactivateAction, isDeactivating] = useActionState<
    NumberPoolActionState,
    FormData
  >(deactivateAttributionNumberAction, {
    ok: false,
    message: "",
    savedAt: null,
  });
  const [activateState, activateAction, isActivating] = useActionState<
    NumberPoolActionState,
    FormData
  >(activateImportedAttributionNumberAction, {
    ok: false,
    message: "",
    savedAt: null,
  });
  const [releaseState, releaseAction, isReleasing] = useActionState<
    NumberPoolActionState,
    FormData
  >(releaseAttributionNumberFromTwilioAction, {
    ok: false,
    message: "",
    savedAt: null,
  });
  const [updateState, updateAction, isUpdating] = useActionState<
    NumberPoolActionState,
    FormData
  >(updateTrackingPoolAction, {
    ok: false,
    message: "",
    savedAt: null,
  });
  const [deleteState, deleteAction, isDeleting] = useActionState<
    NumberPoolActionState,
    FormData
  >(deleteTrackingPoolAction, {
    ok: false,
    message: "",
    savedAt: null,
  });
  const [refreshBundleState, refreshBundleAction, isRefreshingBundle] = useActionState<
    NumberPoolActionState,
    FormData
  >(refreshTwilioBundleComplianceStatusAction, {
    ok: false,
    message: "",
    savedAt: null,
  });

  const activePoolSize = useMemo(
    () => numberPool.filter((number) => number.isActive).length,
    [numberPool],
  );
  const trackingPools = useMemo(() => groupTrackingPools(numberPool), [numberPool]);
  const activeTrackingPools = useMemo(
    () => trackingPools.filter((pool) => pool.active > 0).length,
    [trackingPools],
  );
  const pressuredPools = useMemo(
    () => trackingPools.filter((pool) => poolPressure(pool).level !== "healthy"),
    [trackingPools],
  );
  const releasedNumbers = useMemo(
    () =>
      numberPool.filter((number) => metadataRecord(number.metadata).releasedFromTwilio === true)
        .length,
    [numberPool],
  );
  const inactiveNumbers = useMemo(
    () => numberPool.filter((number) => !number.isActive).length,
    [numberPool],
  );
  const editingPool = useMemo(
    () => trackingPools.find((pool) => pool.key === editingPoolKey) ?? null,
    [editingPoolKey, trackingPools],
  );
  const inactiveImportedNumbers = useMemo(
    () => numberPool.filter((number) => !number.isActive && isImportedTwilioNumber(number)),
    [numberPool],
  );
  const showPools = mode === "all" || mode === "pools";
  const showNumbers = mode === "all" || mode === "numbers";
  const isPoolMode = mode === "pools";
  const isNumberMode = mode === "numbers";
  const addressOptions = addressState.addresses.length ? addressState.addresses : importedAddresses;
  const bundleOptions = bundleState.bundles.length ? bundleState.bundles : importedBundles;
  const compatibleBundleOptions = useMemo(
    () =>
      bundleOptions.filter(
        (bundle) =>
          (!bundle.country || bundle.country === country) &&
          isBundleCompatible(bundle.numberType, numberType),
      ),
    [bundleOptions, country, numberType],
  );

  useEffect(() => {
    setQuantity(recommendedSize);
  }, [recommendedSize]);

  useEffect(() => {
    if (generateState.savedAt) {
      showToast(generateState.message, generateState.ok ? "success" : "error");
      if (generateState.pendingCompliance) {
        setPendingCompliance(generateState.pendingCompliance);
      }
      if (generateState.ok && !generateState.pendingCompliance) {
        setDrawerMode(null);
      }
    }
  }, [generateState, showToast]);

  useEffect(() => {
    if (purchaseState.savedAt) {
      showToast(purchaseState.message, purchaseState.ok ? "success" : "error");
      if (purchaseState.pendingCompliance) {
        setPendingCompliance(purchaseState.pendingCompliance);
      }
    }
  }, [purchaseState, showToast]);

  useEffect(() => {
    if (!refreshBundleState.savedAt) return;

    showToast(refreshBundleState.message, refreshBundleState.ok ? "success" : "error");

    if (refreshBundleState.pendingCompliance) {
      setPendingCompliance(refreshBundleState.pendingCompliance);
    } else if (refreshBundleState.ok) {
      setPendingCompliance(null);
    }
  }, [refreshBundleState, showToast]);

  useEffect(() => {
    if (!pendingCompliance) return;

    const checkBundle = () => {
      const formData = new FormData();
      formData.set("bundleSid", pendingCompliance.bundleSid);
      formData.set("country", pendingCompliance.country);
      formData.set("numberType", pendingCompliance.numberType);
      startBundleRefreshTransition(() => {
        refreshBundleAction(formData);
      });
    };
    const timer = window.setInterval(checkBundle, 120000);

    return () => window.clearInterval(timer);
  }, [pendingCompliance, refreshBundleAction, startBundleRefreshTransition]);

  useEffect(() => {
    if (deactivateState.savedAt) {
      showToast(deactivateState.message, deactivateState.ok ? "success" : "error");
    }
  }, [deactivateState, showToast]);

  useEffect(() => {
    if (activateState.savedAt) {
      showToast(activateState.message, activateState.ok ? "success" : "error");
    }
  }, [activateState, showToast]);

  useEffect(() => {
    if (releaseState.savedAt) {
      showToast(releaseState.message, releaseState.ok ? "success" : "error");
      if (releaseState.ok) {
        setReleaseTarget(null);
      }
    }
  }, [releaseState, showToast]);

  useEffect(() => {
    if (updateState.savedAt) {
      showToast(updateState.message, updateState.ok ? "success" : "error");
      if (updateState.ok) {
        setDrawerMode(null);
        setEditingPoolKey(null);
      }
    }
  }, [updateState, showToast]);

  useEffect(() => {
    if (deleteState.savedAt) {
      showToast(deleteState.message, deleteState.ok ? "success" : "error");
    }
  }, [deleteState, showToast]);

  useEffect(() => {
    if (!addressSid && addressOptions.length === 1) {
      setAddressSid(addressOptions[0].sid);
    }
  }, [addressOptions, addressSid]);

  useEffect(() => {
    if (bundleSid && !compatibleBundleOptions.some((bundle) => bundle.sid === bundleSid)) {
      setBundleSid("");
      return;
    }

    if (!bundleSid && compatibleBundleOptions.length === 1) {
      setBundleSid(compatibleBundleOptions[0].sid);
    }
  }, [compatibleBundleOptions, bundleSid]);

  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="border-b border-gray-200 p-5 dark:border-gray-800">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-500">
              Dynamic number insertion
            </p>
            <div className="mt-1 flex items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                {isNumberMode ? "Manage tracking number inventory" : "Create and manage tracking number pools"}
              </h2>
              <LazyHelpTooltip
                content={
                  isNumberMode
                    ? "Tracking number inventory shows individual Twilio numbers and whether they can still be assigned."
                    : "Number pools group Twilio numbers so DNI can rotate numbers across website visitors."
                }
              />
            </div>
            <p className="mt-1 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
              {isNumberMode
                ? "Review active, inactive, imported and released Twilio numbers used for dynamic number insertion."
                : "A pool is a group of Twilio numbers the website can temporarily show to visitors. The CRM ties the inbound call back to the visitor's advert, UTM source, landing page and session."}
            </p>
          </div>
          <div className="grid min-w-72 grid-cols-2 gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm dark:border-gray-800 dark:bg-white/[0.03] sm:grid-cols-4 xl:grid-cols-2">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Active numbers</p>
              <p className="mt-1 text-xl font-semibold text-gray-800 dark:text-white/90">
                {activePoolSize}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Active pools</p>
              <p className="mt-1 text-xl font-semibold text-gray-800 dark:text-white/90">
                {activeTrackingPools}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Inactive</p>
              <p className="mt-1 text-xl font-semibold text-gray-800 dark:text-white/90">
                {inactiveNumbers}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Pool warnings</p>
              <p className="mt-1 text-xl font-semibold text-gray-800 dark:text-white/90">
                {pressuredPools.length}
              </p>
            </div>
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <ReadinessStep
            label="Twilio connected"
            ready={twilioReady}
            detail="Credentials and voice capability"
          />
          <ReadinessStep
            label="Inventory imported"
            ready={Boolean(importedAt)}
            detail="Existing numbers, addresses and bundles"
          />
          <ReadinessStep
            label="Pool active"
            ready={activePoolSize > 0}
            detail={`${activePoolSize} tracking number${activePoolSize === 1 ? "" : "s"}`}
          />
          <ReadinessStep
            label="Script ready"
            ready
            detail="Website uses CRM-managed script"
          />
        </div>
      </div>

      {!twilioReady ? (
        <div className="m-5 rounded-xl border border-warning-200 bg-warning-50 p-4 dark:border-warning-900/40 dark:bg-warning-900/20">
          <h3 className="text-sm font-semibold text-warning-800 dark:text-warning-200">
            Connect Twilio before generating pools
          </h3>
          <p className="mt-1 text-sm text-warning-700 dark:text-warning-300">
            Add Account SID, Auth Token, Telephony and webhook base URL first. Then this
            screen can search and buy numbers directly from Twilio.
          </p>
          <Link
            href="/settings/integrations/twilio"
            className="mt-3 inline-flex h-10 items-center rounded-lg bg-warning-600 px-4 text-sm font-medium text-white hover:bg-warning-700"
          >
            Open Twilio settings
          </Link>
        </div>
      ) : (
        <>
          <div
            className={`grid gap-6 p-5 ${
              mode === "all" ? "xl:grid-cols-[minmax(0,1fr)_380px]" : "xl:grid-cols-[minmax(0,1fr)_420px]"
            }`}
          >
            {showPools && (
              <div className="space-y-4">
                <TrackingPoolsPanel
                  deleteAction={deleteAction}
                  deleteState={deleteState}
                  isDeleting={isDeleting}
                  onAdd={() => setDrawerMode("create")}
                  onEdit={(pool) => {
                    setEditingPoolKey(pool.key);
                    setDrawerMode("edit");
                  }}
                  pools={trackingPools}
                />

                {mode === "all" && (
                  <ImportedTwilioNumbersPanel
                    importedAt={importedAt}
                    isActivating={isActivating}
                    numbers={inactiveImportedNumbers}
                    action={activateAction}
                    state={activateState}
                  />
                )}
              </div>
            )}

            <div className="space-y-4">
              {showPools && (
                <>
                  <PoolGuidance activePoolSize={activePoolSize} recommendedSize={recommendedSize} />
                  <PoolPressureSummary pools={trackingPools} />
                  {isPoolMode && (
                    <CallTrackingDiagnosticsPanel
                      activeNumbers={activePoolSize}
                      activePools={activeTrackingPools}
                      importedAt={importedAt}
                      recommendedSize={recommendedSize}
                      releasedNumbers={releasedNumbers}
                      totalNumbers={numberPool.length}
                      twilioReady={twilioReady}
                    />
                  )}
                </>
              )}

              {showNumbers && (
                <>
                  {isNumberMode && (
                    <ImportedTwilioNumbersPanel
                      importedAt={importedAt}
                      isActivating={isActivating}
                      numbers={inactiveImportedNumbers}
                      action={activateAction}
                      state={activateState}
                    />
                  )}
                  {mode === "all" && (
                    <CallTrackingDiagnosticsPanel
                      activeNumbers={activePoolSize}
                      activePools={activeTrackingPools}
                      importedAt={importedAt}
                      recommendedSize={recommendedSize}
                      releasedNumbers={releasedNumbers}
                      totalNumbers={numberPool.length}
                      twilioReady={twilioReady}
                    />
                  )}

                  <TrackingNumbersPanel
                    action={deactivateAction}
                    activePoolSize={activePoolSize}
                    inactiveNumbers={inactiveNumbers}
                    isDeactivating={isDeactivating}
                    isReleasing={isReleasing}
                    numbers={numberPool}
                    onRelease={setReleaseTarget}
                    releasedNumbers={releasedNumbers}
                    state={deactivateState}
                  />
                </>
              )}
              {isNumberMode && (
                <CallTrackingDiagnosticsPanel
                  activeNumbers={activePoolSize}
                  activePools={activeTrackingPools}
                  importedAt={importedAt}
                  recommendedSize={recommendedSize}
                  releasedNumbers={releasedNumbers}
                  totalNumbers={numberPool.length}
                  twilioReady={twilioReady}
                />
              )}
            </div>
          </div>

          {drawerMode && (
            <TrackingPoolDrawer
              onClose={() => {
                setDrawerMode(null);
                setEditingPoolKey(null);
              }}
              title={drawerMode === "edit" ? "Edit tracking pool" : "Add tracking pool"}
            >
              {drawerMode === "edit" && editingPool ? (
                <form action={updateAction} className="space-y-4">
                  <input type="hidden" name="poolLabel" value={editingPool.rawLabel ?? ""} />
                  <Field label="Pool name">
                    <input
                      name="label"
                      defaultValue={editingPool.label}
                      className={inputClassName}
                    />
                  </Field>
                  <Field label="Route label">
                    <input
                      name="routeAsLabel"
                      defaultValue={editingPool.routeAsLabel ?? ""}
                      placeholder="Main line, Huddersfield Sales..."
                      className={inputClassName}
                    />
                  </Field>
                  <Field label="Fallback destination number">
                    <input
                      name="destinationNumber"
                      defaultValue={editingPool.destinationNumber ?? ""}
                      placeholder="+441484..."
                      className={inputClassName}
                    />
                  </Field>
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-300">
                    This updates all {editingPool.total} tracking number
                    {editingPool.total === 1 ? "" : "s"} in the pool. Twilio inventory is not released.
                  </div>
                  <button
                    type="submit"
                    disabled={isUpdating}
                    className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isUpdating ? "Saving..." : "Save tracking pool"}
                  </button>
                  <ActionStateMessage state={updateState} />
                </form>
              ) : (
                <>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <MiniStep index={1} label="Search" />
                    <MiniStep index={2} label="Compliance" />
                    <MiniStep index={3} label="Purchase" />
                  </div>
                  {pendingCompliance && (
                    <CompliancePendingPanel
                      isRefreshing={isRefreshingBundle}
                      pendingCompliance={pendingCompliance}
                      state={refreshBundleState}
                      onRefresh={() => {
                        const formData = new FormData();
                        formData.set("bundleSid", pendingCompliance.bundleSid);
                        formData.set("country", pendingCompliance.country);
                        formData.set("numberType", pendingCompliance.numberType);
                        startBundleRefreshTransition(() => {
                          refreshBundleAction(formData);
                        });
                      }}
                    />
                  )}
                  <form action={generateAction} className="mt-4 space-y-4">
                    <Field label="Pool label">
                      <input
                        name="label"
                        value={label}
                        onChange={(event) => setLabel(event.target.value)}
                        className={inputClassName}
                      />
                    </Field>

                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Country">
                        <input
                          name="country"
                          value={country}
                          onChange={(event) => setCountry(event.target.value.toUpperCase())}
                          maxLength={2}
                          className={inputClassName}
                        />
                      </Field>
                      <Field label="Number type">
                        <select
                          name="numberType"
                          value={numberType}
                          onChange={(event) =>
                            setNumberType(event.target.value as TrackingNumberSearchType)
                          }
                          className={inputClassName}
                        >
                          <option value="any">Any voice number</option>
                          <option value="local">Local</option>
                          <option value="national">National</option>
                          <option value="mobile">Mobile</option>
                          <option value="tollFree">Toll-free</option>
                        </select>
                      </Field>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Area code">
                        <input
                          name="areaCode"
                          value={areaCode}
                          onChange={(event) => setAreaCode(event.target.value)}
                          inputMode="numeric"
                          placeholder="01484"
                          className={inputClassName}
                        />
                      </Field>
                      <Field label="Number contains">
                        <input
                          name="contains"
                          value={contains}
                          onChange={(event) => setContains(event.target.value)}
                          placeholder="Optional"
                          className={inputClassName}
                        />
                      </Field>
                    </div>
                    <p className="-mt-2 text-xs text-gray-500 dark:text-gray-400">
                      For UK local numbers, enter the local area code such as 01484.
                    </p>

                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Peak visitors">
                        <input
                          type="number"
                          min={1}
                          max={10}
                          value={peakVisitors}
                          onChange={(event) =>
                            setPeakVisitors(Math.max(1, Number(event.target.value) || 1))
                          }
                          className={inputClassName}
                        />
                      </Field>
                      <Field label="Numbers to buy">
                        <input
                          name="quantity"
                          type="number"
                          min={1}
                          max={10}
                          value={quantity}
                          onChange={(event) =>
                            setQuantity(Math.min(10, Math.max(1, Number(event.target.value) || 1)))
                          }
                          className={inputClassName}
                        />
                      </Field>
                    </div>

                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-white/[0.03]">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="submit"
                          formAction={addressAction}
                          disabled={isLoadingAddresses}
                          className="inline-flex h-9 items-center rounded-lg border border-gray-300 bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
                        >
                          {isLoadingAddresses ? "Loading..." : "Refresh addresses"}
                        </button>
                        <button
                          type="submit"
                          formAction={bundleAction}
                          disabled={isLoadingBundles}
                          className="inline-flex h-9 items-center rounded-lg border border-gray-300 bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
                        >
                          {isLoadingBundles ? "Loading..." : "Refresh bundles"}
                        </button>
                      </div>
                      <div className="mt-3 space-y-2">
                        <ActionStateMessage state={addressState} />
                        <ActionStateMessage state={bundleState} />
                      </div>
                      <div className="mt-3 grid gap-3">
                        {addressOptions.length > 0 ? (
                          <Field label="Saved Twilio address">
                            <select
                              name="addressSid"
                              value={addressSid}
                              onChange={(event) => setAddressSid(event.target.value)}
                              className={inputClassName}
                            >
                              <option value="">Choose an address</option>
                              {addressOptions.map((address) => (
                                <option key={address.sid} value={address.sid}>
                                  {address.label} / {address.city || address.region || address.country} /{" "}
                                  {address.sid}
                                </option>
                              ))}
                            </select>
                          </Field>
                        ) : (
                          <Field label="Twilio Address SID">
                            <input
                              name="addressSid"
                              value={addressSid}
                              onChange={(event) => setAddressSid(event.target.value)}
                              placeholder="AD..."
                              className={inputClassName}
                            />
                          </Field>
                        )}
                        {bundleOptions.length > 0 ? (
                          <Field label="Approved Twilio bundle">
                            <select
                              name="bundleSid"
                              value={bundleSid}
                              onChange={(event) => setBundleSid(event.target.value)}
                              className={inputClassName}
                            >
                              <option value="">Auto-select compatible bundle</option>
                              {compatibleBundleOptions.map((bundle) => (
                                <option key={bundle.sid} value={bundle.sid}>
                                  {bundle.label} / {formatNumberType(bundle.numberType)} /{" "}
                                  {bundle.status} / {bundle.sid}
                                </option>
                              ))}
                            </select>
                            {!compatibleBundleOptions.length && (
                              <span className="mt-1 block text-xs text-warning-600 dark:text-warning-300">
                                No saved bundle matches {country} {formatNumberType(numberType)}. The CRM will
                                query Twilio for an approved matching bundle when buying.
                              </span>
                            )}
                          </Field>
                        ) : (
                          <Field label="Twilio Regulatory Bundle SID">
                            <input
                              name="bundleSid"
                              value={bundleSid}
                              onChange={(event) => setBundleSid(event.target.value)}
                              placeholder="BU..."
                              className={inputClassName}
                            />
                          </Field>
                        )}
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <button
                        type="submit"
                        formAction={searchAction}
                        disabled={isSearching}
                        className="inline-flex h-11 items-center justify-center rounded-lg border border-gray-300 bg-white px-5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
                      >
                        {isSearching ? "Searching..." : "Search numbers"}
                      </button>
                      <button
                        type="submit"
                        disabled={isGenerating}
                        className="inline-flex h-11 items-center justify-center rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isGenerating ? "Buying..." : `Buy ${quantity}`}
                      </button>
                    </div>
                  </form>
                  <div className="mt-4 space-y-3">
                    <ActionStateMessage state={searchState} />
                    <ActionStateMessage state={generateState} />
                    <ActionStateMessage state={purchaseState} />
                    {searchState.numbers.map((number) => (
                      <form
                        key={number.phoneNumber}
                        action={purchaseAction}
                        className="rounded-xl border border-gray-200 p-3 dark:border-gray-800"
                      >
                        <input type="hidden" name="phoneNumber" value={number.phoneNumber} />
                        <input type="hidden" name="label" value={label} />
                        <input type="hidden" name="country" value={number.country || country} />
                        <input type="hidden" name="numberType" value={number.numberType} />
                        <input type="hidden" name="addressSid" value={addressSid} />
                        <input type="hidden" name="bundleSid" value={bundleSid} />
                        <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                          {number.phoneNumber}
                        </p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {[number.locality, number.region, number.country].filter(Boolean).join(", ") ||
                            number.friendlyName ||
                            "Voice-capable number"}
                        </p>
                        <button
                          type="submit"
                          disabled={isPurchasing}
                          className="mt-3 inline-flex h-9 items-center justify-center rounded-lg bg-success-600 px-3 text-sm font-medium text-white hover:bg-success-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Buy this number
                        </button>
                      </form>
                    ))}
                  </div>
                </>
              )}
            </TrackingPoolDrawer>
          )}
          {releaseTarget && (
            <ReleaseTrackingNumberModal
              isReleasing={isReleasing}
              onClose={() => setReleaseTarget(null)}
              releaseAction={releaseAction}
              releaseState={releaseState}
              target={releaseTarget}
            />
          )}
        </>
      )}
    </section>
  );
}

const inputClassName =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:text-white/90";

function CompliancePendingPanel({
  isRefreshing,
  onRefresh,
  pendingCompliance,
  state,
}: {
  isRefreshing: boolean;
  onRefresh: () => void;
  pendingCompliance: TwilioBundleComplianceStatus;
  state: NumberPoolActionState;
}) {
  return (
    <div className="mt-4 rounded-xl border border-warning-200 bg-warning-50 p-4 dark:border-warning-900/40 dark:bg-warning-900/20">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-warning-500" />
            <p className="text-sm font-semibold text-warning-800 dark:text-warning-200">
              Waiting for Twilio approval
            </p>
          </div>
          <p className="mt-2 text-sm text-warning-700 dark:text-warning-300">
            {pendingCompliance.message}
          </p>
          <p className="mt-2 text-xs text-warning-700/80 dark:text-warning-300/80">
            Bundle {pendingCompliance.bundleSid} / Status {pendingCompliance.status} / Last checked{" "}
            {formatStatusDate(pendingCompliance.checkedAt)}
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-warning-300 bg-white px-3 text-xs font-medium text-warning-700 hover:bg-warning-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-warning-800 dark:bg-gray-900 dark:text-warning-300 dark:hover:bg-warning-900/20"
        >
          {isRefreshing ? "Checking..." : "Check now"}
        </button>
      </div>
      {state.message && state.savedAt && (
        <div className="mt-3">
          <ActionStateMessage state={state} />
        </div>
      )}
    </div>
  );
}

function TrackingPoolsPanel({
  deleteAction,
  deleteState,
  isDeleting,
  onAdd,
  onEdit,
  pools,
}: {
  deleteAction: (payload: FormData) => void;
  deleteState: NumberPoolActionState;
  isDeleting: boolean;
  onAdd: () => void;
  onEdit: (pool: TrackingPoolSummary) => void;
  pools: TrackingPoolSummary[];
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
      <div className="border-b border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
                Tracking pools
              </h3>
              <LazyHelpTooltip content="A pool is the group of phone numbers a DNI rule can select for a visitor segment." />
            </div>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Manage grouped tracking numbers, routing labels and active status.
            </p>
          </div>
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600"
          >
            Add tracking pool
          </button>
        </div>
      </div>

      {pools.length ? (
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {pools.map((pool) => (
            <TrackingPoolCard
              key={pool.key}
              deleteAction={deleteAction}
              isDeleting={isDeleting}
              onEdit={onEdit}
              pool={pool}
            />
          ))}
        </div>
      ) : (
        <div className="p-4 text-sm text-gray-500 dark:text-gray-400">
          No tracking pools yet. Add one to buy Twilio numbers for dynamic insertion.
        </div>
      )}
      <div className="border-t border-gray-100 p-4 dark:border-gray-800">
        <ActionStateMessage state={deleteState} />
      </div>
    </div>
  );
}

function TrackingPoolCard({
  deleteAction,
  isDeleting,
  onEdit,
  pool,
}: {
  deleteAction: (payload: FormData) => void;
  isDeleting: boolean;
  onEdit: (pool: TrackingPoolSummary) => void;
  pool: TrackingPoolSummary;
}) {
  const pressure = poolPressure(pool);

  return (
    <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
            {pool.label}
          </p>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              pool.active
                ? "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300"
                : "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300"
            }`}
          >
            {pool.active ? `${pool.active} active` : "Inactive"}
          </span>
          <span className={poolPressureBadgeClass(pressure.level)}>
            {pressure.label}
          </span>
        </div>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {pool.total} number{pool.total === 1 ? "" : "s"} / {pool.assignments} live assignment
          {pool.assignments === 1 ? "" : "s"} / {pool.records} attributed interaction
          {pool.records === 1 ? "" : "s"}
        </p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Capacity: {pressure.available} spare / {pressure.utilization}% in use. {pressure.detail}
        </p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Route: {pool.routeAsLabel || pool.destinationNumber || "Phone system default"}
        </p>
        <TrackingPoolNumbers numbers={pool.numbers} />
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onEdit(pool)}
          className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
        >
          Edit
        </button>
        <form action={deleteAction}>
          <input type="hidden" name="poolLabel" value={pool.rawLabel ?? ""} />
          <button
            type="submit"
            disabled={isDeleting}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-error-200 bg-white px-3 text-sm font-medium text-error-600 hover:bg-error-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-error-900/40 dark:bg-gray-900 dark:text-error-300 dark:hover:bg-error-900/20"
          >
            Delete
          </button>
        </form>
      </div>
    </div>
  );
}

function PoolPressureSummary({ pools }: { pools: TrackingPoolSummary[] }) {
  const pressuredPools = pools
    .map((pool) => ({ pool, pressure: poolPressure(pool) }))
    .filter(({ pressure }) => pressure.level !== "healthy");

  if (!pressuredPools.length) {
    return (
      <div className="rounded-xl border border-success-200 bg-success-50 p-4 dark:border-success-900/40 dark:bg-success-900/20">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-success-800 dark:text-success-200">
            Pool pressure
          </h3>
          <LazyHelpTooltip content="Pool pressure compares live visitor leases with active tracking numbers in each pool." />
        </div>
        <p className="mt-1 text-sm text-success-700 dark:text-success-300">
          Active pools have spare capacity for current DNI leases.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-warning-200 bg-warning-50 p-4 dark:border-warning-900/40 dark:bg-warning-900/20">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-warning-800 dark:text-warning-200">
          Pool pressure
        </h3>
        <LazyHelpTooltip content="Pool pressure highlights pools close to fallback risk because live leases are consuming most or all active numbers." />
      </div>
      <div className="mt-3 space-y-2">
        {pressuredPools.slice(0, 3).map(({ pool, pressure }) => (
          <div key={pool.key} className="rounded-lg border border-warning-200 bg-white/70 p-3 text-sm dark:border-warning-900/40 dark:bg-gray-950/20">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-warning-900 dark:text-warning-100">
                {pool.label}
              </span>
              <span className={poolPressureBadgeClass(pressure.level)}>
                {pressure.label}
              </span>
            </div>
            <p className="mt-1 text-xs text-warning-800 dark:text-warning-200">
              {pool.assignments} live lease{pool.assignments === 1 ? "" : "s"} across {pool.active} active number
              {pool.active === 1 ? "" : "s"}. {pressure.detail}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function TrackingPoolNumbers({ numbers }: { numbers: PoolNumber[] }) {
  if (!numbers.length) return null;

  const visibleNumbers = numbers.slice(0, 3);
  const hiddenCount = Math.max(0, numbers.length - visibleNumbers.length);

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
        Assigned numbers
      </span>
      {visibleNumbers.map((number) => (
        <span
          key={number.id}
          title={number.isActive ? "Active tracking number" : "Inactive tracking number"}
          className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${
            number.isActive
              ? "border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-900/50 dark:bg-brand-900/20 dark:text-brand-300"
              : "border-gray-200 bg-gray-50 text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400"
          }`}
        >
          <span className="truncate">{number.phoneNumber}</span>
          {!number.isActive && <span className="text-[10px] uppercase">Inactive</span>}
        </span>
      ))}
      {hiddenCount > 0 && (
        <span className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
          +{hiddenCount} more
        </span>
      )}
    </div>
  );
}

function TrackingNumbersPanel({
  action,
  activePoolSize,
  inactiveNumbers,
  isDeactivating,
  isReleasing,
  numbers,
  onRelease,
  releasedNumbers,
  state,
}: {
  action: (payload: FormData) => void;
  activePoolSize: number;
  inactiveNumbers: number;
  isDeactivating: boolean;
  isReleasing: boolean;
  numbers: PoolNumber[];
  onRelease: (number: PoolNumber) => void;
  releasedNumbers: number;
  state: NumberPoolActionState;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
      <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
            Tracking numbers
          </h3>
          <LazyHelpTooltip content="Only active tracking numbers are assigned to visitors; inactive numbers can be reactivated or released." />
        </div>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Active, inactive and released inventory with per-number actions.
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <MiniStat label="Active" value={activePoolSize} />
          <MiniStat label="Inactive" value={inactiveNumbers} />
          <MiniStat label="Released" value={releasedNumbers} />
        </div>
      </div>
      {numbers.length ? (
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {numbers.map((number) => (
            <PoolRow
              key={number.id}
              number={number}
              action={action}
              isDeactivating={isDeactivating}
              isReleasing={isReleasing}
              onRelease={() => onRelease(number)}
            />
          ))}
        </div>
      ) : (
        <p className="p-4 text-sm text-gray-500 dark:text-gray-400">
          No tracking numbers yet. Add a tracking pool or import existing Twilio numbers.
        </p>
      )}
      <div className="p-4">
        <ActionStateMessage state={state} />
      </div>
    </div>
  );
}

function TrackingPoolDrawer({
  children,
  onClose,
  title,
}: {
  children: ReactNode;
  onClose: () => void;
  title: string;
}) {
  return (
    <div className="fixed inset-0 z-[99999] flex justify-end bg-gray-900/30 backdrop-blur-[1px]">
      <button
        type="button"
        aria-label="Close panel"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <aside className="relative flex h-full w-full max-w-xl flex-col bg-white shadow-2xl dark:bg-gray-950">
        <div className="flex items-center justify-between border-b border-gray-200 p-5 dark:border-gray-800">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-500">
              Tracking pools
            </p>
            <div className="mt-1 flex items-center gap-2">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                {title}
              </h3>
              <LazyHelpTooltip content="Use this panel to create or edit a tracking pool, including its label, capacity target and assigned numbers." />
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 text-xl leading-none text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.05]"
          >
            &times;
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </aside>
    </div>
  );
}

function ImportedTwilioNumbersPanel({
  action,
  importedAt,
  isActivating,
  numbers,
  state,
}: {
  action: (payload: FormData) => void;
  importedAt: string | null;
  isActivating: boolean;
  numbers: PoolNumber[];
  state: NumberPoolActionState;
}) {
  return (
    <div className="rounded-xl border border-success-200 bg-success-50/60 p-4 dark:border-success-900/40 dark:bg-success-900/10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-success-700 dark:text-success-300">
            Recommended
          </p>
          <div className="mt-1 flex items-center gap-2">
            <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
              Use existing Twilio numbers
            </h3>
            <LazyHelpTooltip content="Imported Twilio numbers can be activated for tracking without buying new inventory." />
          </div>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            Activate imported numbers to add them to the CRM tracking pool and update
            their Twilio voice/SMS webhooks automatically.
          </p>
          {importedAt && (
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Last Twilio import: {formatImportDate(importedAt)}
            </p>
          )}
        </div>
        <Link
          href="/settings/integrations/twilio"
          className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-success-300 bg-white px-3 text-xs font-medium text-success-700 hover:bg-success-100 dark:border-success-800 dark:bg-gray-900 dark:text-success-300 dark:hover:bg-success-900/20"
        >
          Import from Twilio
        </Link>
      </div>

      {numbers.length ? (
        <div className="mt-4 divide-y divide-success-100 overflow-hidden rounded-lg border border-success-200 bg-white dark:divide-success-900/30 dark:border-success-900/40 dark:bg-gray-900">
          {numbers.map((number) => (
            <form
              key={number.id}
              action={action}
              className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <input type="hidden" name="id" value={number.id} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-800 dark:text-white/90">
                  {number.phoneNumber}
                </p>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  {number.label || "Imported Twilio number"}
                  {capabilitiesLabel(number) ? ` / ${capabilitiesLabel(number)}` : ""}
                </p>
              </div>
              <button
                type="submit"
                disabled={isActivating}
                className="inline-flex h-9 items-center justify-center rounded-lg bg-success-600 px-3 text-sm font-medium text-white hover:bg-success-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Use for tracking
              </button>
            </form>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-dashed border-success-200 bg-white p-3 text-sm text-gray-600 dark:border-success-900/40 dark:bg-gray-900 dark:text-gray-300">
          No inactive imported Twilio numbers are ready to activate. Re-run the Twilio
          import if numbers were added directly in Twilio.
        </div>
      )}

      <div className="mt-3">
        <ActionStateMessage state={state} />
      </div>
    </div>
  );
}

function ReadinessStep({
  detail,
  label,
  ready,
}: {
  detail: string;
  label: string;
  ready: boolean;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-center gap-2">
        <span
          className={`h-2.5 w-2.5 rounded-full ${
            ready ? "bg-success-500" : "bg-warning-500"
          }`}
        />
        <p className="truncate text-sm font-semibold text-gray-800 dark:text-white/90">
          {label}
        </p>
      </div>
      <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">
        {detail}
      </p>
    </div>
  );
}

function MiniStep({ index, label }: { index: number; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-white/[0.03]">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-900 text-xs font-semibold text-white dark:bg-white dark:text-gray-900">
        {index}
      </span>
      <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
        {label}
      </span>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
        {label}
      </span>
      {children}
    </label>
  );
}

function metadataRecord(metadata: unknown) {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : {};
}

function groupTrackingPools(numbers: PoolNumber[]): TrackingPoolSummary[] {
  const groups = new Map<string, TrackingPoolSummary>();

  for (const number of numbers) {
    const rawLabel = number.label || null;
    const key = rawLabel ?? "__unlabelled__";
    const metadata = metadataRecord(number.metadata);
    const routeAsLabel =
      typeof metadata.routeAsLabel === "string" && metadata.routeAsLabel
        ? metadata.routeAsLabel
        : null;
    const existing =
      groups.get(key) ??
      ({
        key,
        rawLabel,
        label: rawLabel ?? "Unlabelled tracking pool",
        numbers: [],
        total: 0,
        active: 0,
        assignments: 0,
        records: 0,
        destinationNumber: number.destinationNumber,
        routeAsLabel,
      } satisfies TrackingPoolSummary);

    existing.numbers.push(number);
    existing.total += 1;
    existing.active += number.isActive ? 1 : 0;
    existing.assignments += number.assignments;
    existing.records += number.records;
    existing.destinationNumber ||= number.destinationNumber;
    existing.routeAsLabel ||= routeAsLabel;
    groups.set(key, existing);
  }

  return Array.from(groups.values()).sort((a, b) => {
    const activeDelta = b.active - a.active;
    return activeDelta || a.label.localeCompare(b.label);
  });
}

function poolPressure(pool: TrackingPoolSummary): PoolPressure {
  if (pool.active <= 0) {
    return {
      available: 0,
      detail: "Add or reactivate numbers before this pool can assign DNI leases.",
      label: "No capacity",
      level: "critical",
      utilization: 0,
    };
  }

  const available = Math.max(0, pool.active - pool.assignments);
  const utilization = Math.min(100, Math.round((pool.assignments / pool.active) * 100));

  if (pool.assignments >= pool.active) {
    return {
      available,
      detail: "New visitors may receive the fallback number until a lease expires.",
      label: "At capacity",
      level: "critical",
      utilization,
    };
  }

  if (available <= 1 || utilization >= 75) {
    return {
      available,
      detail: "Add another active number before peak traffic to reduce fallback risk.",
      label: "Pressure high",
      level: "warning",
      utilization,
    };
  }

  return {
    available,
    detail: "Enough active numbers are free for current visitor demand.",
    label: "Capacity ok",
    level: "healthy",
    utilization,
  };
}

function poolPressureBadgeClass(level: PoolPressure["level"]) {
  if (level === "critical") {
    return "rounded-full bg-error-50 px-2 py-0.5 text-xs font-medium text-error-700 dark:bg-error-900/20 dark:text-error-300";
  }

  if (level === "warning") {
    return "rounded-full bg-warning-50 px-2 py-0.5 text-xs font-medium text-warning-700 dark:bg-warning-900/20 dark:text-warning-300";
  }

  return "rounded-full bg-success-50 px-2 py-0.5 text-xs font-medium text-success-700 dark:bg-success-900/20 dark:text-success-300";
}

function isImportedTwilioNumber(number: PoolNumber) {
  const metadata = metadataRecord(number.metadata);

  return (
    metadata.importedFromTwilio === true ||
    typeof metadata.twilioPhoneNumberSid === "string" ||
    metadata.provider === "twilio"
  );
}

function capabilitiesLabel(number: PoolNumber) {
  const capabilities = metadataRecord(metadataRecord(number.metadata).capabilities);
  const labels = [
    capabilities.voice ? "Voice" : null,
    capabilities.sms ? "SMS" : null,
    capabilities.mms ? "MMS" : null,
  ].filter(Boolean);

  return labels.join(", ");
}

function PoolGuidance({
  activePoolSize,
  recommendedSize,
}: {
  activePoolSize: number;
  recommendedSize: number;
}) {
  const ready = activePoolSize >= recommendedSize;

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
              Pool health
            </h3>
            <LazyHelpTooltip content="Pool health compares active numbers with expected concurrent visitors to reduce fallback use." />
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Keep enough active numbers for the number of visitors who may see a phone
            number at the same time.
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            ready
              ? "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300"
              : "bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300"
          }`}
        >
          {ready ? "Ready" : "Needs numbers"}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 text-center">
        <MiniStat label="Active" value={activePoolSize} />
        <MiniStat label="Target" value={recommendedSize} />
        <MiniStat label="Gap" value={Math.max(0, recommendedSize - activePoolSize)} />
      </div>
    </div>
  );
}

function CallTrackingDiagnosticsPanel({
  activeNumbers,
  activePools,
  importedAt,
  recommendedSize,
  releasedNumbers,
  totalNumbers,
  twilioReady,
}: {
  activeNumbers: number;
  activePools: number;
  importedAt: string | null;
  recommendedSize: number;
  releasedNumbers: number;
  totalNumbers: number;
  twilioReady: boolean;
}) {
  const checks = [
    {
      detail: twilioReady
        ? "Twilio voice credentials are ready for buying and routing numbers."
        : "Connect Twilio before buying or activating tracking numbers.",
      ready: twilioReady,
      title: "Twilio connection",
    },
    {
      detail: importedAt
        ? `Inventory last imported ${formatImportDate(importedAt)}.`
        : "Import Twilio inventory to reuse existing numbers, addresses and bundles.",
      ready: Boolean(importedAt),
      title: "Twilio inventory",
    },
    {
      detail: activePools
        ? `${activePools} active pool${activePools === 1 ? "" : "s"} can be selected by DNI rules.`
        : "Add or activate a pool before expecting website number swaps.",
      ready: activePools > 0,
      title: "Number pools",
    },
    {
      detail:
        activeNumbers >= recommendedSize
          ? `${activeNumbers} active numbers meets the current ${recommendedSize} number target.`
          : `${Math.max(0, recommendedSize - activeNumbers)} more active number${
              recommendedSize - activeNumbers === 1 ? "" : "s"
            } recommended for current visitor volume.`,
      ready: activeNumbers >= recommendedSize,
      title: "Pool capacity",
    },
  ];

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
              Diagnostics
            </h3>
            <LazyHelpTooltip content="Diagnostics checks whether the call tracking setup is ready before testing website DNI." />
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Quick checks for the call tracking setup before testing website DNI.
          </p>
        </div>
        <Link
          href="/telephony/call-tracking/diagnostics"
          className="inline-flex h-8 shrink-0 items-center rounded-lg border border-gray-300 bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
        >
          Open
        </Link>
      </div>
      <div className="mt-4 space-y-3">
        {checks.map((check) => (
          <div key={check.title} className="flex gap-3">
            <span
              className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                check.ready ? "bg-success-500" : "bg-warning-500"
              }`}
            />
            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                {check.title}
              </p>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                {check.detail}
              </p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-lg border border-warning-200 bg-warning-50 p-3 text-xs text-warning-800 dark:border-warning-900/50 dark:bg-warning-900/20 dark:text-warning-200">
        Tracking pools inherit call handling from the phone system. Mobile or landline fallback
        on that route can add outbound call cost.
      </div>
      {releasedNumbers > 0 && (
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          {releasedNumbers} of {totalNumbers} tracking number{totalNumbers === 1 ? "" : "s"} have
          been released from Twilio and are retained only for history.
        </p>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 text-lg font-semibold text-gray-800 dark:text-white/90">{value}</p>
    </div>
  );
}

function formatNumberType(numberType: string | null) {
  if (numberType === "tollFree") return "Toll-free";
  return numberType ? numberType[0].toUpperCase() + numberType.slice(1) : "Voice number";
}

function isBundleCompatible(
  bundleNumberType: string | null,
  selectedNumberType: TrackingNumberSearchType,
) {
  if (!bundleNumberType) return false;
  const normalized = bundleNumberType === "toll-free" ? "tollFree" : bundleNumberType;

  if (selectedNumberType === "any") {
    return ["local", "national", "mobile", "tollFree"].includes(normalized);
  }

  return normalized === selectedNumberType;
}

function formatImportDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/London",
  }).format(date);
}

function formatStatusDate(value: number) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "just now";

  return new Intl.DateTimeFormat("en-GB", {
    timeStyle: "short",
    timeZone: "Europe/London",
  }).format(date);
}

function ReleaseTrackingNumberModal({
  isReleasing,
  onClose,
  releaseAction,
  releaseState,
  target,
}: {
  isReleasing: boolean;
  onClose: () => void;
  releaseAction: (payload: FormData) => void;
  releaseState: NumberPoolActionState;
  target: PoolNumber;
}) {
  return (
    <div className="fixed inset-0 z-999999 flex items-center justify-center bg-gray-950/50 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-5 shadow-xl dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
              Release tracking number
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              This permanently releases the number from Twilio.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-white/90"
            aria-label="Close"
          >
            x
          </button>
        </div>
        <form action={releaseAction} className="mt-5 space-y-4">
          <input type="hidden" name="id" value={target.id} />
          <div className="rounded-xl border border-error-200 bg-error-50 p-4 text-sm text-error-800 dark:border-error-900/50 dark:bg-error-900/20 dark:text-error-200">
            <p className="font-semibold">This releases {target.phoneNumber} from Twilio.</p>
            <p className="mt-2">
              Calls and messages to this number will stop. The customer will no longer own the
              number, and Twilio may not be able to recover it later.
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
      </div>
    </div>
  );
}

function PoolRow({
  number,
  action,
  isDeactivating,
  isReleasing,
  onRelease,
}: {
  number: PoolNumber;
  action: (payload: FormData) => void;
  isDeactivating: boolean;
  isReleasing: boolean;
  onRelease: () => void;
}) {
  const metadata =
    number.metadata && typeof number.metadata === "object" && !Array.isArray(number.metadata)
      ? (number.metadata as Record<string, unknown>)
      : {};
  const sid = typeof metadata.twilioPhoneNumberSid === "string" ? metadata.twilioPhoneNumberSid : null;
  const releasedFromTwilio = metadata.releasedFromTwilio === true;
  const canReleaseFromTwilio = Boolean(sid && !number.isActive && !releasedFromTwilio);
  const location = [metadata.locality, metadata.region, metadata.country]
    .filter((value): value is string => typeof value === "string" && Boolean(value))
    .join(", ");

  return (
    <div className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
            {number.phoneNumber}
          </p>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              number.isActive
                ? "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300"
                : "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300"
            }`}
          >
            {releasedFromTwilio ? "Released" : number.isActive ? "Active" : "Inactive"}
          </span>
        </div>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {number.label || "Tracking number"}
          {location ? ` / ${location}` : ""}
        </p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {number.assignments} assignments / {number.records} attributed calls
          {sid ? ` / ${sid}` : ""}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {number.isActive && (
          <form action={action}>
            <input type="hidden" name="id" value={number.id} />
            <button
              type="submit"
              disabled={isDeactivating}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
            >
              Remove from pool
            </button>
          </form>
        )}
        {canReleaseFromTwilio && (
          <button
            type="button"
            onClick={onRelease}
            disabled={isReleasing}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-error-200 bg-white px-3 text-sm font-medium text-error-600 hover:bg-error-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-error-900/40 dark:bg-gray-900 dark:text-error-300 dark:hover:bg-error-900/20"
          >
            Release from Twilio
          </button>
        )}
      </div>
    </div>
  );
}
