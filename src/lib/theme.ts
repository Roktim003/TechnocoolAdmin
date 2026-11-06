/**
 * Light / dark theme. The choice ("light" | "dark" | "system") is kept per browser in localStorage;
 * "system" follows the OS setting. <html data-theme> is set before the first paint by THEME_SCRIPT
 * (inlined in app/layout.tsx) so pages never flash the wrong theme.
 */
export type ThemeChoice = "light" | "dark" | "system";

export const THEME_KEY = "sb.theme";
export const THEME_CHANGED = "sb-theme-changed";

/** Runs in <head> before the body renders. Keep it tiny and dependency-free. */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");var d=t==="dark"||((!t||t==="system")&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.setAttribute("data-theme",d?"dark":"light")}catch(e){}})();`;

export function readChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export function resolve(choice: ThemeChoice): "light" | "dark" {
  if (choice !== "system") return choice;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(choice: ThemeChoice) {
  try {
    if (choice === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {
    /* storage blocked: still switch for this page */
  }
  document.documentElement.setAttribute("data-theme", resolve(choice));
  window.dispatchEvent(new Event(THEME_CHANGED));
}
