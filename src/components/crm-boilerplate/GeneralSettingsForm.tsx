"use client";

import { useActionState, useEffect, useState } from "react";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import LazyHelpTooltip from "@/components/crm-boilerplate/LazyHelpTooltip";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";
import { updateGeneralSettingsAction } from "@/lib/actions/settings";
import {
  displayCurrencyStyleOptions,
  displayDateFormatOptions,
  displayNumberLocaleOptions,
  displayTimeFormatOptions,
  displayWeekStartDayOptions,
  type DisplayDefaults,
} from "@/lib/display-defaults";
import type {
  DocumentLibraryFolder,
  DocumentLibrarySettings,
} from "@/lib/document-library";
import {
  defaultLandingPageOptions,
  defaultTablePageSizeOptions,
  type InterfaceDefaults,
} from "@/lib/interface-defaults";
import {
  moduleToggleDefinitions,
  type ModuleToggleKey,
  type ModuleToggles,
} from "@/lib/module-toggles";
import {
  notificationCategoryDefinitions,
  type NotificationCategory,
  type NotificationDefaults,
} from "@/lib/notification-defaults";
import {
  salesDefaultOwnerModeOptions,
  type SalesDefaults,
  type SalesOwnerMode,
} from "@/lib/sales/defaults";
import {
  taskDefaultAssigneeModeOptions,
  type TaskAssigneeMode,
  type TaskDefaults,
} from "@/lib/tasks/defaults";
import {
  workspaceDefaultCountryOptions,
  workspaceDefaultCurrencyOptions,
  workspaceDefaultLocaleOptions,
  workspaceDefaultTimezoneOptions,
  type WorkspaceDefaults,
} from "@/lib/workspace-defaults";

type Option = {
  label: string;
  value: string;
};

export type GeneralSettingsFormProps = {
  companiesEnabled: boolean;
  displayDefaults: DisplayDefaults;
  documentLibrary: DocumentLibrarySettings;
  interfaceDefaults: InterfaceDefaults;
  moduleToggles: ModuleToggles;
  notificationDefaults: NotificationDefaults;
  salesDefaults: SalesDefaults;
  salesOwnerOptions: Option[];
  salesStageOptions: Option[];
  taskAssigneeOptions: Option[];
  taskDefaults: TaskDefaults;
  workspaceDefaults: WorkspaceDefaults;
  canEdit: boolean;
};

const selectClassName =
  "dark:bg-dark-900 shadow-theme-xs focus:border-brand-300 focus:ring-brand-500/10 dark:focus:border-brand-800 h-11 w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-800 focus:ring-3 focus:outline-hidden disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:disabled:bg-white/[0.04] dark:disabled:text-white/30";

function documentFolderStateKey(folders: DocumentLibraryFolder[]) {
  return folders
    .map((folder) => `${folder.slug}:${folder.name}:${folder.sortOrder}`)
    .join("|");
}

