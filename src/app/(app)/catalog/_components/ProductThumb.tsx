/* eslint-disable @next/next/no-img-element -- images come from the authenticated API proxy, not the Next image optimiser */
import styles from "./catalog.module.css";

/** 40px product thumbnail, or a placeholder box icon when there is no photo. */
export function ProductThumb({ src, alt }: { src: string | null; alt: string }) {
  return (
    <span className={styles.thumb}>
      {src ? (
        <img src={src} alt={alt} loading="lazy" />
      ) : (
        <svg width="20" height="20" viewBox="0 0 32 32" fill="currentColor" aria-label="No photo" role="img">
          <path d="M29 9.3 16.5 2.2a1 1 0 0 0-1 0L3 9.3a1 1 0 0 0-.5.9v11.6a1 1 0 0 0 .5.9l12.5 7.1a1 1 0 0 0 1 0L29 22.7a1 1 0 0 0 .5-.9V10.2a1 1 0 0 0-.5-.9ZM16 4.2 26.5 10 16 15.8 5.5 10Zm-11.5 7.6L15 17.7v9.9L4.5 21.4Zm12.5 15.8v-9.9l10.5-5.9v9.6Z" />
        </svg>
      )}
    </span>
  );
}
