import fs from "node:fs";
import path from "node:path";

import ts from "typescript";

type RuleRow = {
  id: string;
  title: string;
  category: string;
  priority: string;
  description: string;
  contents: Record<string, unknown>;
  targets: string[];
  signals: string[];
  skill_tags: string[];
  version: string;
  lesson_enabled: boolean;
  enabled: boolean;
};

type CliOptions = {
  input: string;
  format: "json" | "sql";
  out?: string;
};

function parseArgs(argv: string[]): CliOptions {
  let input = "";
  let format: "json" | "sql" = "json";
  let out: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input" || arg === "-i") {
      input = argv[i + 1] ?? "";
      i += 1;
      continue;
    }
    if (arg === "--format" || arg === "-f") {
      const value = (argv[i + 1] ?? "json").toLowerCase();
      if (value !== "json" && value !== "sql") {
        throw new Error(`Invalid --format: ${value}. Use json or sql.`);
      }
      format = value;
      i += 1;
      continue;
    }
    if (arg === "--out" || arg === "-o") {
      out = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  if (!input) {
    throw new Error("Missing required --input <path-to-security-module.ts>");
  }

  return { input, format, out };
}

function printHelp(): void {
  console.log(`Extract security rules from a TypeScript module into normalized rows.

Usage:
  pnpm tsx scripts/extract-security-rules.ts --input ./path/to/security.ts [--format json|sql] [--out ./rules.json]

Expected constants in the input file:
  - SECRET_PATTERNS
  - PII_PATTERNS
  - XSS_TEST_PAYLOADS
  - SQLI_TEST_PAYLOADS
  - EDUCATION_CONTENT
`);
}

function isNodeKind(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return node.kind === kind;
}

function propertyNameText(name: ts.PropertyName): string {
  if (ts.isIdentifier(name)) return name.text;
  if (ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return name.getText();
}

function extractLiteral(node: ts.Expression): unknown {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }

  if (ts.isNumericLiteral(node)) {
    return Number(node.text);
  }

  if (isNodeKind(node, ts.SyntaxKind.TrueKeyword)) return true;
  if (isNodeKind(node, ts.SyntaxKind.FalseKeyword)) return false;
  if (isNodeKind(node, ts.SyntaxKind.NullKeyword)) return null;

  if (ts.isRegularExpressionLiteral(node)) {
    return node.getText();
  }

  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.map((item) => {
      if (ts.isSpreadElement(item)) {
        return { __unsupported: "spread", raw: item.getText() };
      }
      return extractLiteral(item);
    });
  }

  if (ts.isObjectLiteralExpression(node)) {
    const output: Record<string, unknown> = {};
    for (const prop of node.properties) {
      if (ts.isPropertyAssignment(prop)) {
        const key = propertyNameText(prop.name);
        output[key] = extractLiteral(prop.initializer);
      } else if (ts.isShorthandPropertyAssignment(prop)) {
        output[prop.name.text] = { __unsupported: "shorthand", raw: prop.getText() };
      } else {
        output[prop.getText()] = { __unsupported: "property-kind", raw: prop.getText() };
      }
    }
    return output;
  }

  if (ts.isPrefixUnaryExpression(node)) {
    const operand = extractLiteral(node.operand);
    if (typeof operand === "number") {
      if (node.operator === ts.SyntaxKind.MinusToken) return -operand;
      if (node.operator === ts.SyntaxKind.PlusToken) return +operand;
    }
  }

  return { __unsupported: "expression", raw: node.getText() };
}

function extractConstValue(sourceFile: ts.SourceFile, constName: string): unknown {
  let extracted: unknown;

  sourceFile.forEachChild(function visit(node) {
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name)) continue;
        if (decl.name.text !== constName) continue;
        if (!decl.initializer) continue;
        extracted = extractLiteral(decl.initializer);
      }
    }
    node.forEachChild(visit);
  });

  return extracted;
}

function priorityFromSeverity(severity: string): string {
  const s = severity.toLowerCase();
  if (s === "critical") return "P0";
  if (s === "high") return "P1";
  if (s === "medium") return "P2";
  if (s === "low") return "P3";
  return "P4";
}

function priorityFromFindingType(type: string): string {
  if (type === "secret_leak") return "P0";
  if (type === "xss_vulnerability") return "P1";
  if (type === "sql_injection") return "P1";
  if (type === "pii_exposure") return "P1";
  if (type === "insecure_dependency") return "P2";
  if (type === "insecure_header") return "P2";
  if (type === "csrf_missing") return "P2";
  return "P3";
}

