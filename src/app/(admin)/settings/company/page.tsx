import LazyCompanyProfileForm from "@/components/crm-boilerplate/LazyCompanyProfileForm";
import PageHeader from "@/components/crm-boilerplate/PageHeader";
import { requireAdmin } from "@/lib/auth";
import { parseCompanyProfile } from "@/lib/company-profile";
import { getCrmSettings } from "@/lib/settings";

export default async function CompanySettingsPage() {
  await requireAdmin();
  const settings = await getCrmSettings();
  const companyProfile = parseCompanyProfile(settings.companyProfile);

  return (
    <>
      <PageHeader
        title="Company Profile"
        description="Organisation identity, ownership and branding settings for this CRM."
      />
      <LazyCompanyProfileForm
        canEdit
        profile={companyProfile}
      />
    </>
  );
}
