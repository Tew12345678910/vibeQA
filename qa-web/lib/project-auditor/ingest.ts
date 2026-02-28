import { promises as fs } from "node:fs";
import path from "node:path";

import { MAX_ZIP_BYTES } from "@/lib/project-auditor/constants";
import {
  createIngestionRecord,
  patchIngestionRecord,
  updateIngestionStatus,
  writeZipBuffer,
  zipFilePath,
} from "@/lib/project-auditor/storage";

function sanitizeFileName(fileName: string): string {
  const normalized = fileName.trim().toLowerCase();
  return normalized.replace(/[^a-z0-9._-]/g, "-");
}

function projectNameFromZip(fileName: string): string {
  const cleaned = path.basename(fileName).replace(/\.zip$/i, "");
  const safe = cleaned.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 80);
  return safe || "uploaded-project";
}

function parseGithubRepoUrl(repoUrl: string): {
  owner: string;
  repo: string;
  branch?: string;
  projectNameHint: string;
} {
  const parsed = new URL(repoUrl);
  if (parsed.protocol !== "https:") {
    throw new Error("GitHub URL must use https");
  }

  if (parsed.hostname !== "github.com" && parsed.hostname !== "www.github.com") {
    throw new Error("GitHub URL must point to github.com");
  }

  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments.length < 2) {
    throw new Error("Invalid GitHub repository URL");
  }

  const owner = segments[0];
  const repo = segments[1].replace(/\.git$/i, "");
  if (!owner || !repo) {
    throw new Error("Invalid GitHub repository URL");
  }

  let branch: string | undefined;
  if (segments[2] === "tree" && segments[3]) {
    branch = decodeURIComponent(segments.slice(3).join("/"));
  }

  return {
    owner,
    repo,
    branch,
    projectNameHint: `${owner}-${repo}`,
  };
}

async function fetchDefaultBranch(owner: string, repo: string): Promise<string | null> {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "ProjectStandardsAuditor/1.0",
    },
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    return null;
  }

  const body = (await response.json()) as { default_branch?: string };
  if (!body.default_branch) return null;
  return body.default_branch;
}

