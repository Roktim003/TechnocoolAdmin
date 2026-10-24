import type { ReactNode } from "react";
import styles from "./Tag.module.css";

export type TagKind = "green" | "red" | "yellow" | "blue" | "purple" | "gray";

export function Tag({ kind = "gray", children, title }: { kind?: TagKind; children: ReactNode; title?: string }) {
  return (
    <span className={`${styles.tag} ${styles[kind]}`} title={title}>
      {children}
    </span>
  );
}
