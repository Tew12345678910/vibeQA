function isIpv4(hostname: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
}

function isPrivateIpv4(hostname: string): boolean {
  if (!isIpv4(hostname)) return false;
  const [a, b] = hostname.split(".").map((part) => Number(part));
  if (a === 10 || a === 127) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

export function isPrivateOrLocalHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  return (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host === "[::1]" ||
    isPrivateIpv4(host)
  );
}

export function validateHostedHttpsUrl(rawUrl: string): {
  valid: boolean;
  message?: string;
} {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:") {
      return { valid: false, message: "Base URL must use https" };
    }
    if (isPrivateOrLocalHostname(url.hostname)) {
      return {
        valid: false,
        message: "Private or localhost URLs are not allowed in hosted mode",
      };
    }
    return { valid: true };
  } catch {
    return { valid: false, message: "Invalid URL" };
  }
}

export function normalizeRoutes(routes: string[]): string[] {
  const unique = new Set<string>();

  for (const rawRoute of routes) {
    const trimmed = rawRoute.trim();
    if (!trimmed) continue;

    let route = trimmed;
    try {
      if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
        const parsed = new URL(trimmed);
        route = `${parsed.pathname}${parsed.search}${parsed.hash}`;
      }
    } catch {
      continue;
    }

    if (!route.startsWith("/")) route = `/${route}`;
    unique.add(route);
  }

  return [...unique].slice(0, 20);
}
