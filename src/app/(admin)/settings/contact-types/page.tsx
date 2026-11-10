import ContactTypeManager from "@/components/crm-boilerplate/ContactTypeManager";
import ContactCustomFieldManager from "@/components/crm-boilerplate/ContactCustomFieldManager";
import PageHeader from "@/components/crm-boilerplate/PageHeader";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function ContactTypeSettingsPage() {
  await requireAdmin();
  const [contactTypes, fields] = await Promise.all([prisma.contactType.findMany({
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      pluralName: true,
      slug: true,
      description: true,
      systemKey: true,
      colourKey: true,
      iconKey: true,
      displayOrder: true,
      isDefault: true,
      isActive: true,
      _count: { select: { contacts: true } },
    },
  }), prisma.contactTypeField.findMany({
    orderBy: [{ contactType: { displayOrder: "asc" } }, { displayOrder: "asc" }, { label: "asc" }],
    select: {
      id: true,
      contactTypeId: true,
      key: true,
      label: true,
      helpText: true,
      placeholder: true,
      fieldType: true,
      requirementMode: true,
      options: true,
      displayOrder: true,
      isActive: true,
      showInTable: true,
      isSearchable: true,
      externalEditable: true,
      contactType: { select: { name: true } },
      _count: { select: { values: true } },
    },
  })]);
  const nextDisplayOrder =
    contactTypes.reduce(
      (highest, contactType) => Math.max(highest, contactType.displayOrder),
      0,
    ) + 10;

  return (
    <>
      <PageHeader
        title="Person Types"
        description="Configure the primary types used to organise People. System identifiers remain stable for existing integrations even when a visible label changes."
      />
      <ContactTypeManager
        nextDisplayOrder={nextDisplayOrder}
        contactTypes={contactTypes.map((contactType) => ({
          ...contactType,
          contactCount: contactType._count.contacts,
        }))}
      />
      <div className="mt-6">
        <ContactCustomFieldManager
          contactTypes={contactTypes.map((type) => ({ id: type.id, name: type.name, isActive: type.isActive }))}
          fields={fields.map((field) => ({
            ...field,
            contactTypeName: field.contactType.name,
            options: Array.isArray(field.options) ? field.options.filter((value): value is string => typeof value === "string") : [],
            valueCount: field._count.values,
          }))}
          nextDisplayOrder={fields.reduce((highest, field) => Math.max(highest, field.displayOrder), 0) + 10}
        />
      </div>
    </>
  );
}
