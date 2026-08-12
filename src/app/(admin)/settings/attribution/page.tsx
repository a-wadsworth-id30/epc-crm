import { redirect } from "next/navigation";
import { attributionLegacySectionPath } from "@/lib/attribution/settings-sections";

export default async function AttributionSettingsIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const { section } = await searchParams;

  redirect(attributionLegacySectionPath(section));
}
