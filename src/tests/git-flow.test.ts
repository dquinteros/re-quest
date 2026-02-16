import { describe, expect, it } from "vitest";
import {
  matchesBranchPattern,
  validatePrFlow,
  getFlowPhase,
  parseFlowRules,
  DEFAULT_FLOW_RULES,
  type FlowRule,
} from "@/lib/git-flow";

describe("matchesBranchPattern", () => {
  it("matches exact branch names", () => {
    expect(matchesBranchPattern("main", "main")).toBe(true);
    expect(matchesBranchPattern("dev", "dev")).toBe(true);
    expect(matchesBranchPattern("main", "dev")).toBe(false);
  });

  it("matches wildcard patterns like feat/*", () => {
    expect(matchesBranchPattern("feat/login-google", "feat/*")).toBe(true);
    expect(matchesBranchPattern("feat/mejoras-dashboard", "feat/*")).toBe(true);
    expect(matchesBranchPattern("fix/error-login-500", "feat/*")).toBe(false);
  });

  it("matches wildcard patterns like fix/*", () => {
    expect(matchesBranchPattern("fix/error-login-500", "fix/*")).toBe(true);
    expect(matchesBranchPattern("fix/validacion-monto", "fix/*")).toBe(true);
    expect(matchesBranchPattern("feat/login", "fix/*")).toBe(false);
  });

  it("matches wildcard patterns like snap/*", () => {
    expect(matchesBranchPattern("snap/2.4.0", "snap/*")).toBe(true);
    expect(matchesBranchPattern("snap/2.4.1", "snap/*")).toBe(true);
    expect(matchesBranchPattern("dev", "snap/*")).toBe(false);
  });

  it("matches nested branch names with prefix wildcard", () => {
    expect(matchesBranchPattern("feat/ui/button-refactor", "feat/*")).toBe(true);
    expect(matchesBranchPattern("fix/auth/token-expired", "fix/*")).toBe(true);
  });

  it("does not match bare prefix without slash content", () => {
    expect(matchesBranchPattern("feat/", "feat/*")).toBe(false);
    expect(matchesBranchPattern("feat", "feat/*")).toBe(false);
  });

  it("matches catch-all wildcard", () => {
    expect(matchesBranchPattern("anything", "*")).toBe(true);
    expect(matchesBranchPattern("feat/login", "*")).toBe(true);
  });
});

describe("validatePrFlow", () => {
  it("returns null for compliant feat/* -> dev", () => {
    const result = validatePrFlow("feat/login-google", "dev", DEFAULT_FLOW_RULES);
    expect(result).toBeNull();
  });

  it("returns null for compliant fix/* -> snap/*", () => {
    const result = validatePrFlow("fix/error-login-500", "snap/2.4.0", DEFAULT_FLOW_RULES);
    expect(result).toBeNull();
  });

  it("returns null for compliant snap/* -> main", () => {
    const result = validatePrFlow("snap/2.4.0", "main", DEFAULT_FLOW_RULES);
    expect(result).toBeNull();
  });

  it("returns violation for feat/* -> main", () => {
    const result = validatePrFlow("feat/login-google", "main", DEFAULT_FLOW_RULES);
    expect(result).not.toBeNull();
    expect(result!.expectedTargets).toEqual(["dev"]);
    expect(result!.baseRef).toBe("main");
    expect(result!.message).toContain("should target");
  });

  it("returns violation for feat/* -> snap/*", () => {
    const result = validatePrFlow("feat/login-google", "snap/2.4.0", DEFAULT_FLOW_RULES);
    expect(result).not.toBeNull();
    expect(result!.expectedTargets).toEqual(["dev"]);
  });

  it("returns violation for fix/* -> dev", () => {
    const result = validatePrFlow("fix/error-login-500", "dev", DEFAULT_FLOW_RULES);
    expect(result).not.toBeNull();
    expect(result!.expectedTargets).toEqual(["snap/*"]);
  });

  it("returns violation for fix/* -> main", () => {
    const result = validatePrFlow("fix/error-login-500", "main", DEFAULT_FLOW_RULES);
    expect(result).not.toBeNull();
    expect(result!.expectedTargets).toEqual(["snap/*"]);
  });

  it("returns violation for snap/* -> dev", () => {
    const result = validatePrFlow("snap/2.4.0", "dev", DEFAULT_FLOW_RULES);
    expect(result).not.toBeNull();
    expect(result!.expectedTargets).toEqual(["main"]);
  });

  it("returns null for unrecognized source branches (no matching rule)", () => {
    const result = validatePrFlow("release/1.0", "main", DEFAULT_FLOW_RULES);
    expect(result).toBeNull();
  });

  it("works with custom rules", () => {
    const customRules: FlowRule[] = [
      { sourcePattern: "feature/*", allowedTargets: ["develop", "staging"] },
    ];

    expect(validatePrFlow("feature/auth", "develop", customRules)).toBeNull();
    expect(validatePrFlow("feature/auth", "staging", customRules)).toBeNull();

    const violation = validatePrFlow("feature/auth", "main", customRules);
    expect(violation).not.toBeNull();
    expect(violation!.expectedTargets).toEqual(["develop", "staging"]);
  });
});

