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
      return `(${sqlEscape(row.id)}, ${sqlEscape(row.title)}, ${sqlEscape(row.category)}, ${sqlEscape(row.priority)}, ${sqlEscape(row.description)}, ${sqlEscape(contents)}::jsonb, ${row.enabled ? "true" : "false"})`;
    })
    .join(",\n");

  return `INSERT INTO public.rules (id, title, category, priority, description, contents, enabled)\nVALUES\n${values}\nON CONFLICT (id) DO UPDATE SET\n  title = EXCLUDED.title,\n  category = EXCLUDED.category,\n  priority = EXCLUDED.priority,\n  description = EXCLUDED.description,\n  contents = EXCLUDED.contents,\n  enabled = EXCLUDED.enabled;\n`;
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
    rules.push({
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
    });
  }

  for (const item of piiPatterns) {
    const r = asRecord(item);
    const label = String(r.label ?? "PII pattern");
    const severity = String(r.severity ?? "medium");
    rules.push({
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
    });
  }

  xssPayloads.forEach((payload, idx) => {
    const value = String(payload ?? "");
    rules.push({
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
    });
  });

  sqliPayloads.forEach((payload, idx) => {
    const value = String(payload ?? "");
    rules.push({
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
    });
  });

  Object.entries(education).forEach(([findingType, value]) => {
    const r = asRecord(value);
    const title = String(r.title ?? `${findingType} guidance`);
    const explanation = String(r.explanation ?? "Security education guidance.");
    rules.push({
      id: idAt(rules.length + 1),
      title: `${title} educational rule`,
      category: findingType,
      priority: priorityFromFindingType(findingType),
      description: explanation,
      contents: {
        source: "EDUCATION_CONTENT",
        findingType,
        ...r,
      },
      enabled: true,
    });
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
