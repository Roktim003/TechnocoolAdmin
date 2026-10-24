import styles from "./purchases.module.css";

/** Received / ordered as a thin bar with the percentage. */
export function Progress({ percent }: { percent: number }) {
  const p = Math.max(0, Math.min(100, percent));
  return (
    <span className={styles.progress} role="img" aria-label={`${p}% received`}>
      <span className={styles.progressTrack}>
        <span className={`${styles.progressFill} ${p >= 100 ? styles.progressDone : ""}`} style={{ width: `${p}%`, display: "block" }} />
      </span>
      <span className={styles.progressLabel}>{p}%</span>
    </span>
  );
}
