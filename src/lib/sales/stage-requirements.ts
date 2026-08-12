import {
  documentUploadTypeDefinition,
  isDocumentUploadType,
  type DocumentUploadType,
} from "@/lib/document-library";

export const stageRequiredActionValues = [
  "required_documents_uploaded",
  "survey_completed",
  "proposal_issued",
  "deposit_received",
  "design_approved",
] as const;

export type StageRequiredAction = (typeof stageRequiredActionValues)[number];

export const stageRequiredActionDefinitions = [
  {
    value: "required_documents_uploaded",
    label: "Required documents uploaded",
    description: "Requires at least one linked contact, organisation or sale file.",
  },
  {
    value: "survey_completed",
    label: "Survey completed",
    description: "Uses survey document evidence, a completed survey task or lead-scope status.",
  },
  {
    value: "proposal_issued",
    label: "Proposal issued",
    description: "Uses quotation/proposal documents or proposal-related communication.",
  },
  {
    value: "deposit_received",
    label: "Deposit received",
    description: "Uses payment evidence in lead scope, finance documents or communication.",
  },
  {
    value: "design_approved",
    label: "Design approved",
    description: "Uses approved design evidence in lead scope, documents or communication.",
  },
] as const satisfies ReadonlyArray<{
  value: StageRequiredAction;
  label: string;
  description: string;
}>;

export type StageRequirementEvidence = {
  communications: Array<{
    body: string | null;
    direction: string;
    subject: string | null;
    summary: string;
  }>;
  files: Array<{
    documentFolder: string | null;
    documentUploadType?: string | null;
    originalName: string;
    notes: string | null;
    tags: string[];
  }>;
  leadScope: unknown;
  tasks: Array<{
    description: string | null;
    status: string;
    title: string;
  }>;
};

const stageRequiredActionSet = new Set<string>(stageRequiredActionValues);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function isStageRequiredAction(
  value: unknown,
): value is StageRequiredAction {
  return typeof value === "string" && stageRequiredActionSet.has(value);
}

export function parseStageRequiredActions(value: unknown): StageRequiredAction[] {
  const data = isRecord(value) ? value : {};
  const rawActions = Array.isArray(value)
    ? value
    : Array.isArray(data.requiredActions)
      ? data.requiredActions
      : [];
  const actions: StageRequiredAction[] = [];
  const seen = new Set<StageRequiredAction>();

  rawActions.forEach((action) => {
    if (!isStageRequiredAction(action) || seen.has(action)) return;
    seen.add(action);
    actions.push(action);
  });

  return actions;
}

export function stageRequiredActionsToJson(actions: StageRequiredAction[]) {
  return parseStageRequiredActions(actions);
}

export function parseStageRequiredDocumentTypes(
  value: unknown,
): DocumentUploadType[] {
  const data = isRecord(value) ? value : {};
  const rawTypes = Array.isArray(value)
    ? value
    : Array.isArray(data.requiredDocumentTypes)
      ? data.requiredDocumentTypes
      : [];
  const types: DocumentUploadType[] = [];
  const seen = new Set<DocumentUploadType>();

  rawTypes.forEach((type) => {
    if (!isDocumentUploadType(type) || seen.has(type)) return;
    seen.add(type);
    types.push(type);
  });

  return types;
}

export function stageRequiredDocumentTypesToJson(types: DocumentUploadType[]) {
  return parseStageRequiredDocumentTypes(types);
}

export function stageRequiredActionLabel(action: StageRequiredAction) {
  return (
    stageRequiredActionDefinitions.find(
      (definition) => definition.value === action,
    )?.label ?? action
  );
}

export function stageRequiredDocumentTypeLabel(type: DocumentUploadType) {
  return documentUploadTypeDefinition(type)?.label ?? type;
}

export function stageRequiredDocumentTypesLabel(types: DocumentUploadType[]) {
  return types.map(stageRequiredDocumentTypeLabel).join(", ");
}

