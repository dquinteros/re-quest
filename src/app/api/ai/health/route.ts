import { getAllBreakerStates } from "@/lib/ai-circuit-breaker";
import { ok, fail } from "@/lib/http";
import {
  AuthenticationError,
  requireAuthenticatedSessionUser,
} from "@/lib/pr-mutations";

/**
 * GET /api/ai/health
 *
 * Returns the current circuit breaker states for all AI features and an
 * overall "healthy" flag.  Useful for monitoring dashboards and for the
 * frontend to proactively disable AI buttons when the service is known
 * to be degraded.
 */
export async function GET(request: Request) {
  let sessionUser;
  try {
    sessionUser = await requireAuthenticatedSessionUser(request);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return fail("Unauthorized", error.message, 401);
    }
    return fail(
      "Failed to authenticate",
      error instanceof Error ? error.message : "Unknown error",
      500,
    );
  }

  // Suppress unused-variable lint — sessionUser confirms authentication
  void sessionUser;

  const breakers = getAllBreakerStates();

  const openCircuits = Object.entries(breakers)
    .filter(([, b]) => b.state === "OPEN")
    .map(([feature]) => feature);

  const healthy = openCircuits.length === 0;

  return ok({
    healthy,
    openCircuits,
    breakers,
    timestamp: new Date().toISOString(),
  });
}
