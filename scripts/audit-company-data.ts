import { ContactCategory, PrismaClient } from "@prisma/client";
import { loadDotEnv } from "./env-utils";

loadDotEnv();

const prisma = new PrismaClient();

type CountRow = { count: bigint };

function countFrom(rows: CountRow[]) {
  return Number(rows[0]?.count ?? BigInt(0));
}

async function main() {
  const companyType = await prisma.contactType.findUnique({
    where: { systemKey: ContactCategory.COMPANY },
    select: { id: true, isActive: true, name: true, slug: true },
  });

  const [
    totalPeople,
    linkedPeople,
    cachedNameOnlyPeople,
    linkedWithCachedName,
    companyTypePeople,
    totalCompanies,
    companiesWithoutPeople,
    companiesMissingDomain,
    companiesMissingOwner,
    companiesMissingAddress,
    companyStatuses,
    companyDocuments,
    pipedriveCompanyLinks,
    duplicateNameGroups,
    duplicateDomainGroups,
    mismatchedCachedNames,
  ] = await Promise.all([
    prisma.contact.count(),
    prisma.contact.count({ where: { companyId: { not: null } } }),
    prisma.contact.count({
      where: { companyId: null, companyName: { not: null } },
    }),
    prisma.contact.count({
      where: { companyId: { not: null }, companyName: { not: null } },
    }),
    companyType
      ? prisma.contact.count({ where: { contactTypeId: companyType.id } })
      : Promise.resolve(0),
    prisma.company.count(),
    prisma.company.count({ where: { contacts: { none: {} } } }),
    prisma.company.count({ where: { domain: null } }),
    prisma.company.count({ where: { owner: null } }),
    prisma.company.count({
      where: {
        addressLine1: null,
        city: null,
        postcode: null,
      },
    }),
    prisma.company.groupBy({
      by: ["status"],
      _count: { _all: true },
      orderBy: { status: "asc" },
    }),
    prisma.fileAsset.count({ where: { entityType: "Company" } }),
    prisma.externalRecordLink.count({
      where: { provider: "pipedrive", internalType: "company" },
    }),
    prisma.$queryRaw<CountRow[]>`
      SELECT COUNT(*)::bigint AS count
      FROM (
        SELECT LOWER(BTRIM(name))
        FROM "Company"
        GROUP BY LOWER(BTRIM(name))
        HAVING COUNT(*) > 1
      ) duplicate_names
    `,
    prisma.$queryRaw<CountRow[]>`
      SELECT COUNT(*)::bigint AS count
      FROM (
        SELECT LOWER(BTRIM(domain))
        FROM "Company"
        WHERE domain IS NOT NULL AND BTRIM(domain) <> ''
        GROUP BY LOWER(BTRIM(domain))
        HAVING COUNT(*) > 1
      ) duplicate_domains
    `,
    prisma.$queryRaw<CountRow[]>`
      SELECT COUNT(*)::bigint AS count
      FROM "Contact" contact
      JOIN "Company" company ON company.id = contact."companyId"
      WHERE contact."companyName" IS NOT NULL
        AND LOWER(BTRIM(contact."companyName")) <> LOWER(BTRIM(company.name))
    `,
  ]);

  const report = {
    generatedAt: new Date().toISOString(),
    scope:
      "Aggregate-only, read-only audit. No person names, company names, contact details or document metadata are emitted.",
    people: {
      total: totalPeople,
      linkedToCompany: linkedPeople,
      unlinked: totalPeople - linkedPeople,
      cachedCompanyNameWithoutLink: cachedNameOnlyPeople,
      linkedWithCachedCompanyName: linkedWithCachedName,
      linkedCachedNameMismatches: countFrom(mismatchedCachedNames),
      companyPersonType: companyType
        ? {
            active: companyType.isActive,
            assignedPeople: companyTypePeople,
            name: companyType.name,
            slug: companyType.slug,
          }
        : null,
    },
    companies: {
      total: totalCompanies,
      withPeople: totalCompanies - companiesWithoutPeople,
      withoutPeople: companiesWithoutPeople,
      missingDomain: companiesMissingDomain,
      missingOwner: companiesMissingOwner,
      missingAddress: companiesMissingAddress,
      duplicateNormalisedNameGroups: countFrom(duplicateNameGroups),
      duplicateNormalisedDomainGroups: countFrom(duplicateDomainGroups),
      statuses: companyStatuses.map((status) => ({
        count: status._count._all,
        status: status.status,
      })),
    },
    dependencies: {
      companyDocuments,
      pipedriveCompanyLinks,
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error(
      "Company data audit failed:",
      error instanceof Error ? error.message : error,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
