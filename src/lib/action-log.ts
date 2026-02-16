import type { ActionResultStatus, ActionType, Prisma } from "@prisma/client";
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

export async function writeActionLog(input: ActionLogInput): Promise<void> {
  await prisma.actionLog.create({
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
}
