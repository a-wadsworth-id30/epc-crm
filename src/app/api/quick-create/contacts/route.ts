import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { requireApiUser } from "@/lib/api-auth";
import { defaultContactCategory } from "@/lib/contacts/categories";
import { contactWhereWithAccess } from "@/lib/crm-resource-access";
import { normalizedContactPhone } from "@/lib/phone-normalization";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const quickCreateContactSearchLimit = 25;

function contains(value: string) {
  return { contains: value, mode: "insensitive" as const };
}

function contactSearchWhere(query: string): Prisma.ContactWhereInput {
  const terms = query
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);
  const normalizedPhone = normalizedContactPhone(query);
  const digitQuery = query.replace(/\D/g, "");
  const filters: Prisma.ContactWhereInput[] = [];

  terms.forEach((term) => {
    filters.push(
      { firstName: contains(term) },
      { lastName: contains(term) },
      { email: contains(term) },
      { phone: contains(term) },
      { companyName: contains(term) },
      { company: { name: contains(term) } },
      { additionalEmails: { some: { email: contains(term) } } },
      { additionalPhones: { some: { phone: contains(term) } } },
    );
  });

  if (normalizedPhone) {
    filters.push(
      { phoneNormalized: { contains: normalizedPhone } },
      {
        additionalPhones: {
          some: { phoneNormalized: { contains: normalizedPhone } },
        },
      },
    );
  }

  if (digitQuery.length >= 3) {
    filters.push(
      { phone: { contains: digitQuery } },
      { phoneNormalized: { contains: digitQuery } },
      { additionalPhones: { some: { phone: { contains: digitQuery } } } },
      {
        additionalPhones: {
          some: { phoneNormalized: { contains: digitQuery } },
        },
      },
    );
  }

  return filters.length ? { OR: filters } : {};
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser();

  if (!auth.ok) {
    return auth.response;
  }

  const user = auth.user;
  const query = (request.nextUrl.searchParams.get("q") ?? "").trim();

  if (query.length < 2 && query.replace(/\D/g, "").length < 3) {
    return NextResponse.json({ contacts: [] });
  }

  const contacts = await prisma.contact.findMany({
    where: contactWhereWithAccess(user, contactSearchWhere(query)),
    orderBy: [{ updatedAt: "desc" }, { lastName: "asc" }, { firstName: "asc" }],
    select: {
      companyId: true,
      companyName: true,
      email: true,
      category: true,
      firstName: true,
      id: true,
      lastName: true,
      leadSource: true,
      phone: true,
      company: { select: { name: true } },
    },
    take: quickCreateContactSearchLimit,
  });

  return NextResponse.json({
    contacts: contacts.map((contact) => ({
      companyId: contact.companyId,
      companyName: contact.company?.name ?? contact.companyName,
      email: contact.email,
      category: contact.category ?? defaultContactCategory,
      id: contact.id,
      leadSource: contact.leadSource,
      name: `${contact.firstName} ${contact.lastName}`.trim(),
      phone: contact.phone,
    })),
  });
}
