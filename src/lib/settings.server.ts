import { prisma } from "@/lib/db";
import type { AppSettings } from "@/lib/settings";
import { normalizeAppSettings, DEFAULT_APP_SETTINGS } from "@/lib/settings";

export async function getUserSettings(userId: string): Promise<AppSettings> {
  const row = await prisma.userSettings.findUnique({
    where: { userId },
    select: { settings: true },
  });

  if (!row) {
    return { ...DEFAULT_APP_SETTINGS };
  }

  return normalizeAppSettings(row.settings);
}

export async function upsertUserSettings(
  userId: string,
  settings: AppSettings,
): Promise<AppSettings> {
  const normalized = normalizeAppSettings(settings);
  const data = JSON.parse(JSON.stringify(normalized));

  await prisma.userSettings.upsert({
    where: { userId },
    create: { userId, settings: data },
    update: { settings: data },
  });

  return normalized;
}
