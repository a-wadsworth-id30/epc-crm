import { z } from "zod";

export const taskDefaultAssigneeModeOptions = [
  { value: "current-user", label: "Current signed-in user" },
  { value: "unassigned", label: "Leave unassigned" },
  { value: "specific-user", label: "Specific user" },
] as const;

export type TaskAssigneeMode =
  | "current-user"
  | "unassigned"
  | "specific-user";

const taskAssigneeModes = taskDefaultAssigneeModeOptions.map(
  (option) => option.value,
) as [TaskAssigneeMode, ...TaskAssigneeMode[]];

const nullableIdSchema = z.preprocess(
  (value) => {
    const text = typeof value === "string" ? value.trim() : "";
    return text || null;
  },
  z.string().min(1).nullable(),
);

export type TaskDefaults = {
  defaultAssigneeMode: TaskAssigneeMode;
  defaultAssigneeId: string | null;
  defaultDueDays: number;
};

export const defaultTaskDefaults: TaskDefaults = {
  defaultAssigneeMode: "current-user",
  defaultAssigneeId: null,
  defaultDueDays: 1,
};

const taskDefaultsBaseSchema = z.object({
  defaultAssigneeMode: z.enum(taskAssigneeModes).default(
    defaultTaskDefaults.defaultAssigneeMode,
  ),
  defaultAssigneeId: nullableIdSchema.default(
    defaultTaskDefaults.defaultAssigneeId,
  ),
  defaultDueDays: z.preprocess(
    (value) => {
      const text = String(value ?? "").trim();
      return text ? text : defaultTaskDefaults.defaultDueDays;
    },
    z.coerce
      .number()
      .int("Enter a whole number of days.")
      .min(0, "Default task due date cannot be in the past.")
      .max(30, "Default task due date cannot exceed 30 days."),
  ),
});

function normaliseTaskDefaults(
  value: z.infer<typeof taskDefaultsBaseSchema>,
): TaskDefaults {
  return {
    defaultAssigneeMode: value.defaultAssigneeMode,
    defaultAssigneeId:
      value.defaultAssigneeMode === "specific-user"
        ? value.defaultAssigneeId
        : null,
    defaultDueDays: value.defaultDueDays,
  };
}

export const taskDefaultsSchema = taskDefaultsBaseSchema.transform(
  normaliseTaskDefaults,
);

const partialTaskDefaultsSchema = taskDefaultsBaseSchema.partial();

export function parseTaskDefaults(value: unknown): TaskDefaults {
  const parsed = partialTaskDefaultsSchema.safeParse(value ?? {});

  if (!parsed.success) {
    return defaultTaskDefaults;
  }

  return taskDefaultsSchema.parse({
    ...defaultTaskDefaults,
    ...parsed.data,
  });
}

export function resolveTaskDefaultAssigneeId({
  fallbackUserId,
  taskDefaults,
}: {
  fallbackUserId?: string | null;
  taskDefaults: TaskDefaults;
}) {
  if (taskDefaults.defaultAssigneeMode === "unassigned") {
    return null;
  }

  if (taskDefaults.defaultAssigneeMode === "specific-user") {
    return taskDefaults.defaultAssigneeId ?? fallbackUserId ?? null;
  }

  return fallbackUserId ?? null;
}

export function taskDefaultDueDate(taskDefaults: TaskDefaults, now = new Date()) {
  const dueDate = new Date(now);
  dueDate.setDate(dueDate.getDate() + taskDefaults.defaultDueDays);
  return dueDate;
}
