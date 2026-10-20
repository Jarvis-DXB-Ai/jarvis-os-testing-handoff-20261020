"use client"
import Sidebar from "@/components/layout/sidebar"
import styles from "@/components/agents/organisation-structure.module.css"
export default function OrganisationError({ reset }: { reset: () => void }) {
 return <><Sidebar /><main className={styles.shell}><h1>Organisation Structure</h1><div className={styles.panel} role="alert"><h2>Couldn’t load the organisation structure</h2><p>The last read did not complete. No partial structure is shown.</p><button onClick={reset}>Try again</button></div></main></>
}
