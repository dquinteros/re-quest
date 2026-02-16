import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/auth";
import { FlowConfigPage } from "@/components/flow-config-page";

export default async function FlowConfigRoute() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/");
  }

  return (
    <FlowConfigPage
      viewerLabel={session.user.login ?? session.user.name ?? null}
    />
  );
}
