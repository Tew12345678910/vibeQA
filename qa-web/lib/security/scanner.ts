import {
  type SecurityEducation,
  type SecurityFinding,
  type SecurityFindingLocation,
  type SecurityFindingType,
  type SecurityScanConfig,
  type SecurityScanSummary,
  type SecuritySeverity,
} from "./types";

function generateSecurityId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `sec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function maskSecret(secret: string): string {
  if (!secret) return "";
  const visible = secret.slice(0, 4);
  const remaining = Math.max(secret.length - 4, 0);
  const maskedLength = Math.min(remaining, 12);
  const masked = maskedLength > 0 ? "*".repeat(maskedLength) : "***";
  return `${visible}${masked}${remaining > maskedLength ? "…" : ""}`;
}

type SecretPattern = {
  id: string;
  label: string;
  regex: RegExp;
  severity: SecuritySeverity;
};

const SECRET_PATTERNS: SecretPattern[] = [
  {
    id: "aws-access-key",
    label: "AWS access key",
    regex: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/g,
    severity: "critical",
  },
  {
    id: "generic-api-key",
    label: "API key",
    regex: /\b(api_key|apikey|api-key)\s*[:=]\s*['"]?[A-Za-z0-9_\-]{16,}['"]?/gi,
    severity: "high",
  },
  {
    id: "private-key-block",
    label: "Private key",
    regex:
      /-----BEGIN (RSA |DSA |EC )?PRIVATE KEY-----[\s\S]+?-----END (RSA |DSA |EC )?PRIVATE KEY-----/g,
    severity: "critical",
  },
  {
    id: "github-token",
    label: "GitHub token",
    regex: /\bgh[pousr]_[A-Za-z0-9]{36}\b/g,
    severity: "high",
  },
  {
    id: "jwt-token",
    label: "JWT token",
    regex:
      /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]{10,}\.[A-Za-z0-9._-]{10,}\b/g,
    severity: "medium",
  },
  {
    id: "bearer-token",
    label: "Bearer token",
    regex: /\bBearer\s+[A-Za-z0-9\-\._~\+\/]+=*/gi,
    severity: "medium",
  },
  {
    id: "hardcoded-password",
    label: "Hardcoded password",
    regex: /\b(pass(word)?|pwd)\s*[:=]\s*['"][^'"]{6,}['"]/gi,
    severity: "high",
  },
  {
    id: "db-connection-string",
    label: "Database connection string",
    regex:
      /\b(postgres(ql)?:\/\/|mysql:\/\/|mongodb(\+srv)?:\/\/|mssql:\/\/)[^'"\s]+/gi,
    severity: "high",
  },
  {
    id: "stripe-key",
    label: "Stripe key",
    regex: /\b(sk|pk)_(live|test)_[0-9a-zA-Z]{10,}\b/g,
    severity: "high",
  },
  {
    id: "slack-token",
    label: "Slack token",
    regex: /\bxox[baprs]-[A-Za-z0-9\-]{10,}\b/g,
    severity: "high",
  },
  {
    id: "sendgrid-key",
    label: "SendGrid key",
    regex: /\bSG\.[A-Za-z0-9_\-]{16,}\.[A-Za-z0-9_\-]{16,}\b/g,
    severity: "high",
  },
];

type PiiPattern = {
  id: string;
  label: string;
  regex: RegExp;
  severity: SecuritySeverity;
};

const PII_PATTERNS: PiiPattern[] = [
  {
    id: "email",
    label: "Email address",
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    severity: "medium",
  },
  {
    id: "phone",
    label: "Phone number",
    regex: /\+?\d[\d\s().-]{8,}\d/g,
    severity: "medium",
  },
  {
    id: "ssn-us",
    label: "US Social Security Number",
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
    severity: "high",
  },
  {
    id: "credit-card",
    label: "Credit card number",
    regex: /\b(?:\d[ -]*?){13,16}\b/g,
    severity: "critical",
  },
  {
    id: "ipv4",
    label: "IPv4 address",
    regex:
      /\b((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g,
    severity: "low",
  },
  {
    id: "street-address",
    label: "Street address",
    regex:
      /\b\d{1,5}\s+[A-Za-z0-9\s]{3,}\s+(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr)\b/gi,
    severity: "medium",
  },
  {
    id: "dob-iso",
    label: "Date of birth",
    regex:
      /\b(19|20)\d{2}[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b/g,
    severity: "medium",
  },
  {
    id: "dob-us",
    label: "Date of birth",
    regex:
      /\b(0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])[-/](19|20)\d{2}\b/g,
    severity: "medium",
  },
];

export const XSS_TEST_PAYLOADS: string[] = [
  `<script>alert('xss')</script>`,
  `"><script>alert(1)</script>`,
  `'><img src=x onerror=alert(1)>`,
  `<svg onload=alert(1)>`,
  `<body onload=alert('xss')>`,
  `<img src=x onerror="alert('xss')" />`,
  `</script><script>alert('xss')</script>`,
];

