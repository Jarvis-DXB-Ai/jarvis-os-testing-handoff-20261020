import { ClientAssetsLibrary } from '@/components/clients/client-assets-library';
import { loadClientAssetsLibrary } from '@/lib/client-assets-library-server';
export default async function ClientAssetsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ClientAssetsLibrary key={id} clientId={id} initial={await loadClientAssetsLibrary(id)} />;
}
