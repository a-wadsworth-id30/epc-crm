import Link from "next/link";

export const metadata = {
  title: "CRM Softphone Extension Privacy Policy",
  description:
    "Privacy policy for the CRM Softphone Chrome extension.",
};

const updatedAt = "23 June 2026";

export default function ChromeSoftphonePrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-gray-50 px-5 py-10 text-gray-800 dark:bg-gray-950 dark:text-gray-100">
      <article className="mx-auto max-w-4xl rounded-2xl border border-gray-200 bg-white p-6 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 sm:p-10">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-500">
          Privacy policy
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-gray-900 dark:text-white">
          CRM Softphone Chrome Extension
        </h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Last updated: {updatedAt}
        </p>

        <div className="mt-8 space-y-7 text-sm leading-7 text-gray-600 dark:text-gray-300">
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Purpose
            </h2>
            <p className="mt-2">
              The CRM Softphone Chrome extension provides inbound call
              notifications and toolbar access for signed-in iD30 CRM users.
              It lets authorised users open a dedicated CRM softphone window,
              view softphone status and send call controls such as answer,
              hangup, mute and hold back to the CRM.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Data handled by the extension
            </h2>
            <p className="mt-2">
              The extension may display limited CRM softphone state from the
              signed-in softphone window, including caller names, contact names,
              phone numbers, call direction, call status and call duration.
              This is used only to operate the softphone interface.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Data not collected
            </h2>
            <p className="mt-2">
              The extension does not collect passwords, Twilio credentials,
              payment details, health information, browser history, website
              content, call recordings, call transcripts, SMS content, email
              content or chat message content.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Storage
            </h2>
            <p className="mt-2">
              The extension stores only temporary softphone state in Chrome
              session storage so the extension can show the current call
              status. It does not store CRM passwords, Twilio credentials, call
              recordings or permanent customer records.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Sharing
            </h2>
            <p className="mt-2">
              The extension sends user softphone commands and call state
              messages between the extension and the signed-in CRM softphone
              window. It does not sell user data and does not transfer user data
              to third parties for advertising, creditworthiness or unrelated
              purposes.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Permissions
            </h2>
            <p className="mt-2">
              Notifications are used for inbound call alerts. Storage is used
              for temporary extension state. Tabs permission is used to find or
              focus the CRM softphone window. Host access is limited to the
              iD30 CRM domain.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Contact
            </h2>
            <p className="mt-2">
              Privacy questions about this extension can be raised with the
              CRM administrator responsible for the deployment.
            </p>
          </section>
        </div>

        <div className="mt-10 border-t border-gray-200 pt-6 dark:border-gray-800">
          <Link
            href="/signin"
            className="text-sm font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400"
          >
            Return to iD30 CRM
          </Link>
        </div>
      </article>
    </main>
  );
}
