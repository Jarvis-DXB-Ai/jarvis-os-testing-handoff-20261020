import AgencyContentWorkspace from "@/components/content/agency-content-workspace";
import { loadAgencyContentData } from "@/lib/agency-content-server";

export const dynamic = "force-dynamic";

export default async function SocialMediaWorkspacePage() {
  const data = await loadAgencyContentData();
  return <AgencyContentWorkspace data={data} />;
}
