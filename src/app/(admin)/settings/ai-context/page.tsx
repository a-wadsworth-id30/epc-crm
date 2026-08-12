import LazyCrmAIContextForm from "@/components/crm-boilerplate/LazyCrmAIContextForm";
import PageHeader from "@/components/crm-boilerplate/PageHeader";
import { requireAdmin } from "@/lib/auth";
import { getCrmAIContext } from "@/lib/ai/crm-context";
import { getCrmSettings } from "@/lib/settings";

export default async function AIContextSettingsPage() {
  await requireAdmin();
  const settings = await getCrmSettings();

  return (
    <>
      <PageHeader
        title="AI Context"
        description="Business context, tone and guardrails used by CRM AI workflows."
      />
      <LazyCrmAIContextForm
        aiContext={getCrmAIContext(settings.aiContext)}
        canEdit
      />
    </>
  );
}
