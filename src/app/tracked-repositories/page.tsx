import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/auth";
import { TrackedRepositoriesPage } from "@/components/tracked-repositories-page";

export default async function TrackedRepositoriesRoute() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/");
  }

  return (
    <TrackedRepositoriesPage
      viewerLabel={session.user.login ?? session.user.name ?? null}
    />
  );
}