export const SQLI_TEST_PAYLOADS: string[] = [
  `' OR '1'='1'--`,
  `" OR "1"="1"--`,
  `admin'--`,
  `admin' #`,
  `' OR 1=1--`,
  `' UNION SELECT NULL, NULL, NULL--`,
  `'; DROP TABLE users;--`,
  `" ; DROP TABLE users;--`,
];

const EDUCATION_CONTENT: Record<SecurityFindingType, SecurityEducation> = {
  secret_leak: {
    type: "secret_leak",
    title: "Secret or API Key Leak",
    explanation:
      "Secrets such as API keys, access tokens, and private keys are meant to stay on the server or in secure secret managers. When they appear in client-side code, logs, or public repositories, attackers can reuse them to access your infrastructure or third‑party services.",
    impact:
      "An attacker with valid credentials can impersonate your application, exfiltrate data, run up infrastructure bills, or disable critical services. In severe cases this leads to full account takeover across cloud providers.",
    remediation:
      "Immediately revoke and rotate any exposed credentials. Move secrets into a dedicated secret manager or environment variables that are only available on the server. Add automated secret scanning to CI to block new leaks and avoid hardcoding keys in source files.",
    references: [
      "https://owasp.org/www-community/attacks/Password_Storage_Cheat_Sheet",
      "https://cheatsheetseries.owasp.org/cheatsheets/Credential_Stuffing_Prevention_Cheat_Sheet.html",
    ],
    cweId: "CWE-798",
    owaspCategory: "A02:2021 – Cryptographic Failures",
  },
  pii_exposure: {
    type: "pii_exposure",
    title: "Personal Data (PII) Exposure",
    explanation:
      "Personally identifiable information (PII) such as names, email addresses, phone numbers, and government IDs must be collected and stored carefully. Exposing this information in logs, client-side code, or unsecured endpoints increases the risk of privacy breaches.",
    impact:
      "PII leaks can lead to identity theft, phishing attacks, and regulatory penalties under laws like GDPR or CCPA. Even small leaks can damage user trust and brand reputation.",
    remediation:
      "Minimize collected PII to what is strictly necessary. Mask or pseudonymize identifiers where possible, and avoid logging raw PII. Use transport encryption (HTTPS) and encrypt sensitive fields at rest. Implement data retention policies and access controls for production data.",
    references: [
      "https://owasp.org/www-community/Personal_Identifiable_Information",
      "https://owasp.org/www-project-top-ten/2017/A3_Sensitive_Data_Exposure",
    ],
    cweId: "CWE-359",
    owaspCategory: "A01:2021 – Broken Access Control",
  },
  xss_vulnerability: {
    type: "xss_vulnerability",
    title: "Cross-Site Scripting (XSS)",
    explanation:
      "Cross-Site Scripting (XSS) occurs when untrusted input is rendered as HTML or executed as JavaScript in a user's browser. Attackers can inject scripts into pages viewed by other users, often via query parameters, form fields, or unsafe HTML rendering.",
    impact:
      "XSS allows attackers to steal cookies or tokens, perform actions on behalf of a victim, keylog input, deface pages, or pivot into further attacks. In single-page apps it may completely compromise the user's session.",
    remediation:
      "Treat all user input as untrusted. Prefer safe DOM APIs and templating that escape by default. Avoid `dangerouslySetInnerHTML` unless absolutely necessary and properly sanitized. Apply Content Security Policy (CSP) to restrict script sources and disable inline execution where possible.",
    references: [
      "https://owasp.org/www-community/attacks/xss/",
      "https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html",
    ],
    cweId: "CWE-79",
    owaspCategory: "A03:2021 – Injection",
  },
  sql_injection: {
    type: "sql_injection",
    title: "SQL Injection",
    explanation:
      "SQL Injection happens when untrusted input is concatenated into SQL queries without proper parameterization. Attackers can change the logic of queries, exfiltrate data, or modify the database.",
    impact:
      "Successful SQL injection can lead to full database compromise: reading or deleting data, escalating privileges, or executing administrative operations. It is one of the most severe and common web vulnerabilities.",
    remediation:
      "Always use parameterized queries or ORM query builders that separate SQL logic from data values. Avoid building SQL strings with string concatenation. Limit database privileges for application accounts and add input validation where appropriate.",
    references: [
      "https://owasp.org/www-community/attacks/SQL_Injection",
      "https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html",
    ],
    cweId: "CWE-89",
    owaspCategory: "A03:2021 – Injection",
  },
  insecure_dependency: {
    type: "insecure_dependency",
    title: "Insecure or Outdated Dependency",
    explanation:
      "Modern applications depend on many third‑party libraries. When those libraries contain known vulnerabilities or are not kept up to date, attackers can exploit them even if your own code is correct.",
    impact:
      "Insecure dependencies can introduce remote code execution, XSS, SSRF, and other critical flaws. Attackers often scan for publicly known vulnerabilities in popular packages.",
    remediation:
      "Use tooling like `npm audit`, `pnpm audit`, `yarn audit`, or SCA platforms to detect vulnerable packages. Apply security patches regularly, pin versions where necessary, and remove unused dependencies.",
    references: [
      "https://owasp.org/www-project-top-ten/2017/A9_Using_Components_with_Known_Vulnerabilities.html",
      "https://owasp.org/Top10/A06_2021-Vulnerable_and_Outdated_Components/",
    ],
    cweId: "CWE-1104",
    owaspCategory: "A06:2021 – Vulnerable and Outdated Components",
  },
  insecure_header: {
    type: "insecure_header",
    title: "Missing or Insecure Security Headers",
    explanation:
      "Security-related HTTP response headers such as `Content-Security-Policy`, `Strict-Transport-Security`, and `X-Frame-Options` harden the browser against common attacks. When they are missing or misconfigured, the attack surface is larger.",
    impact:
      "Missing headers can make XSS, clickjacking, and protocol downgrade attacks easier. While headers do not fix vulnerabilities by themselves, they provide important defense-in-depth.",
    remediation:
      "Enable a reasonable Content Security Policy, enforce HTTPS with HSTS, and configure clickjacking protections (`X-Frame-Options` or `frame-ancestors`). Add these headers at your edge or application gateway.",
    references: [
      "https://owasp.org/www-project-secure-headers/",
      "https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy",
    ],
    cweId: "CWE-693",
    owaspCategory: "Security Hardening",
  },
  csrf_missing: {
    type: "csrf_missing",
    title: "Missing CSRF Protections",
    explanation:
      "Cross-Site Request Forgery (CSRF) tricks a victim's browser into sending unwanted requests to a web application where they are authenticated. Without CSRF protections, state‑changing endpoints can be abused by malicious sites.",
    impact:
      "Attackers may be able to change user settings, perform financial transactions, or take over accounts by abusing the victim's session.",
    remediation:
      "Use CSRF tokens for state‑changing requests, and prefer same‑site cookies with the `SameSite=Lax` or `Strict` attribute. For APIs, consider using double submit cookies or other CSRF defenses and ensure CORS is correctly restricted.",
    references: [
      "https://owasp.org/www-community/attacks/csrf",
      "https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html",
    ],
    cweId: "CWE-352",
    owaspCategory: "A01:2021 – Broken Access Control",
  },
};

