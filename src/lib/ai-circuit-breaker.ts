/**
 * In-memory circuit breaker for AI (Codex) calls.
 *
 * States:
 *   CLOSED   – requests pass through normally.
 *   OPEN     – after N consecutive failures, immediately reject new requests
 *              for a cooldown period.
 *   HALF_OPEN – after cooldown, allow one probe request.  If it succeeds the
 *               breaker resets to CLOSED; if it fails, it re-opens.
 *
 * Each AI feature type gets its own independent breaker so that one broken
 * feature doesn't disable others.
 */

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerConfig {
  /** Consecutive failure count that trips the breaker (default 5). */
  failureThreshold: number;
  /** How long the breaker stays open before allowing a probe (ms, default 60s). */
  cooldownMs: number;
}

interface BreakerState {
  state: CircuitState;
  consecutiveFailures: number;
  lastFailureTime: number;
  totalFailures: number;
  totalSuccesses: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  cooldownMs: 60_000,
};

const breakers = new Map<string, BreakerState>();

function getOrCreate(feature: string): BreakerState {
  let b = breakers.get(feature);
  if (!b) {
    b = {
      state: "CLOSED",
      consecutiveFailures: 0,
      lastFailureTime: 0,
      totalFailures: 0,
      totalSuccesses: 0,
    };
    breakers.set(feature, b);
  }
  return b;
}

/**
 * Check whether a request should be allowed through.
 * Throws a descriptive error when the circuit is open.
 */
export function checkCircuit(
  feature: string,
  config: CircuitBreakerConfig = DEFAULT_CONFIG,
): void {
  const b = getOrCreate(feature);

  if (b.state === "CLOSED") return;

  if (b.state === "OPEN") {
    const elapsed = Date.now() - b.lastFailureTime;
    if (elapsed >= config.cooldownMs) {
      b.state = "HALF_OPEN";
      return;
    }
    const remainingSec = Math.ceil((config.cooldownMs - elapsed) / 1000);
    throw new Error(
      `AI service temporarily unavailable for ${feature} (circuit open). ` +
        `Retry in ~${remainingSec}s.`,
    );
  }

  // HALF_OPEN: allow the single probe through
}

/**
 * Record a successful AI call – resets the breaker to CLOSED.
 */
export function recordSuccess(feature: string): void {
  const b = getOrCreate(feature);
  b.consecutiveFailures = 0;
  b.state = "CLOSED";
  b.totalSuccesses += 1;
}

/**
 * Record a failed AI call.  After `failureThreshold` consecutive failures the
 * breaker opens.
 */
export function recordFailure(
  feature: string,
  config: CircuitBreakerConfig = DEFAULT_CONFIG,
): void {
  const b = getOrCreate(feature);
  b.consecutiveFailures += 1;
  b.lastFailureTime = Date.now();
  b.totalFailures += 1;

  if (b.state === "HALF_OPEN") {
    b.state = "OPEN";
    return;
  }

  if (b.consecutiveFailures >= config.failureThreshold) {
    b.state = "OPEN";
  }
}

/**
 * Returns a snapshot of all breaker states (useful for health checks).
 */
export function getAllBreakerStates(): Record<
  string,
  {
    state: CircuitState;
    consecutiveFailures: number;
    totalFailures: number;
    totalSuccesses: number;
  }
> {
  const result: Record<
    string,
    {
      state: CircuitState;
      consecutiveFailures: number;
      totalFailures: number;
      totalSuccesses: number;
    }
  > = {};
  for (const [feature, b] of breakers) {
    result[feature] = {
      state: b.state,
      consecutiveFailures: b.consecutiveFailures,
      totalFailures: b.totalFailures,
      totalSuccesses: b.totalSuccesses,
    };
  }
  return result;
}

/**
 * Reset a specific breaker (useful for testing or manual recovery).
 */
export function resetBreaker(feature: string): void {
  breakers.delete(feature);
}