describe("getFlowPhase", () => {
  it("returns Development for feat/* -> dev", () => {
    expect(getFlowPhase("feat/login-google", "dev")).toBe("Development");
  });

  it("returns QA Fix for fix/* -> snap/*", () => {
    expect(getFlowPhase("fix/error-login-500", "snap/2.4.0")).toBe("QA Fix");
  });

  it("returns Promotion for snap/* -> main", () => {
    expect(getFlowPhase("snap/2.4.0", "main")).toBe("Promotion");
  });

  it("returns Unknown for unrecognized combinations", () => {
    expect(getFlowPhase("feat/login", "main")).toBe("Unknown");
    expect(getFlowPhase("fix/bug", "dev")).toBe("Unknown");
    expect(getFlowPhase("release/1.0", "main")).toBe("Unknown");
    expect(getFlowPhase("main", "dev")).toBe("Unknown");
  });
});

describe("parseFlowRules", () => {
  it("returns default rules for null/undefined", () => {
    expect(parseFlowRules(null)).toEqual(DEFAULT_FLOW_RULES);
    expect(parseFlowRules(undefined)).toEqual(DEFAULT_FLOW_RULES);
  });

  it("returns default rules for non-array values", () => {
    expect(parseFlowRules("string")).toEqual(DEFAULT_FLOW_RULES);
    expect(parseFlowRules(42)).toEqual(DEFAULT_FLOW_RULES);
    expect(parseFlowRules({})).toEqual(DEFAULT_FLOW_RULES);
  });

  it("returns default rules for empty array", () => {
    expect(parseFlowRules([])).toEqual(DEFAULT_FLOW_RULES);
  });

  it("parses valid flow rules", () => {
    const input = [
      { sourcePattern: "feature/*", allowedTargets: ["develop"] },
      { sourcePattern: "hotfix/*", allowedTargets: ["main", "develop"] },
    ];

    expect(parseFlowRules(input)).toEqual(input);
  });

  it("skips invalid entries and returns defaults if nothing valid", () => {
    const input = [
      { sourcePattern: 123, allowedTargets: ["dev"] },
      { sourcePattern: "feat/*", allowedTargets: "not-array" },
      { sourcePattern: "feat/*", allowedTargets: [] },
      null,
      "invalid",
    ];

    expect(parseFlowRules(input)).toEqual(DEFAULT_FLOW_RULES);
  });

  it("filters out non-string targets", () => {
    const input = [
      { sourcePattern: "feat/*", allowedTargets: ["dev", 42, null, "main"] },
    ];

    expect(parseFlowRules(input)).toEqual([
      { sourcePattern: "feat/*", allowedTargets: ["dev", "main"] },
    ]);
  });
});
