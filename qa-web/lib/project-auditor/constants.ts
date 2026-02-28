export const MAX_ZIP_BYTES = 1024 * 1024 * 1024; // 1 GB
export const MAX_SCAN_FILES = 5000;
export const MAX_TOTAL_BYTES = 50 * 1024 * 1024;
export const MAX_FILE_BYTES = 1 * 1024 * 1024;

export const RETENTION_MS = 24 * 60 * 60 * 1000;

export const RUNS_DIRECTORY = "runs";

export const SKIP_DIRECTORIES = new Set([
  "node_modules",
  ".next",
  "dist",
  "build",
  "out",
  "coverage",
  ".git",
]);

export const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".avif",
  ".ico",
  ".pdf",
  ".zip",
  ".gz",
  ".tar",
  ".tgz",
  ".7z",
  ".rar",
  ".mp4",
  ".mov",
  ".avi",
  ".mkv",
  ".mp3",
  ".wav",
  ".ogg",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".eot",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".class",
  ".jar",
  ".wasm",
  ".pyc",
  ".lockb",
]);

export const TEXT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
  ".json",
  ".md",
  ".mdx",
  ".yml",
  ".yaml",
  ".toml",
  ".ini",
  ".env",
  ".txt",
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".html",
  ".graphql",
  ".gql",
  ".sql",
  ".sh",
  ".bash",
  ".zsh",
]);

export const LARGE_FILE_WARN_THRESHOLD = 250 * 1024;
