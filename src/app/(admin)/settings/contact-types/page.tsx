import ContactTypeManager from "@/components/crm-boilerplate/ContactTypeManager";
import PageHeader from "@/components/crm-boilerplate/PageHeader";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function ContactTypeSettingsPage() {
  await requireAdmin();
  const contactTypes = await prisma.contactType.findMany({
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
  });
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
    </>
  );
}
