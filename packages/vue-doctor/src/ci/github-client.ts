/**
 * Lightweight GitHub REST API client for CI and PR feedback using native fetch.
 */

export interface GitHubClientOptions {
  token: string;
  apiUrl?: string;
}

export interface GitHubComment {
  id: number;
  body: string;
  user?: { login: string };
  created_at?: string;
  updated_at?: string;
}

export interface GitHubReviewComment extends GitHubComment {
  path: string;
  line?: number;
  original_line?: number;
  commit_id?: string;
}

export interface CreateReviewCommentParams {
  body: string;
  commit_id: string;
  path: string;
  line: number;
  side?: "RIGHT" | "LEFT";
}

export interface CheckRunAnnotation {
  path: string;
  start_line: number;
  end_line: number;
  annotation_level: "notice" | "warning" | "failure";
  message: string;
  title?: string;
  raw_details?: string;
}

export interface CreateCheckRunParams {
  name: string;
  head_sha: string;
  status: "queued" | "in_progress" | "completed";
  conclusion?: "success" | "failure" | "neutral" | "cancelled" | "skipped" | "timed_out" | "action_required";
  output?: {
    title: string;
    summary: string;
    annotations?: CheckRunAnnotation[];
  };
}

export interface CreateCommitStatusParams {
  state: "error" | "failure" | "pending" | "success";
  description?: string;
  context?: string;
  target_url?: string;
}

export class GitHubClient {
  private readonly token: string;
  private readonly apiUrl: string;

  constructor(options: GitHubClientOptions) {
    this.token = options.token;
    this.apiUrl = (options.apiUrl ?? process.env.GITHUB_API_URL ?? "https://api.github.com").replace(/\/+$/, "");
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.apiUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
    const headers = {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${this.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "vue-doctor-ci",
      ...(options.headers as Record<string, string>),
    };

    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GitHub API request failed [${response.status} ${response.statusText}]: ${errorText}`);
    }

    if (response.status === 204) {
      return undefined as unknown as T;
    }
    return (await response.json()) as T;
  }

  async getPullRequest(owner: string, repo: string, pullNumber: number): Promise<any> {
    return this.request(`/repos/${owner}/${repo}/pulls/${pullNumber}`);
  }

  async listIssueComments(owner: string, repo: string, issueNumber: number): Promise<GitHubComment[]> {
    return this.request<GitHubComment[]>(`/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100`);
  }

  async createIssueComment(owner: string, repo: string, issueNumber: number, body: string): Promise<GitHubComment> {
    return this.request<GitHubComment>(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
  }

  async updateIssueComment(owner: string, repo: string, commentId: number, body: string): Promise<GitHubComment> {
    return this.request<GitHubComment>(`/repos/${owner}/${repo}/issues/comments/${commentId}`, {
      method: "PATCH",
      body: JSON.stringify({ body }),
    });
  }

  async deleteIssueComment(owner: string, repo: string, commentId: number): Promise<void> {
    return this.request<void>(`/repos/${owner}/${repo}/issues/comments/${commentId}`, {
      method: "DELETE",
    });
  }

  async listReviewComments(owner: string, repo: string, pullNumber: number): Promise<GitHubReviewComment[]> {
    return this.request<GitHubReviewComment[]>(`/repos/${owner}/${repo}/pulls/${pullNumber}/comments?per_page=100`);
  }

  async createReviewComment(
    owner: string,
    repo: string,
    pullNumber: number,
    params: CreateReviewCommentParams,
  ): Promise<GitHubReviewComment> {
    return this.request<GitHubReviewComment>(`/repos/${owner}/${repo}/pulls/${pullNumber}/comments`, {
      method: "POST",
      body: JSON.stringify({
        body: params.body,
        commit_id: params.commit_id,
        path: params.path,
        line: params.line,
        side: params.side ?? "RIGHT",
      }),
    });
  }

  async updateReviewComment(owner: string, repo: string, commentId: number, body: string): Promise<GitHubReviewComment> {
    return this.request<GitHubReviewComment>(`/repos/${owner}/${repo}/pulls/comments/${commentId}`, {
      method: "PATCH",
      body: JSON.stringify({ body }),
    });
  }

  async deleteReviewComment(owner: string, repo: string, commentId: number): Promise<void> {
    return this.request<void>(`/repos/${owner}/${repo}/pulls/comments/${commentId}`, {
      method: "DELETE",
    });
  }

  async createCheckRun(owner: string, repo: string, params: CreateCheckRunParams): Promise<any> {
    return this.request(`/repos/${owner}/${repo}/check-runs`, {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  async createCommitStatus(owner: string, repo: string, sha: string, params: CreateCommitStatusParams): Promise<any> {
    return this.request(`/repos/${owner}/${repo}/statuses/${sha}`, {
      method: "POST",
      body: JSON.stringify(params),
    });
  }
}
