import { z } from "zod";

function listParam(value: string | null): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

const schema = z.object({
  q: z.string().optional().default(""),
  repo: z.array(z.string()).default([]),
  author: z.array(z.string()).default([]),
  state: z.array(z.enum(["OPEN", "CLOSED", "MERGED"]).catch("OPEN")).default([]),
  reviewState: z
    .array(
      z
        .enum([
          "REVIEW_REQUESTED",
          "APPROVED",
          "CHANGES_REQUESTED",
          "COMMENTED",
          "UNREVIEWED",
          "DRAFT",
        ])
        .catch("UNREVIEWED"),
    )
    .default([]),
  ciState: z
    .array(z.enum(["SUCCESS", "FAILURE", "PENDING", "UNKNOWN"]).catch("UNKNOWN"))
    .default([]),
  label: z.array(z.string()).default([]),
  assignee: z.array(z.string()).default([]),
  draft: z.enum(["true", "false", "all"]).default("all"),
  updatedFrom: z.string().optional(),
  updatedTo: z.string().optional(),
  sort: z
    .enum(["urgency", "updated_desc", "updated_asc", "created_desc", "created_asc"])
    .default("urgency"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
});

export interface ParsedInboxQuery {
  q: string;
  repo: string[];
  author: string[];
  state: Array<"OPEN" | "CLOSED" | "MERGED">;
  reviewState: Array<
    | "REVIEW_REQUESTED"
    | "APPROVED"
    | "CHANGES_REQUESTED"
    | "COMMENTED"
    | "UNREVIEWED"
    | "DRAFT"
  >;
  ciState: Array<"SUCCESS" | "FAILURE" | "PENDING" | "UNKNOWN">;
  label: string[];
  assignee: string[];
  draft: "true" | "false" | "all";
  updatedFrom?: string;
  updatedTo?: string;
  sort: "urgency" | "updated_desc" | "updated_asc" | "created_desc" | "created_asc";
  page: number;
  pageSize: number;
}

export function parseInboxQuery(searchParams: URLSearchParams): ParsedInboxQuery {
  return schema.parse({
    q: searchParams.get("q") ?? "",
    repo: listParam(searchParams.get("repo")),
    author: listParam(searchParams.get("author")),
    state: listParam(searchParams.get("state")),
    reviewState: listParam(searchParams.get("reviewState")),
    ciState: listParam(searchParams.get("ciState")),
    label: listParam(searchParams.get("label")),
    assignee: listParam(searchParams.get("assignee")),
    draft: searchParams.get("draft") ?? "all",
    updatedFrom: searchParams.get("updatedFrom") ?? undefined,
    updatedTo: searchParams.get("updatedTo") ?? undefined,
    sort: searchParams.get("sort") ?? "urgency",
    page: searchParams.get("page") ?? 1,
    pageSize: searchParams.get("pageSize") ?? 30,
  });
}
