import "server-only";

import type { Prisma } from "@prisma/client";
import {
  contactEmailValues,
  contactPhoneValues,
} from "@/lib/contact-methods";
import { normalizedContactPhone } from "@/lib/phone-normalization";
import { prisma } from "@/lib/prisma";
import {
  normalizeSearchDigits,
  searchMatch,
  searchTokens,
  type SearchField,
} from "@/lib/search/match";
import { getCrmSettings } from "@/lib/settings";

const defaultLimit = 10;
const maxLimit = 25;
const minCandidateTake = 24;
const maxCandidateTake = 80;
const queryMode = "insensitive" as const;
const allowedAreas = ["contacts", "companies", "sales", "products", "reports"] as const;
const defaultAreas = ["contacts", "sales", "companies"] as const;

type McpSearchArea = (typeof allowedAreas)[number];
type McpSearchRecordType = "company" | "contact" | "product" | "report" | "sale";

type SearchCandidateTerms = {
  digitTerms: string[];
  normalizedPhone: string | null;
  textTerms: string[];
};

type McpSearchRecord = {
  id: string;
  type: McpSearchRecordType;
  title: string;
  subtitle: string | null;
  description: string | null;
  href: string;
  score: number;
};

const typePriority: Record<McpSearchRecordType, number> = {
  contact: 50,
  sale: 40,
  company: 30,
  product: 20,
  report: 10,
};

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function contains(value: string) {
  return { contains: value, mode: queryMode };
}

function parseLimit(value: unknown) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) return defaultLimit;

  return Math.min(maxLimit, Math.max(1, Math.floor(parsed)));
}

function candidateLimit(limit: number, multiplier = 8, max = maxCandidateTake) {
  return Math.min(max, Math.max(minCandidateTake, limit * multiplier));
}

function parseAreas(value: unknown): McpSearchArea[] {
  if (!Array.isArray(value)) return [...defaultAreas];

  const allowed = new Set<string>(allowedAreas);
  const areas = value.filter(
    (area): area is McpSearchArea =>
      typeof area === "string" && allowed.has(area),
  );

  return areas.length ? Array.from(new Set(areas)) : [...defaultAreas];
}

function searchCandidateTerms(query: string): SearchCandidateTerms {
  const textTerms = new Set<string>();

  for (const token of searchTokens(query)) {
    if (/^\d+$/.test(token)) continue;
    if (token.length >= 2) textTerms.add(token);
    if (token.length >= 4) textTerms.add(token.slice(0, 3));
  }

  const digits = normalizeSearchDigits(query);
  const digitTerms = new Set<string>();

  if (digits.length >= 3) {
    digitTerms.add(digits);

    if (digits.length >= 7) {
      digitTerms.add(digits.slice(-7));
    }

    digitTerms.add(digits.slice(-4));
  }

  return {
    digitTerms: Array.from(digitTerms)
      .filter((term) => term.length >= 3)
      .slice(0, 4),
    normalizedPhone: digits.length >= 7 ? normalizedContactPhone(query) : null,
    textTerms: Array.from(textTerms).slice(0, 6),
  };
}

function contactTextClauses(term: string): Prisma.ContactWhereInput[] {
  const clauses: Prisma.ContactWhereInput[] = [
    { firstName: contains(term) },
    { lastName: contains(term) },
    { email: contains(term) },
    { additionalEmails: { some: { email: contains(term) } } },
    { companyName: contains(term) },
    { company: { name: contains(term) } },
  ];

  if (term.length >= 3) {
    clauses.push(
      { role: contains(term) },
      { city: contains(term) },
      { postcode: contains(term) },
      { tagAssignments: { some: { tag: { name: contains(term) } } } },
    );
  }

  return clauses;
}

