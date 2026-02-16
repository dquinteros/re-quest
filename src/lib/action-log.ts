import type { ActionLog, ActionResultStatus, ActionType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export interface ActionLogInput {
  actionType: ActionType;
  resultStatus: ActionResultStatus;
  repository: string;
  pullNumber?: number;
  actorLogin?: string | null;
  payload?: Prisma.InputJsonValue;
  errorMessage?: string;
}

export async function writeActionLog(input: ActionLogInput): Promise<string> {
  const entry = await prisma.actionLog.create({
    data: {
      actionType: input.actionType,
      resultStatus: input.resultStatus,
      repository: input.repository,
      pullNumber: input.pullNumber,
      actorLogin: input.actorLogin ?? undefined,
      payload: input.payload,
      errorMessage: input.errorMessage,
    },
  });
  return entry.id;
}

export async function updateActionLogStatus(
  id: string,
  resultStatus: ActionResultStatus,
  errorMessage?: string,
): Promise<void> {
  await prisma.actionLog.update({
    where: { id },
    data: { resultStatus, ...(errorMessage ? { errorMessage } : {}) },
  });
}

export async function getLatestActionLog(
  actionType: ActionType,
  repository: string,
  pullNumber: number,
): Promise<ActionLog | null> {
  return prisma.actionLog.findFirst({
    where: { actionType, repository, pullNumber },
    orderBy: { createdAt: "desc" },
  });
}
