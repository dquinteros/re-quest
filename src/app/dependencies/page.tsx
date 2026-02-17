import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/auth";
import { DependenciesPage } from "@/components/dependencies-page";

export default async function DependenciesRoute() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/");
  }

  return (
    <DependenciesPage
      viewerLabel={session.user.login ?? session.user.name ?? null}
    />
  );
}
