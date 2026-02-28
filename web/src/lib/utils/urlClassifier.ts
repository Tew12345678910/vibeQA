function isIpv4Host(hostname: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
}

function isPrivateIpv4(hostname: string): boolean {
  if (!isIpv4Host(hostname)) {
    return false;
  }

  const [a, b] = hostname.split(".").map((part) => Number(part));
  if (a === 10) {
    return true;
  }
  if (a === 127) {
    return true;
  }
  if (a === 192 && b === 168) {
    return true;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }
  return false;
}

export function isPrivateOrLocalUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();
    if (["localhost", "0.0.0.0"].includes(host)) {
      return true;
    }
    return isPrivateIpv4(host);
  } catch {
    return false;
  }
}

export function isLikelyCloudBrowserUseEndpoint(endpoint: string | undefined): boolean {
  if (!endpoint) {
    return true;
  }

  try {
    const host = new URL(endpoint).hostname.toLowerCase();
    return host.includes("browser-use.com") || host.includes("browseruse.com");
  } catch {
    return true;
  }
}

export function validateSuiteBaseUrl(baseUrl: string): { valid: boolean; message?: string } {
  try {
    const url = new URL(baseUrl);
    if (!["http:", "https:"].includes(url.protocol)) {
      return { valid: false, message: "Base URL must use http or https" };
    }
    return { valid: true };
  } catch {
    return { valid: false, message: "Invalid URL format" };
  }
}
