import Link from 'next/link';
import Sidebar from '@/components/layout/sidebar';
import styles from './start.module.css';

export const metadata = {title: 'Start here · Jarvis Office'};

const steps = [
  {number: '01', title: 'Set up the client', text: 'Add the client, attach source material to its Brain, and confirm the service scope. Keep facts, references and owner approvals distinct.', href: '/clients/new', action: 'Onboard a client'},
  {number: '02', title: 'Give the COO one clear task', text: 'Open the client’s Office. Describe the outcome, source material and acceptance criteria. Ask for a draft; the COO assigns the relevant departments.', href: '/office', action: 'Open Office'},
  {number: '03', title: 'Review what was actually made', text: 'Inspect the saved output and its evidence. Check the artifact, source versions and QA findings. A completed model call is separate from accepted work.', href: '/office', action: 'Review work in Office'},
  {number: '04', title: 'Request an exact correction', text: 'Name the part, the observed problem and the change you need. Keep correct work intact, then review the revised artifact before approving its use.', href: '/office', action: 'Continue the task'},
] as const;

export default function OfficeStartPage() {
  return <>
    <Sidebar variant="office" />
    <main className={styles.page}>
      <div className={styles.content}>
        <header className={styles.header}>
          <Link href="/office" className={styles.wordmark}>JARVIS <span>OFFICE</span></Link>
          <span className={styles.pilot}>Private pilot</span>
        </header>
        <section className={styles.intro} aria-labelledby="start-title">
          <p className={styles.eyebrow}>START HERE</p>
          <h1 id="start-title">One brief.<br />A clear path to review.</h1>
          <p className={styles.lead}>Set the context, give the COO a useful task, and review the work before it goes further.</p>
          <nav className={styles.actions} aria-label="Choose where to start">
            <Link className={styles.primary} href="/clients">Choose a client <span aria-hidden="true">↗</span></Link>
            <Link className={styles.secondary} href="/office/demo">Explore the demo <span aria-hidden="true">→</span></Link>
          </nav>
          <p className={styles.hint}>Office currently opens the existing DemoClientA workspace. The demo is a simulation.</p>
        </section>
        <ol className={styles.steps} aria-label="Your first Office task">
          {steps.map(step => <li key={step.number} className={styles.step}>
            <span className={styles.number} aria-hidden="true">{step.number}</span>
            <div><h2>{step.title}</h2><p>{step.text}</p><Link href={step.href}>{step.action} <span aria-hidden="true">→</span></Link></div>
          </li>)}
        </ol>
        <aside className={styles.limits} aria-labelledby="pilot-title">
          <div><p className={styles.eyebrow}>BEFORE YOU BEGIN</p><h2 id="pilot-title">Review stays with you.</h2></div>
          <div className={styles.notes}>
            <p>QA findings and draft readiness are separate from your approval. Sending, publishing and spend need their own exact authorization.</p>
            <p>Automatic WhatsApp routing is currently inactive. Registered roles and verified methods do not mean every role has passed a real task; the complete new native workflow remains unproven.</p>
            <p>Subscription or tool availability may hold a request. Check the current status in <Link href="/office">Office</Link> before starting.</p>
          </div>
        </aside>
        <footer className={styles.footer}><span>Context → task → evidence → your decision</span><Link href="/office">Enter Office <span aria-hidden="true">↗</span></Link></footer>
      </div>
    </main>
  </>;
}
