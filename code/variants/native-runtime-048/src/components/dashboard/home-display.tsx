import styles from './home-dashboard-view.module.css';

export function DisplayText({ value }: { value: { kind: string; text?: string } }) {
  switch (value.kind) {
    case 'known': return <>{value.text}</>;
    case 'loading': return <span aria-busy="true">…</span>;
    case 'error': return <span role="alert">{value.text || 'Unavailable'}</span>;
    case 'not_tracked': return <span className={styles.ghostText}>{value.text || 'Not allocated'}</span>;
    case 'unknown': return <span className={styles.ghostText}>{value.text || 'No data'}</span>;
    default: return null;
  }
}

export function ActionButton({ action, onClick, className }: { action: { id: string; label: string; state: string; disabledReason?: string }; onClick?: () => void; className?: string }) {
  if (action.state === 'hidden') return null;
  return (
    <button
      type="button"
      className={className}
      disabled={action.state === 'disabled' || action.state === 'loading'}
      aria-busy={action.state === 'loading'}
      title={action.state === 'disabled' ? action.disabledReason : undefined}
      onClick={onClick}
    >
      {action.state === 'loading' ? '…' : action.label}
    </button>
  );
}

