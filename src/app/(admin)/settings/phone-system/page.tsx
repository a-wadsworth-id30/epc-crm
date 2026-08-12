import { redirect } from "next/navigation";
import {
  phoneTabAliases,
  phoneTabPathById,
  type PhoneTab,
} from "@/lib/telephony/navigation";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LegacyPhoneSystemSettingsPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const requestedTab = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const normalized = requestedTab
    ? phoneTabAliases[requestedTab] ?? requestedTab
    : "dashboard";
  const tab = Object.keys(phoneTabPathById).includes(normalized)
    ? (normalized as PhoneTab)
    : "dashboard";

  redirect(phoneTabPathById[tab]);
}
