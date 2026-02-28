export type ProjectRouter = "app" | "pages" | "unknown";
export type RouteCriticality = "high" | "medium" | "low";

export type ProjectRouteAnalysis = {
  path: string;
  description: string;
  criticality?: RouteCriticality;
};

export type ProjectAnalysis = {
  source: "github-scan";
  scanId: string;
  analyzedAt: string;
  framework: string;
  router: ProjectRouter;
  endpointCount: number;
  routes: ProjectRouteAnalysis[];
};

export type RunScope = "full" | "analysis-only";

export type RunMetadata = {
  scope: RunScope;
  selectedRoutePaths: string[];
  projectAnalysis?: ProjectAnalysis;
};

const ROUTE_PURPOSE_HINTS: Array<{ match: RegExp; purpose: string }> = [
  { match: /^(login|signin|auth)$/i, purpose: "User authentication and sign-in entry point." },
  { match: /^(signup|register)$/i, purpose: "New account registration and onboarding start." },
  { match: /^dashboard$/i, purpose: "Primary operational overview with high-level status and actions." },
  { match: /^settings$/i, purpose: "Configuration and preference management for users or workspace." },
  { match: /^profile$/i, purpose: "User account profile, identity, and personal settings." },
  { match: /^projects?$/i, purpose: "Project listing and navigation into project-level workflows." },
  { match: /^runs?$/i, purpose: "Execution history and run-level inspection workflow." },
  { match: /^issues?$/i, purpose: "Issue triage, prioritization, and remediation tracking." },
  { match: /^reports?$/i, purpose: "Generated quality reports, summaries, and audit outcomes." },
  { match: /^billing|payment|subscription$/i, purpose: "Billing, subscription, and payment lifecycle management." },
  { match: /^checkout|cart$/i, purpose: "Purchase completion flow and order confirmation steps." },
  { match: /^orders?$/i, purpose: "Order history and order-specific detail management." },
  { match: /^docs?|help|support$/i, purpose: "Documentation, help content, and support guidance." },
  { match: /^search$/i, purpose: "Search entry point and result exploration flow." },
  { match: /^admin$/i, purpose: "Administrative controls and restricted management operations." },
  { match: /^api$/i, purpose: "Programmatic API surface and service integration boundary." },
];

function humanizeSegment(value: string): string {
  return value
    .replace(/^\[(.+)\]$/, "$1")
    .replace(/[-_]/g, " ")
    .trim();
}

function purposeFromSegment(segment: string): string | undefined {
  for (const hint of ROUTE_PURPOSE_HINTS) {
    if (hint.match.test(segment)) return hint.purpose;
  }
  return undefined;
}

export function describeRoutePurpose(routePath: string): string {
  const normalized = normalizeRoutePath(routePath);
  if (normalized === "/") {
    return "Main landing page and first user entry into the application.";
  }

  const segments = normalized.replace(/^\/+/, "").split("/").filter(Boolean);
  const leaf = segments[segments.length - 1] ?? "";
  const dynamicLeaf = /^\[.+\]$/.test(leaf);
  const leafHuman = humanizeSegment(leaf);
  const leafPurpose = purposeFromSegment(leaf);
  if (leafPurpose) return leafPurpose;

  if (dynamicLeaf) {
    const parent = segments[segments.length - 2];
    const parentHuman = parent ? humanizeSegment(parent) : "resource";
    return `Detail page for a specific ${parentHuman} item, including record-level actions and context.`;
  }

  if (segments.length > 1) {
    const parent = humanizeSegment(segments[segments.length - 2] ?? "");
    return `Sub-flow under ${parent || "this section"} focused on ${leafHuman || "route-specific tasks"}.`;
  }

  const pretty = leafHuman.charAt(0).toUpperCase() + leafHuman.slice(1);
  return `${pretty || "This"} page supporting its core user flow and actions.`;
}

function isGenericPurpose(purpose: string, routePath: string): boolean {
  const trimmed = purpose.trim().toLowerCase();
  if (!trimmed) return true;
  if (trimmed === "primary entry route") return true;
  if (trimmed.startsWith("user flow route:")) return true;
  const normalizedPath = normalizeRoutePath(routePath).toLowerCase();
  if (trimmed === normalizedPath) return true;
  return false;
}

export function resolveRoutePurpose(
  routePath: string,
  providedPurpose?: string,
): string {
  if (providedPurpose && !isGenericPurpose(providedPurpose, routePath)) {
    return providedPurpose.trim();
  }
  return describeRoutePurpose(routePath);
}

export function fallbackRouteDescription(routePath: string): string {
  return describeRoutePurpose(routePath);
}

export function normalizeRoutePath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "/";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export function normalizeProjectAnalysis(
  value: unknown,
): ProjectAnalysis | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;

  const routes = Array.isArray(raw.routes)
    ? raw.routes
        .map((entry) => {
          if (!entry || typeof entry !== "object") return null;
          const route = entry as Record<string, unknown>;
          const pathValue = String(route.path ?? "").trim();
          if (!pathValue) return null;
          const normalizedPath = normalizeRoutePath(pathValue);
          const description = resolveRoutePurpose(
            normalizedPath,
            route.description ? String(route.description) : undefined,
          );
          const criticality =
            route.criticality === "high" ||
            route.criticality === "medium" ||
            route.criticality === "low"
              ? route.criticality
              : undefined;

          const normalizedRoute: ProjectRouteAnalysis = {
            path: normalizedPath,
            description,
          };
          if (criticality) {
            normalizedRoute.criticality = criticality;
          }

          return normalizedRoute;
        })
        .filter(
          (entry): entry is NonNullable<typeof entry> => entry !== null,
        )
    : [];

  const framework = String(raw.framework ?? "").trim();
  const scanId = String(raw.scanId ?? "").trim();
  const analyzedAt = String(raw.analyzedAt ?? "").trim();
  const source = raw.source === "github-scan" ? "github-scan" : null;

  if (!framework || !scanId || !analyzedAt || !source) {
    return undefined;
  }

  const router: ProjectRouter =
    raw.router === "app" || raw.router === "pages" ? raw.router : "unknown";

  return {
    source,
    framework,
    scanId,
    analyzedAt,
    router,
    endpointCount: Number(raw.endpointCount ?? 0),
    routes,
  };
}
