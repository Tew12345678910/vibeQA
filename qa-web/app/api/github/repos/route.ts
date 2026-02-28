import { NextResponse } from "next/server";

export interface GitHubRepoItem {
  fullName: string;
  name: string;
  isPrivate: boolean;
  htmlUrl: string;
  defaultBranch: string;
  language: string | null;
  description: string | null;
}

interface RawGitHubRepo {
  full_name: string;
  name: string;
  private: boolean;
  html_url: string;
  default_branch: string;
  language: string | null;
  description: string | null;
}

/**
 * Lists repositories accessible by the authenticated GitHub user.
 * The caller must pass the GitHub provider_token (obtained from Supabase
 * GitHub OAuth) in the `x-github-token` header.
 */
export async function GET(request: Request) {
  const token = request.headers.get("x-github-token");
  if (!token) {
    return NextResponse.json(
      { data: null, error: "Missing x-github-token header" },
      { status: 401 },
    );
  }

  const response = await fetch(
    "https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator",
    {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "ProjectStandardsAuditor/1.0",
      },
      signal: AbortSignal.timeout(15_000),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    return NextResponse.json(
      { data: null, error: `GitHub API error ${response.status}: ${body}` },
      { status: response.status },
    );
  }

  const raw = (await response.json()) as RawGitHubRepo[];

  const repos: GitHubRepoItem[] = raw.map((r) => ({
    fullName: r.full_name,
    name: r.name,
    isPrivate: r.private,
    htmlUrl: r.html_url,
    defaultBranch: r.default_branch,
    language: r.language,
    description: r.description,
  }));

  return NextResponse.json({ data: repos, error: null });
}