export default function GeneralSettingsForm({
  companiesEnabled,
  displayDefaults,
  documentLibrary,
  interfaceDefaults,
  moduleToggles,
  notificationDefaults,
  salesDefaults,
  salesOwnerOptions,
  salesStageOptions,
  taskAssigneeOptions,
  taskDefaults,
  workspaceDefaults,
  canEdit,
}: GeneralSettingsFormProps) {
  const [enabled, setEnabled] = useState(companiesEnabled);
  const [display, setDisplay] = useState(displayDefaults);
  const [documentFolders, setDocumentFolders] = useState(
    documentLibrary.folders,
  );
  const [interfaceSettings, setInterfaceSettings] =
    useState(interfaceDefaults);
  const [modules, setModules] = useState(moduleToggles);
  const [notifications, setNotifications] = useState(notificationDefaults);
  const [sales, setSales] = useState(salesDefaults);
  const [tasks, setTasks] = useState(taskDefaults);
  const [defaults, setDefaults] = useState(workspaceDefaults);
  const [state, formAction, isPending] = useActionState(updateGeneralSettingsAction, {
    ok: false,
    message: "",
    companiesEnabled: null,
    displayDefaults: null,
    documentLibrary: null,
    interfaceDefaults: null,
    moduleToggles: null,
    notificationDefaults: null,
    salesDefaults: null,
    taskDefaults: null,
    workspaceDefaults: null,
  });
  const [savedCompaniesEnabled, setSavedCompaniesEnabled] = useState(companiesEnabled);
  const [savedDisplay, setSavedDisplay] = useState(displayDefaults);
  const [savedDocumentFolders, setSavedDocumentFolders] = useState(
    documentLibrary.folders,
  );
  const [savedInterfaceSettings, setSavedInterfaceSettings] =
    useState(interfaceDefaults);
  const [savedModules, setSavedModules] = useState(moduleToggles);
  const [savedNotifications, setSavedNotifications] = useState(notificationDefaults);
  const [savedSales, setSavedSales] = useState(salesDefaults);
  const [savedTasks, setSavedTasks] = useState(taskDefaults);
  const [savedDefaults, setSavedDefaults] = useState(workspaceDefaults);
  const { showToast } = useToast();
  const isDirty =
    enabled !== savedCompaniesEnabled ||
    display.currencyDisplay !== savedDisplay.currencyDisplay ||
    display.dateFormat !== savedDisplay.dateFormat ||
    display.numberLocale !== savedDisplay.numberLocale ||
    display.timeFormat !== savedDisplay.timeFormat ||
    display.weekStartDay !== savedDisplay.weekStartDay ||
    documentFolderStateKey(documentFolders) !==
      documentFolderStateKey(savedDocumentFolders) ||
    interfaceSettings.defaultLandingPage !==
      savedInterfaceSettings.defaultLandingPage ||
    interfaceSettings.defaultTablePageSize !==
      savedInterfaceSettings.defaultTablePageSize ||
    modules.ai !== savedModules.ai ||
    modules.discovery !== savedModules.discovery ||
    modules.marketing !== savedModules.marketing ||
    modules.products !== savedModules.products ||
    modules.telephony !== savedModules.telephony ||
    notifications.showInfoNotifications !==
      savedNotifications.showInfoNotifications ||
    notificationCategoryDefinitions.some(
      (category) =>
        notifications.categories[category.key] !==
        savedNotifications.categories[category.key],
    ) ||
    sales.defaultOwnerId !== savedSales.defaultOwnerId ||
    sales.defaultOwnerMode !== savedSales.defaultOwnerMode ||
    sales.defaultSalesPipelineStageId !== savedSales.defaultSalesPipelineStageId ||
    sales.staleLeadDays !== savedSales.staleLeadDays ||
    tasks.defaultAssigneeId !== savedTasks.defaultAssigneeId ||
    tasks.defaultAssigneeMode !== savedTasks.defaultAssigneeMode ||
    tasks.defaultDueDays !== savedTasks.defaultDueDays ||
    defaults.country !== savedDefaults.country ||
    defaults.currency !== savedDefaults.currency ||
    defaults.locale !== savedDefaults.locale ||
    defaults.timezone !== savedDefaults.timezone;

  useEffect(() => {
    if (
      !state.ok ||
      state.companiesEnabled === null ||
      !state.displayDefaults ||
      !state.documentLibrary ||
      !state.interfaceDefaults ||
      !state.moduleToggles ||
      !state.notificationDefaults ||
      !state.salesDefaults ||
      !state.taskDefaults ||
      !state.workspaceDefaults
    ) {
      return;
    }

    const savedEnabled = state.companiesEnabled;
    const savedDisplayDefaults = state.displayDefaults;
    const savedDocumentLibrary = state.documentLibrary;
    const savedInterfaceDefaults = state.interfaceDefaults;
    const savedModuleToggles = state.moduleToggles;
    const savedNotificationDefaults = state.notificationDefaults;
    const savedSalesDefaults = state.salesDefaults;
    const savedTaskDefaults = state.taskDefaults;
    const savedWorkspaceDefaults = state.workspaceDefaults;
    queueMicrotask(() => {
      setEnabled(savedEnabled);
      setDisplay(savedDisplayDefaults);
      setDocumentFolders(savedDocumentLibrary.folders);
      setInterfaceSettings(savedInterfaceDefaults);
      setModules(savedModuleToggles);
      setNotifications(savedNotificationDefaults);
      setSales(savedSalesDefaults);
      setTasks(savedTaskDefaults);
      setDefaults(savedWorkspaceDefaults);
      setSavedCompaniesEnabled(savedEnabled);
      setSavedDisplay(savedDisplayDefaults);
      setSavedDocumentFolders(savedDocumentLibrary.folders);
      setSavedInterfaceSettings(savedInterfaceDefaults);
      setSavedModules(savedModuleToggles);
      setSavedNotifications(savedNotificationDefaults);
      setSavedSales(savedSalesDefaults);
      setSavedTasks(savedTaskDefaults);
      setSavedDefaults(savedWorkspaceDefaults);
    });
    showToast(state.message || "Settings saved.");
  }, [
    showToast,
    state.companiesEnabled,
    state.displayDefaults,
    state.documentLibrary,
    state.interfaceDefaults,
    state.message,
    state.moduleToggles,
    state.notificationDefaults,
    state.ok,
    state.salesDefaults,
    state.taskDefaults,
    state.workspaceDefaults,
  ]);

  function updateDefault(key: keyof WorkspaceDefaults, value: string) {
    setDefaults((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function updateDisplayDefault(key: keyof DisplayDefaults, value: string) {
    setDisplay(
      (current) =>
        ({
          ...current,
          [key]: value,
        }) as DisplayDefaults,
    );
  }

  function updateInterfaceLandingPage(value: string) {
    setInterfaceSettings((current) => ({
      ...current,
      defaultLandingPage: value,
    }) as InterfaceDefaults);
  }

  function updateInterfacePageSize(value: string) {
    const pageSize = Number(value);

    setInterfaceSettings((current) => ({
      ...current,
      defaultTablePageSize: Number.isFinite(pageSize)
        ? pageSize
        : current.defaultTablePageSize,
    }) as InterfaceDefaults);
  }

  function updateDocumentFolderName(index: number, value: string) {
    setDocumentFolders((current) =>
      current.map((folder, folderIndex) =>
        folderIndex === index ? { ...folder, name: value } : folder,
      ),
    );
  }

  function addDocumentFolder() {
    setDocumentFolders((current) => [
      ...current,
      {
        name: "New folder",
        slug: "",
        sortOrder: current.length,
      },
    ]);
  }

  function removeDocumentFolder(index: number) {
    setDocumentFolders((current) =>
      current
        .filter((_, folderIndex) => folderIndex !== index)
        .map((folder, sortOrder) => ({ ...folder, sortOrder })),
    );
  }

  function updateModule(key: ModuleToggleKey, value: boolean) {
    setModules((current) => ({
      ...current,
      [key]: value,
    }));

    if (key === "companies") {
      setEnabled(value);
    }
  }

  function updateNotificationCategory(
    category: NotificationCategory,
    value: boolean,
  ) {
    setNotifications((current) => ({
      ...current,
      categories: {
        ...current.categories,
        [category]: value,
      },
    }));
  }

  function updateShowInfoNotifications(value: boolean) {
    setNotifications((current) => ({
      ...current,
      showInfoNotifications: value,
    }));
  }

  function updateSalesOwnerMode(value: string) {
    const ownerMode = value as SalesOwnerMode;

    setSales((current) => ({
      ...current,
      defaultOwnerId:
        ownerMode === "specific-user" ? current.defaultOwnerId : null,
      defaultOwnerMode: ownerMode,
    }));
  }

  function updateSalesDefaultId(
    key: "defaultOwnerId" | "defaultSalesPipelineStageId",
    value: string,
  ) {
    setSales((current) => ({
      ...current,
      [key]: value || null,
    }));
  }

  function updateStaleLeadDays(value: string) {
    const days = Number(value);

    setSales((current) => ({
      ...current,
      staleLeadDays: Number.isFinite(days) ? days : current.staleLeadDays,
    }));
  }

  function updateTaskAssigneeMode(value: string) {
    const assigneeMode = value as TaskAssigneeMode;

    setTasks((current) => ({
      ...current,
      defaultAssigneeId:
        assigneeMode === "specific-user" ? current.defaultAssigneeId : null,
      defaultAssigneeMode: assigneeMode,
    }));
  }

  function updateTaskAssigneeId(value: string) {
    setTasks((current) => ({
      ...current,
      defaultAssigneeId: value || null,
    }));
  }

  function updateTaskDueDays(value: string) {
    const days = Number(value);

    setTasks((current) => ({
      ...current,
      defaultDueDays: Number.isFinite(days) ? days : current.defaultDueDays,
    }));
  }

  return (
    <form action={formAction} className="space-y-6">
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="border-b border-gray-200 p-5 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
              Workspace defaults
            </h2>
            <LazyHelpTooltip content="Sets the baseline locale, timezone, country and currency used by CRM workflows as they adopt global workspace defaults." />
          </div>
          <p className="mt-2 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
            These values define the CRM-wide baseline for new records, reporting
            and operational workflows.
          </p>
        </div>

        <div className="grid gap-5 p-5 md:grid-cols-2">
          <SelectField
            label="Default currency"
            name="defaultCurrency"
            value={defaults.currency}
            options={workspaceDefaultCurrencyOptions}
            disabled={!canEdit}
            description="Used by new manual sales opportunities and future money defaults."
            onChange={(value) => updateDefault("currency", value)}
          />
          <SelectField
            label="Default timezone"
            name="defaultTimezone"
            value={defaults.timezone}
            options={workspaceDefaultTimezoneOptions}
            disabled={!canEdit}
            description="Used as the workspace baseline for date and time sensitive workflows."
            onChange={(value) => updateDefault("timezone", value)}
          />
          <SelectField
            label="Default locale"
            name="defaultLocale"
            value={defaults.locale}
            options={workspaceDefaultLocaleOptions}
            disabled={!canEdit}
            description="Used for future date, number and currency formatting defaults."
            onChange={(value) => updateDefault("locale", value)}
          />
          <SelectField
            label="Default country"
            name="defaultCountry"
            value={defaults.country}
            options={workspaceDefaultCountryOptions}
            disabled={!canEdit}
            description="Used as the baseline country for future address and compliance defaults."
            onChange={(value) => updateDefault("country", value)}
          />
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="border-b border-gray-200 p-5 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
              Interface defaults
            </h2>
            <LazyHelpTooltip content="Controls everyday CRM interface behavior such as where users land after sign-in and how many rows list pages show by default." />
          </div>
          <p className="mt-2 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
            These values reduce repeated setup choices for common CRM work.
          </p>
        </div>

        <div className="grid gap-5 p-5 md:grid-cols-2">
          <SelectField
            label="Default landing page"
            name="interfaceDefaultLandingPage"
            value={interfaceSettings.defaultLandingPage}
            options={defaultLandingPageOptions}
            disabled={!canEdit}
            description="Used after sign-in when there is no protected page to return to."
            onChange={updateInterfaceLandingPage}
          />
          <SelectField
            label="Default list page size"
            name="interfaceDefaultTablePageSize"
            value={String(interfaceSettings.defaultTablePageSize)}
            options={defaultTablePageSizeOptions}
            disabled={!canEdit}
            description="Used by supported list pages when the URL does not already specify a page size."
            onChange={updateInterfacePageSize}
          />
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="border-b border-gray-200 p-5 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
              Document library
            </h2>
            <LazyHelpTooltip content="Defines the standard folders shown on contact, company and sales document panels. Folder identities stay stable when names are changed." />
          </div>
          <p className="mt-2 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
            These folders appear on CRM records that store customer or project
            documents.
          </p>
        </div>

        <div className="space-y-3 p-5">
          {documentFolders.map((folder, index) => (
            <div
              key={`${folder.slug || "new"}-${index}`}
              className="grid gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 md:grid-cols-[minmax(0,1fr)_auto] dark:border-gray-800 dark:bg-gray-950/30"
            >
              <input
                type="hidden"
                name="documentFolderSlug"
                value={folder.slug}
              />
              <label className="block">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Folder {index + 1}
                </span>
                <input
                  type="text"
                  name="documentFolderName"
                  value={folder.name}
                  maxLength={80}
                  disabled={!canEdit}
                  onChange={(event) =>
                    updateDocumentFolderName(index, event.target.value)
                  }
                  className={`mt-2 ${selectClassName}`}
                />
              </label>
              <button
                type="button"
                disabled={!canEdit || documentFolders.length <= 1}
                onClick={() => removeDocumentFolder(index)}
                className="inline-flex h-11 items-center justify-center self-end rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
              >
                Remove
              </button>
            </div>
          ))}

          <button
            type="button"
            disabled={!canEdit || documentFolders.length >= 50}
            onClick={addDocumentFolder}
            className="inline-flex h-11 items-center justify-center rounded-lg border border-brand-200 bg-brand-50 px-4 text-sm font-semibold text-brand-700 transition hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-brand-900/40 dark:bg-brand-900/20 dark:text-brand-300"
          >
            Add folder
          </button>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="border-b border-gray-200 p-5 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
              Display formatting
            </h2>
            <LazyHelpTooltip content="Controls the visible date, time, number and currency presentation used by CRM views that read global display defaults." />
          </div>
          <p className="mt-2 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
            These settings keep dashboard and sales values consistent with the
            client workspace.
          </p>
        </div>

        <div className="grid gap-5 p-5 md:grid-cols-2">
          <SelectField
            label="Date format"
            name="displayDateFormat"
            value={display.dateFormat}
            options={displayDateFormatOptions}
            disabled={!canEdit}
            description="Used for visible CRM dates in supported dashboard and sales views."
            onChange={(value) => updateDisplayDefault("dateFormat", value)}
          />
          <SelectField
            label="Time format"
            name="displayTimeFormat"
            value={display.timeFormat}
            options={displayTimeFormatOptions}
            disabled={!canEdit}
            description="Controls whether visible times use a 24-hour or 12-hour clock."
            onChange={(value) => updateDisplayDefault("timeFormat", value)}
          />
          <SelectField
            label="Week starts on"
            name="displayWeekStartDay"
            value={display.weekStartDay}
            options={displayWeekStartDayOptions}
            disabled={!canEdit}
            description="Stored for calendar and reporting views as they adopt workspace display defaults."
            onChange={(value) => updateDisplayDefault("weekStartDay", value)}
          />
          <SelectField
            label="Number locale"
            name="displayNumberLocale"
            value={display.numberLocale}
            options={displayNumberLocaleOptions}
            disabled={!canEdit}
            description="Controls number separators and currency formatting, or follows the workspace locale."
            onChange={(value) => updateDisplayDefault("numberLocale", value)}
          />
          <SelectField
            label="Currency display"
            name="displayCurrencyStyle"
            value={display.currencyDisplay}
            options={displayCurrencyStyleOptions}
            disabled={!canEdit}
            description="Choose whether money values show a currency symbol or ISO currency code."
            onChange={(value) => updateDisplayDefault("currencyDisplay", value)}
          />
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="border-b border-gray-200 p-5 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
              Notification defaults
            </h2>
            <LazyHelpTooltip content="Controls which generated header notifications are visible by default. Critical notifications always remain visible." />
          </div>
          <p className="mt-2 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
            Reduce notification noise by hiding non-critical categories or
            optional information-only updates.
          </p>
        </div>

        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          <ModuleToggleRow
            checked={notifications.showInfoNotifications}
            description="Shows positive or low-priority updates such as new contacts, captured attribution activity and recent uploads."
            disabled={!canEdit}
            label="Information notifications"
            name="notificationShowInfo"
            onChange={updateShowInfoNotifications}
          />
          {notificationCategoryDefinitions.map((category) => (
            <ModuleToggleRow
              key={category.key}
              checked={notifications.categories[category.key]}
              description={`${category.description} Critical notifications in this category stay visible.`}
              disabled={!canEdit}
              label={category.label}
              name={`notificationCategory${category.key}`}
              onChange={(value) =>
                updateNotificationCategory(category.key, value)
              }
            />
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="border-b border-gray-200 p-5 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
              Task defaults
            </h2>
            <LazyHelpTooltip content="Sets the default assignee and due date for follow-up tasks created by CRM assistant workflows." />
          </div>
          <p className="mt-2 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
            These defaults apply when a task is created without an explicit
            assignee or due date, including AI follow-up task actions.
          </p>
        </div>

        <div className="grid gap-5 p-5 md:grid-cols-2">
          <SelectField
            label="Default assignee"
            name="taskDefaultAssigneeMode"
            value={tasks.defaultAssigneeMode}
            options={taskDefaultAssigneeModeOptions}
            disabled={!canEdit}
            description="Controls who receives newly created follow-up tasks when no assignee is provided."
            onChange={updateTaskAssigneeMode}
          />
          <SelectField
            label="Specific assignee"
            name="taskDefaultAssigneeId"
            value={tasks.defaultAssigneeId ?? ""}
            options={[
              { label: "Choose assignee", value: "" },
              ...taskAssigneeOptions,
            ]}
            disabled={!canEdit || tasks.defaultAssigneeMode !== "specific-user"}
            description="Used only when the default assignee mode is set to a specific user."
            onChange={updateTaskAssigneeId}
          />
          <NumberField
            label="Default due date"
            name="taskDefaultDueDays"
            value={tasks.defaultDueDays}
            min={0}
            max={30}
            disabled={!canEdit}
            description="Number of days from task creation before the follow-up is due."
            onChange={updateTaskDueDays}
          />
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="border-b border-gray-200 p-5 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
              Sales defaults
            </h2>
            <LazyHelpTooltip content="Sets baseline owner, pipeline stage and stale lead review timing for new sales records created by CRM workflows." />
          </div>
          <p className="mt-2 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
            These defaults apply to new manual sales, captured website leads,
            phone-call leads and stale sales notifications.
          </p>
        </div>

        <div className="grid gap-5 p-5 md:grid-cols-2">
          <SelectField
            label="Default owner"
            name="salesDefaultOwnerMode"
            value={sales.defaultOwnerMode}
            options={salesDefaultOwnerModeOptions}
            disabled={!canEdit}
            description="Controls who owns newly created sales records when no explicit owner is provided."
            onChange={updateSalesOwnerMode}
          />
          <SelectField
            label="Specific owner"
            name="salesDefaultOwnerId"
            value={sales.defaultOwnerId ?? ""}
            options={[{ label: "Choose owner", value: "" }, ...salesOwnerOptions]}
            disabled={!canEdit || sales.defaultOwnerMode !== "specific-user"}
            description="Used only when the default owner mode is set to a specific user."
            onChange={(value) => updateSalesDefaultId("defaultOwnerId", value)}
          />
          <SelectField
            label="Default pipeline stage"
            name="salesDefaultPipelineStageId"
            value={sales.defaultSalesPipelineStageId ?? ""}
            options={[
              { label: "First active lead stage", value: "" },
              ...salesStageOptions,
            ]}
            disabled={!canEdit}
            description="Sets the starting stage for new sales records when the workflow does not choose one."
            onChange={(value) =>
              updateSalesDefaultId("defaultSalesPipelineStageId", value)
            }
          />
          <NumberField
            label="Stale lead review"
            name="salesStaleLeadDays"
            value={sales.staleLeadDays}
            min={1}
            max={90}
            disabled={!canEdit}
            description="Controls when assigned open sales with no next step are flagged in notifications."
            onChange={updateStaleLeadDays}
          />
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="border-b border-gray-200 p-5 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
              Module toggles
            </h2>
            <LazyHelpTooltip content="Controls which major CRM workspaces are visible in the app shell and search. Direct URL access is not blocked by these toggles yet." />
          </div>
          <p className="mt-2 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
            Switch off modules that are not part of this client workspace to
            simplify navigation and search.
          </p>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {moduleToggleDefinitions.map((module) => (
            <ModuleToggleRow
              key={module.key}
              checked={module.key === "companies" ? enabled : modules[module.key]}
              description={module.description}
              disabled={!canEdit}
              label={module.label}
              name={moduleInputName(module.key)}
              onChange={(value) => updateModule(module.key, value)}
            />
          ))}
        </div>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <ActionStateMessage state={!state.ok ? state : undefined} />
        <button
          type="submit"
          disabled={!canEdit || isPending || !isDirty}
          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-brand-500 px-4 py-3 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Saving..." : "Save settings"}
        </button>
      </div>
    </form>
  );
}

function NumberField({
  description,
  disabled,
  label,
  max,
  min,
  name,
  onChange,
  value,
}: {
  description: string;
  disabled: boolean;
  label: string;
  max: number;
  min: number;
  name: string;
  onChange: (value: string) => void;
  value: number;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
      </span>
      <input
        type="number"
        name={name}
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={`mt-2 ${selectClassName}`}
      />
      <span className="mt-2 block text-xs leading-5 text-gray-500 dark:text-gray-400">
        {description}
      </span>
    </label>
  );
}

function moduleInputName(key: ModuleToggleKey) {
  switch (key) {
    case "companies":
      return "companiesEnabled";
    case "products":
      return "moduleProducts";
    case "discovery":
      return "moduleDiscovery";
    case "marketing":
      return "moduleMarketing";
    case "telephony":
      return "moduleTelephony";
    case "ai":
      return "moduleAi";
  }
}

function ModuleToggleRow({
  checked,
  description,
  disabled,
  label,
  name,
  onChange,
}: {
  checked: boolean;
  description: string;
  disabled: boolean;
  label: string;
  name: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
          {label}
        </h3>
        <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
          {description}
        </p>
      </div>
      <label
        className={`flex select-none items-center gap-3 text-sm font-medium ${
          disabled ? "cursor-not-allowed text-gray-400" : "cursor-pointer text-gray-700 dark:text-gray-400"
        }`}
      >
        <input
          type="checkbox"
          name={name}
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          className="sr-only"
        />
        <span
          className={`relative block h-6 w-11 rounded-full transition ${
            checked ? "bg-brand-500" : "bg-gray-200 dark:bg-white/10"
          } ${disabled ? "opacity-60" : ""}`}
        >
          <span
            className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-theme-sm transition ${
              checked ? "translate-x-full" : "translate-x-0"
            }`}
          />
        </span>
        {checked ? "Enabled" : "Disabled"}
      </label>
    </div>
  );
}

function SelectField({
  description,
  disabled,
  label,
  name,
  onChange,
  options,
  value,
}: {
  description: string;
  disabled: boolean;
  label: string;
  name: string;
  onChange: (value: string) => void;
  options: readonly Option[];
  value: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
      </span>
      <select
        name={name}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={`mt-2 ${selectClassName}`}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span className="mt-2 block text-xs leading-5 text-gray-500 dark:text-gray-400">
        {description}
      </span>
    </label>
  );
}
