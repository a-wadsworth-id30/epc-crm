"use client";

import dynamic from "next/dynamic";
import type { CompanyProfileFormProps } from "@/components/crm-boilerplate/CompanyProfileForm";

function CompanyProfileFormLoading() {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-800">
        <div className="h-5 w-40 rounded bg-gray-100 dark:bg-white/[0.08]">
          <span className="sr-only">Company profile</span>
        </div>
        <div className="mt-3 h-4 w-full max-w-2xl rounded bg-gray-50 dark:bg-white/[0.05]" />
      </div>
      <div className="space-y-5 p-5">
        <div>
          <div className="h-4 w-36 rounded bg-gray-100 dark:bg-white/[0.08]" />
          <div className="mt-2 h-11 rounded-lg bg-gray-50 dark:bg-white/[0.05]" />
        </div>
        {[
          "Identity details",
          "Registered address",
          "Brand styling",
          "Company logos",
          "Document defaults",
        ].map((section, index) => (
          <section
            key={section}
            className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"
          >
            <div className="h-4 w-40 rounded bg-gray-100 dark:bg-white/[0.08]">
              <span className="sr-only">{section}</span>
            </div>
            <div className="mt-4 grid gap-5 xl:grid-cols-2">
              {["one", "two", "three", "four"].map((item) => (
                <div key={item}>
                  <div className="h-4 w-32 rounded bg-gray-100 dark:bg-white/[0.08]" />
                  <div
                    className={
                      index === 3
                        ? "mt-2 h-14 rounded-lg bg-gray-50 dark:bg-white/[0.05]"
                        : "mt-2 h-11 rounded-lg bg-gray-50 dark:bg-white/[0.05]"
                    }
                  />
                </div>
              ))}
            </div>
          </section>
        ))}
        <div className="flex justify-end border-t border-gray-100 pt-5 dark:border-gray-800">
          <div className="h-11 w-40 rounded-lg bg-gray-100 dark:bg-white/[0.08]" />
        </div>
      </div>
    </section>
  );
}

const CompanyProfileForm = dynamic<CompanyProfileFormProps>(
  () => import("@/components/crm-boilerplate/CompanyProfileForm"),
  {
    loading: CompanyProfileFormLoading,
    ssr: false,
  },
);

export default function LazyCompanyProfileForm(
  props: CompanyProfileFormProps,
) {
  return <CompanyProfileForm {...props} />;
}
