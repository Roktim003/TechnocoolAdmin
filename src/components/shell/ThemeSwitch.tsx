"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { applyTheme, readChoice, resolve, THEME_CHANGED, THEME_KEY, type ThemeChoice } from "@/lib/theme";
import styles from "./AppShell.module.css";

const OPTIONS: { value: ThemeChoice; label: string; icon: "sun" | "moon" | "monitor" }[] = [
  { value: "light", label: "Light", icon: "sun" },
  { value: "dark", label: "Dark", icon: "moon" },
  { value: "system", label: "System", icon: "monitor" },
];

/**
 * Top-bar theme menu: Light / Dark / System (follows the computer's setting).
 * Also keeps "System" in step with the OS, syncs other tabs, and prints in light.
 */
export function ThemeSwitch() {
  const [choice, setChoice] = useState<ThemeChoice>("system");
  const [shown, setShown] = useState<"light" | "dark">("light");
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sync = () => {
      const c = readChoice();
      setChoice(c);
      setShown(resolve(c));
      document.documentElement.setAttribute("data-theme", resolve(c));
    };
    sync();
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onStorage = (e: StorageEvent) => e.key === THEME_KEY && sync();
    // Printing always uses the light theme (white paper, dark text).
    const beforePrint = () => document.documentElement.setAttribute("data-theme", "light");
    media.addEventListener("change", sync);
    window.addEventListener("storage", onStorage);
    window.addEventListener(THEME_CHANGED, sync);
    window.addEventListener("beforeprint", beforePrint);
    window.addEventListener("afterprint", sync);
    return () => {
      media.removeEventListener("change", sync);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(THEME_CHANGED, sync);
      window.removeEventListener("beforeprint", beforePrint);
      window.removeEventListener("afterprint", sync);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div className={styles.themeWrap} ref={box}>
      <button type="button" className={styles.iconButton} aria-haspopup="menu" aria-expanded={open} aria-label={`Theme: ${OPTIONS.find((o) => o.value === choice)?.label}`} title="Theme" onClick={() => setOpen((o) => !o)}>
        <Icon name={shown === "dark" ? "moon" : "sun"} size={16} />
      </button>
      {open ? (
        <div className={styles.themeMenu} role="menu" aria-label="Theme">
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              role="menuitemradio"
              aria-checked={choice === o.value}
              className={`${styles.themeItem} ${choice === o.value ? styles.themeItemOn : ""}`}
              onClick={() => {
                applyTheme(o.value);
                setOpen(false);
              }}
            >
              <Icon name={o.icon} size={15} />
              <span>{o.label}</span>
              {choice === o.value ? <Icon name="check" size={14} className={styles.themeCheck} /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