function opportunityTextClauses(term: string): Prisma.SalesOpportunityWhereInput[] {
  const clauses: Prisma.SalesOpportunityWhereInput[] = [
    { title: contains(term) },
    { company: { name: contains(term) } },
    { contact: { firstName: contains(term) } },
    { contact: { lastName: contains(term) } },
    { contact: { email: contains(term) } },
    { contact: { additionalEmails: { some: { email: contains(term) } } } },
  ];

  if (term.length >= 3) {
    clauses.push(
      { source: contains(term) },
      { nextStep: contains(term) },
      { owner: { name: contains(term) } },
      { salesPipelineStage: { name: contains(term) } },
    );
  }

  return clauses;
}

function contactSearchWhere({
  digitTerms,
  normalizedPhone,
  textTerms,
}: SearchCandidateTerms): Prisma.ContactWhereInput {
  const OR: Prisma.ContactWhereInput[] = [];

  for (const term of textTerms) {
    OR.push(...contactTextClauses(term));
  }

  if (normalizedPhone) {
    OR.push(
      { phoneNormalized: normalizedPhone },
      { additionalPhones: { some: { phoneNormalized: normalizedPhone } } },
    );
  } else {
    for (const term of digitTerms) {
      OR.push(
        { phone: contains(term) },
        { phoneNormalized: contains(term) },
        { additionalPhones: { some: { phone: contains(term) } } },
        { additionalPhones: { some: { phoneNormalized: contains(term) } } },
      );
    }
  }

  return { OR };
}

function opportunitySearchWhere({
  digitTerms,
  normalizedPhone,
  textTerms,
}: SearchCandidateTerms): Prisma.SalesOpportunityWhereInput {
  const OR: Prisma.SalesOpportunityWhereInput[] = [];

  for (const term of textTerms) {
    OR.push(...opportunityTextClauses(term));
  }

  if (normalizedPhone) {
    OR.push(
      { contact: { phoneNormalized: normalizedPhone } },
      {
        contact: {
          additionalPhones: { some: { phoneNormalized: normalizedPhone } },
        },
      },
    );
  } else {
    for (const term of digitTerms) {
      OR.push(
        { contact: { phone: contains(term) } },
        { contact: { phoneNormalized: contains(term) } },
        { contact: { additionalPhones: { some: { phone: contains(term) } } } },
        {
          contact: {
            additionalPhones: { some: { phoneNormalized: contains(term) } },
          },
        },
      );
    }
  }

  return { OR };
}

function companySearchWhere(textTerms: string[]): Prisma.CompanyWhereInput {
  return {
    OR: textTerms.flatMap((term) => [
      { name: contains(term) },
      { domain: contains(term) },
      ...(term.length >= 3
        ? [{ status: contains(term) }, { owner: contains(term) }]
        : []),
    ]),
  };
}

function productSearchWhere(textTerms: string[]): Prisma.ProductWhereInput {
  return {
    OR: textTerms.flatMap((term) => [
      { name: contains(term) },
      { sku: contains(term) },
      { description: contains(term) },
      { category: { name: contains(term) } },
      { tags: { has: term } },
    ]),
  };
}

function reportSearchWhere(textTerms: string[]): Prisma.ReportDefinitionWhereInput {
  return {
    OR: textTerms.flatMap((term) => [
      { title: contains(term) },
      { description: contains(term) },
      { source: contains(term) },
    ]),
  };
}

function createRecord(
  query: string,
  input: {
    description: string | null;
    fields: SearchField[];
    href: string;
    id: string;
    subtitle: string | null;
    title: string;
    type: McpSearchRecordType;
  },
): McpSearchRecord | null {
  const match = searchMatch(query, input.fields);

  if (!match.matched) return null;

  return {
    description: input.description || null,
    href: input.href,
    id: input.id,
    score: match.score,
    subtitle: input.subtitle || null,
    title: input.title,
    type: input.type,
  };
}

