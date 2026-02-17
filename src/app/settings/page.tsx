import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/auth";
import { SettingsPage } from "@/components/settings-page";

export default async function SettingsRoute() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/");
  }

  return (
    <SettingsPage
      viewerLabel={session.user.login ?? session.user.name ?? null}
    />
  );
}
