import styles from '@/components/clients/client-assets-library.module.css';
export default function Loading() {
  return <section className={styles.shell} aria-busy="true"><h2>Loading assets…</h2><div className={styles.grid}>{[0,1,2].map(i => <div key={i} className={styles.card}><div className={styles.preview} /><p>Loading reference…</p></div>)}</div></section>;
}
