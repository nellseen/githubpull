export interface GitHubAccount {
  index: number;
  name: string;
  username: string;
  email: string;
  token: string;
  avatar_url?: string;
  public_repos?: number;
  total_private_repos?: number;
  rateLimit?: {
    limit: number;
    remaining: number;
    reset: number;
  };
}

export interface VercelAccount {
  index: number;
  name: string;
  username: string;
  email: string;
  token: string;
  id?: string;
  avatar?: string;
}

export interface VercelProject {
  id: string;
  name: string;
  framework?: string | null;
  updatedAt?: number;
  url?: string;
}

export interface UserSessionData {
  active_platform?: 'github' | 'vercel';
  state?:
    | 'WAITING_FOLDER_NAME'
    | 'WAITING_ZIP_REPO_NAME'
    | 'WAITING_CLONE_URL'
    | 'WAITING_VERCEL_FOLDER_NAME'
    | 'WAITING_VERCEL_ZIP_PROJECT_NAME'
    | 'WAITING_VERCEL_STARTER_NAME'
    | null;
  selected_account?: GitHubAccount;
  selected_vercel_account?: VercelAccount;
  pending_action?: string;
  temp_zip_path?: string;
  temp_zip_name?: string;
  target_path?: string;
  repo_name?: string;
  vercel_project_name?: string;
}

export interface DeployFolderOptions {
  account: GitHubAccount;
  folderPath: string;
  repoName: string;
  isPrivate?: boolean;
  commitMessage?: string;
}

export interface DeployZipOptions {
  account: GitHubAccount;
  zipFilePath: string;
  repoName: string;
  targetBaseDir: string;
  isPrivate?: boolean;
  flatten?: boolean;
  commitMessage?: string;
}

export interface CloneRepoOptions {
  account: GitHubAccount;
  cloneUrl: string;
  targetBaseDir: string;
  customFolderName?: string;
}

export interface ExecutionResult {
  success: boolean;
  logs: string[];
  finalOutput: string;
}
