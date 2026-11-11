import { type NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import {
  normalizeContactEmailMethods,
  normalizeContactPhoneMethods,
} from "@/lib/contact-methods";
import { defaultContactCategory } from "@/lib/contacts/categories";
import { contactWhereWithAccess } from "@/lib/crm-resource-access";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser();

  if (!auth.ok) {
    return auth.response;
  }

  const query = request.nextUrl.searchParams.get("query")?.trim().slice(0, 120) ?? "";
  const requestedLimit = Number(request.nextUrl.searchParams.get("limit") ?? 100);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 100)
    : 100;
  const searchWhere = query
    ? {
        OR: [
          { firstName: { contains: query, mode: "insensitive" as const } },
          { lastName: { contains: query, mode: "insensitive" as const } },
          { email: { contains: query, mode: "insensitive" as const } },
          { phone: { contains: query, mode: "insensitive" as const } },
          { companyName: { contains: query, mode: "insensitive" as const } },
          {
            additionalEmails: {
              some: { email: { contains: query, mode: "insensitive" as const } },
            },
          },
        ],
      }
    : undefined;

  const contacts = await prisma.contact.findMany({
    where: contactWhereWithAccess(auth.user, searchWhere),
    orderBy: [{ updatedAt: "desc" }, { lastName: "asc" }, { firstName: "asc" }],
    take: limit,
    select: {
      id: true,
      additionalEmails: {
        orderBy: { createdAt: "asc" },
        select: { email: true, id: true, label: true },
      },
      additionalPhones: {
        orderBy: { createdAt: "asc" },
        select: { id: true, label: true, phone: true, phoneNormalized: true },
      },
      firstName: true,
      lastName: true,
      category: true,
      email: true,
      phone: true,
      role: true,
      companyName: true,
      company: {
        select: {
          id: true,
          name: true,
        },
      },
      companyAffiliations: {
        select: { companyId: true },
      },
      tagAssignments: {
        include: {
          tag: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });

  return NextResponse.json({
    contacts: contacts.map((contact) => ({
      id: contact.id,
      displayName: `${contact.firstName} ${contact.lastName}`.trim(),
      firstName: contact.firstName,
      lastName: contact.lastName,
      category: contact.category ?? defaultContactCategory,
      email: contact.email,
      phone: contact.phone,
      additionalEmails: normalizeContactEmailMethods(
        contact.additionalEmails,
        contact.email,
      ),
      additionalPhones: normalizeContactPhoneMethods(
        contact.additionalPhones,
        contact.phone,
      ),
      role: contact.role,
      companyId: contact.company?.id ?? null,
      companyIds: contact.companyAffiliations.map(
        (affiliation) => affiliation.companyId,
      ),
      companyName: contact.company?.name ?? contact.companyName,
      tags: contact.tagAssignments.map((assignment) => assignment.tag),
    })),
  });
}
