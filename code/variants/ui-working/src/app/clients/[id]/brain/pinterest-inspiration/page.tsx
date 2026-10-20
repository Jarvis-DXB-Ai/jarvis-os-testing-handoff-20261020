import PinterestInspirationWorkspace from './pinterest-inspiration-workspace'

export default async function PinterestInspirationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <PinterestInspirationWorkspace clientId={id} />
}
