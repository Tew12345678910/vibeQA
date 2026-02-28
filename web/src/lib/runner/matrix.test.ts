import { describe, expect, it } from "vitest";

import { DEFAULT_VIEWPORTS, expandRunCaseMatrix } from "./matrix";

describe("expandRunCaseMatrix", () => {
  it("creates exactly 2 run-cases per test case by default", () => {
    const rows = expandRunCaseMatrix([101, 102, 103], DEFAULT_VIEWPORTS);
    expect(rows).toHaveLength(6);
    expect(rows.filter((row) => row.testCaseId === 101)).toHaveLength(2);
  });
});
