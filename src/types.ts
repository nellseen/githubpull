export interface GitHubAccount {
  index: number;
  name: string;
  username: string;
  email: string;
  tokenMasked?: string;
  avatar_url?: string;
  public_repos?: number;
  total_private_repos?: number;
  rateLimit?: {
    limit: number;
    remaining: number;
    reset: number;
  };
}

export interface RepoItem {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  private: boolean;
  fork: boolean;
  stargazers_count: number;
  forks_count: number;
  updated_at: string;
  default_branch: string;
  size: number;
  language: string | null;
  clone_url: string;
  ssh_url: string;
}

export interface WorkspaceFolder {
  name: string;
  relativePath: string;
  fullPath: string;
  hasGit: boolean;
  fileCount: number;
  updatedAt: string;
}

export interface SystemStatus {
  status: string;
  accountsCount: number;
  accounts: {
    index: number;
    name: string;
    username: string;
    avatar_url?: string;
    public_repos?: number;
  }[];
  baseDir: string;
  wsClientsCount: number;
  telegramConfigured: boolean;
  telegramBotName?: string | null;
  serverTime: string;
}
