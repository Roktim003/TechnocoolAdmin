import Link from "next/link";
import { PageHeader } from "./PageHeader";
import styles from "./PageStates.module.css";

export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <>
      <PageHeader title={title} />
      <section className={styles.tile}>
        <p className={styles.eyebrow}>Coming soon</p>
        <h2 className={styles.heading}>{title} is not built yet</h2>
        <p className={styles.text}>{description}</p>
      </section>
    </>
  );
}

export function AccessDenied({ what }: { what: string }) {
  return (
    <>
      <PageHeader title="Access denied" />
      <section className={styles.tile} role="alert">
        <p className={`${styles.eyebrow} ${styles.error}`}>403 · Forbidden</p>
        <h2 className={styles.heading}>You don’t have permission to open {what}.</h2>
        <p className={styles.text}>Ask an Admin to give your role access if you need it.</p>
        <Link href="/dashboard" className={styles.link}>
          Go to the dashboard
        </Link>
      </section>
    </>
  );
}
