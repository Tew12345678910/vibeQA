import fs from "node:fs";
import path from "node:path";

import { getDbClient } from "@/lib/db/client";

type SecuritySeverity = "critical" | "high" | "medium" | "low";

type RuleRow = {
  id: string;
  title: string;
  category: string;
  priority: string;
  description: string;
  contents: Record<string, unknown>;
  enabled: boolean;
};

type PatternRule = {
  id: string;
  label: string;
  regex: string;
  severity: SecuritySeverity;
};

type EducationRule = {
  type: string;
  title: string;
  explanation: string;
  impact: string;
  remediation: string;
  references: string[];
  cweId: string;
  owaspCategory: string;
};

function loadDotEnvLocal(): void {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;

  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex <= 0) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function priorityFromSeverity(severity: string): string {
  const s = severity.toLowerCase();
  if (s === "critical") return "P0";
  if (s === "high") return "P1";
  if (s === "medium") return "P2";
  if (s === "low") return "P3";
  return "P4";
}

function priorityFromType(type: string): string {
  if (type === "secret_leak") return "P0";
  if (type === "xss_vulnerability") return "P1";
  if (type === "sql_injection") return "P1";
  if (type === "pii_exposure") return "P1";
  if (type === "insecure_dependency") return "P2";
  if (type === "insecure_header") return "P2";
  if (type === "csrf_missing") return "P2";
  return "P3";
}

const SECRET_PATTERNS: PatternRule[] = [
  { id: "aws-access-key", label: "AWS access key", regex: "\\b(AKIA|ASIA)[0-9A-Z]{16}\\b", severity: "critical" },
  { id: "generic-api-key", label: "API key", regex: "\\b(api_key|apikey|api-key)\\s*[:=]\\s*['\"']?[A-Za-z0-9_\\-]{16,}['\"']?", severity: "high" },
  { id: "private-key-block", label: "Private key", regex: "-----BEGIN (RSA |DSA |EC )?PRIVATE KEY-----[\\s\\S]+?-----END (RSA |DSA |EC )?PRIVATE KEY-----", severity: "critical" },
  { id: "github-token", label: "GitHub token", regex: "\\bgh[pousr]_[A-Za-z0-9]{36}\\b", severity: "high" },
  { id: "jwt-token", label: "JWT token", regex: "\\beyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9._-]{10,}\\.[A-Za-z0-9._-]{10,}\\b", severity: "medium" },
  { id: "bearer-token", label: "Bearer token", regex: "\\bBearer\\s+[A-Za-z0-9\\-\\._~\\+\\/]+=*", severity: "medium" },
  { id: "hardcoded-password", label: "Hardcoded password", regex: "\\b(pass(word)?|pwd)\\s*[:=]\\s*['\"'][^'\"']{6,}['\"']", severity: "high" },
  { id: "db-connection-string", label: "Database connection string", regex: "\\b(postgres(ql)?:\\/\\/|mysql:\\/\\/|mongodb(\\+srv)?:\\/\\/|mssql:\\/\\/)[^'\"'\\s]+", severity: "high" },
  { id: "stripe-key", label: "Stripe key", regex: "\\b(sk|pk)_(live|test)_[0-9a-zA-Z]{10,}\\b", severity: "high" },
  { id: "slack-token", label: "Slack token", regex: "\\bxox[baprs]-[A-Za-z0-9\\-]{10,}\\b", severity: "high" },
  { id: "sendgrid-key", label: "SendGrid key", regex: "\\bSG\\.[A-Za-z0-9_\\-]{16,}\\.[A-Za-z0-9_\\-]{16,}\\b", severity: "high" },
];

const PII_PATTERNS: PatternRule[] = [
  { id: "email", label: "Email address", regex: "\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}\\b", severity: "medium" },
  { id: "phone", label: "Phone number", regex: "\\+?\\d[\\d\\s().-]{8,}\\d", severity: "medium" },
  { id: "ssn-us", label: "US Social Security Number", regex: "\\b\\d{3}-\\d{2}-\\d{4}\\b", severity: "high" },
  { id: "credit-card", label: "Credit card number", regex: "\\b(?:\\d[ -]*?){13,16}\\b", severity: "critical" },
  { id: "ipv4", label: "IPv4 address", regex: "\\b((25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\.){3}(25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\b", severity: "low" },
  { id: "street-address", label: "Street address", regex: "\\b\\d{1,5}\\s+[A-Za-z0-9\\s]{3,}\\s+(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr)\\b", severity: "medium" },
  { id: "dob-iso", label: "Date of birth", regex: "\\b(19|20)\\d{2}[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\\d|3[01])\\b", severity: "medium" },
  { id: "dob-us", label: "Date of birth", regex: "\\b(0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\\d|3[01])[-/](19|20)\\d{2}\\b", severity: "medium" },
];

