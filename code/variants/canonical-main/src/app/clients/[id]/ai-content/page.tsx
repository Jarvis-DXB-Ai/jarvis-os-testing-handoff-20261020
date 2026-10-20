import { redirect } from "next/navigation";

export default async function AiContentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/clients/${id}/ai-content/studio`);
}
