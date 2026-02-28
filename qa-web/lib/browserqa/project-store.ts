import { focusSchema, type Focus } from "@/lib/contracts";
import {
  normalizeProjectAnalysis,
  type ProjectAnalysis,
} from "@/lib/browserqa/project-analysis";

const STORAGE_KEY = "browserqa_projects_v1";
const DEFAULT_FOCUS: Focus[] = [
  "usability",
  "accessibility",
  "security",
  "content",
  "functional",
];

export type SiteAuthType = "none" | "credentials" | "social";

export type ProjectConfig = {
  id: string;
  name: string;
  sourceType?: "local" | "github";
  projectPath: string;
  githubRepo?: string;
  websiteUrl?: string;
  baseUrl: string;
  guidelinePath?: string;
  routes: string[];
  maxPages: number;
  maxClicksPerPage: number;
  focus: Focus[];
  detectedFramework?: string;
  analysis?: ProjectAnalysis;
  /** Whether the website requires login to be tested by the browser agent. */
  siteAuthType?: SiteAuthType;
  siteUsername?: string;
  /** Stored in localStorage — not sent server-side; used only for the local browser agent. */
  sitePassword?: string;
  createdAt: string;
  updatedAt: string;
};

function canUseStorage(): boolean {
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  );
}

function safeParse(raw: string | null): ProjectConfig[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(
        (entry): entry is Record<string, unknown> =>
          typeof entry === "object" && entry !== null,
      )
      .map((entry) => {
        const focusValues = Array.isArray(entry.focus)
          ? entry.focus.filter((value): value is Focus =>
              focusSchema.options.includes(String(value) as Focus),
            )
          : [];

        return {
          id: String(entry.id ?? ""),
          name: String(entry.name ?? ""),
          sourceType:
            entry.sourceType === "github"
              ? ("github" as const)
              : ("local" as const),
          projectPath: String(entry.projectPath ?? ""),
          githubRepo: entry.githubRepo ? String(entry.githubRepo) : undefined,
          websiteUrl: entry.websiteUrl ? String(entry.websiteUrl) : undefined,
          baseUrl: String(entry.baseUrl ?? ""),
          guidelinePath: entry.guidelinePath
            ? String(entry.guidelinePath)
            : undefined,
          routes: Array.isArray(entry.routes)
            ? entry.routes.map((value) => String(value)).filter(Boolean)
            : [],
          maxPages: Number(entry.maxPages ?? 6),
          maxClicksPerPage: Number(entry.maxClicksPerPage ?? 6),
          focus: focusValues.length ? focusValues : DEFAULT_FOCUS,
          detectedFramework: entry.detectedFramework
            ? String(entry.detectedFramework)
            : undefined,
          analysis: normalizeProjectAnalysis(entry.analysis),
          siteAuthType:
            entry.siteAuthType === "credentials"
              ? "credentials"
              : entry.siteAuthType === "social"
                ? "social"
                : entry.siteAuthType === "none"
                  ? "none"
                  : undefined,
          siteUsername: entry.siteUsername
            ? String(entry.siteUsername)
            : undefined,
          sitePassword: entry.sitePassword
            ? String(entry.sitePassword)
            : undefined,
          createdAt: String(entry.createdAt ?? new Date().toISOString()),
          updatedAt: String(entry.updatedAt ?? new Date().toISOString()),
        } satisfies ProjectConfig;
      })
      .map((project) => ({
        ...project,
        routes:
          project.routes.length > 0
            ? project.routes
            : project.analysis?.routes.map((route) => route.path) ?? [],
        detectedFramework:
          project.detectedFramework ?? project.analysis?.framework ?? undefined,
      }))
      .filter((suite) => suite.id && suite.name && suite.baseUrl);
  } catch {
    return [];
  }
}

function save(projects: ProjectConfig[]) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

export function loadProjects(): ProjectConfig[] {
  if (!canUseStorage()) return [];
  return safeParse(window.localStorage.getItem(STORAGE_KEY));
}

export function getProjectById(id: string): ProjectConfig | null {
  return loadProjects().find((p) => p.id === id) ?? null;
}

export function createProject(input: {
  name: string;
  sourceType?: "local" | "github";
  projectPath: string;
  githubRepo?: string;
  websiteUrl?: string;
  baseUrl: string;
  guidelinePath?: string;
  routes?: string[];
  focus: Focus[];
  detectedFramework?: string;
  analysis?: ProjectAnalysis;
}): ProjectConfig {
  const projects = loadProjects();
  const now = new Date().toISOString();

  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  const created: ProjectConfig = {
    id,
    name: input.name,
    sourceType: input.sourceType ?? "local",
    projectPath: input.projectPath,
    githubRepo: input.githubRepo,
    websiteUrl: input.websiteUrl,
    baseUrl: input.baseUrl,
    guidelinePath: input.guidelinePath,
    routes: input.routes ?? [],
    maxPages: 6,
    maxClicksPerPage: 6,
    focus: input.focus,
    detectedFramework: input.detectedFramework ?? input.analysis?.framework,
    analysis: input.analysis,
    createdAt: now,
    updatedAt: now,
  };

  projects.push(created);
  save(projects);
  return created;
}

export function deleteProject(id: string): void {
  const projects = loadProjects().filter((p) => p.id !== id);
  save(projects);
}

export function updateProjectTimestamp(id: string): void {
  const projects = loadProjects();
  const index = projects.findIndex((p) => p.id === id);
  if (index === -1) return;
  projects[index] = {
    ...projects[index],
    updatedAt: new Date().toISOString(),
  };
  save(projects);
}

export function patchProject(
  id: string,
  patch: Partial<
    Pick<
      ProjectConfig,
      | "githubRepo"
      | "websiteUrl"
      | "name"
      | "detectedFramework"
      | "routes"
      | "analysis"
      | "siteAuthType"
      | "siteUsername"
      | "sitePassword"
    >
  >,
): ProjectConfig | null {
  const projects = loadProjects();
  const index = projects.findIndex((p) => p.id === id);
  if (index === -1) return null;
  projects[index] = {
    ...projects[index],
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  save(projects);
  return projects[index];
}

export function makeVirtualProjectId(baseUrl: string): string {
  return `url_${encodeURIComponent(baseUrl)}`;
}

export function parseVirtualProjectId(projectId: string): string | null {
  if (!projectId.startsWith("url_")) return null;
  try {
    return decodeURIComponent(projectId.slice(4));
  } catch {
    return null;
  }
}