const XSS_TEST_PAYLOADS: string[] = [
  "<script>alert('xss')</script>",
  "\"><script>alert(1)</script>",
  "'><img src=x onerror=alert(1)>",
  "<svg onload=alert(1)>",
  "<body onload=alert('xss')>",
  "<img src=x onerror=\"alert('xss')\" />",
  "</script><script>alert('xss')</script>",
];

const SQLI_TEST_PAYLOADS: string[] = [
  "' OR '1'='1'--",
  "\" OR \"1\"=\"1\"--",
  "admin'--",
  "admin' #",
  "' OR 1=1--",
  "' UNION SELECT NULL, NULL, NULL--",
  "'; DROP TABLE users;--",
  "\" ; DROP TABLE users;--",
];

const EDUCATION_CONTENT: EducationRule[] = [
  {
    type: "secret_leak",
    title: "Secret or API Key Leak",
    explanation: "Secrets such as API keys, access tokens, and private keys are meant to stay on the server or in secure secret managers.",
    impact: "An attacker with valid credentials can impersonate your application and exfiltrate data.",
    remediation: "Revoke and rotate exposed credentials. Move secrets to server-only secret managers and CI secret scanning.",
    references: [
      "https://owasp.org/www-community/attacks/Password_Storage_Cheat_Sheet",
      "https://cheatsheetseries.owasp.org/cheatsheets/Credential_Stuffing_Prevention_Cheat_Sheet.html",
    ],
    cweId: "CWE-798",
    owaspCategory: "A02:2021 – Cryptographic Failures",
  },
  {
    type: "pii_exposure",
    title: "Personal Data (PII) Exposure",
    explanation: "Personally identifiable information in logs, client code, or unsecured endpoints increases breach risk.",
    impact: "Can lead to identity theft, phishing, and regulatory penalties.",
    remediation: "Minimize PII, avoid raw logging, and enforce encryption + access control.",
    references: [
      "https://owasp.org/www-community/Personal_Identifiable_Information",
      "https://owasp.org/www-project-top-ten/2017/A3_Sensitive_Data_Exposure",
    ],
    cweId: "CWE-359",
    owaspCategory: "A01:2021 – Broken Access Control",
  },
  {
    type: "xss_vulnerability",
    title: "Cross-Site Scripting (XSS)",
    explanation: "XSS occurs when untrusted input is rendered/executed as script in a browser.",
    impact: "Attackers can steal tokens/cookies and act as victims.",
    remediation: "Escape/sanitize untrusted data, avoid unsafe HTML APIs, and enforce CSP.",
    references: [
      "https://owasp.org/www-community/attacks/xss/",
      "https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html",
    ],
    cweId: "CWE-79",
    owaspCategory: "A03:2021 – Injection",
  },
  {
    type: "sql_injection",
    title: "SQL Injection",
    explanation: "SQL injection happens when untrusted input is concatenated into SQL queries.",
    impact: "Can expose or destroy database contents and escalate privileges.",
    remediation: "Use parameterized queries/ORM query builders and least-privileged DB users.",
    references: [
      "https://owasp.org/www-community/attacks/SQL_Injection",
      "https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html",
    ],
    cweId: "CWE-89",
    owaspCategory: "A03:2021 – Injection",
  },
  {
    type: "insecure_dependency",
    title: "Insecure or Outdated Dependency",
    explanation: "Known-vulnerable third-party dependencies can be exploited even when first-party code is safe.",
    impact: "Can introduce critical flaws like RCE, XSS, and SSRF.",
    remediation: "Run dependency audits regularly and patch/remove vulnerable packages.",
    references: [
      "https://owasp.org/www-project-top-ten/2017/A9_Using_Components_with_Known_Vulnerabilities.html",
      "https://owasp.org/Top10/A06_2021-Vulnerable_and_Outdated_Components/",
    ],
    cweId: "CWE-1104",
    owaspCategory: "A06:2021 – Vulnerable and Outdated Components",
  },
  {
    type: "insecure_header",
    title: "Missing or Insecure Security Headers",
    explanation: "Missing/misconfigured security headers weaken browser-side hardening.",
    impact: "Increases exposure to XSS, clickjacking, and downgrade attacks.",
    remediation: "Set CSP, HSTS, and frame protections at app or edge.",
    references: [
      "https://owasp.org/www-project-secure-headers/",
      "https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy",
    ],
    cweId: "CWE-693",
    owaspCategory: "Security Hardening",
  },
  {
    type: "csrf_missing",
    title: "Missing CSRF Protections",
    explanation: "CSRF tricks authenticated browsers into unwanted state-changing requests.",
    impact: "Can lead to unauthorized actions and account-impacting changes.",
    remediation: "Use CSRF tokens and same-site cookie protections with restricted CORS.",
    references: [
      "https://owasp.org/www-community/attacks/csrf",
      "https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html",
    ],
    cweId: "CWE-352",
    owaspCategory: "A01:2021 – Broken Access Control",
  },
];

