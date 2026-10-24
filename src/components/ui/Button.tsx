import type { ButtonHTMLAttributes } from "react";
import styles from "./Button.module.css";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  kind?: "primary" | "secondary" | "danger" | "ghost";
  size?: "md" | "sm";
}

export function Button({ kind = "primary", size = "md", className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={[styles.button, styles[kind], styles[size], className].filter(Boolean).join(" ")} {...props} />;
}
