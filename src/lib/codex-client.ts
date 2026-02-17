import { spawn } from "node:child_process";
import { writeFile, unlink, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 2_000;

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
  /** Max retry attempts on transient failures (default 2, total attempts = maxRetries + 1) */
  maxRetries?: number;
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

    const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    const result = await spawnCodexWithRetry(codexBin, args, {
      timeoutMs,
      cwd: options.cwd,
    }, maxRetries);

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Determines whether a spawn failure is transient and worth retrying.
 * Spawn errors (binary not found) are NOT retried.
 * Non-zero exit codes and timeouts ARE retried.
 */
function isTransientSpawnError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("failed to start codex") || msg.includes("enoent")) {
      return false;
    }
  }
  return true;
}

/**
 * Wraps spawnCodex with retry logic using exponential backoff.
 * Only retries on transient errors (non-zero exit code, timeout).
 * Does not retry on spawn failures (binary not found).
 */
async function spawnCodexWithRetry(
  bin: string,
  args: string[],
  options: { timeoutMs: number; cwd?: string },
  maxRetries: number,
): Promise<SpawnResult> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await spawnCodex(bin, args, options);

      // Non-zero exit code is retryable (except on last attempt)
      if (result.exitCode !== 0 && attempt < maxRetries) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        await sleep(delay);
        continue;
      }

      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (!isTransientSpawnError(error) || attempt >= maxRetries) {
        throw lastError;
      }

      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
      await sleep(delay);
    }
  }

  throw lastError ?? new Error("Codex retry exhausted");
}

interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Max bytes to buffer from stdout/stderr to prevent unbounded memory usage. */
const MAX_BUFFER_BYTES = 10 * 1024 * 1024; // 10 MB

function spawnCodex(
  bin: string,
  args: string[],
  options: { timeoutMs: number; cwd?: string },
): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(bin, args, {
        cwd: options.cwd,
        env: { ...process.env },
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      reject(
        new Error(
          `Failed to start codex: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
      return;
    }

    let stdout = "";
    let stderr = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    let killTimer: ReturnType<typeof setTimeout> | null = null;

    function settle() {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
    }

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill("SIGTERM");
        killTimer = setTimeout(() => {
          try {
            child.kill("SIGKILL");
          } catch {
            // Process may already be dead
          }
        }, 5000);
        settle();
        resolve({ stdout, stderr: stderr + "\n[codex timeout]", exitCode: 124 });
      }
    }, options.timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      if (stdoutBytes < MAX_BUFFER_BYTES) {
        const text = chunk.toString();
        stdout += text;
        stdoutBytes += chunk.length;
      }
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      if (stderrBytes < MAX_BUFFER_BYTES) {
        const text = chunk.toString();
        stderr += text;
        stderrBytes += chunk.length;
      }
    });

    child.on("close", (code) => {
      if (!settled) {
        settled = true;
        settle();
        resolve({ stdout, stderr, exitCode: code ?? 1 });
      }
    });

    child.on("error", (err) => {
      if (!settled) {
        settled = true;
        settle();
        reject(new Error(`Failed to start codex: ${err.message}`));
      }
    });
  });
}

/**
 * Convenience: run codex expecting a JSON result matching the given schema.
 * Returns the parsed object or throws.
 *
 * When a `validate` callback is provided, the parsed output is passed through
 * it before being returned.  This enables runtime shape validation (e.g. with
 * Zod) so that malformed AI output is caught here instead of crashing the UI.
 */
export async function runCodexJson<T>(
  options: Omit<CodexExecOptions, "outputSchema"> & {
    outputSchema: string;
    /** Optional runtime validator.  Receives raw-parsed data, should return
     *  validated T or throw with a descriptive message. */
    validate?: (data: unknown) => T;
  },
): Promise<T> {
  const result = await runCodex<T>(options);

  if (result.exitCode !== 0) {
    throw new Error(result.error ?? `Codex exited with code ${result.exitCode}`);
  }

  if (result.parsed === null) {
    throw new Error(`Codex returned unparseable output: ${result.raw.slice(0, 500)}`);
  }

  if (options.validate) {
    return options.validate(result.parsed);
  }

  return result.parsed;
}
