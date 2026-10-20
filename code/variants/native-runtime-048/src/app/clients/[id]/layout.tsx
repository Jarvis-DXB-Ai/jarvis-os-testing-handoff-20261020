import ClientWorkspaceShell from "@/components/clients/client-workspace-shell";
import { loadClientWorkspaceChrome } from "@/lib/client-workspace-chrome-server";

export default async function ClientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let initialChrome = null;
  try {
    initialChrome = await loadClientWorkspaceChrome(id);
  } catch {
    // Domain pages retain their own error states when the shared chrome is unavailable.
  }
  return (
    <ClientWorkspaceShell clientId={id} initialChrome={initialChrome}>
      {children}
    </ClientWorkspaceShell>
  );
}
