import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";

interface CliOptions {
  command?: string;
  label: string;
  repeat: number;
  output: string;
}

interface BenchmarkSummary {
  timestamp: string;
  label: string;
  command: string;
  repeat: number;
  samplesMs: number[];
  averageMs: number;
  minMs: number;
  maxMs: number;
  exitCode: number;
}

function printHelp() {
  console.log(`Usage:
  npx tsx scripts/benchmark-ux-harness.ts --label before --repeat 5 --command "npm run test -- src/tests/home-auth-smoke.test.ts"

Options:
  --label <name>      Run label shown in logs/table rows (default: run)
  --repeat <count>    Number of timed runs (default: 3)
  --command <string>  Command to benchmark. If omitted, only a manual template is printed.
  --output <path>     JSONL output file (default: scripts/benchmark-results.jsonl)
  --help              Show this help text
`);
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    label: "run",
    repeat: 3,
    output: "scripts/benchmark-results.jsonl",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--help") {
      printHelp();
      process.exit(0);
    }

    if (argument === "--label") {
      options.label = argv[index + 1] ?? options.label;
      index += 1;
      continue;
    }

    if (argument === "--repeat") {
      const parsed = Number(argv[index + 1]);
      if (!Number.isFinite(parsed) || parsed < 1) {
        throw new Error("--repeat must be a positive number.");
      }

      options.repeat = Math.floor(parsed);
      index += 1;
      continue;
    }

    if (argument === "--command") {
      options.command = argv[index + 1];
      index += 1;
      continue;
    }

    if (argument === "--output") {
      options.output = argv[index + 1] ?? options.output;
      index += 1;
      continue;
    }
  }

  return options;
}

function formatRow(summary: BenchmarkSummary): string {
  return `| ${summary.timestamp} | ${summary.label} | ${summary.command} | ${summary.repeat} | ${summary.averageMs.toFixed(2)} | ${summary.minMs.toFixed(2)} | ${summary.maxMs.toFixed(2)} |`;
}

function printManualTemplate(defaultLabel: string) {
  console.log("Manual timing template:");
  console.log("| timestamp | label | command | repeat | avg_ms | min_ms | max_ms |");
  console.log("| --- | --- | --- | --- | --- | --- | --- |");
  console.log(`| <iso-time> | ${defaultLabel} | <command> | <count> | <avg> | <min> | <max> |`);
}

function runTimedCommand(command: string): { durationMs: number; exitCode: number } {
  const start = performance.now();
  const result = spawnSync(command, {
    shell: true,
    stdio: "inherit",
    env: process.env,
  });
  const durationMs = performance.now() - start;

  return {
    durationMs,
    exitCode: result.status ?? 1,
  };
}

function summarizeRuns(
  label: string,
  command: string,
  repeat: number,
  samplesMs: number[],
  exitCode: number,
): BenchmarkSummary {
  const averageMs = samplesMs.reduce((total, value) => total + value, 0) / samplesMs.length;
  const minMs = Math.min(...samplesMs);
  const maxMs = Math.max(...samplesMs);

  return {
    timestamp: new Date().toISOString(),
    label,
    command,
    repeat,
    samplesMs,
    averageMs,
    minMs,
    maxMs,
    exitCode,
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (!options.command) {
    printManualTemplate(options.label);
    return;
  }

  const samplesMs: number[] = [];
  let lastExitCode = 0;

  console.log(`Benchmarking "${options.command}" (${options.repeat} run${options.repeat === 1 ? "" : "s"})`);
  for (let runIndex = 0; runIndex < options.repeat; runIndex += 1) {
    console.log(`\nRun ${runIndex + 1}/${options.repeat}`);
    const run = runTimedCommand(options.command);
    samplesMs.push(run.durationMs);
    lastExitCode = run.exitCode;
    console.log(`Duration: ${run.durationMs.toFixed(2)}ms`);

    if (lastExitCode !== 0) {
      console.log(`Command exited with non-zero code (${lastExitCode}). Stopping early.`);
      break;
    }
  }

  const summary = summarizeRuns(
    options.label,
    options.command,
    samplesMs.length,
    samplesMs,
    lastExitCode,
  );

  const outputPath = resolve(process.cwd(), options.output);
  appendFileSync(outputPath, `${JSON.stringify(summary)}\n`, "utf8");

  console.log("\nSummary row:");
  console.log("| timestamp | label | command | repeat | avg_ms | min_ms | max_ms |");
  console.log("| --- | --- | --- | --- | --- | --- | --- |");
  console.log(formatRow(summary));
  console.log(`\nSaved JSON summary to ${outputPath}`);

  if (lastExitCode !== 0) {
    process.exit(lastExitCode);
  }
}

main();
