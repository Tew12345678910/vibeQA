import { focusSchema, type Focus } from "@/lib/contracts";

const STORAGE_KEY = "browserqa_suites_v1";
const DEFAULT_FOCUS: Focus[] = [
  "usability",
  "accessibility",
  "security",
  "content",
  "functional",
];

export type SuiteConfig = {
  id: string;
  name: string;
  projectPath: string;
  baseUrl: string;
  guidelinePath?: string;
  routes: string[];
  maxPages: number;
  maxClicksPerPage: number;
  focus: Focus[];
  createdAt: string;
  updatedAt: string;
};

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function safeParse(raw: string | null): SuiteConfig[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null)
      .map((entry) => {
        const focusValues = Array.isArray(entry.focus)
          ? entry.focus.filter((value): value is Focus =>
              focusSchema.options.includes(String(value) as Focus),
            )
          : [];

        return {
          id: String(entry.id ?? ""),
          name: String(entry.name ?? ""),
          projectPath: String(entry.projectPath ?? ""),
          baseUrl: String(entry.baseUrl ?? ""),
          guidelinePath: entry.guidelinePath ? String(entry.guidelinePath) : undefined,
          routes: Array.isArray(entry.routes)
            ? entry.routes.map((value) => String(value)).filter(Boolean)
            : [],
          maxPages: Number(entry.maxPages ?? 6),
          maxClicksPerPage: Number(entry.maxClicksPerPage ?? 6),
          focus: focusValues.length ? focusValues : DEFAULT_FOCUS,
          createdAt: String(entry.createdAt ?? new Date().toISOString()),
          updatedAt: String(entry.updatedAt ?? new Date().toISOString()),
        };
      })
      .filter((suite) => suite.id && suite.name && suite.baseUrl);
  } catch {
    return [];
  }
}

function save(suites: SuiteConfig[]) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(suites));
}

export function loadSuites(): SuiteConfig[] {
  if (!canUseStorage()) return [];
  return safeParse(window.localStorage.getItem(STORAGE_KEY));
}

export function getSuiteById(id: string): SuiteConfig | null {
  return loadSuites().find((suite) => suite.id === id) ?? null;
}

export function createSuite(input: {
  name: string;
  projectPath: string;
  baseUrl: string;
  guidelinePath?: string;
  routes: string[];
  maxPages: number;
  maxClicksPerPage: number;
  focus: Focus[];
}): SuiteConfig {
  const suites = loadSuites();
  const now = new Date().toISOString();

  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  const created: SuiteConfig = {
    id,
    name: input.name,
    projectPath: input.projectPath,
    baseUrl: input.baseUrl,
    guidelinePath: input.guidelinePath,
    routes: input.routes,
    maxPages: input.maxPages,
    maxClicksPerPage: input.maxClicksPerPage,
    focus: input.focus,
    createdAt: now,
    updatedAt: now,
  };

  suites.push(created);
  save(suites);
  return created;
}

export function deleteSuite(id: string): void {
  const suites = loadSuites().filter((suite) => suite.id !== id);
  save(suites);
}

export function updateSuiteTimestamp(id: string): void {
  const suites = loadSuites();
  const index = suites.findIndex((suite) => suite.id === id);
  if (index === -1) return;
  suites[index] = {
    ...suites[index],
    updatedAt: new Date().toISOString(),
  };
  save(suites);
}

export function makeVirtualSuiteId(baseUrl: string): string {
  return `url_${encodeURIComponent(baseUrl)}`;
}

export function parseVirtualSuiteId(suiteId: string): string | null {
  if (!suiteId.startsWith("url_")) return null;
  try {
    return decodeURIComponent(suiteId.slice(4));
  } catch {
    return null;
  }
}
