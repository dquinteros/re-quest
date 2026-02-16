import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/auth";
import { InsightsPage } from "@/components/insights-page";

export default async function InsightsRoute() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/");
  }

  return (
    <InsightsPage
      viewerLabel={session.user.login ?? session.user.name ?? null}
    />
  );
}
