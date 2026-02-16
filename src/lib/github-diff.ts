import { Octokit } from "@octokit/rest";

const MAX_DIFF_CHARS = 60_000;

export interface PrDiffContext {
  title: string;
  body: string | null;
  diff: string;
  changedFiles: string[];
  truncated: boolean;
}

/**
 * Fetches the diff for a pull request via the GitHub API.
 * Truncates to MAX_DIFF_CHARS to stay within reasonable context window sizes.
 */
export async function fetchPrDiff(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
): Promise<string> {
  const response = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: pullNumber,
    mediaType: { format: "diff" },
  });

  const diff = response.data as unknown as string;
  return diff;
}

/**
 * Fetches the list of changed files for a pull request.
 */
export async function fetchPrChangedFiles(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
): Promise<string[]> {
  const files = await octokit.rest.pulls.listFiles({
    owner,
    repo,
    pull_number: pullNumber,
    per_page: 100,
  });

  return files.data.map((f) => f.filename);
}

/**
 * Builds a complete context document for Codex, including PR metadata and diff.
 * Truncates the diff if it exceeds the maximum character limit.
 */
export async function buildPrContext(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
  title: string,
  body: string | null,
): Promise<PrDiffContext> {
  const [diff, changedFiles] = await Promise.all([
    fetchPrDiff(octokit, owner, repo, pullNumber),
    fetchPrChangedFiles(octokit, owner, repo, pullNumber),
  ]);

  const truncated = diff.length > MAX_DIFF_CHARS;
  const trimmedDiff = truncated
    ? diff.slice(0, MAX_DIFF_CHARS) + "\n\n[... diff truncated for length ...]"
    : diff;

  return {
    title,
    body,
    diff: trimmedDiff,
    changedFiles,
    truncated,
  };
}

/**
 * Formats PR context into a text document suitable for Codex input.
 */
export function formatPrContextForCodex(ctx: PrDiffContext): string {
  const sections = [
    `# Pull Request: ${ctx.title}`,
    "",
    "## Description",
    ctx.body || "(no description provided)",
    "",
    "## Changed Files",
    ctx.changedFiles.map((f) => `- ${f}`).join("\n"),
    "",
    "## Diff",
    "```diff",
    ctx.diff,
    "```",
  ];

  if (ctx.truncated) {
    sections.push("", "Note: The diff was truncated due to size limits.");
  }

  return sections.join("\n");
}
