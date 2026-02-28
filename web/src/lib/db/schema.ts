import { relations, sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const suite = sqliteTable("suite", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  projectPath: text("project_path").notNull(),
  baseUrl: text("base_url").notNull(),
  guidelinePath: text("guideline_path"),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
});

export const suiteViewport = sqliteTable(
  "suite_viewport",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    suiteId: integer("suite_id").notNull().references(() => suite.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  },
  (t) => ({
    suiteViewportKey: uniqueIndex("suite_viewport_suite_key_uq").on(t.suiteId, t.key),
  }),
);

export const testCase = sqliteTable(
  "test_case",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    suiteId: integer("suite_id").notNull().references(() => suite.id, { onDelete: "cascade" }),
    externalCaseId: text("external_case_id").notNull(),
    name: text("name").notNull(),
    path: text("path").notNull(),
    origin: text("origin").notNull(),
    assertionsJson: text("assertions_json").notNull(),
    sourceRefsJson: text("source_refs_json").notNull(),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    suiteCaseKey: uniqueIndex("test_case_suite_external_uq").on(t.suiteId, t.externalCaseId),
  }),
);

export const run = sqliteTable("run", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  suiteId: integer("suite_id").notNull().references(() => suite.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  startedAt: integer("started_at").notNull().default(sql`(unixepoch() * 1000)`),
  finishedAt: integer("finished_at"),
  trigger: text("trigger").notNull().default("manual"),
  summaryJson: text("summary_json").notNull().default("{}"),
});

export const runCase = sqliteTable(
  "run_case",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    runId: integer("run_id").notNull().references(() => run.id, { onDelete: "cascade" }),
    testCaseId: integer("test_case_id").notNull().references(() => testCase.id, { onDelete: "cascade" }),
    viewportKey: text("viewport_key").notNull(),
    browserUseTaskId: text("browser_use_task_id"),
    status: text("status").notNull(),
    error: text("error"),
    liveUrl: text("live_url"),
    publicShareUrl: text("public_share_url"),
    outputJson: text("output_json"),
    startedAt: integer("started_at"),
    finishedAt: integer("finished_at"),
  },
  (t) => ({
    runCaseUnique: uniqueIndex("run_case_run_test_viewport_uq").on(t.runId, t.testCaseId, t.viewportKey),
  }),
);

export const issue = sqliteTable("issue", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runId: integer("run_id").notNull().references(() => run.id, { onDelete: "cascade" }),
  runCaseId: integer("run_case_id").notNull().references(() => runCase.id, { onDelete: "cascade" }),
  severity: text("severity").notNull(),
  title: text("title").notNull(),
  symptom: text("symptom").notNull(),
  expected: text("expected").notNull(),
  actual: text("actual").notNull(),
  reproStepsJson: text("repro_steps_json").notNull(),
  fileHintsJson: text("file_hints_json").notNull(),
  fixGuidance: text("fix_guidance").notNull(),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
});

export const artifact = sqliteTable("artifact", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runCaseId: integer("run_case_id").notNull().references(() => runCase.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  urlOrPath: text("url_or_path").notNull(),
  metadataJson: text("metadata_json").notNull().default("{}"),
});

export const suiteRelations = relations(suite, ({ many }) => ({
  viewports: many(suiteViewport),
  testCases: many(testCase),
  runs: many(run),
}));
