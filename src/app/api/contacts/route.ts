import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import {
  normalizeContactEmailMethods,
  normalizeContactPhoneMethods,
} from "@/lib/contact-methods";
import { contactWhereWithAccess } from "@/lib/crm-resource-access";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const auth = await requireApiUser();

  if (!auth.ok) {
    return auth.response;
  }

  const contacts = await prisma.contact.findMany({
    where: contactWhereWithAccess(auth.user),
    orderBy: [{ updatedAt: "desc" }, { lastName: "asc" }, { firstName: "asc" }],
    take: 100,
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
      email: true,
      phone: true,
      role: true,
      companyName: true,
      company: {
        select: {
          name: true,
        },
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
      companyName: contact.company?.name ?? contact.companyName,
      tags: contact.tagAssignments.map((assignment) => assignment.tag),
    })),
  });
}
