import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/db";
import { requireAuthenticatedUser, UnauthorizedError } from "@/lib/session-auth";
import { parseFlowRules, DEFAULT_FLOW_RULES } from "@/lib/git-flow";

export async function GET(request: Request) {
  try {
    const user = await requireAuthenticatedUser();
    const url = new URL(request.url);
    const repo = url.searchParams.get("repo");

    if (repo) {
      const config = await prisma.flowConfig.findUnique({
        where: {
          userId_repoFullName: {
            userId: user.id,
            repoFullName: repo,
          },
        },
      });

      return ok({
        repoFullName: repo,
        rules: config ? parseFlowRules(config.rules) : DEFAULT_FLOW_RULES,
        isCustom: !!config,
      });
    }

    const configs = await prisma.flowConfig.findMany({
      where: { userId: user.id },
      orderBy: { repoFullName: "asc" },
    });

    return ok({
      configs: configs.map((c) => ({
        repoFullName: c.repoFullName,
        rules: parseFlowRules(c.rules),
        isCustom: true,
      })),
      defaultRules: DEFAULT_FLOW_RULES,
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return fail("Unauthorized", error.message, 401);
    }

    return fail(
      "Failed to load flow config",
      error instanceof Error ? error.message : "Unknown error",
      500,
    );
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireAuthenticatedUser();
    const body = (await request.json()) as Record<string, unknown>;

    const repoFullName = body.repoFullName;
    if (typeof repoFullName !== "string" || !repoFullName.includes("/")) {
      return fail("Invalid repoFullName", "Must be in owner/repo format", 400);
    }

    const rules = parseFlowRules(body.rules);

    const config = await prisma.flowConfig.upsert({
      where: {
        userId_repoFullName: {
          userId: user.id,
          repoFullName,
        },
      },
      create: {
        userId: user.id,
        repoFullName,
        rules: JSON.parse(JSON.stringify(rules)),
      },
      update: {
        rules: JSON.parse(JSON.stringify(rules)),
      },
    });

    return ok({
      repoFullName: config.repoFullName,
      rules: parseFlowRules(config.rules),
      isCustom: true,
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return fail("Unauthorized", error.message, 401);
    }

    return fail(
      "Failed to save flow config",
      error instanceof Error ? error.message : "Unknown error",
      500,
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireAuthenticatedUser();
    const url = new URL(request.url);
    const repo = url.searchParams.get("repo");

    if (!repo) {
      return fail("Missing repo parameter", undefined, 400);
    }

    await prisma.flowConfig.deleteMany({
      where: {
        userId: user.id,
        repoFullName: repo,
      },
    });

    return ok({
      repoFullName: repo,
      rules: DEFAULT_FLOW_RULES,
      isCustom: false,
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return fail("Unauthorized", error.message, 401);
    }

    return fail(
      "Failed to delete flow config",
      error instanceof Error ? error.message : "Unknown error",
      500,
    );
  }
}
