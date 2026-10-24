"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./AppShell.module.css";

export interface SideNavItem {
  href: string;
  label: string;
}

export function SideNav({ items }: { items: SideNavItem[] }) {
  const pathname = usePathname();
  // The longest matching item wins, so /stock/counts highlights "Stock counts", not "Stock in / out".
  const current = items
    .filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <nav className={styles.nav} aria-label="Main" data-print="hide">
      <ul className={styles.navList}>
        {items.map((item) => {
          const active = item.href === current;
          return (
            <li key={item.href}>
              <Link href={item.href} className={`${styles.navItem} ${active ? styles.navActive : ""}`} aria-current={active ? "page" : undefined}>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
