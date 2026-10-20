import Sidebar from '@/components/layout/sidebar'
import { FinanceWorkspace } from '@/components/finance/finance-workspace'
import { loadFinanceSnapshot } from '@/lib/finance-costs-server'

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month } = await searchParams
  return <><Sidebar /><FinanceWorkspace initialSnapshot={await loadFinanceSnapshot(month)} /></>
}