export function stageRequirementHasEvidence({
  action,
  evidence,
  requiredDocumentTypes = [],
}: {
  action: StageRequiredAction;
  evidence: StageRequirementEvidence;
  requiredDocumentTypes?: DocumentUploadType[];
}) {
  if (action === "required_documents_uploaded") {
    if (!requiredDocumentTypes.length) return evidence.files.length > 0;

    return requiredDocumentTypes.every((type) =>
      evidence.files.some((file) => fileMatchesDocumentType(file, type)),
    );
  }

  if (action === "survey_completed") {
    return (
      hasTruthyStatus(evidence.leadScope, [
        "surveycompleted",
        "surveycomplete",
        "surveyfinished",
        "surveyapproved",
        "surveystatus",
        "survey",
      ]) ||
      hasCompletedTask(evidence.tasks, ["survey", "site visit"]) ||
      hasFileEvidence(evidence.files, ["survey", "site photo"], [
        "surveys-and-site-photos",
      ])
    );
  }

  if (action === "proposal_issued") {
    return (
      hasTruthyStatus(evidence.leadScope, [
        "proposalissued",
        "proposalcomplete",
        "quoteissued",
        "quotationissued",
        "proposalstatus",
        "quotestatus",
        "proposal",
      ]) ||
      hasFileEvidence(evidence.files, ["proposal", "quotation", "quote"], [
        "quotations-and-proposals",
      ]) ||
      hasCommunicationEvidence(evidence.communications, [
        "proposal issued",
        "quotation issued",
        "quote issued",
        "proposal sent",
        "quote sent",
      ])
    );
  }

  if (action === "deposit_received") {
    return (
      hasTruthyStatus(evidence.leadScope, [
        "depositreceived",
        "depositpaid",
        "paymentreceived",
        "depositstatus",
        "paymentstatus",
        "deposit",
      ]) ||
      hasFileEvidence(evidence.files, ["deposit", "payment", "paid"], [
        "contracts-and-finance",
      ]) ||
      hasCommunicationEvidence(evidence.communications, [
        "deposit received",
        "deposit paid",
        "payment received",
      ])
    );
  }

  if (action === "design_approved") {
    return (
      hasTruthyStatus(evidence.leadScope, [
        "designapproved",
        "designsignedoff",
        "designapproval",
        "designstatus",
        "design",
      ]) ||
      hasFileEvidence(evidence.files, ["approved", "signed off"], [
        "design-documents",
      ]) ||
      hasCommunicationEvidence(evidence.communications, [
        "design approved",
        "design signed off",
        "approved design",
      ])
    );
  }

  return false;
}

function fileMatchesDocumentType(
  file: StageRequirementEvidence["files"][number],
  type: DocumentUploadType,
) {
  if (file.documentUploadType === type) return true;

  const definition = documentUploadTypeDefinition(type);
  if (!definition) return false;

  return file.documentFolder === definition.folderSlug;
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeKey(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function flattenJsonText(value: unknown): string[] {
  if (value === null || typeof value === "undefined") return [];
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return [String(value)];
  }
  if (Array.isArray(value)) return value.flatMap(flattenJsonText);
  if (!isRecord(value)) return [];

  return Object.entries(value).flatMap(([key, item]) => [
    key,
    ...flattenJsonText(item),
  ]);
}

function hasTruthyStatus(value: unknown, keys: string[]) {
  if (!isRecord(value)) {
    const flatText = normalizeText(flattenJsonText(value).join(" "));
    return keys.some((key) => flatText.includes(normalizeText(key)));
  }

  const normalizedKeys = new Set(keys.map(normalizeKey));
  const stack: Array<Record<string, unknown>> = [value];
  const flatTextParts: string[] = [];

  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;

    Object.entries(current).forEach(([key, item]) => {
      flatTextParts.push(key, String(item ?? ""));
      if (!normalizedKeys.has(normalizeKey(key))) {
        if (isRecord(item)) stack.push(item);
        return;
      }

      if (item === true) flatTextParts.push(`${key} complete`);
      if (
        typeof item === "string" &&
        /\b(done|complete|completed|approved|issued|paid|received|yes|true)\b/i.test(
          item,
        )
      ) {
        flatTextParts.push(`${key} complete`);
      }
    });
  }

  const flatText = normalizeText(flatTextParts.join(" "));
  return keys.some((key) => {
    const normalized = normalizeText(key);
    return (
      flatText.includes(`${normalized} complete`) ||
      flatText.includes(`${normalized} completed`) ||
      flatText.includes(`${normalized} approved`) ||
      flatText.includes(`${normalized} issued`) ||
      flatText.includes(`${normalized} paid`) ||
      flatText.includes(`${normalized} received`)
    );
  });
}

function hasCompletedTask(
  tasks: StageRequirementEvidence["tasks"],
  keywords: string[],
) {
  return tasks.some((task) => {
    if (task.status !== "DONE") return false;
    const taskText = normalizeText(`${task.title} ${task.description ?? ""}`);
    return keywords.some((keyword) => taskText.includes(normalizeText(keyword)));
  });
}

function hasFileEvidence(
  files: StageRequirementEvidence["files"],
  keywords: string[],
  folders: string[],
) {
  return files.some((file) => {
    const folder = normalizeText(file.documentFolder);
    const fileText = normalizeText(
      [
        file.originalName,
        file.notes,
        file.documentFolder,
        ...file.tags,
      ].join(" "),
    );
    const folderMatches = folders.some(
      (candidate) => normalizeText(candidate) === folder,
    );
    const keywordMatches = keywords.some((keyword) =>
      fileText.includes(normalizeText(keyword)),
    );

    return folderMatches || keywordMatches;
  });
}

function hasCommunicationEvidence(
  communications: StageRequirementEvidence["communications"],
  phrases: string[],
) {
  return communications.some((communication) => {
    const text = normalizeText(
      [
        communication.subject,
        communication.summary,
        communication.body,
        communication.direction,
      ].join(" "),
    );

    return phrases.some((phrase) => text.includes(normalizeText(phrase)));
  });
}
