import SanitizedEmailBody from "@/components/crm-boilerplate/SanitizedEmailBody";

export type EmailContentProps = {
  emptyMessage?: string;
  historyHtml?: string | null;
  historyId?: string;
  historyText?: string | null;
  latestHtml?: string | null;
  latestText?: string | null;
  showHistory?: boolean;
};

export default function EmailContent({
  emptyMessage = "This email does not contain a readable message body.",
  historyHtml,
  historyId,
  historyText,
  latestHtml,
  latestText,
  showHistory = false,
}: EmailContentProps) {
  const hasLatestContent = Boolean(latestHtml || latestText?.trim());
  const hasHistory = Boolean(historyHtml || historyText?.trim());

  return (
    <div className="w-full max-w-[860px] min-w-0">
      {hasLatestContent ? (
        <SanitizedEmailBody html={latestHtml} text={latestText ?? ""} />
      ) : (
        <p className="text-sm text-gray-500 italic dark:text-gray-400">
          {emptyMessage}
        </p>
      )}

      {showHistory && hasHistory ? (
        <section
          aria-label="Previous conversation"
          className="mt-6 border-l-2 border-gray-200 pl-4 text-gray-600 dark:border-gray-700 dark:text-gray-400"
          id={historyId}
        >
          <p className="mb-3 text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
            Previous conversation
          </p>
          <SanitizedEmailBody
            html={historyHtml}
            text={historyText ?? ""}
          />
        </section>
      ) : null}
    </div>
  );
}