export function getSecurityEducation(
  type: SecurityFindingType,
): SecurityEducation {
  return EDUCATION_CONTENT[type];
}

export function getDefaultConfig(): SecurityScanConfig {
  return {
    enableSecretsScan: true,
    enablePiiScan: true,
    enableXssScan: true,
    enableDependencyScan: true,
    enableHeaderScan: true,
    failOnCritical: true,
  };
}

export function scanForSecrets(
  content: string,
  location: SecurityFindingLocation,
): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  if (!content) return findings;

  for (const pattern of SECRET_PATTERNS) {
    pattern.regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.regex.exec(content)) !== null) {
      const raw = match[0];
      findings.push({
        id: generateSecurityId(),
        type: "secret_leak",
        severity: pattern.severity,
        name: `${pattern.label} detected`,
        description: `Potential ${pattern.label.toLowerCase()} is present in this content. Secrets should never be committed to source control or exposed in client-side code.`,
        location: { ...location },
        evidence: maskSecret(raw),
        rawEvidence: raw,
        status: "open",
        detectedAt: new Date(),
      });
    }
  }

  return findings;
}

export function scanForPii(
  content: string,
  location: SecurityFindingLocation,
): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  if (!content) return findings;

  for (const pattern of PII_PATTERNS) {
    pattern.regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.regex.exec(content)) !== null) {
      const raw = match[0];
      findings.push({
        id: generateSecurityId(),
        type: "pii_exposure",
        severity: pattern.severity,
        name: `${pattern.label} detected`,
        description:
          "This looks like personal data (PII). Make sure you have a valid reason to store it, protect it with encryption and access controls, and avoid exposing it in logs or client-side code.",
        location: { ...location },
        evidence: maskSecret(raw),
        rawEvidence: raw,
        status: "open",
        detectedAt: new Date(),
      });
    }
  }

  return findings;
}

