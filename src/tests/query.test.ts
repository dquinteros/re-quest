import { parseInboxQuery } from "@/lib/query";
import { describe, expect, it } from "vitest";

describe("parseInboxQuery", () => {
  it("uses defaults when no params are supplied", () => {
    const parsed = parseInboxQuery(new URLSearchParams());

    expect(parsed).toEqual({
      q: "",
      repo: [],
      author: [],
      state: [],
      reviewState: [],
      ciState: [],
      label: [],
      assignee: [],
      draft: "all",
      flowViolation: "",
      updatedFrom: undefined,
      updatedTo: undefined,
      sort: "urgency",
      page: 1,
      pageSize: 30,
    });
  });

  it("splits csv filters and trims spacing", () => {
    const params = new URLSearchParams({
      repo: "org/api, org/web",
      author: "alice, bob",
      label: "backend, urgent",
      assignee: "alice ,carol",
      reviewState: "REVIEW_REQUESTED,CHANGES_REQUESTED",
      ciState: "FAILURE,PENDING",
      draft: "false",
      sort: "updated_desc",
      page: "2",
      pageSize: "50",
    });

    const parsed = parseInboxQuery(params);

    expect(parsed.repo).toEqual(["org/api", "org/web"]);
    expect(parsed.author).toEqual(["alice", "bob"]);
    expect(parsed.label).toEqual(["backend", "urgent"]);
    expect(parsed.assignee).toEqual(["alice", "carol"]);
    expect(parsed.reviewState).toEqual(["REVIEW_REQUESTED", "CHANGES_REQUESTED"]);
    expect(parsed.ciState).toEqual(["FAILURE", "PENDING"]);
    expect(parsed.draft).toBe("false");
    expect(parsed.sort).toBe("updated_desc");
    expect(parsed.page).toBe(2);
    expect(parsed.pageSize).toBe(50);
  });

  it("coerces invalid enum list items with zod catch", () => {
    const params = new URLSearchParams({
      state: "OPEN,NOPE",
      reviewState: "BAD_REVIEW",
      ciState: "BROKEN",
    });

    const parsed = parseInboxQuery(params);

    expect(parsed.state).toEqual(["OPEN", "OPEN"]);
    expect(parsed.reviewState).toEqual(["UNREVIEWED"]);
    expect(parsed.ciState).toEqual(["UNKNOWN"]);
  });

  it("throws on invalid sort", () => {
    expect(() => {
      parseInboxQuery(new URLSearchParams({ sort: "not-a-sort" }));
    }).toThrow();
  });

  it("enforces page and pageSize bounds", () => {
    expect(() => {
      parseInboxQuery(new URLSearchParams({ page: "0" }));
    }).toThrow();

    expect(() => {
      parseInboxQuery(new URLSearchParams({ pageSize: "101" }));
    }).toThrow();
  });
});
