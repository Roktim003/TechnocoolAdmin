"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";
import styles from "./AppShell.module.css";

export interface SideNavItem {
  href: string;
  label: string;
  group: string;
  icon: IconName;
}

/** The longest matching item wins, so /stock/counts highlights "Stock counts", not "Stock in / out". */
export function currentNavItem<T extends { href: string }>(items: T[], pathname: string): T | undefined {
  return items.filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`)).sort((a, b) => b.href.length - a.href.length)[0];
}

export function SideNav({ items }: { items: SideNavItem[] }) {
  const pathname = usePathname();
  const current = currentNavItem(items, pathname)?.href;
  // Keep the order the items arrive in; each group starts where its first item appears.
  const groups: { name: string; items: SideNavItem[] }[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last?.name === item.group) last.items.push(item);
    else groups.push({ name: item.group, items: [item] });
  }
  return (
    <nav className={styles.navScroll} aria-label="Main">
      {groups.map((g) => (
        <div key={g.name} className={styles.group}>
          <div className={styles.groupHead}>{g.name}</div>
          <ul className={styles.navList}>
            {g.items.map((item) => {
              const active = item.href === current;
              return (
                <li key={item.href}>
                  <Link href={item.href} className={`${styles.navItem} ${active ? styles.navActive : ""}`} aria-current={active ? "page" : undefined}>
                    <Icon name={item.icon} className={styles.navIcon} />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Top-bar breadcrumb: "StockBook › <current section>". */
export function Crumbs({ items }: { items: SideNavItem[] }) {
  const pathname = usePathname();
  const item = currentNavItem(items, pathname);
  const deeper = item && pathname !== item.href;
  return (
    <nav className={styles.crumbs} aria-label="Breadcrumb">
      <Link href="/dashboard">StockBook</Link>
      {item ? (
        <>
          <Icon name="chevronRight" size={12} className={styles.crumbSep} />
          {deeper ? <Link href={item.href}>{item.label}</Link> : <span className={styles.crumbCur}>{item.label}</span>}
        </>
      ) : null}
      {deeper ? (
        <>
          <Icon name="chevronRight" size={12} className={styles.crumbSep} />
          <span className={styles.crumbCur}>Details</span>
        </>
      ) : null}
    </nav>
  );
}