export function scanResponse(
  content: string,
  url: string,
  config: SecurityScanConfig,
): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const baseLocation: SecurityFindingLocation = { url, requestUrl: url };

  if (config.enableSecretsScan) {
    findings.push(...scanForSecrets(content, baseLocation));
  }

  if (config.enablePiiScan) {
    findings.push(...scanForPii(content, baseLocation));
  }

  if (config.enableHeaderScan) {
    if (/Set-Cookie:/i.test(content) && !/;\s*Secure/i.test(content)) {
      const rawEvidence = "Set-Cookie header missing Secure attribute";
      findings.push({
        id: generateSecurityId(),
        type: "insecure_header",
        severity: "medium",
        name: "Cookie without Secure flag",
        description:
          "Cookies should be marked with the Secure attribute so they are only sent over HTTPS connections.",
        location: { ...baseLocation },
        evidence: maskSecret(rawEvidence),
        rawEvidence,
        status: "open",
        detectedAt: new Date(),
      });
    }

    if (/Set-Cookie:/i.test(content) && !/;\s*HttpOnly/i.test(content)) {
      const rawEvidence = "Set-Cookie header missing HttpOnly attribute";
      findings.push({
        id: generateSecurityId(),
        type: "insecure_header",
        severity: "high",
        name: "Cookie without HttpOnly flag",
        description:
          "Sensitive cookies should be marked HttpOnly to prevent access from JavaScript and reduce XSS impact.",
        location: { ...baseLocation },
        evidence: maskSecret(rawEvidence),
        rawEvidence,
        status: "open",
        detectedAt: new Date(),
      });
    }

    if (!/Content-Security-Policy/i.test(content)) {
      const rawEvidence = "No Content-Security-Policy header present";
      findings.push({
        id: generateSecurityId(),
        type: "insecure_header",
        severity: "medium",
        name: "Missing Content-Security-Policy header",
        description:
          "A Content Security Policy (CSP) header helps mitigate XSS by tightly controlling which scripts and resources can load.",
        location: { ...baseLocation },
        evidence: maskSecret(rawEvidence),
        rawEvidence,
        status: "open",
        detectedAt: new Date(),
      });
    }
  }

  return findings;
}

export function scanSourceCode(
  content: string,
  filePath: string,
  config: SecurityScanConfig,
): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const baseLocation: SecurityFindingLocation = { file: filePath };

  if (config.enableSecretsScan) {
    findings.push(...scanForSecrets(content, baseLocation));
  }

  if (config.enablePiiScan) {
    findings.push(...scanForPii(content, baseLocation));
  }

  return findings;
}

export function createSummary(
  findings: SecurityFinding[],
): SecurityScanSummary {
  const byTypeCounts: SecurityScanSummary["byType"] = {
    secret_leak: 0,
    pii_exposure: 0,
    xss_vulnerability: 0,
    sql_injection: 0,
    insecure_dependency: 0,
    insecure_header: 0,
    csrf_missing: 0,
  };

  let criticalCount = 0;
  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;
  let infoCount = 0;

  for (const finding of findings) {
    byTypeCounts[finding.type] += 1;
    if (finding.severity === "critical") criticalCount += 1;
    else if (finding.severity === "high") highCount += 1;
    else if (finding.severity === "medium") mediumCount += 1;
    else if (finding.severity === "low") lowCount += 1;
    else infoCount += 1;
  }

  const totalFindings = findings.length;
  const riskScoreBase =
    criticalCount * 25 +
    highCount * 15 +
    mediumCount * 8 +
    lowCount * 3 +
    infoCount;
  const riskScore =
    totalFindings === 0 ? 0 : Math.min(100, Math.round(riskScoreBase));

  return {
    totalFindings,
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
    infoCount,
    byType: byTypeCounts,
    riskScore,
  };
}

