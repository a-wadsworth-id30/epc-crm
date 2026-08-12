"use client";

import { useMemo, useRef, useState } from "react";
import { useClickOutside } from "@/hooks/useClickOutside";

type CompanyOption = {
  id: string;
  name: string;
};

export default function SearchableCompanySelect({
  allowCreate = false,
  companyIdName = "companyId",
  companyNameName = "companyName",
  id,
  companies,
  defaultCompanyId,
  defaultCompanyName,
  onDirty,
}: {
  allowCreate?: boolean;
  companyIdName?: string;
  companyNameName?: string;
  id: string;
  companies: CompanyOption[];
  defaultCompanyId?: string | null;
  defaultCompanyName?: string | null;
  onDirty?: () => void;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const defaultCompany = companies.find((company) => company.id === defaultCompanyId);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<CompanyOption | null>(defaultCompany ?? null);
  const [query, setQuery] = useState(defaultCompany?.name ?? defaultCompanyName ?? "");

  useClickOutside(wrapperRef, () => setIsOpen(false));

  const newCompanyName = selectedCompany ? "" : query.replace(/\s+/g, " ").trim();
  const hasExactCompanyMatch = companies.some(
    (company) => company.name.toLowerCase() === newCompanyName.toLowerCase(),
  );
  const filteredCompanies = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) return companies.slice(0, 25);

    return companies
      .filter((company) => company.name.toLowerCase().includes(normalizedQuery))
      .slice(0, 25);
  }, [companies, query]);

  return (
    <div ref={wrapperRef} className="relative">
      <input type="hidden" name={companyIdName} value={selectedCompany?.id ?? ""} />
      {allowCreate ? (
        <input type="hidden" name={companyNameName} value={newCompanyName} />
      ) : null}
      <input
        id={id}
        type="text"
        value={query}
        onFocus={() => setIsOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setSelectedCompany(null);
          setIsOpen(true);
          onDirty?.();
        }}
        placeholder="Search companies..."
        autoComplete="off"
        className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
      />
      {isOpen && (
        <div className="absolute z-50 mt-2 max-h-64 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 shadow-theme-lg dark:border-gray-800 dark:bg-gray-900">
          <button
            type="button"
            onClick={() => {
              setSelectedCompany(null);
              setQuery("");
              setIsOpen(false);
              onDirty?.();
            }}
            className="w-full rounded-md px-3 py-2 text-left text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5"
          >
            Unassigned
          </button>
          {filteredCompanies.map((company) => (
            <button
              key={company.id}
              type="button"
              onClick={() => {
                setSelectedCompany(company);
                setQuery(company.name);
                setIsOpen(false);
                onDirty?.();
              }}
              className="w-full rounded-md px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
            >
              {company.name}
            </button>
          ))}
          {allowCreate && newCompanyName && !hasExactCompanyMatch ? (
            <button
              type="button"
              onClick={() => {
                setSelectedCompany(null);
                setQuery(newCompanyName);
                setIsOpen(false);
                onDirty?.();
              }}
              className="w-full rounded-md px-3 py-2 text-left text-sm font-medium text-brand-600 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-900/20"
            >
              Create <span className="font-semibold">{newCompanyName}</span>
            </button>
          ) : null}
          {!filteredCompanies.length && (
            <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
              {allowCreate && newCompanyName
                ? "No matching companies"
                : "No companies found"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