function uniq(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const value = item.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function targetsForCategory(category: string): string[] {
  if (category === "xss_vulnerability") {
    return ["app/**/*.tsx", "pages/**/*.tsx", "src/**/*.tsx", "components/**/*.tsx"];
  }
  if (category === "sql_injection") {
    return ["app/api/**/route.ts", "pages/api/**/*.ts", "src/**/*.ts", "server/**/*.ts"];
  }
  if (category === "secret_leak") {
    return ["**/*.env*", "**/*.ts", "**/*.js", "**/*.json", "**/*.log"];
  }
  return ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.json"];
}

function signalsForCategory(category: string): string[] {
  const byCategory: Record<string, string[]> = {
    secret_leak: ["process.env", "api_key", "token", "secret", "Bearer "],
    pii_exposure: ["email", "phone", "ssn", "credit card", "dob", "log"],
    xss_vulnerability: ["dangerouslySetInnerHTML", "<script", "innerHTML", "onerror="],
    sql_injection: ["SELECT", "UNION", "$queryRaw", "query(", "execute("],
    insecure_dependency: ["dependency", "CVE", "audit"],
    insecure_header: ["Content-Security-Policy", "Strict-Transport-Security", "X-Frame-Options"],
    csrf_missing: ["csrf", "sameSite", "origin", "referer", "token"],
  };
  return byCategory[category] ?? ["security"];
}

function skillTagsForCategory(category: string): string[] {
  const byCategory: Record<string, string[]> = {
    secret_leak: ["secrets-management", "credential-hygiene"],
    pii_exposure: ["privacy", "data-protection"],
    xss_vulnerability: ["xss-prevention", "output-encoding"],
    sql_injection: ["sql-injection", "query-parameterization"],
    insecure_dependency: ["dependency-security", "supply-chain"],
    insecure_header: ["http-security-headers", "browser-hardening"],
    csrf_missing: ["csrf-protection", "session-security"],
  };
  return byCategory[category] ?? ["secure-coding"];
}

function enrichRuleRow(
  row: Omit<RuleRow, "targets" | "signals" | "skill_tags" | "version" | "lesson_enabled">,
  options?: { lessonEnabled?: boolean },
): RuleRow {
  const targets = targetsForCategory(row.category);
  const signals = uniq([
    ...signalsForCategory(row.category),
    typeof row.contents.regex === "string" ? String(row.contents.regex).slice(0, 120) : "",
    typeof row.contents.payload === "string" ? String(row.contents.payload).slice(0, 120) : "",
  ]);
  const skillTags = skillTagsForCategory(row.category);
  const version = "security-rule-spec/v2.0";
  const lessonEnabled = options?.lessonEnabled ?? true;

  return {
    ...row,
    targets,
    signals,
    skill_tags: skillTags,
    version,
    lesson_enabled: lessonEnabled,
    contents: {
      ...row.contents,
      version,
      targets,
      signals,
      skill_tags: skillTags,
      education: {
        why_it_matters:
          "Security findings are easiest to prevent when guidance is attached to each rule during retrieval.",
        rule_of_thumb:
          "Treat this rule as a default secure coding contract and verify it in tests.",
        common_pitfalls: [
          "Applying fixes in one file while leaving parallel paths vulnerable.",
          "Relying on manual reviews without automated checks.",
          "Skipping regression tests for known payloads and patterns.",
        ],
      },
      remediation: {
        recommended_pattern:
          "Implement shared security controls and enforce them uniformly across in-scope files.",
        implementation_steps: [
          "Identify all in-scope files and current violations.",
          "Apply the secure pattern in shared code or middleware.",
          "Add positive and negative tests.",
          "Re-run scanner checks and confirm findings are resolved.",
        ],
        acceptance_criteria: [
          "All in-scope code paths follow the recommended secure pattern.",
          "Known insecure inputs are rejected, sanitized, or blocked.",
          "Automated checks pass with no reintroduced violations.",
        ],
      },
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function idAt(index: number): string {
  return `IC-${String(index).padStart(4, "0")}`;
}

function sqlEscape(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function toSql(rows: RuleRow[]): string {
  if (!rows.length) return "-- No rules found";

  const values = rows
    .map((row) => {
      const contents = JSON.stringify(row.contents);
      const targets = `ARRAY[${row.targets.map(sqlEscape).join(", ")}]::text[]`;
      const signals = `ARRAY[${row.signals.map(sqlEscape).join(", ")}]::text[]`;
      const skillTags = `ARRAY[${row.skill_tags.map(sqlEscape).join(", ")}]::text[]`;
      return `(${sqlEscape(row.id)}, ${sqlEscape(row.title)}, ${sqlEscape(row.category)}, ${sqlEscape(row.priority)}, ${sqlEscape(row.description)}, ${sqlEscape(contents)}::jsonb, ${targets}, ${signals}, ${skillTags}, ${sqlEscape(row.version)}, ${row.lesson_enabled ? "true" : "false"}, ${row.enabled ? "true" : "false"})`;
    })
    .join(",\n");

  return `INSERT INTO public.rules (id, title, category, priority, description, contents, targets, signals, skill_tags, version, lesson_enabled, enabled)\nVALUES\n${values}\nON CONFLICT (id) DO UPDATE SET\n  title = EXCLUDED.title,\n  category = EXCLUDED.category,\n  priority = EXCLUDED.priority,\n  description = EXCLUDED.description,\n  contents = EXCLUDED.contents,\n  targets = EXCLUDED.targets,\n  signals = EXCLUDED.signals,\n  skill_tags = EXCLUDED.skill_tags,\n  version = EXCLUDED.version,\n  lesson_enabled = EXCLUDED.lesson_enabled,\n  enabled = EXCLUDED.enabled;\n`;
}

function buildRules(sourcePath: string, rawTs: string): RuleRow[] {
  const sourceFile = ts.createSourceFile(sourcePath, rawTs, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  const secretPatterns = asArray(extractConstValue(sourceFile, "SECRET_PATTERNS"));
  const piiPatterns = asArray(extractConstValue(sourceFile, "PII_PATTERNS"));
  const xssPayloads = asArray(extractConstValue(sourceFile, "XSS_TEST_PAYLOADS"));
  const sqliPayloads = asArray(extractConstValue(sourceFile, "SQLI_TEST_PAYLOADS"));
  const education = asRecord(extractConstValue(sourceFile, "EDUCATION_CONTENT"));

  const rules: RuleRow[] = [];

  for (const item of secretPatterns) {
    const r = asRecord(item);
    const label = String(r.label ?? "Secret pattern");
    const severity = String(r.severity ?? "high");
    rules.push(
      enrichRuleRow({
        id: idAt(rules.length + 1),
        title: `${label} detection rule`,
        category: "secret_leak",
        priority: priorityFromSeverity(severity),
        description: `Detects possible ${label.toLowerCase()} exposure in source content.`,
        contents: {
          source: "SECRET_PATTERNS",
          ...r,
        },
        enabled: true,
      }),
    );
  }

  for (const item of piiPatterns) {
    const r = asRecord(item);
    const label = String(r.label ?? "PII pattern");
    const severity = String(r.severity ?? "medium");
    rules.push(
      enrichRuleRow({
        id: idAt(rules.length + 1),
        title: `${label} detection rule`,
        category: "pii_exposure",
        priority: priorityFromSeverity(severity),
        description: `Detects possible ${label.toLowerCase()} exposure in source content.`,
        contents: {
          source: "PII_PATTERNS",
          ...r,
        },
        enabled: true,
      }),
    );
  }

  xssPayloads.forEach((payload, idx) => {
    const value = String(payload ?? "");
    rules.push(
      enrichRuleRow(
        {
          id: idAt(rules.length + 1),
          title: `XSS test payload ${idx + 1}`,
          category: "xss_vulnerability",
          priority: "P2",
          description: "Synthetic payload used for cross-site scripting detection and validation.",
          contents: {
            source: "XSS_TEST_PAYLOADS",
            index: idx,
            payload: value,
          },
          enabled: true,
        },
        { lessonEnabled: false },
      ),
    );
  });

  sqliPayloads.forEach((payload, idx) => {
    const value = String(payload ?? "");
    rules.push(
      enrichRuleRow(
        {
          id: idAt(rules.length + 1),
          title: `SQL injection test payload ${idx + 1}`,
          category: "sql_injection",
          priority: "P2",
          description: "Synthetic payload used for SQL injection detection and validation.",
          contents: {
            source: "SQLI_TEST_PAYLOADS",
            index: idx,
            payload: value,
          },
          enabled: true,
        },
        { lessonEnabled: false },
      ),
    );
  });

  Object.entries(education).forEach(([findingType, value]) => {
    const r = asRecord(value);
    const title = String(r.title ?? `${findingType} guidance`);
    const explanation = String(r.explanation ?? "Security education guidance.");
    rules.push(
      enrichRuleRow({
        id: idAt(rules.length + 1),
        title: `${title} educational rule`,
        category: findingType,
        priority: priorityFromFindingType(findingType),
        description: explanation,
        contents: {
          source: "EDUCATION_CONTENT",
          findingType,
          ...r,
          education: {
            why_it_matters: String(r.impact ?? explanation),
            rule_of_thumb: String(r.remediation ?? "Apply secure defaults and validate with tests."),
            common_pitfalls: [
              "Treating this issue as informational only.",
              "Fixing one location while similar paths remain exposed.",
              "Skipping automated regression coverage.",
            ],
          },
        },
        enabled: true,
      }),
    );
  });

  return rules;
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const inputPath = path.resolve(process.cwd(), options.input);
  const rawTs = fs.readFileSync(inputPath, "utf8");

  const rules = buildRules(inputPath, rawTs);
  if (!rules.length) {
    throw new Error(
      "No rules extracted. Ensure the input file has SECRET_PATTERNS / PII_PATTERNS / EDUCATION_CONTENT constants.",
    );
  }

  const output = options.format === "sql" ? toSql(rules) : JSON.stringify(rules, null, 2);

  if (options.out) {
    const outPath = path.resolve(process.cwd(), options.out);
    fs.writeFileSync(outPath, output, "utf8");
    console.log(`Extracted ${rules.length} rules to ${outPath}`);
    return;
  }

  process.stdout.write(output);
}

main();
