import styles from "./FourDotsLoader.module.css";

export default function FourDotsLoader({ label = "Loading…" }: { label?: string }) {
  return <div data-four-dots-loader className={styles.loader} role="status" aria-live="polite">
    <span className={styles.orbit} aria-hidden="true"><i /><i /><i /><i /></span>
    <span className={styles.label}>{label}</span>
  </div>;
}
