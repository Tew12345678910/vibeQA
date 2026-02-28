import { describe, expect, it } from "vitest";

import { mapBrowserUseLifecycleToRunCaseStatus } from "./mapper";

describe("mapBrowserUseLifecycleToRunCaseStatus", () => {
  it("maps terminal and non-terminal statuses", () => {
    expect(mapBrowserUseLifecycleToRunCaseStatus("created")).toBe("pending");
    expect(mapBrowserUseLifecycleToRunCaseStatus("running")).toBe("running");
    expect(mapBrowserUseLifecycleToRunCaseStatus("finished")).toBe("passed");
    expect(mapBrowserUseLifecycleToRunCaseStatus("failed")).toBe("failed");
    expect(mapBrowserUseLifecycleToRunCaseStatus("paused")).toBe("failed");
    expect(mapBrowserUseLifecycleToRunCaseStatus("stopped")).toBe("failed");
  });
});
