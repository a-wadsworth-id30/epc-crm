"use client";

import type { Dispatch, SetStateAction } from "react";
import { useMemo, useState } from "react";
import LazyHelpTooltip from "@/components/crm-boilerplate/LazyHelpTooltip";

type MappingRow = {
  key: string;
  label: string;
  required: boolean;
  defaultField: string;
  sample: string;
  crmTarget: string;
  note: string;
};

const mappingRows: MappingRow[] = [
  {
    key: "name",
    label: "Full name",
    required: false,
    defaultField: "name",
    sample: "Jane Smith",
    crmTarget: "Contact first name + last name",
    note: "Can be replaced by firstName and lastName if the form captures them separately.",
  },
  {
    key: "firstName",
    label: "First name",
    required: false,
    defaultField: "",
    sample: "Jane",
    crmTarget: "Contact first name",
    note: "Leave blank when the site sends a single full name field.",
  },
  {
    key: "lastName",
    label: "Last name",
    required: false,
    defaultField: "",
    sample: "Smith",
    crmTarget: "Contact last name",
    note: "Leave blank when the site sends a single full name field.",
  },
  {
    key: "email",
    label: "Email",
    required: false,
    defaultField: "email",
    sample: "jane@example.com",
    crmTarget: "Contact email, duplicate matching",
    note: "Used to update an existing contact when present.",
  },
  {
    key: "phone",
    label: "Phone",
    required: false,
    defaultField: "phone",
    sample: "+447700900123",
    crmTarget: "Contact phone, duplicate matching",
    note: "Normalised by the CRM before it is saved.",
  },
  {
    key: "companyName",
    label: "Company",
    required: false,
    defaultField: "company",
    sample: "Example Ltd",
    crmTarget: "Contact company name",
    note: "Stored on the contact when a company record is not linked yet.",
  },
  {
    key: "message",
    label: "Message",
    required: false,
    defaultField: "message",
    sample: "Interested in a quote.",
    crmTarget: "Conversation body + summary",
    note: "Creates the first inbound email-style communication on the opportunity. All captured form fields are also attached to the conversation.",
  },
  {
    key: "source",
    label: "Lead source",
    required: false,
    defaultField: "source",
    sample: "Website",
    crmTarget: "Opportunity source",
    note: "Falls back to UTM source, then Website.",
  },
  {
    key: "title",
    label: "Opportunity title",
    required: false,
    defaultField: "form_title",
    sample: "Website enquiry",
    crmTarget: "Opportunity title + communication subject",
    note: "Falls back to a generated title using the source and contact name.",
  },
  {
    key: "attribution",
    label: "Attribution payload",
    required: false,
    defaultField: "crm_attribution",
    sample: "{\"visitorId\":\"v_123\",\"sessionId\":\"s_456\"}",
    crmTarget: "Attribution snapshot + record metadata",
    note: "May be sent as attribution or crm_attribution. JSON strings are accepted.",
  },
];

function jsonValue(row: MappingRow) {
  if (row.key === "attribution") {
    return {
      visitorId: "v_123",
      sessionId: "s_456",
      landingPage: "https://example.com/",
      currentPage: "https://example.com/contact",
      referrer: "https://google.com/",
      lastTouch: {
        params: {
          utm_source: "google",
          utm_medium: "cpc",
          utm_campaign: "brand",
        },
      },
    };
  }

  return row.sample;
}

