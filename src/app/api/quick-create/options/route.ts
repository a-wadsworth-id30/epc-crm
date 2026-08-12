import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import {
  companyWhereWithAccess,
  contactWhereWithAccess,
} from "@/lib/crm-resource-access";
import { isGeoapifyAddressLookupEnabled } from "@/lib/integrations/geoapify";
import { prisma } from "@/lib/prisma";
import {
  parseSalesDefaults,
  resolveSalesDefaultOwnerId,
} from "@/lib/sales/defaults";
import { getCrmSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

const quickCreateCompanyOptionLimit = 250;
const quickCreateContactOptionLimit = 500;

export async function GET() {
  const auth = await requireApiUser();

  if (!auth.ok) {
    return auth.response;
  }

  const [settings, addressLookupEnabled] = await Promise.all([
    getCrmSettings(),
    isGeoapifyAddressLookupEnabled(),
  ]);
  const currentUser = auth.user;
  const salesDefaults = parseSalesDefaults(settings.salesDefaults);
  const [companies, contacts, contactTags, salesOwners, salesStages] =
    await Promise.all([
      settings.companiesEnabled
        ? prisma.company.findMany({
            where: companyWhereWithAccess(currentUser),
            orderBy: { name: "asc" },
            select: { id: true, name: true },
            take: quickCreateCompanyOptionLimit,
          })
        : Promise.resolve([]),
      prisma.contact.findMany({
        where: contactWhereWithAccess(currentUser),
        orderBy: [
          { updatedAt: "desc" },
          { lastName: "asc" },
          { firstName: "asc" },
        ],
        select: {
          companyId: true,
          companyName: true,
          email: true,
          firstName: true,
          id: true,
          lastName: true,
          leadSource: true,
          phone: true,
          company: { select: { name: true } },
        },
        take: quickCreateContactOptionLimit,
      }),
      prisma.contactTag.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.user.findMany({
        where: { status: "ACTIVE" },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.salesPipelineStage.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { bucket: true, id: true, name: true },
      }),
    ]);

  return NextResponse.json({
    addressLookupEnabled,
    companies,
    companiesEnabled: settings.companiesEnabled,
    contacts: contacts.map((contact) => ({
      companyId: contact.companyId,
      companyName: contact.company?.name ?? contact.companyName,
      email: contact.email,
      id: contact.id,
      leadSource: contact.leadSource,
      name: `${contact.firstName} ${contact.lastName}`.trim(),
      phone: contact.phone,
    })),
    contactTags,
    sales: {
      defaultOwnerId: resolveSalesDefaultOwnerId({
        fallbackUserId: currentUser.id,
        salesDefaults,
      }),
      defaultStageId: salesDefaults.defaultSalesPipelineStageId,
      owners: salesOwners.map((owner) => ({
        label: owner.name,
        value: owner.id,
      })),
      stages: salesStages.map((stage) => ({
        bucket: stage.bucket,
        label: stage.name,
        value: stage.id,
      })),
    },
  });
}
