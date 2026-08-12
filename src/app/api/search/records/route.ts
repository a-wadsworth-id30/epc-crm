import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { requireApiUser } from "@/lib/api-auth";
import {
  contactEmailValues,
  contactPhoneValues,
} from "@/lib/contact-methods";
import {
  companyWhereWithAccess,
  contactWhereWithAccess,
  salesOpportunityWhereWithAccess,
} from "@/lib/crm-resource-access";
import { normalizedContactPhone } from "@/lib/phone-normalization";
import { prisma } from "@/lib/prisma";
import {
  normalizeSearchDigits,
  searchMatch,
  searchTokens,
  type SearchField,
} from "@/lib/search/match";
import type {
  CrmSearchRecord,
  CrmSearchRecordType,
  CrmSearchResponse,
} from "@/lib/search/records";
import { getCrmSettings } from "@/lib/settings";

const defaultLimit = 8;
const maxLimit = 20;
const minCandidateTake = 24;
const maxCandidateTake = 80;
const queryMode = "insensitive" as const;
const typePriority: Record<CrmSearchRecordType, number> = {
  contact: 40,
  sale: 30,
  company: 20,
  user: 10,
};

export async function GET(request: NextRequest) {
  const auth = await requireApiUser();

  if (!auth.ok) {
    return auth.response;
  }

  const user = auth.user;
  const query = (request.nextUrl.searchParams.get("q") ?? "").trim();
  const limit = parseLimit(request.nextUrl.searchParams.get("limit"));

  if (query.length < 2 && normalizeSearchDigits(query).length < 3) {
    return NextResponse.json<CrmSearchResponse>({ query, records: [] });
  }

  const terms = searchCandidateTerms(query);

  if (!terms.textTerms.length && !terms.digitTerms.length) {
    return NextResponse.json<CrmSearchResponse>({ query, records: [] });
  }

  const settings = await getCrmSettings();
  const candidateTake = candidateLimit(limit);
  const secondaryCandidateTake = candidateLimit(limit, 5, 48);
  const contactWhere = contactWhereWithAccess(user, contactSearchWhere(terms));
  const opportunityWhere = salesOpportunityWhereWithAccess(
    user,
    opportunitySearchWhere(terms),
  );
  const companyWhere = terms.textTerms.length
    ? companyWhereWithAccess(user, companySearchWhere(terms.textTerms))
    : null;
  const userWhere =
    terms.textTerms.length || terms.digitTerms.length
      ? userSearchWhere(terms)
      : null;
  const [contacts, opportunities, companies, users] = await Promise.all([
    prisma.contact.findMany({
      where: contactWhere,
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
        addressLine1: true,
        addressLine2: true,
        city: true,
        company: { select: { name: true } },
        companyName: true,
        country: true,
        county: true,
        email: true,
        firstName: true,
        id: true,
        lastName: true,
        phone: true,
        phoneNormalized: true,
        postcode: true,
        role: true,
        tagAssignments: {
          orderBy: { tag: { name: "asc" } },
          select: { tag: { select: { name: true } } },
        },
      },
    }),
    prisma.salesOpportunity.findMany({
      where: opportunityWhere,
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
              select: { id: true, label: true, phone: true, phoneNormalized: true },
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
    }),
    settings.companiesEnabled && companyWhere
      ? prisma.company.findMany({
          where: companyWhere,
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
    user.role === "ADMIN" && userWhere
      ? prisma.user.findMany({
          where: userWhere,
          orderBy: [{ status: "asc" }, { name: "asc" }],
          take: secondaryCandidateTake,
          select: {
            email: true,
            firstName: true,
            id: true,
            landline: true,
            lastName: true,
            mobile: true,
            name: true,
            role: true,
            roleTemplate: true,
            sipAddress: true,
            status: true,
            voiceExtension: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const records: CrmSearchRecord[] = [
    ...contacts.map((contact) => {
      const companyName = contact.company?.name ?? contact.companyName;
      const tagNames = contact.tagAssignments.map(
        (assignment) => assignment.tag.name,
      );
      const fullName = `${contact.firstName} ${contact.lastName}`.trim();
      const addressLines = [
        contact.addressLine1,
        contact.addressLine2,
        contact.city,
        contact.county,
        contact.postcode,
        contact.country,
      ];
      const emailValues = contactEmailValues(contact.email, contact.additionalEmails);
      const phoneValues = contactPhoneValues(
        contact.phone,
        contact.phoneNormalized,
        contact.additionalPhones,
      );

      return createRecord(query, {
        description: [companyName, contact.role, ...tagNames]
          .filter(Boolean)
          .join(" / "),
        fields: [
          contact.firstName,
          contact.lastName,
          fullName,
          `${contact.lastName} ${contact.firstName}`,
          ...emailValues,
          ...phoneValues,
          companyName,
          contact.role,
          ...addressLines,
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
        description: [company.status, company.owner]
          .filter(Boolean)
          .join(" / "),
        fields: [company.name, company.domain, company.status, company.owner],
        href: "/clients",
        id: company.id,
        subtitle: company.domain,
        title: company.name,
        type: "company",
      }),
    ),
    ...users.map((recordUser) => {
      const fullName =
        [recordUser.firstName, recordUser.lastName].filter(Boolean).join(" ") ||
        recordUser.name;

      return createRecord(query, {
        description: [
          recordUser.role,
          recordUser.status,
          recordUser.voiceExtension
            ? `Extension ${recordUser.voiceExtension}`
            : null,
        ]
          .filter(Boolean)
          .join(" / "),
        fields: [
          recordUser.name,
          recordUser.firstName,
          recordUser.lastName,
          fullName,
          recordUser.lastName && recordUser.firstName
            ? `${recordUser.lastName} ${recordUser.firstName}`
            : null,
          recordUser.email,
          recordUser.mobile,
          recordUser.landline,
          recordUser.sipAddress,
          recordUser.voiceExtension,
          recordUser.role,
          recordUser.roleTemplate,
          recordUser.status,
        ],
        href: "/settings/users",
        id: recordUser.id,
        subtitle: recordUser.email,
        title: recordUser.name,
        type: "user",
      });
    }),
  ].filter((record): record is CrmSearchRecord => Boolean(record));

  records.sort(
    (a, b) =>
      b.score - a.score ||
      typePriority[b.type] - typePriority[a.type] ||
      a.title.localeCompare(b.title),
  );

  return NextResponse.json<CrmSearchResponse>({
    query,
    records: records.slice(0, limit),
  });
}

function contains(value: string) {
  return { contains: value, mode: queryMode };
}

function candidateLimit(
  limit: number,
  multiplier = 8,
  max = maxCandidateTake,
) {
  return Math.min(max, Math.max(minCandidateTake, limit * multiplier));
}

function parseLimit(value: string | null) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) return defaultLimit;

  return Math.min(maxLimit, Math.max(1, Math.floor(parsed)));
}

type SearchCandidateTerms = {
  digitTerms: string[];
  normalizedPhone: string | null;
  textTerms: string[];
};

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

function companySearchWhere(
  textTerms: string[],
): Prisma.CompanyWhereInput {
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

function userSearchWhere({
  digitTerms,
  textTerms,
}: SearchCandidateTerms): Prisma.UserWhereInput {
  const OR: Prisma.UserWhereInput[] = [];

  for (const term of textTerms) {
    OR.push(
      { name: contains(term) },
      { firstName: contains(term) },
      { lastName: contains(term) },
      { email: contains(term) },
    );

    if (term.length >= 3) {
      OR.push(
        { roleTemplate: contains(term) },
        { sipAddress: contains(term) },
        { voiceExtension: contains(term) },
      );
    }
  }

  for (const term of digitTerms) {
    OR.push(
      { landline: contains(term) },
      { mobile: contains(term) },
      { voiceExtension: contains(term) },
    );
  }

  return { OR };
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
      { addressLine1: contains(term) },
      { addressLine2: contains(term) },
      { city: contains(term) },
      { county: contains(term) },
      { postcode: contains(term) },
      { country: contains(term) },
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

function searchCandidateTerms(query: string): SearchCandidateTerms {
  const textTerms = new Set<string>();

  for (const token of searchTokens(query)) {
    if (/^\d+$/.test(token)) {
      continue;
    }

    if (token.length >= 2) textTerms.add(token);

    if (token.length >= 4) {
      textTerms.add(token.slice(0, 3));
    }
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

  const normalizedPhone =
    digits.length >= 7 ? normalizedContactPhone(query) : null;

  return {
    digitTerms: Array.from(digitTerms)
      .filter((term) => term.length >= 3)
      .slice(0, 4),
    normalizedPhone,
    textTerms: Array.from(textTerms).slice(0, 6),
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
    type: CrmSearchRecordType;
  },
): CrmSearchRecord | null {
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
