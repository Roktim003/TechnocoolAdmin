"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/Icon";
import styles from "./AppShell.module.css";

/** Below this width the sidebar is a slide-in drawer (keep in step with AppShell.module.css). */
const DRAWER_BELOW = 900;

/**
 * Phones and tablets: a ☰ button in the top bar opens the sidebar as a drawer from the left
 * (`html[data-nav="open"]` drives the CSS). Closes on a link tap, the backdrop, Esc, a route
 * change, or when the window grows back to desktop width.
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  useEffect(() => setMounted(true), []);

  // Route changed (a nav link was followed): close.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    const root = document.documentElement;
    if (open) root.setAttribute("data-nav", "open");
    else root.removeAttribute("data-nav");
    if (!open) return;
    const side = document.getElementById("app-sidebar");
    const prevFocus = document.activeElement as HTMLElement | null;
    side?.querySelector<HTMLElement>('[aria-current="page"], a')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => (e.target as HTMLElement).closest("a") && setOpen(false);
    const onResize = () => window.innerWidth >= DRAWER_BELOW && setOpen(false);
    document.addEventListener("keydown", onKey);
    side?.addEventListener("click", onClick);
    window.addEventListener("resize", onResize);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      side?.removeEventListener("click", onClick);
      window.removeEventListener("resize", onResize);
      document.body.style.overflow = "";
      root.removeAttribute("data-nav");
      prevFocus?.focus();
    };
  }, [open]);

  return (
    <>
      <button type="button" className={styles.menuButton} aria-label="Open menu" aria-controls="app-sidebar" aria-expanded={open} onClick={() => setOpen(true)}>
        <Icon name="menu" size={18} />
      </button>
      {mounted && open ? createPortal(<div className={styles.navBackdrop} onClick={() => setOpen(false)} aria-hidden="true" />, document.body) : null}
    </>
  );
}
