import Link from "next/link";
import { HeaderActions } from "./HeaderActions";
import { SideNav, type SideNavItem } from "./SideNav";
import styles from "./AppShell.module.css";

export interface AppShellProps {
  user: { name: string; roleName: string };
  nav: SideNavItem[];
  canSearchUsers: boolean;
  children: React.ReactNode;
}

export function AppShell({ user, nav, canSearchUsers, children }: AppShellProps) {
  return (
    <div className={styles.shell}>
      <a href="#main" className={styles.skip}>
        Skip to main content
      </a>
      <header className={styles.header} data-print="hide">
        <Link href="/dashboard" className={styles.brand}>
          <strong>StockBook</strong>
        </Link>
        {canSearchUsers ? (
          <form action="/users" className={styles.search} role="search">
            <label htmlFor="shell-search" className="visually-hidden">
              Search users
            </label>
            <input id="shell-search" name="q" type="search" placeholder="Search users" className={styles.searchInput} autoComplete="off" />
          </form>
        ) : (
          <span className={styles.spacer} />
        )}
        <HeaderActions name={user.name} roleName={user.roleName} />
      </header>
      <div className={styles.body}>
        <SideNav items={nav} />
        <main id="main" className={styles.main}>
          {children}
        </main>
      </div>
    </div>
  );
}
