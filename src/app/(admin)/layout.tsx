import AdminShell from "@/layout/AdminShell";
import { getAppShellSettings } from "@/lib/app-shell";
import { requireUser } from "@/lib/auth";
import { timeAsync } from "@/lib/performance/server-timing";

const buildCommit = process.env.APP_BUILD_COMMIT ?? "unknown";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [currentUser, shellSettings] = await timeAsync(
    "admin-layout.bootstrap",
    () =>
      Promise.all([
        timeAsync("admin-layout.requireUser", () => requireUser(), {
          thresholdMs: 150,
        }),
        timeAsync(
          "admin-layout.getAppShellSettings",
          () => getAppShellSettings(),
          {
            thresholdMs: 100,
          },
        ),
      ]),
    { thresholdMs: 250 },
  );

  return (
    <AdminShell
      currentUser={currentUser}
      companiesEnabled={shellSettings.companiesEnabled}
      companyProfile={shellSettings.companyProfile}
      moduleToggles={shellSettings.moduleToggles}
      buildCommit={buildCommit}
    >
      {children}
    </AdminShell>
  );
}
