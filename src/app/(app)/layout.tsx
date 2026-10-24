import { getWebPrincipal } from "@/modules/identity/interface/web-session";
import { hasPermission } from "@/shared/rbac/guards";
import { AppShell } from "@/components/shell/AppShell";
import { SessionRefresher } from "@/components/shell/SessionRefresher";
import { visibleNav } from "./nav";

export const dynamic = "force-dynamic";

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const principal = await getWebPrincipal();
  // No valid access cookie: try the refresh cookie in the browser, else go to /login.
  if (!principal) return <SessionRefresher />;

  return (
    <AppShell
      user={{ name: principal.name, roleName: principal.roleName }}
      nav={visibleNav(principal.permissions).map(({ href, label }) => ({ href, label }))}
      canSearchUsers={hasPermission(principal, "users", "FULL")}
    >
      {children}
    </AppShell>
  );
}
