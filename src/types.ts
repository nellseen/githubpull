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

export interface UserSessionData {
  state?: 'WAITING_FOLDER_NAME' | 'WAITING_ZIP_REPO_NAME' | 'WAITING_CLONE_URL' | null;
  selected_account?: GitHubAccount;
  pending_action?: string;
  temp_zip_path?: string;
  temp_zip_name?: string;
  target_path?: string;
  repo_name?: string;
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
