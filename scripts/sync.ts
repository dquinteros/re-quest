import { runSync } from "../src/lib/sync-service";

function parseLoginFlag(argv: string[]): string | undefined {
  const inline = argv.find((arg) => arg.startsWith("--login="));
  if (inline) {
    const value = inline.slice("--login=".length).trim();
    return value || undefined;
  }

  const index = argv.indexOf("--login");
  if (index >= 0) {
    const nextValue = argv[index + 1]?.trim();
    return nextValue || undefined;
  }

  return undefined;
}

async function main() {
  const trigger = process.argv.includes("--manual") ? "MANUAL" : "POLL";
  const login = parseLoginFlag(process.argv);
  const result = await runSync({ trigger, ...(login ? { login } : {}) });

  console.log(
    JSON.stringify(
      {
        runId: result.runId,
        trigger: result.trigger,
        status: result.status,
        pulledCount: result.pulledCount,
        upsertedCount: result.upsertedCount,
        errorCount: result.errorCount,
        startedAt: result.startedAt,
        finishedAt: result.finishedAt,
        viewerLogin: result.viewerLogin,
      },
      null,
      2,
    ),
  );

  if (result.errorCount > 0) {
    for (const issue of result.errors) {
      console.error(
        `[sync-error] ${issue.repository}${
          issue.pullNumber ? `#${issue.pullNumber}` : ""
        }: ${issue.message}`,
      );
    }
  }
}

main().catch((error) => {
  console.error(
    `[sync-failed] ${error instanceof Error ? error.message : "Unknown sync error"}`,
  );
  process.exit(1);
});