async function downloadArchiveToFile(args: {
  url: string;
  destinationPath: string;
  authorizationHeader?: string;
}): Promise<number> {
  const response = await fetch(args.url, {
    headers: {
      "User-Agent": "ProjectStandardsAuditor/1.0",
      Accept: "application/zip,application/octet-stream",
      ...(args.authorizationHeader ? { Authorization: args.authorizationHeader } : {}),
    },
    redirect: "follow",
    signal: AbortSignal.timeout(45_000),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Download failed (${response.status})`);
  }

  const handle = await fs.open(args.destinationPath, "w");
  let total = 0;

  try {
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      total += value.byteLength;
      if (total > MAX_ZIP_BYTES) {
        throw new Error(
          `Repository archive exceeds max size of ${Math.floor(MAX_ZIP_BYTES / (1024 * 1024))}MB`,
        );
      }

      await handle.write(Buffer.from(value));
    }
  } finally {
    await handle.close();
  }

  return total;
}

async function downloadGithubArchive(args: {
  owner: string;
  repo: string;
  branch?: string;
  destinationPath: string;
}): Promise<number> {
  const branchCandidates = new Set<string>();

  if (args.branch) {
    branchCandidates.add(args.branch);
  }

  const defaultBranch = await fetchDefaultBranch(args.owner, args.repo);
  if (defaultBranch) {
    branchCandidates.add(defaultBranch);
  }

  branchCandidates.add("main");
  branchCandidates.add("master");

  let lastError: Error | null = null;

  for (const branch of branchCandidates) {
    const archiveUrl = `https://codeload.github.com/${args.owner}/${args.repo}/zip/refs/heads/${encodeURIComponent(branch)}`;
    try {
      return await downloadArchiveToFile({
        url: archiveUrl,
        destinationPath: args.destinationPath,
      });
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Download failed");
    }
  }

  throw new Error(
    lastError?.message ??
      "Unable to download GitHub archive (repo may be private or branch not found)",
  );
}

/**
 * Downloads a GitHub repository archive using an authenticated GitHub token.
 * Uses the GitHub API endpoint which supports both public and private repos.
 */
async function downloadPrivateGithubArchive(args: {
  owner: string;
  repo: string;
  branch?: string;
  destinationPath: string;
  githubToken: string;
}): Promise<number> {
  // Resolve the default branch if one was not specified.
  const repoInfoRes = await fetch(
    `https://api.github.com/repos/${args.owner}/${args.repo}`,
    {
      headers: {
        Authorization: `token ${args.githubToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "ProjectStandardsAuditor/1.0",
      },
      signal: AbortSignal.timeout(12_000),
    },
  );

  if (!repoInfoRes.ok) {
    throw new Error(
      `GitHub API error ${repoInfoRes.status}: unable to resolve repository. ` +
        "Check the token has the 'repo' scope and the repository exists.",
    );
  }

  const repoInfo = (await repoInfoRes.json()) as { default_branch: string };
  const branch = args.branch ?? repoInfo.default_branch ?? "main";

  // Use the GitHub API zipball endpoint — this works for private repos with a valid token.
  const archiveUrl = `https://api.github.com/repos/${args.owner}/${args.repo}/zipball/${encodeURIComponent(branch)}`;

  return downloadArchiveToFile({
    url: archiveUrl,
    destinationPath: args.destinationPath,
    authorizationHeader: `token ${args.githubToken}`,
  });
}

export async function ingestPrivateGithubRepo(
  repoUrl: string,
  githubToken: string,
) {
  const parsed = parseGithubRepoUrl(repoUrl);
  const record = await createIngestionRecord({
    sourceType: "github",
    sourceLabel: repoUrl,
    zipFileName: "source.zip",
    zipBytes: 0,
    projectNameHint: parsed.projectNameHint,
  });

  let updatedRecord = record;
  try {
    const bytes = await downloadPrivateGithubArchive({
      ...parsed,
      destinationPath: zipFilePath(record.id),
      githubToken,
    });
    updatedRecord = await patchIngestionRecord({
      id: record.id,
      patch: { zipBytes: bytes, status: "ingested", error: null },
    });
  } catch (error) {
    await updateIngestionStatus({
      id: record.id,
      status: "failed",
      error: error instanceof Error ? error.message : "Failed to store archive",
    });
    await fs.rm(zipFilePath(record.id), { force: true });
    throw error;
  }

  return updatedRecord;
}

export async function ingestZipFile(file: File) {
  const fileName = sanitizeFileName(file.name || "upload.zip");
  if (!fileName.endsWith(".zip")) {
    throw new Error("Only .zip files are supported");
  }

  if (file.size <= 0) {
    throw new Error("Uploaded ZIP is empty");
  }

  if (file.size > MAX_ZIP_BYTES) {
    throw new Error(
      `ZIP exceeds max size of ${Math.floor(MAX_ZIP_BYTES / (1024 * 1024))}MB`,
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const record = await createIngestionRecord({
    sourceType: "zip",
    sourceLabel: file.name || "upload.zip",
    zipFileName: fileName,
    zipBytes: buffer.byteLength,
    projectNameHint: projectNameFromZip(file.name || "uploaded-project.zip"),
  });

  await writeZipBuffer(record.id, buffer);
  return record;
}

export async function ingestGithubRepo(repoUrl: string) {
  const parsed = parseGithubRepoUrl(repoUrl);
  const record = await createIngestionRecord({
    sourceType: "github",
    sourceLabel: repoUrl,
    zipFileName: "source.zip",
    zipBytes: 0,
    projectNameHint: parsed.projectNameHint,
  });

  let updatedRecord = record;
  try {
    const bytes = await downloadGithubArchive({
      ...parsed,
      destinationPath: zipFilePath(record.id),
    });
    updatedRecord = await patchIngestionRecord({
      id: record.id,
      patch: { zipBytes: bytes, status: "ingested", error: null },
    });
  } catch (error) {
    await updateIngestionStatus({
      id: record.id,
      status: "failed",
      error: error instanceof Error ? error.message : "Failed to store archive",
    });
    await fs.rm(zipFilePath(record.id), { force: true });
    throw error;
  }

  return updatedRecord;
}

export async function readZipBytes(id: string): Promise<Buffer> {
  const fullPath = zipFilePath(id);
  return fs.readFile(fullPath);
}
