import Link from 'next/link';
import styles from './client-action.module.css';
import type { ComponentProps, ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary';
const classes = (variant: Variant, className?: string) => `client-workspace-${variant} ${styles.action}${className ? ` ${className}` : ''}`;
/** Use inside client-workspace-shell so the existing client tokens are in scope. */
export function ClientAction({ variant = 'primary', className, type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {variant?: Variant}) {
  return <button type={type} className={classes(variant, className)} {...props} />;
}
export function ClientActionLink({ variant = 'primary', className, ...props }: ComponentProps<typeof Link> & {variant?: Variant}) {
  return <Link className={classes(variant, className)} {...props} />;
}
