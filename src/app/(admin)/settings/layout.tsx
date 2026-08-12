import SettingsNav from "@/components/crm-boilerplate/SettingsNav";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SettingsNav />
      {children}
    </>
  );
}
