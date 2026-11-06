import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { APP_NAME } from "@/shared/config/constants";
import { getWebPrincipal } from "@/modules/identity/interface/web-session";
import { LoginForm } from "./LoginForm";
import styles from "./login.module.css";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; expired?: string }> }) {
  const { next, expired } = await searchParams;
  if (await getWebPrincipal()) redirect(next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");

  return (
    <main className={styles.page}>
      <div className={styles.wrap}>
        <div className={styles.brand}>
          <Image src="/brand/logo-128.png" alt="Techno Cool Associates" width={56} height={56} className={styles.logo} priority />
          <span className={styles.brandText}>
            <span className={styles.brandName}>{APP_NAME}</span>
            <span className={styles.brandCompany}>Techno Cool Associates</span>
          </span>
        </div>
        <section className={styles.panel} aria-labelledby="login-title">
          <h1 id="login-title" className={styles.title}>
            Log in to {APP_NAME}
          </h1>
          <p className={styles.subtitle}>Inventory for LG · Daikin · Dunham-Bush projects</p>
          <LoginForm next={next ?? ""} expired={expired === "1"} />
        </section>
        <p className={styles.footnote}>Forgot your password? Ask an Admin to set a new one.</p>
      </div>
    </main>
  );
}
