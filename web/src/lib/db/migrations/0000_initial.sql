CREATE TABLE IF NOT EXISTS `suite` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `name` text NOT NULL,
  `project_path` text NOT NULL,
  `base_url` text NOT NULL,
  `guideline_path` text,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `suite_viewport` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `suite_id` integer NOT NULL,
  `key` text NOT NULL,
  `label` text NOT NULL,
  `width` integer NOT NULL,
  `height` integer NOT NULL,
  `enabled` integer DEFAULT true NOT NULL,
  FOREIGN KEY (`suite_id`) REFERENCES `suite`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `suite_viewport_suite_key_uq` ON `suite_viewport` (`suite_id`,`key`);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `test_case` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `suite_id` integer NOT NULL,
  `external_case_id` text NOT NULL,
  `name` text NOT NULL,
  `path` text NOT NULL,
  `origin` text NOT NULL,
  `assertions_json` text NOT NULL,
  `source_refs_json` text NOT NULL,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`suite_id`) REFERENCES `suite`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `test_case_suite_external_uq` ON `test_case` (`suite_id`,`external_case_id`);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `run` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `suite_id` integer NOT NULL,
  `status` text NOT NULL,
  `started_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `finished_at` integer,
  `trigger` text DEFAULT 'manual' NOT NULL,
  `summary_json` text DEFAULT '{}' NOT NULL,
  FOREIGN KEY (`suite_id`) REFERENCES `suite`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `run_case` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `run_id` integer NOT NULL,
  `test_case_id` integer NOT NULL,
  `viewport_key` text NOT NULL,
  `browser_use_task_id` text,
  `status` text NOT NULL,
  `error` text,
  `live_url` text,
  `public_share_url` text,
  `output_json` text,
  `started_at` integer,
  `finished_at` integer,
  FOREIGN KEY (`run_id`) REFERENCES `run`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`test_case_id`) REFERENCES `test_case`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `run_case_run_test_viewport_uq` ON `run_case` (`run_id`,`test_case_id`,`viewport_key`);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `issue` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `run_id` integer NOT NULL,
  `run_case_id` integer NOT NULL,
  `severity` text NOT NULL,
  `title` text NOT NULL,
  `symptom` text NOT NULL,
  `expected` text NOT NULL,
  `actual` text NOT NULL,
  `repro_steps_json` text NOT NULL,
  `file_hints_json` text NOT NULL,
  `fix_guidance` text NOT NULL,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`run_id`) REFERENCES `run`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`run_case_id`) REFERENCES `run_case`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `artifact` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `run_case_id` integer NOT NULL,
  `kind` text NOT NULL,
  `url_or_path` text NOT NULL,
  `metadata_json` text DEFAULT '{}' NOT NULL,
  FOREIGN KEY (`run_case_id`) REFERENCES `run_case`(`id`) ON UPDATE no action ON DELETE cascade
);
