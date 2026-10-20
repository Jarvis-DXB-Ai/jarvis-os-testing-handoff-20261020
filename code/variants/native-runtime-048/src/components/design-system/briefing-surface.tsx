import type { ComponentPropsWithoutRef } from 'react';
import styles from '@/components/dashboard/home-dashboard-view.module.css';

/** Shared Home surface; caller supplies content and carousel logic inside the Home token scope. */
export function BriefingSurface({children,className,...props}: ComponentPropsWithoutRef<'section'>) {
  return <section className={`${styles.hero}${className ? ` ${className}` : ''}`} {...props}>
    <span aria-hidden className={styles.heroGrain} />
    <span aria-hidden className={styles.heroSheen} />
    <span aria-hidden className={styles.heroEdge} />
    <div className={styles.heroIn}>{children}</div>
  </section>;
}