export async function searchMcpCrm(args: unknown) {
  const input = objectValue(args);
  const query = stringValue(input.query) ?? "";
  const limit = parseLimit(input.limit);
  const areas = parseAreas(input.areas);

  if (query.length < 2 && normalizeSearchDigits(query).length < 3) {
    return {
      ok: true,
      source: "crm-mcp-search",
      query,
      areas,
      limit,
      count: 0,
      results: [],
    };
  }

  const terms = searchCandidateTerms(query);

  if (!terms.textTerms.length && !terms.digitTerms.length) {
    return {
      ok: true,
      source: "crm-mcp-search",
      query,
      areas,
      limit,
      count: 0,
      results: [],
    };
  }

  const settings = await getCrmSettings();
  const candidateTake = candidateLimit(limit);
  const secondaryCandidateTake = candidateLimit(limit, 5, 48);
  const includeContacts = areas.includes("contacts");
  const includeSales = areas.includes("sales");
  const includeCompanies =
    settings.companiesEnabled && areas.includes("companies") && terms.textTerms.length > 0;
  const includeProducts = areas.includes("products") && terms.textTerms.length > 0;
  const includeReports = areas.includes("reports") && terms.textTerms.length > 0;

  const [contacts, opportunities, companies, products, reports] = await Promise.all([
    includeContacts
      ? prisma.contact.findMany({
          where: contactSearchWhere(terms),
          orderBy: [
            { updatedAt: "desc" },
            { lastName: "asc" },
            { firstName: "asc" },
          ],
          take: candidateTake,
          select: {
            additionalEmails: {
              orderBy: { createdAt: "asc" },
              select: { email: true, id: true, label: true },
            },
            additionalPhones: {
              orderBy: { createdAt: "asc" },
              select: { id: true, label: true, phone: true, phoneNormalized: true },
            },
            company: { select: { name: true } },
            companyName: true,
            email: true,
            firstName: true,
            id: true,
            lastName: true,
            phone: true,
            phoneNormalized: true,
            role: true,
            tagAssignments: {
              orderBy: { tag: { name: "asc" } },
              select: { tag: { select: { name: true } } },
            },
          },
        })
      : Promise.resolve([]),
    includeSales
      ? prisma.salesOpportunity.findMany({
          where: opportunitySearchWhere(terms),
          orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
          take: candidateTake,
          select: {
            company: { select: { name: true } },
            contact: {
              select: {
                additionalEmails: {
                  orderBy: { createdAt: "asc" },
                  select: { email: true, id: true, label: true },
                },
                additionalPhones: {
                  orderBy: { createdAt: "asc" },
                  select: {
                    id: true,
                    label: true,
                    phone: true,
                    phoneNormalized: true,
                  },
                },
                email: true,
                firstName: true,
                lastName: true,
                phone: true,
                phoneNormalized: true,
              },
            },
            id: true,
            nextStep: true,
            owner: { select: { name: true } },
            salesPipelineStage: { select: { name: true } },
            source: true,
            title: true,
          },
        })
      : Promise.resolve([]),
    includeCompanies
      ? prisma.company.findMany({
          where: companySearchWhere(terms.textTerms),
          orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
          take: secondaryCandidateTake,
          select: {
            domain: true,
            id: true,
            name: true,
            owner: true,
            status: true,
          },
        })
      : Promise.resolve([]),
    includeProducts
      ? prisma.product.findMany({
          where: productSearchWhere(terms.textTerms),
          orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
          take: secondaryCandidateTake,
          select: {
            category: { select: { name: true } },
            description: true,
            id: true,
            isActive: true,
            name: true,
            sku: true,
            tags: true,
            type: true,
          },
        })
      : Promise.resolve([]),
    includeReports
      ? prisma.reportDefinition.findMany({
          where: reportSearchWhere(terms.textTerms),
          orderBy: [{ updatedAt: "desc" }, { title: "asc" }],
          take: secondaryCandidateTake,
          select: {
            description: true,
            id: true,
            source: true,
            title: true,
            visibility: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const results = [
    ...contacts.map((contact) => {
      const companyName = contact.company?.name ?? contact.companyName;
      const fullName = `${contact.firstName} ${contact.lastName}`.trim();
      const tagNames = contact.tagAssignments.map((assignment) => assignment.tag.name);
      const emailValues = contactEmailValues(contact.email, contact.additionalEmails);
      const phoneValues = contactPhoneValues(
        contact.phone,
        contact.phoneNormalized,
        contact.additionalPhones,
      );

      return createRecord(query, {
        description: [companyName, contact.role, ...tagNames].filter(Boolean).join(" / "),
        fields: [
          contact.firstName,
          contact.lastName,
          fullName,
          `${contact.lastName} ${contact.firstName}`,
          ...emailValues,
          ...phoneValues,
          companyName,
          contact.role,
          ...tagNames,
        ],
        href: `/contacts/${contact.id}`,
        id: contact.id,
        subtitle: [emailValues[0], phoneValues[0]].filter(Boolean).join(" / "),
        title: fullName,
        type: "contact",
      });
    }),
    ...opportunities.map((opportunity) => {
      const contactName = opportunity.contact
        ? `${opportunity.contact.firstName} ${opportunity.contact.lastName}`.trim()
        : null;
      const reversedContactName = opportunity.contact
        ? `${opportunity.contact.lastName} ${opportunity.contact.firstName}`.trim()
        : null;
      const linkedName = [contactName, opportunity.company?.name]
        .filter(Boolean)
        .join(" / ");
      const emailValues = opportunity.contact
        ? contactEmailValues(
            opportunity.contact.email,
            opportunity.contact.additionalEmails,
          )
        : [];
      const phoneValues = opportunity.contact
        ? contactPhoneValues(
            opportunity.contact.phone,
            opportunity.contact.phoneNormalized,
            opportunity.contact.additionalPhones,
          )
        : [];

      return createRecord(query, {
        description: [
          opportunity.salesPipelineStage?.name,
          opportunity.source,
          opportunity.owner?.name,
          opportunity.nextStep,
        ]
          .filter(Boolean)
          .join(" / "),
        fields: [
          opportunity.title,
          opportunity.source,
          opportunity.nextStep,
          opportunity.company?.name,
          opportunity.contact?.firstName,
          opportunity.contact?.lastName,
          contactName,
          reversedContactName,
          ...emailValues,
          ...phoneValues,
          opportunity.owner?.name,
          opportunity.salesPipelineStage?.name,
        ],
        href: `/sales/${opportunity.id}`,
        id: opportunity.id,
        subtitle: linkedName || null,
        title: opportunity.title,
        type: "sale",
      });
    }),
    ...companies.map((company) =>
      createRecord(query, {
        description: [company.status, company.owner].filter(Boolean).join(" / "),
        fields: [company.name, company.domain, company.status, company.owner],
        href: "/clients",
        id: company.id,
        subtitle: company.domain,
        title: company.name,
        type: "company",
      }),
    ),
    ...products.map((product) =>
      createRecord(query, {
        description: [
          product.category?.name,
          product.type,
          product.isActive ? "Active" : "Inactive",
          product.description,
        ]
          .filter(Boolean)
          .join(" / "),
        fields: [
          product.name,
          product.sku,
          product.description,
          product.category?.name,
          product.type,
          ...product.tags,
        ],
        href: "/products",
        id: product.id,
        subtitle: [product.sku, product.category?.name].filter(Boolean).join(" / "),
        title: product.name,
        type: "product",
      }),
    ),
    ...reports.map((report) =>
      createRecord(query, {
        description: [report.description, report.source, report.visibility]
          .filter(Boolean)
          .join(" / "),
        fields: [report.title, report.description, report.source, report.visibility],
        href: "/reports",
        id: report.id,
        subtitle: report.visibility,
        title: report.title,
        type: "report",
      }),
    ),
  ].filter((record): record is McpSearchRecord => Boolean(record));

  results.sort(
    (a, b) =>
      b.score - a.score ||
      typePriority[b.type] - typePriority[a.type] ||
      a.title.localeCompare(b.title),
  );

  const limited = results.slice(0, limit);

  return {
    ok: true,
    source: "crm-mcp-search",
    query,
    areas,
    limit,
    count: limited.length,
    results: limited,
  };
}
