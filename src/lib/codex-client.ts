import { spawn } from "node:child_process";
import { writeFile, unlink, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DEFAULT_TIMEOUT_MS = 120_000;

export interface CodexResult<T> {
  raw: string;
  parsed: T | null;
  exitCode: number;
  error?: string;
}

export interface CodexExecOptions {
  prompt: string;
  /** JSON Schema string for structured output via --output-schema */
  outputSchema?: string;
  /** Timeout in milliseconds (default 120s) */
  timeout?: number;
  /** Working directory for the codex process */
  cwd?: string;
  /** Additional context written to a temp file and referenced in the prompt */
  contextContent?: string;
  /** Filename for the context temp file (default: context.txt) */
  contextFilename?: string;
  /** Model name to pass via --model flag (e.g. "o4-mini", "o3") */
  model?: string;
}

/**
 * Resolves the path to the codex CLI binary.
 * Respects CODEX_CLI_PATH env var, defaults to "codex".
 */
function getCodexBin(): string {
  return process.env.CODEX_CLI_PATH || "codex";
}

function getTimeoutMs(): number {
  const envTimeout = process.env.CODEX_TIMEOUT_MS;
  if (envTimeout) {
    const parsed = Number(envTimeout);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_TIMEOUT_MS;
}

/**
 * Spawns `codex exec` in non-interactive mode with structured output support.
 * Context is passed via a temp file to avoid shell escaping issues.
 * Progress streams to stderr; final result goes to stdout.
 */
export async function runCodex<T = string>(
  options: CodexExecOptions,
): Promise<CodexResult<T>> {
  const timeoutMs = options.timeout ?? getTimeoutMs();
  const codexBin = getCodexBin();
  let tempDir: string | null = null;
  let contextFilePath: string | null = null;

  let schemaFilePath: string | null = null;

  try {
    let prompt = options.prompt;

    if (options.contextContent) {
      tempDir = await mkdtemp(join(tmpdir(), "codex-ctx-"));
      const filename = options.contextFilename ?? "context.txt";
      contextFilePath = join(tempDir, filename);
      await writeFile(contextFilePath, options.contextContent, "utf-8");
      prompt = `${prompt}\n\nThe context data is in the file: ${contextFilePath}`;
    }

    const args = ["exec"];

    args.push("--sandbox", "read-only");
    args.push("--full-auto");

    if (options.model) {
      args.push("--model", options.model);
    }

    if (options.outputSchema) {
      if (!tempDir) {
        tempDir = await mkdtemp(join(tmpdir(), "codex-ctx-"));
      }
      schemaFilePath = join(tempDir, "output-schema.json");
      await writeFile(schemaFilePath, options.outputSchema, "utf-8");
      args.push("--output-schema", schemaFilePath);
    }

    args.push(prompt);

    const result = await spawnCodex(codexBin, args, {
      timeoutMs,
      cwd: options.cwd,
    });

    let parsed: T | null = null;
    if (options.outputSchema && result.stdout.trim()) {
      try {
        parsed = JSON.parse(result.stdout.trim()) as T;
      } catch {
        // If output-schema was requested but parsing fails, try to extract JSON
        const jsonMatch = result.stdout.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            parsed = JSON.parse(jsonMatch[0]) as T;
          } catch {
            // Leave parsed as null
          }
        }
      }
    }

    return {
      raw: result.stdout,
      parsed,
      exitCode: result.exitCode,
      error: result.exitCode !== 0 ? result.stderr || `codex exited with code ${result.exitCode}` : undefined,
    };
  } finally {
    if (contextFilePath) {
      await unlink(contextFilePath).catch(() => {});
    }
    if (schemaFilePath) {
      await unlink(schemaFilePath).catch(() => {});
    }
    if (tempDir) {
      const { rm } = await import("node:fs/promises");
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function spawnCodex(
  bin: string,
  args: string[],
  options: { timeoutMs: number; cwd?: string },
): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd: options.cwd,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill("SIGTERM");
        setTimeout(() => child.kill("SIGKILL"), 5000);
        resolve({ stdout, stderr: stderr + "\n[codex timeout]", exitCode: 124 });
      }
    }, options.timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ stdout, stderr, exitCode: code ?? 1 });
      }
    });

    child.on("error", (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error(`Failed to start codex: ${err.message}`));
      }
    });
  });
}

/**
 * Convenience: run codex expecting a JSON result matching the given schema.
 * Returns the parsed object or throws.
 */
export async function runCodexJson<T>(
  options: Omit<CodexExecOptions, "outputSchema"> & { outputSchema: string },
): Promise<T> {
  const result = await runCodex<T>(options);

  if (result.exitCode !== 0) {
    throw new Error(result.error ?? `Codex exited with code ${result.exitCode}`);
  }

  if (result.parsed === null) {
    throw new Error(`Codex returned unparseable output: ${result.raw.slice(0, 500)}`);
  }

  return result.parsed;
}
