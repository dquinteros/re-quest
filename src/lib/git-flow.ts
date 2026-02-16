export interface FlowRule {
  sourcePattern: string;
  allowedTargets: string[];
}

export interface FlowViolation {
  headRef: string;
  baseRef: string;
  expectedTargets: string[];
  message: string;
}

export type FlowPhase =
  | "Development"
  | "QA Fix"
  | "Promotion"
  | "Unknown";

export const DEFAULT_FLOW_RULES: FlowRule[] = [
  { sourcePattern: "feat/*", allowedTargets: ["dev"] },
  { sourcePattern: "fix/*", allowedTargets: ["snap/*"] },
  { sourcePattern: "snap/*", allowedTargets: ["main"] },
];

/**
 * Match a branch name against a glob-style pattern.
 * Supports a single trailing `*` wildcard after a `/` prefix,
 * e.g. `feat/*` matches `feat/login-google` and `feat/deep/nested`.
 * An exact string matches only itself.
 */
export function matchesBranchPattern(branch: string, pattern: string): boolean {
  if (pattern === "*") {
    return true;
  }

  if (!pattern.includes("*")) {
    return branch === pattern;
  }

  const starIndex = pattern.indexOf("*");
  const prefix = pattern.slice(0, starIndex);

  if (pattern.endsWith("*")) {
    return branch.startsWith(prefix) && branch.length > prefix.length;
  }

  return branch === pattern;
}

/**
 * Validate a PR's source → target branch combination against a set of flow rules.
 * Returns a FlowViolation if a matching rule exists and the target is not allowed,
 * or null if compliant (or if no rule matches the source branch).
 */
export function validatePrFlow(
  headRef: string,
  baseRef: string,
  rules: FlowRule[],
): FlowViolation | null {
  for (const rule of rules) {
    if (!matchesBranchPattern(headRef, rule.sourcePattern)) {
      continue;
    }

    const targetAllowed = rule.allowedTargets.some((target) =>
      matchesBranchPattern(baseRef, target),
    );

    if (targetAllowed) {
      return null;
    }

    return {
      headRef,
      baseRef,
      expectedTargets: rule.allowedTargets,
      message: `Branch "${headRef}" should target ${rule.allowedTargets.map((t) => `"${t}"`).join(" or ")}, but targets "${baseRef}"`,
    };
  }

  return null;
}

/**
 * Determine the flow phase for a PR based on its branch names.
 */
export function getFlowPhase(headRef: string, baseRef: string): FlowPhase {
  if (matchesBranchPattern(headRef, "feat/*") && baseRef === "dev") {
    return "Development";
  }

  if (matchesBranchPattern(headRef, "fix/*") && matchesBranchPattern(baseRef, "snap/*")) {
    return "QA Fix";
  }

  if (matchesBranchPattern(headRef, "snap/*") && baseRef === "main") {
    return "Promotion";
  }

  return "Unknown";
}

/**
 * Parse a JSON value into a validated array of FlowRule objects.
 * Returns the default rules if the input is invalid.
 */
export function parseFlowRules(value: unknown): FlowRule[] {
  if (!Array.isArray(value)) {
    return DEFAULT_FLOW_RULES;
  }

  const rules: FlowRule[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") continue;

    const record = item as Record<string, unknown>;

    if (typeof record.sourcePattern !== "string") continue;
    if (!Array.isArray(record.allowedTargets)) continue;

    const allowedTargets = record.allowedTargets.filter(
      (t): t is string => typeof t === "string",
    );

    if (allowedTargets.length === 0) continue;

    rules.push({
      sourcePattern: record.sourcePattern,
      allowedTargets,
    });
  }

  return rules.length > 0 ? rules : DEFAULT_FLOW_RULES;
}
