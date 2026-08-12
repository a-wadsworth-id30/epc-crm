import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Offline | iD30 CRM",
};

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6 py-12 dark:bg-gray-950">
      <section className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-theme-xs dark:border-gray-800 dark:bg-gray-900">
        <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-gray-100 text-lg font-semibold text-gray-700 dark:bg-white/[0.06] dark:text-gray-200">
          iD
        </div>
        <h1 className="mt-5 text-xl font-semibold text-gray-900 dark:text-white">
          You are offline
        </h1>
        <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
          iD30 CRM needs a network connection for live customer data. Reconnect
          and try again.
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white transition hover:bg-brand-600"
        >
          Retry dashboard
        </Link>
      </section>
    </main>
  );
}
