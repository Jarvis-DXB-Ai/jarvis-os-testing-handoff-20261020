import { redirect } from "next/navigation";

export default function AgentRunsPage() {
  redirect("/agents?view=runs");
}
