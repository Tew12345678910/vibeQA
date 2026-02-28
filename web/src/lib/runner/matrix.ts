export type Viewport = {
  key: string;
  label: string;
  width: number;
  height: number;
  enabled: boolean;
};

export const DEFAULT_VIEWPORTS: Viewport[] = [
  { key: "desktop", label: "Desktop", width: 1440, height: 900, enabled: true },
  { key: "mobile", label: "Mobile", width: 390, height: 844, enabled: true },
];

export function expandRunCaseMatrix(testCaseIds: number[], viewports: Viewport[]): Array<{
  testCaseId: number;
  viewportKey: string;
}> {
  const enabled = viewports.filter((viewport) => viewport.enabled);
  const out: Array<{ testCaseId: number; viewportKey: string }> = [];

  for (const testCaseId of testCaseIds) {
    for (const viewport of enabled) {
      out.push({ testCaseId, viewportKey: viewport.key });
    }
  }

  return out;
}
