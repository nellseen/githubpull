import fs from 'fs';
import path from 'path';
import { VercelAccount, VercelProject } from './types';
import { cleanJunkFiles, flattenDirectory, extractZip } from './fs_utils';

const VERCEL_API_BASE = 'https://api.vercel.com';

const EXCLUDE_DIRS = ['node_modules', '.git', '.cache', '__pycache__', '.next', 'dist'];
const EXCLUDE_FILES = ['.DS_Store', 'thumbs.db'];

export async function fetchVercelAccountDetails(token: string, index: number, silent: boolean = false): Promise<VercelAccount | null> {
  try {
    const res = await fetch(`${VERCEL_API_BASE}/v2/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'githubpull-vercel-deployer',
      },
    });

    if (!res.ok) {
      if (!silent && process.env.DEBUG === 'true') {
        console.warn(`[Vercel] Token #${index + 1} validation status: ${res.status}`);
      }
      return null;
    }

    const data = (await res.json()) as any;
    const user = data.user;
    if (!user) return null;

    const username = user.username || user.name || `vercel-user-${index + 1}`;
    const email = user.email || `${username}@vercel.com`;

    const account: VercelAccount = {
      index,
      name: `Akun Vercel ${index + 1} (${username})`,
      username,
      email,
      token,
      id: user.id,
      avatar: user.avatar,
    };

    console.log(`[Vercel] Berhasil mendeteksi akun: ${username}`);
    return account;
  } catch (err: any) {
    if (!silent && process.env.DEBUG === 'true') {
      console.warn(`[Vercel] Error token #${index + 1}: ${err.message}`);
    }
    return null;
  }
}

export async function loadVercelAccounts(tokensRaw?: string, silent: boolean = false): Promise<VercelAccount[]> {
  const envRaw = tokensRaw !== undefined ? tokensRaw : (process.env.VERCEL_TOKENS || '');
  let tokens: string[] = [];

  if (!envRaw) {
    const singleToken = process.env.VERCEL_TOKEN || '';
    tokens = singleToken ? [singleToken.trim()] : [];
  } else {
    tokens = envRaw.split(',').map((t) => t.trim()).filter(Boolean);
  }

  const accounts: VercelAccount[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const acc = await fetchVercelAccountDetails(tokens[i], i, silent);
    if (acc) {
      accounts.push(acc);
    }
  }

  return accounts;
}

export async function listVercelProjects(account: VercelAccount): Promise<VercelProject[]> {
  const res = await fetch(`${VERCEL_API_BASE}/v9/projects?limit=50`, {
    headers: {
      Authorization: `Bearer ${account.token}`,
      'User-Agent': 'githubpull-vercel-deployer',
    },
  });

  if (!res.ok) {
    throw new Error(`Gagal mengambil daftar project Vercel: ${res.statusText}`);
  }

  const data = (await res.json()) as any;
  const projects = data.projects || [];

  return projects.map((p: any) => ({
    id: p.id,
    name: p.name,
    framework: p.framework,
    updatedAt: p.updatedAt,
    url: p.targets?.production?.url ? `https://${p.targets.production.url}` : undefined,
  }));
}

export async function deleteVercelProject(account: VercelAccount, projectIdOrName: string): Promise<boolean> {
  const res = await fetch(`${VERCEL_API_BASE}/v9/projects/${encodeURIComponent(projectIdOrName)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${account.token}`,
      'User-Agent': 'githubpull-vercel-deployer',
    },
  });

  return res.status === 200 || res.status === 204;
}

/**
 * Collects project files into payload for Vercel Deployments API
 */
function collectFilesForDeployment(rootDirectory: string): { file: string; data: string; encoding: string }[] {
  const files: { file: string; data: string; encoding: string }[] = [];

  function walk(currentDir: string, relativePrefix: string = '') {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!EXCLUDE_DIRS.includes(entry.name)) {
          walk(path.join(currentDir, entry.name), path.join(relativePrefix, entry.name));
        }
      } else {
        if (!EXCLUDE_FILES.includes(entry.name)) {
          const filePath = path.join(currentDir, entry.name);
          const relativePath = path.join(relativePrefix, entry.name).replace(/\\/g, '/');
          const content = fs.readFileSync(filePath);
          // Files under 10MB can be sent inline base64
          files.push({
            file: relativePath,
            data: content.toString('base64'),
            encoding: 'base64',
          });
        }
      }
    }
  }

  walk(rootDirectory);
  return files;
}

