import { describe, expect, it } from "vitest";
import {
  checklistProgress,
  describeRule,
  displayStatus,
  evidenceFileName,
  evidencePath,
  evidenceProblem,
  nextItem,
  type ChecklistItem,
} from "./checklist";

const item = (over: Partial<ChecklistItem>): ChecklistItem => ({
  id: "i",
  code: "EPF_REGISTRATION",
  title: "x",
  sort_order: 10,
  due_rule: null,
  due_date: null,
  status: "not_started",
  evidence_file_path: null,
  completed_at: null,
  ...over,
});

describe("checklist progress", () => {
  it("counts done items out of the ones that apply", () => {
    const items = [
      item({ status: "done" }),
      item({ status: "in_progress" }),
      item({ status: "not_applicable" }),
      item({}),
    ];
    expect(checklistProgress(items)).toEqual({ done: 1, total: 3 });
  });

  it("shows overdue only for open items past their due date", () => {
    const today = "2026-12-10";
    expect(displayStatus(item({ due_date: "2026-12-09" }), today)).toBe(
      "overdue",
    );
    expect(displayStatus(item({ due_date: "2026-12-10" }), today)).toBe(
      "not_started",
    );
    expect(
      displayStatus(item({ due_date: "2026-12-01", status: "done" }), today),
    ).toBe("done");
    expect(
      displayStatus(item({ due_date: null, status: "in_progress" }), today),
    ).toBe("in_progress");
  });

  it("picks the next item by due date, undated last", () => {
    const items = [
      item({ id: "a", due_date: null, sort_order: 1 }),
      item({ id: "b", due_date: "2026-12-31", sort_order: 2 }),
      item({ id: "c", due_date: "2026-12-08", sort_order: 3 }),
      item({ id: "d", due_date: "2026-12-01", status: "done", sort_order: 4 }),
    ];
    expect(nextItem(items)?.id).toBe("c");
    expect(nextItem([item({ status: "done" })])).toBeNull();
  });
});

describe("deadline rules", () => {
  it("reads the rule the database stores", () => {
    expect(describeRule("first_hire+7")).toEqual({
      anchor: "first_hire",
      days: 7,
    });
    expect(describeRule("first_payday-7")).toEqual({
      anchor: "first_payday",
      days: -7,
    });
    expect(describeRule(null)).toBeNull();
  });
});

describe("evidence files", () => {
  it("only accepts PDF, JPEG and PNG up to 10 MB", () => {
    expect(evidenceProblem({ size: 1000, type: "application/pdf" })).toBeNull();
    expect(evidenceProblem({ size: 1000, type: "image/heic" })).toBe(
      "fileType",
    );
    expect(evidenceProblem({ size: 11 * 1024 * 1024, type: "image/png" })).toBe(
      "fileTooBig",
    );
  });

  it("stores files in the company folder with a safe name", () => {
    const path = evidencePath("t1", "i1", "KWSP Borang (A).PDF", 1700000000000);
    expect(path).toBe("t1/setup-checklist/i1/1700000000000-KWSP-Borang-A.pdf");
    expect(evidenceFileName(path)).toBe("KWSP-Borang-A.pdf");
    // Path tricks never leave the item's folder.
    expect(evidencePath("t1", "i1", "../../x", 1)).toBe(
      "t1/setup-checklist/i1/1-evidence",
    );
  });
});
