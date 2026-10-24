import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getWebPrincipal } from "@/modules/identity/interface/web-session";
import { LoginForm } from "./LoginForm";
import styles from "./login.module.css";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; expired?: string }> }) {
  const { next, expired } = await searchParams;
  if (await getWebPrincipal()) redirect(next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");

  return (
    <main className={styles.page}>
      <header className={styles.brandBar}>
        <span className={styles.brand}>
          <strong>StockBook</strong>
        </span>
      </header>
      <section className={styles.panel} aria-labelledby="login-title">
        <h1 id="login-title" className={styles.title}>
          Log in
        </h1>
        <p className={styles.subtitle}>Inventory for LG · Daikin · Dunham-Bush projects</p>
        <LoginForm next={next ?? ""} expired={expired === "1"} />
        <p className={styles.footnote}>Forgot your password? Ask an Admin to set a new one.</p>
      </section>
    </main>
  );
}
