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

export interface VercelConfig {
  framework?: string | null;
  buildCommand?: string | null;
  outputDirectory?: string | null;
  installCommand?: string | null;
  devCommand?: string | null;
  cleanUrls?: boolean;
  trailingSlash?: boolean;
  rewrites?: any[];
  redirects?: any[];
  headers?: any[];
  routes?: any[];
  raw?: any;
}

/**
 * Reads and parses vercel.json if present in the project folder
 */
export function readVercelConfig(folderPath: string): VercelConfig | null {
  const vercelJsonPath = path.join(folderPath, 'vercel.json');
  if (!fs.existsSync(vercelJsonPath)) return null;

  try {
    const rawContent = fs.readFileSync(vercelJsonPath, 'utf-8');
    const parsed = JSON.parse(rawContent);
    return {
      framework: parsed.framework !== undefined ? parsed.framework : undefined,
      buildCommand: parsed.buildCommand || parsed.build?.command || null,
      outputDirectory: parsed.outputDirectory || parsed.distDir || parsed.build?.directory || null,
      installCommand: parsed.installCommand || null,
      devCommand: parsed.devCommand || null,
      cleanUrls: parsed.cleanUrls,
      trailingSlash: parsed.trailingSlash,
      rewrites: parsed.rewrites,
      redirects: parsed.redirects,
      headers: parsed.headers,
      routes: parsed.routes,
      raw: parsed,
    };
  } catch (err: any) {
    console.warn(`[Vercel] Gagal membaca vercel.json: ${err.message}`);
    return null;
  }
}

export function detectFramework(folderPath: string): string | null {
  // 1. Prioritaskan framework eksplisit dari vercel.json jika ada
  const vercelCfg = readVercelConfig(folderPath);
  if (vercelCfg && vercelCfg.framework !== undefined) {
    return vercelCfg.framework;
  }

  // 2. Deteksi otomatis dari package.json
  try {
    const pkgPath = path.join(folderPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps['next']) return 'nextjs';
      if (deps['@remix-run/react']) return 'remix';
      if (deps['nuxt'] || deps['nuxt3']) return 'nuxtjs';
      if (deps['astro']) return 'astro';
      if (deps['@sveltejs/kit'] || deps['svelte']) return 'sveltekit';
      if (deps['vue']) return 'vue';
      if (deps['react-scripts']) return 'create-react-app';
      if (deps['vite']) return 'vite';
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Scaffolds a complete HTML5 starter project that is guaranteed to deploy cleanly to Vercel
 */
export function scaffoldStarterProject(targetPath: string, projectName: string): string {
  if (!fs.existsSync(targetPath)) {
    fs.mkdirSync(targetPath, { recursive: true });
  }

  const indexPath = path.join(targetPath, 'index.html');
  const indexContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${projectName} — Vercel</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #000;
      color: #ededed;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 1.5rem;
    }
    .card {
      background: #111;
      border: 1px solid #333;
      border-radius: 16px;
      padding: 2.5rem;
      max-width: 520px;
      width: 100%;
      text-align: center;
      box-shadow: 0 8px 30px rgba(0,0,0,0.5);
    }
    .badge {
      display: inline-block;
      background: #1a1a1a;
      border: 1px solid #444;
      border-radius: 999px;
      padding: 6px 16px;
      font-size: 0.8rem;
      color: #0070f3;
      font-weight: 600;
      margin-bottom: 1.25rem;
    }
    h1 { font-size: 1.85rem; font-weight: 700; margin-bottom: 0.75rem; letter-spacing: -0.02em; }
    p { color: #888; font-size: 0.95rem; line-height: 1.6; margin-bottom: 1.5rem; }
    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: #00e599;
      font-size: 0.85rem;
      font-weight: 600;
      background: rgba(0, 229, 153, 0.1);
      border: 1px solid rgba(0, 229, 153, 0.2);
      padding: 6px 14px;
      border-radius: 999px;
    }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #00e599; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">▲ Vercel Live Deployment</div>
    <h1>${projectName}</h1>
    <p>Halaman ini berhasil di-deploy ke Vercel via Telegram Bot Multi-Cloud Deployer.</p>
    <div class="status-pill">
      <span class="dot"></span>
      <span>Deployment Status: Production Ready</span>
    </div>
  </div>
</body>
</html>`;

  fs.writeFileSync(indexPath, indexContent);
  return indexPath;
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

  // Periksa konfigurasi vercel.json jika ada
  const vercelConfig = readVercelConfig(folderPath);
  if (vercelConfig) {
    log('⚙️ Konfigurasi vercel.json terdeteksi!');
    if (vercelConfig.framework) log(`   • Framework (vercel.json): ${vercelConfig.framework}`);
    if (vercelConfig.buildCommand) log(`   • Build command: ${vercelConfig.buildCommand}`);
    if (vercelConfig.outputDirectory) log(`   • Output directory: ${vercelConfig.outputDirectory}`);
    if (vercelConfig.rewrites?.length) log(`   • Rewrites: ${vercelConfig.rewrites.length} aturan`);
    if (vercelConfig.cleanUrls) log(`   • Clean URLs: aktif`);
  }

  // Pastikan folder memiliki index.html jika tidak ada package.json dan tidak ada vercel.json
  const hasIndex = fs.existsSync(path.join(folderPath, 'index.html'));
  const hasPkg = fs.existsSync(path.join(folderPath, 'package.json'));
  const hasVercelJson = Boolean(vercelConfig);

  if (!hasIndex && !hasPkg && !hasVercelJson) {
    log('Menyiapkan file index.html standar untuk halaman Vercel...');
    scaffoldStarterProject(folderPath, projectName);
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

  const framework = detectFramework(folderPath);
  if (framework) {
    log(`Framework aktif: ${framework}`);
  } else {
    log('Tipe proyek: Static HTML / Static Site');
  }

  log(`Menginisialisasi deployment ke Vercel (Project: ${cleanProjectName})...`);

  const projectSettings: Record<string, any> = {
    framework: framework || null,
  };

  if (vercelConfig?.buildCommand) {
    projectSettings.buildCommand = vercelConfig.buildCommand;
  }
  if (vercelConfig?.outputDirectory) {
    projectSettings.outputDirectory = vercelConfig.outputDirectory;
  }
  if (vercelConfig?.installCommand) {
    projectSettings.installCommand = vercelConfig.installCommand;
  }
  if (vercelConfig?.devCommand) {
    projectSettings.devCommand = vercelConfig.devCommand;
  }

  const deployUrl = `${VERCEL_API_BASE}/v13/deployments?skipAutoDetectionConfirmation=1`;
  const deployRes = await fetch(deployUrl, {
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
      projectSettings,
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