export default function AttributionLeadEndpointMapper({ baseUrl }: { baseUrl: string }) {
  const endpoint = `${baseUrl}/api/attribution/lead`;
  const [fieldNames, setFieldNames] = useState<Record<string, string>>(() =>
    Object.fromEntries(mappingRows.map((row) => [row.key, row.defaultField])),
  );
  const [copied, setCopied] = useState<string | null>(null);

  const enabledRows = mappingRows.filter((row) => fieldNames[row.key]?.trim());
  const disabledRows = mappingRows.length - enabledRows.length;
  const previewPayload = useMemo(
    () => ({
      ...Object.fromEntries(
        enabledRows.map((row) => [row.key, jsonValue(row)]),
      ),
      fields: [
        { name: "project_type", label: "Project type", value: "Website" },
        { name: "budget", label: "Budget", value: "To be discussed" },
      ],
    }),
    [enabledRows],
  );
  const snippet = useMemo(() => {
    const payloadLines = enabledRows.map((row) => {
      if (row.key === "attribution") {
        return `    attribution: window.id30Attribution?.get?.() ?? formData.get("${fieldNames[row.key]}"),`;
      }

      return `    ${row.key}: formData.get("${fieldNames[row.key]}"),`;
    });

    return `function crmFieldLabel(name) {
  return String(name)
    .replace(/\\[\\]$/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (character) => character.toUpperCase());
}

function crmCapturedFields(formData) {
  const sensitive = /(pass(word|code)?|secret|token|api[-_\\s]?key|authorization|auth|card|cc[-_\\s]?num|cvc|cvv|iban|sort[-_\\s]?code|account[-_\\s]?number|routing[-_\\s]?number)/i;

  return Array.from(formData.entries())
    .filter(([name, value]) => typeof value === "string" && value.trim() && !sensitive.test(name))
    .slice(0, 80)
    .map(([name, value]) => ({
      name,
      label: crmFieldLabel(name),
      value: String(value).replace(/\\s+/g, " ").trim().slice(0, 1500),
    }));
}

async function sendLeadToCrm(event) {
  event.preventDefault();

  const formData = new FormData(event.currentTarget);
  const payload = {
${payloadLines.join("\n")}
    fields: crmCapturedFields(formData),
  };

  const response = await fetch("${endpoint}", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("CRM lead capture failed");
  }

  return response.json();
}`;
  }, [enabledRows, endpoint, fieldNames]);

  async function copy(text: string, key: string) {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    window.setTimeout(() => setCopied((current) => (current === key ? null : current)), 1600);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.7fr)] xl:items-start">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">
              Lead capture endpoint
            </p>
            <div className="mt-2 flex items-center gap-2">
              <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
                Form field mapper
              </h2>
              <LazyHelpTooltip content="Maps website form input names to CRM lead fields and generates the endpoint payload a developer can install." />
            </div>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-500 dark:text-gray-400">
              Match website input names to CRM lead fields, then copy the generated submit handler or payload preview.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <SummaryStat label="Mapped fields" value={enabledRows.length.toString()} />
              <SummaryStat label="Skipped fields" value={disabledRows.toString()} />
              <SummaryStat label="CRM records" value="4" />
            </div>
          </div>

          <div className="min-w-0 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.04]">
            <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
              POST endpoint
            </p>
            <code className="mt-2 block truncate rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100">
              {endpoint}
            </code>
            <button
              type="button"
              onClick={() => void copy(endpoint, "endpoint")}
              className="mt-3 inline-flex h-9 items-center justify-center rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
            >
              {copied === "endpoint" ? "Copied" : "Copy endpoint"}
            </button>
          </div>
        </div>
      </section>

      <section className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(380px,0.85fr)] xl:items-start">
        <div className="min-w-0 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
                Field mapping
              </h3>
              <LazyHelpTooltip content="Shows each CRM lead field, the website input name to read from, and what record data will be created." />
            </div>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Leave a website input name blank to omit that field from the generated payload.
            </p>
          </div>

          <div className="overflow-hidden md:overflow-x-auto">
            <div className="md:min-w-[760px]">
              <div className="hidden grid-cols-[minmax(200px,1fr)_180px_minmax(220px,1fr)] gap-4 border-b border-gray-200 bg-gray-50 px-5 py-3 text-xs font-semibold uppercase text-gray-500 md:grid dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
                <span>CRM field</span>
                <span>Website input</span>
                <span>CRM result</span>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {mappingRows.map((row) => (
                  <MappingEditorRow
                    key={row.key}
                    fieldName={fieldNames[row.key] ?? ""}
                    row={row}
                    setFieldNames={setFieldNames}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="min-w-0 space-y-6">
          <CodePreview
            title="Generated submit handler"
            code={snippet}
            copied={copied === "snippet"}
            onCopy={() => void copy(snippet, "snippet")}
          />
          <CodePreview
            title="Payload preview"
            code={JSON.stringify(previewPayload, null, 2)}
            copied={copied === "payload"}
            onCopy={() => void copy(JSON.stringify(previewPayload, null, 2), "payload")}
          />
          <RecordsCreatedPanel />
        </div>
      </section>
    </div>
  );
}

function CodePreview({
  title,
  code,
  copied,
  onCopy,
}: {
  title: string;
  code: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-gray-200 bg-gray-950 dark:border-gray-800">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
        <span className="text-xs font-medium text-gray-400">{title}</span>
        <button
          type="button"
          onClick={onCopy}
          className="rounded-md px-2 py-1 text-xs font-medium text-white hover:bg-white/10"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="max-h-[420px] max-w-full overflow-auto p-4 text-xs leading-5 text-gray-100">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 p-3 dark:border-gray-800">
      <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold text-gray-800 dark:text-white/90">
        {value}
      </p>
    </div>
  );
}

function MappingEditorRow({
  fieldName,
  row,
  setFieldNames,
}: {
  fieldName: string;
  row: MappingRow;
  setFieldNames: Dispatch<SetStateAction<Record<string, string>>>;
}) {
  return (
    <div className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(200px,1fr)_180px_minmax(220px,1fr)] md:gap-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
            {row.label}
          </p>
          <code className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
            {row.key}
          </code>
          {row.required && (
            <span className="rounded-full bg-warning-50 px-2 py-0.5 text-xs font-medium text-warning-700 dark:bg-warning-900/20 dark:text-warning-300">
              Required
            </span>
          )}
        </div>
        <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
          {row.note}
        </p>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-gray-600 md:hidden dark:text-gray-400">
          Website input
        </span>
        <input
          value={fieldName}
          onChange={(event) =>
            setFieldNames((current) => ({
              ...current,
              [row.key]: event.target.value,
            }))
          }
          placeholder="Skip"
          className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        />
      </label>

      <div className="min-w-0">
        <span className="mb-1.5 block text-xs font-medium text-gray-600 md:hidden dark:text-gray-400">
          CRM result
        </span>
        <p className="text-sm font-medium text-gray-800 dark:text-white/90">
          {row.crmTarget}
        </p>
        <p className="mt-1 break-words text-xs text-gray-500 md:truncate dark:text-gray-400">
          Example: {row.sample}
        </p>
      </div>
    </div>
  );
}

function RecordsCreatedPanel() {
  const records = [
    ["Contact", "Created or updated by matching email or normalised phone."],
    ["Sales opportunity", "Created in Lead stage with source, title and next follow-up step."],
    ["Conversation item", "The message and captured form fields are added as an inbound website enquiry."],
    ["Attribution record", "UTM, landing page, referrer and visitor/session metadata are linked back to the lead."],
  ];

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <p className="text-base font-semibold text-gray-800 dark:text-white/90">
        CRM records created
      </p>
      <div className="mt-4 grid gap-3">
        {records.map(([title, detail]) => (
          <div key={title} className="rounded-xl border border-gray-200 p-3 dark:border-gray-800">
            <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
              {title}
            </p>
            <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
              {detail}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
