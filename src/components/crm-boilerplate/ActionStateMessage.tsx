"use client";

export default function ActionStateMessage({
  state,
}: {
  state?: { ok: boolean; message: string };
}) {
  if (!state?.message) return null;

  return (
    <div
      className={`rounded-lg border px-4 py-3 text-sm ${
        state.ok
          ? "border-success-200 bg-success-50 text-success-700 dark:border-success-800 dark:bg-success-900/20 dark:text-success-300"
          : "border-error-200 bg-error-50 text-error-700 dark:border-error-800 dark:bg-error-900/20 dark:text-error-300"
      }`}
    >
      {state.message}
    </div>
  );
}