function buildSecurityRules(): RuleRow[] {
  const rows: RuleRow[] = [];

  for (const item of SECRET_PATTERNS) {
    rows.push({
      id: `SEC-SECRET-${item.id}`,
      title: `${item.label} detection`,
      category: "secret_leak",
      priority: priorityFromSeverity(item.severity),
      description: `Detect potential ${item.label.toLowerCase()} exposure in source or logs.`,
      contents: {
        source: "SECRET_PATTERNS",
        ...item,
      },
      enabled: true,
    });
  }

  for (const item of PII_PATTERNS) {
    rows.push({
      id: `SEC-PII-${item.id}`,
      title: `${item.label} detection`,
      category: "pii_exposure",
      priority: priorityFromSeverity(item.severity),
      description: `Detect potential ${item.label.toLowerCase()} exposure in source or logs.`,
      contents: {
        source: "PII_PATTERNS",
        ...item,
      },
      enabled: true,
    });
  }

  XSS_TEST_PAYLOADS.forEach((payload, index) => {
    rows.push({
      id: `SEC-XSS-${String(index + 1).padStart(2, "0")}`,
      title: `XSS test payload ${index + 1}`,
      category: "xss_vulnerability",
      priority: "P2",
      description: "Synthetic XSS payload for detection/test probing.",
      contents: {
        source: "XSS_TEST_PAYLOADS",
        index,
        payload,
      },
      enabled: true,
    });
  });

  SQLI_TEST_PAYLOADS.forEach((payload, index) => {
    rows.push({
      id: `SEC-SQLI-${String(index + 1).padStart(2, "0")}`,
      title: `SQLi test payload ${index + 1}`,
      category: "sql_injection",
      priority: "P2",
      description: "Synthetic SQL injection payload for detection/test probing.",
      contents: {
        source: "SQLI_TEST_PAYLOADS",
        index,
        payload,
      },
      enabled: true,
    });
  });

  for (const item of EDUCATION_CONTENT) {
    rows.push({
      id: `SEC-EDU-${item.type}`,
      title: `${item.title} education`,
      category: item.type,
      priority: priorityFromType(item.type),
      description: item.explanation,
      contents: {
        source: "EDUCATION_CONTENT",
        ...item,
      },
      enabled: true,
    });
  }

  return rows;
}

async function main(): Promise<void> {
  loadDotEnvLocal();

  const db = getDbClient();
  const rows = buildSecurityRules();

  const { error } = await db.from("rules").upsert(rows, { onConflict: "id" });
  if (error) {
    if (/relation .* does not exist|Could not find the table/i.test(error.message)) {
      throw new Error(
        "Table `rules` is missing. Apply migration qa-web/supabase/migrations/20260228_rules_table.sql first.",
      );
    }
    throw new Error(error.message);
  }

  const { count, error: countError } = await db
    .from("rules")
    .select("id", { count: "exact", head: true });

  if (countError) {
    throw new Error(countError.message);
  }

  console.log(`Upserted ${rows.length} security rules into public.rules.`);
  console.log(`Current total rows in public.rules: ${count ?? 0}`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
