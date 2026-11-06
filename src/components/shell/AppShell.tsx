import Link from "next/link";
import { ConfirmHost } from "@/components/ui/ConfirmDialog";
import { Icon } from "@/components/ui/Icon";
import { HeaderActions, UserMenu } from "./HeaderActions";
import { MobileNav } from "./MobileNav";
import { TableLabels } from "./TableLabels";
import { Crumbs, SideNav, type SideNavItem } from "./SideNav";
import styles from "./AppShell.module.css";

export interface AppShellProps {
  user: { name: string; roleName: string };
  nav: SideNavItem[];
  canSearchUsers: boolean;
  children: React.ReactNode;
}

/** Gr8r Studio shell: warm-gray sidebar (brand, grouped nav, user) beside a white top bar and content. */
export function AppShell({ user, nav, canSearchUsers, children }: AppShellProps) {
  return (
    <div className={styles.shell}>
      <a href="#main" className={styles.skip}>
        Skip to main content
      </a>
      <aside id="app-sidebar" className={styles.side} data-print="hide">
        <div className={styles.sideTop}>
          <Link href="/dashboard" className={styles.brand}>
            <span className={styles.logo} aria-hidden="true">
              SB
            </span>
            <span className={styles.brandName}>StockBook</span>
          </Link>
        </div>
        <SideNav items={nav} />
        <div className={styles.sideBottom}>
          <UserMenu name={user.name} roleName={user.roleName} />
        </div>
      </aside>
      <div className={styles.main}>
        <header className={styles.topbar} data-print="hide">
          <MobileNav />
          <Crumbs items={nav} />
          <span className={styles.spacer} />
          {canSearchUsers ? (
            <form action="/users" className={styles.search} role="search">
              <Icon name="search" size={14} className={styles.searchIcon} />
              <label htmlFor="shell-search" className="visually-hidden">
                Search users
              </label>
              <input id="shell-search" name="q" type="search" placeholder="Search users" className={styles.searchInput} autoComplete="off" />
            </form>
          ) : null}
          <HeaderActions />
        </header>
        <main id="main" className={styles.content}>
          {children}
        </main>
      </div>
      <ConfirmHost />
      <TableLabels />

    </div>
  );
}