export function generateDemoSecurityFindings(): SecurityFinding[] {
  const now = Date.now();
  const awsEvidence = "AKIAEXAMPLEKEY123456";
  const piiEvidence = "user@example.com";
  const xssEvidence = "<div dangerouslySetInnerHTML={{ __html: commentHtml }} />";
  const sqlEvidence = 'const query = "SELECT * FROM users WHERE email = \'" + email + "\'";';
  const cspEvidence = "Response headers do not include Content-Security-Policy";
  const csrfEvidence = "POST /account/update-email without CSRF token";
  const depEvidence = '"some-package": "1.2.3" (known vulnerability)';

  const items: SecurityFinding[] = [
    {
      id: generateSecurityId(),
      type: "secret_leak",
      severity: "critical",
      name: "AWS access key committed to repo",
      description:
        "An AWS access key pattern was found in source code. Attackers could use this to access your AWS account.",
      location: {
        file: "apps/web/src/config/aws.ts",
        line: 12,
      },
      evidence: maskSecret(awsEvidence),
      rawEvidence: awsEvidence,
      status: "open",
      detectedAt: new Date(now - 1000 * 60 * 60 * 4),
    },
    {
      id: generateSecurityId(),
      type: "pii_exposure",
      severity: "high",
      name: "Email addresses in frontend log message",
      description:
        "User email addresses appear in a client-side log message. Logs may be visible in browser developer tools and third‑party logging providers.",
      location: {
        file: "apps/web/src/components/ProfileDebugPanel.tsx",
        line: 42,
      },
      evidence: maskSecret(piiEvidence),
      rawEvidence: piiEvidence,
      status: "open",
      detectedAt: new Date(now - 1000 * 60 * 60 * 2),
    },
    {
      id: generateSecurityId(),
      type: "xss_vulnerability",
      severity: "high",
      name: "Unsanitized HTML rendering",
      description:
        "User-controlled content is rendered using dangerouslySetInnerHTML, which can lead to Cross-Site Scripting (XSS) if not sanitized.",
      location: {
        file: "apps/web/src/components/MarkdownRenderer.tsx",
        line: 88,
      },
      evidence: maskSecret(xssEvidence),
      rawEvidence: xssEvidence,
      status: "open",
      detectedAt: new Date(now - 1000 * 60 * 30),
    },
    {
      id: generateSecurityId(),
      type: "sql_injection",
      severity: "medium",
      name: "String-concatenated SQL query",
      description:
        "A SQL query appears to be constructed with string concatenation. If user input flows into this string, it may be vulnerable to SQL Injection.",
      location: {
        file: "apps/api/src/repositories/UserRepository.ts",
        line: 67,
      },
      evidence: maskSecret(sqlEvidence),
      rawEvidence: sqlEvidence,
      status: "open",
      detectedAt: new Date(now - 1000 * 60 * 20),
    },
    {
      id: generateSecurityId(),
      type: "insecure_header",
      severity: "medium",
      name: "Missing Content-Security-Policy header",
      description:
        "The application does not send a Content-Security-Policy header, reducing protection against XSS and content injection.",
      location: {
        url: "https://app.example.com/dashboard",
      },
      evidence: maskSecret(cspEvidence),
      rawEvidence: cspEvidence,
      status: "open",
      detectedAt: new Date(now - 1000 * 60 * 10),
    },
    {
      id: generateSecurityId(),
      type: "csrf_missing",
      severity: "medium",
      name: "State-changing POST endpoint without CSRF token",
      description:
        "A state-changing POST request appears to be sent without any CSRF token or double-submit cookie, which may allow CSRF attacks.",
      location: {
        url: "https://api.example.com/account/update-email",
        requestUrl: "https://api.example.com/account/update-email",
      },
      evidence: maskSecret(csrfEvidence),
      rawEvidence: csrfEvidence,
      status: "open",
      detectedAt: new Date(now - 1000 * 60 * 5),
    },
    {
      id: generateSecurityId(),
      type: "insecure_dependency",
      severity: "low",
      name: "Outdated frontend dependency",
      description:
        "A frontend dependency has a known security advisory. Upgrading to the latest patched version is recommended.",
      location: {
        file: "package.json",
      },
      evidence: maskSecret(depEvidence),
      rawEvidence: depEvidence,
      status: "open",
      detectedAt: new Date(now - 1000 * 60 * 3),
    },
  ];

  return items;
}

