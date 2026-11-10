import type { Prisma } from "@prisma/client";
import { requireApiUser } from "@/lib/api-auth";
import { contactWhereWithAccess } from "@/lib/crm-resource-access";
import { serializeContactCustomFieldValue } from "@/lib/contacts/custom-fields";
import { contactSearchWhere } from "@/lib/contacts/query";
import { toCsv } from "@/lib/csv";
import { prisma } from "@/lib/prisma";

const exportLimit = 5_000;

function displayCustomValue(
  value: ReturnType<typeof serializeContactCustomFieldValue>,
) {
  if (Array.isArray(value)) return value.join(" | ");
  if (value === true) return "Yes";
  if (value === false) return "No";
  return value ?? "";
}

export async function GET(request: Request) {
  const auth = await requireApiUser();

  if (!auth.ok) {
    return auth.response;
  }

  const user = auth.user;
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  const typeSlug = (url.searchParams.get("type") ?? "").trim();
  const selectedType = typeSlug
    ? await prisma.contactType.findFirst({
        where: { isActive: true, slug: typeSlug },
        select: { id: true, name: true, systemKey: true },
      })
    : null;

  if (typeSlug && !selectedType) {
    return Response.json(
      { error: "That person type is not available." },
      { status: 400 },
    );
  }

  const filters: Prisma.ContactWhereInput[] = [];
  const searchWhere = contactSearchWhere(query);

  if (searchWhere) filters.push(searchWhere);
  if (selectedType) {
    filters.push({
      OR: [
        { contactTypeId: selectedType.id },
        ...(selectedType.systemKey
          ? [{ contactTypeId: null, category: selectedType.systemKey }]
          : []),
      ],
    });
  }

  const where = contactWhereWithAccess(
    user,
    filters.length ? { AND: filters } : undefined,
  );
  const [fields, contacts, activeTypes] = await Promise.all([
    prisma.contactTypeField.findMany({
      where: {
        isActive: true,
        ...(selectedType ? { contactTypeId: selectedType.id } : {}),
      },
      orderBy: [
        { contactType: { displayOrder: "asc" } },
        { displayOrder: "asc" },
        { label: "asc" },
      ],
      select: {
        contactType: { select: { name: true } },
        id: true,
        label: true,
      },
    }),
    prisma.contact.findMany({
      where,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
      take: exportLimit,
      select: {
        additionalEmails: {
          orderBy: { createdAt: "asc" },
          select: { email: true },
        },
        additionalPhones: {
          orderBy: { createdAt: "asc" },
          select: { phone: true },
        },
        addressLine1: true,
        addressLine2: true,
        city: true,
        company: { select: { name: true } },
        companyName: true,
        category: true,
        contactType: { select: { name: true } },
        country: true,
        county: true,
        createdAt: true,
        customFieldValues: {
          select: {
            booleanValue: true,
            dateValue: true,
            fieldId: true,
            jsonValue: true,
            numberValue: true,
            textValue: true,
          },
        },
        email: true,
        firstName: true,
        lastName: true,
        leadSource: true,
        phone: true,
        postcode: true,
        role: true,
        tagAssignments: {
          orderBy: { tag: { name: "asc" } },
          select: { tag: { select: { name: true } } },
        },
        updatedAt: true,
      },
    }),
    prisma.contactType.findMany({
      where: { isActive: true },
      select: { name: true, systemKey: true },
    }),
  ]);
  const includeTypeInFieldLabel = !selectedType;
  const rows: unknown[][] = [
    [
      "Person type",
      "First name",
      "Last name",
      "Primary email",
      "Additional emails",
      "Primary phone",
      "Additional phones",
      "Company",
      "Role",
      "Lead source",
      "Address line 1",
      "Address line 2",
      "City",
      "County",
      "Postcode",
      "Country",
      "Tags",
      "Created at",
      "Updated at",
      ...fields.map((field) =>
        includeTypeInFieldLabel
          ? `${field.contactType.name}: ${field.label}`
          : field.label,
      ),
    ],
    ...contacts.map((contact) => {
      const values = new Map(
        contact.customFieldValues.map((value) => [
          value.fieldId,
          displayCustomValue(serializeContactCustomFieldValue(value)),
        ]),
      );

      return [
        contact.contactType?.name ??
          activeTypes.find((type) => type.systemKey === contact.category)?.name ??
          "Unassigned",
        contact.firstName,
        contact.lastName,
        contact.email ?? "",
        contact.additionalEmails.map((entry) => entry.email).join(" | "),
        contact.phone ?? "",
        contact.additionalPhones.map((entry) => entry.phone).join(" | "),
        contact.company?.name ?? contact.companyName ?? "",
        contact.role ?? "",
        contact.leadSource ?? "",
        contact.addressLine1 ?? "",
        contact.addressLine2 ?? "",
        contact.city ?? "",
        contact.county ?? "",
        contact.postcode ?? "",
        contact.country ?? "",
        contact.tagAssignments.map((entry) => entry.tag.name).join(" | "),
        contact.createdAt.toISOString(),
        contact.updatedAt.toISOString(),
        ...fields.map((field) => values.get(field.id) ?? ""),
      ];
    }),
  ];

  await prisma.auditLog.create({
    data: {
      action: "contacts.exported",
      actorId: user.id,
      entity: "Contact",
      metadata: {
        exportedCount: contacts.length,
        limit: exportLimit,
        queryApplied: Boolean(query),
        typeId: selectedType?.id ?? null,
      },
    },
  });

  return new Response(toCsv(rows), {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="people-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
      "X-Export-Limit": String(exportLimit),
      "X-Export-Row-Count": String(contacts.length),
    },
  });
}
