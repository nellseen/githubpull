import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { 
  GitHubAccount, 
  DeployFolderOptions, 
  DeployZipOptions, 
  CloneRepoOptions, 
  ExecutionResult 
} from './types';
import { cleanJunkFiles, flattenDirectory, extractZip } from './fs_utils';
import { checkOrCreateRepo, validateGitHubUrl, buildAuthenticatedUrl } from './github';

/**
 * Runs shell command with real-time stream logging (matches run_command_with_live_log in python)
 */
export function runCommandWithLiveLog(
  cmd: string,
  cwd: string,
  onLine?: (line: string) => void,
  maskToken?: string
): Promise<ExecutionResult> {
  return new Promise((resolve) => {
    const logs: string[] = [];
    const proc = spawn(cmd, { cwd, shell: true });

    const handleOutput = (data: Buffer) => {
      const text = data.toString('utf-8');
      const lines = text.split('\n');
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (line) {
          const sanitized = maskToken ? line.replace(new RegExp(maskToken, 'g'), '****') : line;
          logs.push(sanitized);
          if (onLine) onLine(sanitized);
        }
      }
    };

    proc.stdout.on('data', handleOutput);
    proc.stderr.on('data', handleOutput);

    proc.on('close', (code) => {
      const finalOutput = logs.slice(-20).join('\n') || 'Selesai tanpa output.';
      resolve({
        success: code === 0,
        logs,
        finalOutput,
      });
    });

    proc.on('error', (err) => {
      const errLine = `Gagal menjalankan perintah: ${err.message}`;
      logs.push(errLine);
      if (onLine) onLine(errLine);
      resolve({
        success: false,
        logs,
        finalOutput: errLine,
      });
    });
  });
}

/**
 * Executes Folder deployment workflow
 */
export async function deployFolderWorkflow(
  options: DeployFolderOptions,
  onLog?: (line: string) => void
): Promise<ExecutionResult> {
  const { account, folderPath, repoName, isPrivate = false, commitMessage = 'Auto deploy/update via Telegram Bot' } = options;

  if (!fs.existsSync(folderPath)) {
    throw new Error(`Folder tidak ditemukan: ${folderPath}`);
  }

  // 1. Clean junk files
  const cleaned = cleanJunkFiles(folderPath);
  if (cleaned > 0 && onLog) {
    onLog(`Membersihkan ${cleaned} file sampah (.DS_Store, cache, dll)`);
  }

  // 2. Ensure remote repo exists
  if (onLog) onLog(`Memeriksa repository ${account.username}/${repoName} di GitHub...`);
  await checkOrCreateRepo(account, repoName, isPrivate);

  // 3. Build git command chain
  const remoteUrl = `https://${account.username}:${account.token}@github.com/${account.username}/${repoName}.git`;
  const sanitizedRemote = `https://${account.username}:****@github.com/${account.username}/${repoName}.git`;

  const cmd = `
    git init && \
    git config user.name "${account.username}" && \
    git config user.email "${account.email}" && \
    git branch -M main && \
    git remote remove origin 2>/dev/null || true && \
    git remote add origin ${remoteUrl} && \
    git add . && \
    git commit -m "${commitMessage}" || true && \
    git push -u origin main --force
  `;

  if (onLog) {
    onLog(`Menginisialisasi Git dan menghubungkan ke ${sanitizedRemote}...`);
  }

  return await runCommandWithLiveLog(cmd, folderPath, onLog, account.token);
}

/**
 * Executes ZIP deployment workflow
 */
export async function deployZipWorkflow(
  options: DeployZipOptions,
  onLog?: (line: string) => void
): Promise<ExecutionResult> {
  const { 
    account, 
    zipFilePath, 
    repoName, 
    targetBaseDir, 
    isPrivate = false, 
    flatten = true, 
    commitMessage = 'Auto deploy ZIP via Telegram Bot' 
  } = options;

  const targetDir = path.join(targetBaseDir, repoName);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  if (onLog) onLog(`Mengekstrak file ZIP ke ${repoName}...`);
  extractZip(zipFilePath, targetDir);

  if (flatten) {
    if (onLog) onLog('Memeriksa dan meratakan struktur folder jika bertingkat...');
    flattenDirectory(targetDir);
  }

  cleanJunkFiles(targetDir);

  return await deployFolderWorkflow({
    account,
    folderPath: targetDir,
    repoName,
    isPrivate,
    commitMessage,
  }, onLog);
}

/**
 * Executes Git Clone / Git Pull workflow
 */
export async function cloneOrPullWorkflow(
  options: CloneRepoOptions,
  onLog?: (line: string) => void
): Promise<ExecutionResult> {
  const { account, cloneUrl, targetBaseDir, customFolderName } = options;

  if (!validateGitHubUrl(cloneUrl)) {
    throw new Error('URL GitHub tidak valid! Format: https://github.com/username/repo');
  }

  const repoNameFromUrl = cloneUrl.replace(/\.git$/, '').split('/').pop() || 'repo';
  const folderName = customFolderName || repoNameFromUrl;
  const targetDir = path.join(targetBaseDir, folderName);

  const authenticatedUrl = buildAuthenticatedUrl(cloneUrl, account);

  if (fs.existsSync(targetDir)) {
    if (onLog) onLog(`Folder ${folderName} sudah ada. Menjalankan git pull...`);
    const cmd = `git pull`;
    return await runCommandWithLiveLog(cmd, targetDir, onLog, account.token);
  } else {
    if (onLog) onLog(`Melakukan clone repository ${repoNameFromUrl} ke ${folderName}...`);
    const cmd = `git clone ${authenticatedUrl} "${folderName}"`;
    return await runCommandWithLiveLog(cmd, targetBaseDir, onLog, account.token);
  }
}
