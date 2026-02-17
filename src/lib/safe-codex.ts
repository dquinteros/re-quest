/**
 * Safe wrapper around codex-client that adds circuit breaker protection.
 *
 * Flow:  checkCircuit → runCodex/runCodexJson (with built-in retry) → record result
 *
 * All AI API routes should use these safe wrappers instead of calling
 * runCodex / runCodexJson directly.
 */

import {
  checkCircuit,
  recordSuccess,
  recordFailure,
  type CircuitBreakerConfig,
} from "./ai-circuit-breaker";
import {
  runCodex,
  runCodexJson,
  type CodexExecOptions,
  type CodexResult,
} from "./codex-client";

export interface SafeCodexOptions {
  /** Feature key used for circuit breaker tracking (e.g. "ai_summary") */
  feature: string;
  /** Override default circuit breaker thresholds */
  circuitConfig?: CircuitBreakerConfig;
}

/**
 * Safe version of `runCodex` – checks the circuit breaker before executing
 * and records success/failure after completion.
 */
export async function safeRunCodex<T = string>(
  options: CodexExecOptions,
  safe: SafeCodexOptions,
): Promise<CodexResult<T>> {
  checkCircuit(safe.feature, safe.circuitConfig);

  try {
    const result = await runCodex<T>(options);

    if (result.exitCode === 0) {
      recordSuccess(safe.feature);
    } else {
      recordFailure(safe.feature, safe.circuitConfig);
    }

    return result;
  } catch (error) {
    recordFailure(safe.feature, safe.circuitConfig);
    throw error;
  }
}

/**
 * Safe version of `runCodexJson` – checks the circuit breaker before executing
 * and records success/failure after completion.
 */
export async function safeRunCodexJson<T>(
  options: Omit<CodexExecOptions, "outputSchema"> & {
    outputSchema: string;
    validate?: (data: unknown) => T;
  },
  safe: SafeCodexOptions,
): Promise<T> {
  checkCircuit(safe.feature, safe.circuitConfig);

  try {
    const result = await runCodexJson<T>(options);
    recordSuccess(safe.feature);
    return result;
  } catch (error) {
    recordFailure(safe.feature, safe.circuitConfig);
    throw error;
  }
}