/**
 * Deploys folder to Vercel via Vercel Deployments API v13
 */
export async function deployFolderToVercel(
  account: VercelAccount,
  folderPath: string,
  projectName: string,
  onLog?: (line: string) => void
): Promise<{ success: boolean; url: string; logs: string[] }> {
  const logs: string[] = [];
  const log = (msg: string) => {
    logs.push(msg);
    if (onLog) onLog(msg);
  };

  if (!fs.existsSync(folderPath)) {
    throw new Error(`Folder tidak ditemukan: ${folderPath}`);
  }

  // Clean junk files before deploying
  const cleaned = cleanJunkFiles(folderPath);
  if (cleaned > 0) {
    log(`Pembersihan: ${cleaned} file sampah dihapus.`);
  }

  log(`Membaca file proyek dari ${path.basename(folderPath)}...`);
  const files = collectFilesForDeployment(folderPath);
  log(`Total file yang akan diunggah ke Vercel: ${files.length} file`);

  if (files.length === 0) {
    throw new Error('Direktori kosong atau tidak ada file yang dapat di-deploy!');
  }

  const cleanProjectName = projectName
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_\-\.]/g, '-');

  log(`Menginisialisasi deployment ke Vercel (Project: ${cleanProjectName})...`);

  const deployRes = await fetch(`${VERCEL_API_BASE}/v13/deployments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${account.token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'githubpull-vercel-deployer',
    },
    body: JSON.stringify({
      name: cleanProjectName,
      files,
      target: 'production',
    }),
  });

  if (!deployRes.ok) {
    const errBody = (await deployRes.json()) as any;
    const msg = errBody?.error?.message || deployRes.statusText;
    throw new Error(`Gagal deploy ke Vercel: ${msg}`);
  }

  const deployData = (await deployRes.json()) as any;
  const deploymentId = deployData.id;
  const deploymentUrl = `https://${deployData.url}`;
  const prodAlias = deployData.alias?.[0] ? `https://${deployData.alias[0]}` : deploymentUrl;

  log(`Deployment dibuat! ID: ${deploymentId}`);
  log(`URL Preview: ${deploymentUrl}`);

  // Poll status until ready (max 60 seconds)
  let ready = false;
  let attempts = 0;
  const maxAttempts = 20;

  while (!ready && attempts < maxAttempts) {
    attempts++;
    await new Promise((r) => setTimeout(r, 2000));

    try {
      const checkRes = await fetch(`${VERCEL_API_BASE}/v13/deployments/${deploymentId}`, {
        headers: {
          Authorization: `Bearer ${account.token}`,
        },
      });

      if (checkRes.ok) {
        const checkData = (await checkRes.json()) as any;
        const state = checkData.readyState || checkData.status;
        log(`Status build Vercel: ${state}...`);

        if (state === 'READY') {
          ready = true;
          log(`✅ Vercel Deployment SUKSES! Live di: ${prodAlias}`);
          break;
        } else if (state === 'ERROR' || state === 'CANCELED') {
          throw new Error(`Deployment Vercel berstatus: ${state}`);
        }
      }
    } catch (err: any) {
      if (err.message.includes('Deployment Vercel berstatus:')) throw err;
      // Continue polling on transient network errors
    }
  }

  return {
    success: true,
    url: prodAlias,
    logs,
  };
}

/**
 * Unzips and deploys directly to Vercel
 */
export async function deployZipToVercel(
  account: VercelAccount,
  zipFilePath: string,
  projectName: string,
  targetBaseDir: string,
  onLog?: (line: string) => void
): Promise<{ success: boolean; url: string; logs: string[] }> {
  const cleanProjectName = projectName
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_\-\.]/g, '-');

  const targetDir = path.join(targetBaseDir, cleanProjectName);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  if (onLog) onLog(`Mengekstrak file ZIP ke ${cleanProjectName}...`);
  extractZip(zipFilePath, targetDir);

  if (onLog) onLog('Memeriksa struktur folder...');
  flattenDirectory(targetDir);
  cleanJunkFiles(targetDir);

  return await deployFolderToVercel(account, targetDir, cleanProjectName, onLog);
}
