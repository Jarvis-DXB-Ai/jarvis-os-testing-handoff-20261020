import Sidebar from "@/components/layout/sidebar"
import styles from "@/components/agents/organisation-structure.module.css"
export default function OrganisationLoading() {
 return <><Sidebar /><main className={styles.shell} aria-busy="true"><h1>Organisation Structure</h1><p>Loading departments and roles…</p><div className={styles.layout}><div>{Array.from({ length: 8 }, (_, i) => <div key={i} className={styles.panel} style={{ minHeight: 78 }} />)}</div><div className={styles.panel} style={{ minHeight: 480 }} /></div></main></>
}
