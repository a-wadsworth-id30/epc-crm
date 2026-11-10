import CompanyCustomFieldManager from "@/components/crm-boilerplate/CompanyCustomFieldManager";
import CompanyTypeManager from "@/components/crm-boilerplate/CompanyTypeManager";
import PageHeader from "@/components/crm-boilerplate/PageHeader";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function CompanyTypeSettingsPage() {
  await requireAdmin();
  const [companyTypes, fields] = await Promise.all([
    prisma.companyType.findMany({
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
        _count: { select: { companies: true } },
      },
    }),
    prisma.companyTypeField.findMany({
      orderBy: [{ companyType: { displayOrder: "asc" } }, { displayOrder: "asc" }, { label: "asc" }],
      select: {
        id: true,
        companyTypeId: true,
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
        viewRoleTemplates: true,
        editRoleTemplates: true,
        companyType: { select: { name: true } },
        _count: { select: { values: true } },
      },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Company Types"
        description="Configure organisation classifications and the structured fields required for each type. Company types remain separate from Person Types and lifecycle status."
      />
      <CompanyTypeManager
        nextDisplayOrder={companyTypes.reduce((highest, type) => Math.max(highest, type.displayOrder), 0) + 10}
        companyTypes={companyTypes.map((type) => ({ ...type, companyCount: type._count.companies }))}
      />
      <div className="mt-6">
        <CompanyCustomFieldManager
          companyTypes={companyTypes.map((type) => ({ id: type.id, name: type.name, isActive: type.isActive }))}
          fields={fields.map((field) => ({
            ...field,
            companyTypeName: field.companyType.name,
            options: Array.isArray(field.options) ? field.options.filter((value): value is string => typeof value === "string") : [],
            valueCount: field._count.values,
          }))}
          nextDisplayOrder={fields.reduce((highest, field) => Math.max(highest, field.displayOrder), 0) + 10}
        />
      </div>
    </>
  );
}
