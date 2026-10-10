import express, { Request, Response } from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { spawn } from 'child_process';
import multer from 'multer';
import AdmZip from 'adm-zip';
import dotenv from 'dotenv';
import cors from 'cors';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Multer for ZIP file uploads
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const upload = multer({ dest: uploadDir });

// Deployment base directory
const BASE_DIR = process.env.BASE_DIR || path.join(process.cwd(), 'deployments');
if (!fs.existsSync(BASE_DIR)) {
  fs.mkdirSync(BASE_DIR, { recursive: true });
  // Seed a sample starter project so user can immediately test folder deployment
  const sampleDir = path.join(BASE_DIR, 'sample-app');
  if (!fs.existsSync(sampleDir)) {
    fs.mkdirSync(sampleDir, { recursive: true });
    fs.writeFileSync(
      path.join(sampleDir, 'README.md'),
      '# Sample Application\n\nDeployed via GitHub Pull & Multi-Account Deployer.\n'
    );
    fs.writeFileSync(
      path.join(sampleDir, 'index.js'),
      'console.log("Hello from GitHub Deployer!");\n'
    );
  }
}

const IGNORE_LIST = ['.DS_Store', '__pycache__', '.cache', 'thumbs.db', '.git'];

// Active WebSocket clients
const wsClients = new Set<WebSocket>();

wss.on('connection', (ws) => {
  wsClients.add(ws);
  ws.send(JSON.stringify({
    type: 'system',
    message: 'Connected to GitHub Deployer WebSocket server',
    timestamp: new Date().toISOString()
  }));

  ws.on('message', (data) => {
    try {
      const parsed = JSON.parse(data.toString());
      if (parsed.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      }
    } catch {
      // ignore
    }
  });

  ws.on('close', () => {
    wsClients.delete(ws);
  });
});

function broadcastWs(data: object) {
  const payload = JSON.stringify(data);
  for (const client of wsClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

// In-memory GitHub accounts cache & token list
interface GitHubAccount {
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

let activeTokens: string[] = [];

// Initialize tokens from env
function getInitialTokens(): string[] {
  const ghTokens = process.env.GH_TOKENS || '';
  const singleToken = process.env.GH_TOKEN || '';
  const tokens = ghTokens
    ? ghTokens.split(',').map((t) => t.trim()).filter(Boolean)
    : (singleToken ? [singleToken.trim()] : []);
  return tokens;
}

activeTokens = getInitialTokens();
let cachedAccounts: GitHubAccount[] = [];

async function fetchAccountDetails(token: string, index: number): Promise<GitHubAccount | null> {
  const headers = {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'githubpull-deployer-node',
  };

  try {
    const userRes = await fetch('https://api.github.com/user', { headers });
    if (!userRes.ok) {
      return null;
    }
    const userData = (await userRes.json()) as any;
    const username = userData.login;
    let email = userData.email;

    // Check emails if private
    if (!email) {
      try {
        const emailsRes = await fetch('https://api.github.com/user/emails', { headers });
        if (emailsRes.ok) {
          const emails = (await emailsRes.json()) as any[];
          const primary = emails.find((e) => e.primary && e.verified);
          if (primary) email = primary.email;
        }
      } catch {
        // ignore
      }
    }

    if (!email) {
      email = `${username}@users.noreply.github.com`;
    }

    // Rate limit info
    const rateLimit = {
      limit: parseInt(userRes.headers.get('x-ratelimit-limit') || '5000', 10),
      remaining: parseInt(userRes.headers.get('x-ratelimit-remaining') || '5000', 10),
      reset: parseInt(userRes.headers.get('x-ratelimit-reset') || '0', 10),
    };

    return {
      index,
      name: `Account ${index + 1} (${username})`,
      username,
      email,
      token,
      avatar_url: userData.avatar_url,
      public_repos: userData.public_repos,
      total_private_repos: userData.total_private_repos,
      rateLimit,
    };
  } catch (err) {
    console.error(`Failed to load GitHub account for token #${index}:`, err);
    return null;
  }
}

async function refreshAccounts() {
  const accounts: GitHubAccount[] = [];
  for (let i = 0; i < activeTokens.length; i++) {
    const acc = await fetchAccountDetails(activeTokens[i], i);
    if (acc) {
      accounts.push(acc);
    }
  }
  cachedAccounts = accounts;
  return cachedAccounts;
}

// Initial load
refreshAccounts().catch(console.error);

// Clean junk files helper
function cleanJunkFiles(directory: string): number {
  let cleanedCount = 0;
  function walk(currentDir: string) {
    if (!fs.existsSync(currentDir)) return;
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (IGNORE_LIST.includes(entry.name)) {
        try {
          if (entry.isDirectory()) {
            if (entry.name !== '.git') {
              fs.rmSync(fullPath, { recursive: true, force: true });
              cleanedCount++;
            }
          } else {
            fs.unlinkSync(fullPath);
            cleanedCount++;
          }
        } catch {
          // ignore
        }
      } else if (entry.isDirectory()) {
        walk(fullPath);
      }
    }
  }
  walk(directory);
  return cleanedCount;
}

// Flatten directory helper (if zip has single top-level folder)
function flattenDirectory(targetDir: string) {
  let iterations = 0;
  while (iterations < 5) {
    const items = fs.readdirSync(targetDir).filter((item) => item !== '.git' && !IGNORE_LIST.includes(item));
    if (items.length === 1) {
      const singlePath = path.join(targetDir, items[0]);
      if (fs.statSync(singlePath).isDirectory()) {
        const subItems = fs.readdirSync(singlePath);
        for (const sub of subItems) {
          const from = path.join(singlePath, sub);
          const to = path.join(targetDir, sub);
          fs.renameSync(from, to);
        }
        fs.rmdirSync(singlePath);
        iterations++;
        continue;
      }
    }
    break;
  }
}

// Safe execution helper with real-time log streaming
function runCommandStreaming(
  cmd: string,
  args: string[],
  cwd: string,
  onLog: (line: string, isError: boolean) => void
): Promise<{ success: boolean; output: string }> {
  return new Promise((resolve) => {
    let combinedOutput = '';
    const proc = spawn(cmd, args, { cwd, shell: true });

    proc.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (line.trim()) {
          combinedOutput += line + '\n';
          onLog(line, false);
        }
      }
    });

    proc.stderr.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (line.trim()) {
          combinedOutput += line + '\n';
          onLog(line, true);
        }
      }
    });

    proc.on('close', (code) => {
      resolve({
        success: code === 0,
        output: combinedOutput,
      });
    });

    proc.on('error', (err) => {
      const errorMsg = `Command failed: ${err.message}`;
      combinedOutput += errorMsg + '\n';
      onLog(errorMsg, true);
      resolve({
        success: false,
        output: combinedOutput,
      });
    });
  });
}

// ----------------- API ROUTES -----------------

// Status
app.get('/api/status', async (req: Request, res: Response) => {
  const telegramTokenSet = Boolean(process.env.TELEGRAM_BOT_TOKEN);
  let telegramBotName: string | null = null;

  if (telegramTokenSet) {
    try {
      const tgRes = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getMe`);
      if (tgRes.ok) {
        const tgData = (await tgRes.json()) as any;
        telegramBotName = tgData.result?.username || null;
      }
    } catch {
      // ignore
    }
  }

  res.json({
    status: 'online',
    accountsCount: cachedAccounts.length,
    accounts: cachedAccounts.map((a) => ({
      index: a.index,
      name: a.name,
      username: a.username,
      avatar_url: a.avatar_url,
      public_repos: a.public_repos,
    })),
    baseDir: BASE_DIR,
    wsClientsCount: wsClients.size,
    telegramConfigured: telegramTokenSet,
    telegramBotName,
    serverTime: new Date().toISOString(),
  });
});

// Accounts
app.get('/api/accounts', async (req: Request, res: Response) => {
  const refreshed = await refreshAccounts();
  // Return accounts with masked tokens for security
  const safeAccounts = refreshed.map((acc) => ({
    ...acc,
    tokenMasked: acc.token.slice(0, 4) + '...' + acc.token.slice(-4),
  }));
  res.json(safeAccounts);
});

// Add / Validate Token
app.post('/api/accounts/add', async (req: Request, res: Response) => {
  const { token } = req.body;
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'Token is required' });
  }

  const trimmed = token.trim();
  const acc = await fetchAccountDetails(trimmed, activeTokens.length);
  if (!acc) {
    return res.status(400).json({ error: 'Invalid GitHub token or insufficient permissions.' });
  }

  if (!activeTokens.includes(trimmed)) {
    activeTokens.push(trimmed);
  }
  await refreshAccounts();

  res.json({
    success: true,
    account: {
      ...acc,
      tokenMasked: trimmed.slice(0, 4) + '...' + trimmed.slice(-4),
    },
  });
});

// Remove Account
app.delete('/api/accounts/:index', async (req: Request, res: Response) => {
  const idx = parseInt(req.params.index, 10);
  if (isNaN(idx) || idx < 0 || idx >= activeTokens.length) {
    return res.status(400).json({ error: 'Invalid account index' });
  }

  activeTokens.splice(idx, 1);
  await refreshAccounts();
  res.json({ success: true, remaining: cachedAccounts.length });
});

// Repositories for an account
app.get('/api/repos', async (req: Request, res: Response) => {
  const accountIndex = parseInt(req.query.accountIndex as string, 10) || 0;
  const account = cachedAccounts[accountIndex];

  if (!account) {
    return res.status(404).json({ error: 'GitHub account not found. Please add a valid GitHub token.' });
  }

  try {
    const headers = {
      Authorization: `token ${account.token}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'githubpull-deployer-node',
    };

    const reposRes = await fetch(
      'https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator',
      { headers }
    );

    if (!reposRes.ok) {
      const errBody = await reposRes.text();
      return res.status(reposRes.status).json({ error: `GitHub API error: ${errBody}` });
    }

    const repos = await reposRes.json();
    res.json(repos);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch repositories' });
  }
});

// Create repository
app.post('/api/repos', async (req: Request, res: Response) => {
  const { accountIndex = 0, name, description = '', isPrivate = false } = req.body;
  const account = cachedAccounts[accountIndex];
  if (!account) {
    return res.status(400).json({ error: 'Selected account not found' });
  }

  try {
    const response = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers: {
        Authorization: `token ${account.token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'githubpull-deployer-node',
      },
      body: JSON.stringify({
        name,
        description,
        private: Boolean(isPrivate),
        auto_init: true,
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      return res.status(response.status).json({ error: err.message || 'Failed to create repo' });
    }

    const newRepo = await response.json();
    res.json({ success: true, repo: newRepo });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete repository
app.delete('/api/repos/:owner/:repo', async (req: Request, res: Response) => {
  const accountIndex = parseInt(req.query.accountIndex as string, 10) || 0;
  const account = cachedAccounts[accountIndex];
  const { owner, repo } = req.params;

  if (!account) {
    return res.status(400).json({ error: 'Selected account not found' });
  }

  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      method: 'DELETE',
      headers: {
        Authorization: `token ${account.token}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'githubpull-deployer-node',
      },
    });

    if (response.status === 204) {
      res.json({ success: true, message: `Repository ${owner}/${repo} deleted successfully` });
    } else {
      const errData = await response.text();
      res.status(response.status).json({ error: errData || 'Failed to delete repository' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Workspace folders list
app.get('/api/workspace/folders', (req: Request, res: Response) => {
  try {
    if (!fs.existsSync(BASE_DIR)) {
      return res.json([]);
    }

    const items = fs.readdirSync(BASE_DIR, { withFileTypes: true });
    const folders = items
      .filter((i) => i.isDirectory())
      .map((dir) => {
        const fullPath = path.join(BASE_DIR, dir.name);
        const hasGit = fs.existsSync(path.join(fullPath, '.git'));
        let fileCount = 0;
        try {
          fileCount = fs.readdirSync(fullPath).length;
        } catch {
          // ignore
        }
        const stat = fs.statSync(fullPath);

        return {
          name: dir.name,
          relativePath: dir.name,
          fullPath,
          hasGit,
          fileCount,
          updatedAt: stat.mtime,
        };
      });

    res.json(folders);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create folder in workspace
app.post('/api/workspace/folders', (req: Request, res: Response) => {
  const { folderName } = req.body;
  if (!folderName) {
    return res.status(400).json({ error: 'Folder name is required' });
  }
  const cleanName = folderName.trim().replace(/[^a-zA-Z0-9_\-\.]/g, '-');
  const targetPath = path.join(BASE_DIR, cleanName);

  if (fs.existsSync(targetPath)) {
    return res.status(400).json({ error: 'Folder already exists' });
  }

  fs.mkdirSync(targetPath, { recursive: true });
  fs.writeFileSync(path.join(targetPath, 'README.md'), `# ${cleanName}\n\nCreated on ${new Date().toLocaleString()}\n`);

  res.json({ success: true, folderName: cleanName });
});

// Deploy local folder to GitHub (SSE streaming)
app.get('/api/deploy/folder/stream', async (req: Request, res: Response) => {
  const accountIndex = parseInt(req.query.accountIndex as string, 10) || 0;
  const folderName = req.query.folderName as string;
  const rawRepoName = req.query.repoName as string;
  const isPrivate = req.query.isPrivate === 'true';
  const commitMessage = (req.query.commitMessage as string) || 'Auto deploy via GitHub Pull & Deployer';

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendEvent = (event: string, data: any) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    broadcastWs({ type: event, ...data });
  };

  const account = cachedAccounts[accountIndex];
  if (!account) {
    sendEvent('error', { message: 'GitHub account not found' });
    return res.end();
  }

  if (!folderName) {
    sendEvent('error', { message: 'Folder name is required' });
    return res.end();
  }

  const targetPath = path.join(BASE_DIR, folderName);
  if (!fs.existsSync(targetPath)) {
    sendEvent('error', { message: `Folder does not exist: ${folderName}` });
    return res.end();
  }

  const repoName = (rawRepoName || folderName).trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9_\-\.]/g, '-');

  sendEvent('log', { message: `Starting deployment of folder: ${folderName} to repo: ${repoName}` });
  sendEvent('log', { message: `Selected GitHub Account: ${account.username} (${account.email})` });

  // Clean junk
  const cleaned = cleanJunkFiles(targetPath);
  if (cleaned > 0) {
    sendEvent('log', { message: `Cleaned ${cleaned} junk/cache file(s)` });
  }

  // Ensure remote repo exists
  try {
    const headers = {
      Authorization: `token ${account.token}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'githubpull-deployer-node',
    };

    sendEvent('log', { message: `Checking if repository ${account.username}/${repoName} exists on GitHub...` });
    const checkRes = await fetch(`https://api.github.com/repos/${account.username}/${repoName}`, { headers });

    if (checkRes.status === 404) {
      sendEvent('log', { message: `Repository does not exist. Creating ${repoName} (${isPrivate ? 'Private' : 'Public'})...` });
      const createRes = await fetch('https://api.github.com/user/repos', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: repoName, private: isPrivate }),
      });
      if (!createRes.ok) {
        const createErr = await createRes.json();
        sendEvent('error', { message: `Failed to create repo on GitHub: ${createErr.message}` });
        return res.end();
      }
      sendEvent('log', { message: `Repository ${repoName} created successfully!` });
    } else {
      sendEvent('log', { message: `Repository ${account.username}/${repoName} exists. Preparing push...` });
    }
  } catch (err: any) {
    sendEvent('error', { message: `Error verifying repo on GitHub: ${err.message}` });
    return res.end();
  }

  // Git steps
  const remoteUrl = `https://${account.username}:${account.token}@github.com/${account.username}/${repoName}.git`;
  const sanitizedRemote = `https://${account.username}:****@github.com/${account.username}/${repoName}.git`;

  sendEvent('log', { message: `Configuring git repository at ${folderName}...` });

  const commands = [
    { cmd: 'git', args: ['init'] },
    { cmd: 'git', args: ['config', 'user.name', `"${account.username}"`] },
    { cmd: 'git', args: ['config', 'user.email', `"${account.email}"`] },
    { cmd: 'git', args: ['branch', '-M', 'main'] },
    { cmd: 'git', args: ['remote', 'remove', 'origin'], ignoreError: true },
    { cmd: 'git', args: ['remote', 'add', 'origin', remoteUrl], logMask: sanitizedRemote },
    { cmd: 'git', args: ['add', '.'] },
    { cmd: 'git', args: ['commit', '-m', `"${commitMessage}"`], ignoreError: true },
    { cmd: 'git', args: ['push', '-u', 'origin', 'main', '--force'], logMask: 'git push -u origin main --force' },
  ];

  for (const step of commands) {
    const displayCmd = step.logMask || `${step.cmd} ${step.args.join(' ')}`;
    sendEvent('log', { message: `$ ${displayCmd}` });

    const result = await runCommandStreaming(step.cmd, step.args, targetPath, (line, isErr) => {
      // Mask token if present
      const safeLine = line.replace(account.token, '****');
      sendEvent('log', { message: safeLine, isError: isErr });
    });

    if (!result.success && !step.ignoreError) {
      sendEvent('error', { message: `Command failed: ${displayCmd}` });
      return res.end();
    }
  }

  sendEvent('success', {
    message: `Deployment successful!`,
    repoUrl: `https://github.com/${account.username}/${repoName}`,
  });
  res.end();
});

// Unzip and Deploy ZIP
app.post('/api/deploy/zip', upload.single('zipFile'), async (req: Request, res: Response) => {
  const accountIndex = parseInt(req.body.accountIndex as string, 10) || 0;
  const rawRepoName = req.body.repoName as string;
  const isPrivate = req.body.isPrivate === 'true' || req.body.isPrivate === true;
  const flatten = req.body.flatten !== 'false';
  const commitMessage = (req.body.commitMessage as string) || 'Auto deploy ZIP via GitHub Pull & Deployer';

  if (!req.file) {
    return res.status(400).json({ error: 'No ZIP file uploaded' });
  }

  const account = cachedAccounts[accountIndex];
  if (!account) {
    try { fs.unlinkSync(req.file.path); } catch {}
    return res.status(400).json({ error: 'Selected account not found' });
  }

  const zipOriginalName = req.file.originalname || 'project.zip';
  const fallbackRepoName = path.basename(zipOriginalName, path.extname(zipOriginalName));
  const repoName = (rawRepoName || fallbackRepoName)
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9_\-\.]/g, '-');

  const targetDir = path.join(BASE_DIR, repoName);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const logs: string[] = [];
  const addLog = (msg: string) => {
    logs.push(msg);
    broadcastWs({ type: 'zip_log', repoName, message: msg });
  };

  try {
    addLog(`Unpacking ${zipOriginalName} into ${repoName}...`);
    const zip = new AdmZip(req.file.path);
    zip.extractAllTo(targetDir, true);
    // Remove temp upload file
    try { fs.unlinkSync(req.file.path); } catch {}

    if (flatten) {
      addLog('Flattening nested directory structure...');
      flattenDirectory(targetDir);
    }

    const cleaned = cleanJunkFiles(targetDir);
    addLog(`Cleaned ${cleaned} cache and metadata file(s)`);

    // Ensure repo exists on GitHub
    const headers = {
      Authorization: `token ${account.token}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'githubpull-deployer-node',
    };

    addLog(`Checking GitHub repository ${account.username}/${repoName}...`);
    const checkRes = await fetch(`https://api.github.com/repos/${account.username}/${repoName}`, { headers });

    if (checkRes.status === 404) {
      addLog(`Creating repository ${account.username}/${repoName}...`);
      const createRes = await fetch('https://api.github.com/user/repos', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: repoName, private: isPrivate }),
      });
      if (!createRes.ok) {
        throw new Error('Failed to create repository on GitHub');
      }
      addLog('Repository created on GitHub!');
    }

    const remoteUrl = `https://${account.username}:${account.token}@github.com/${account.username}/${repoName}.git`;

    addLog('Initializing Git and preparing commit...');
    const commands = [
      { cmd: 'git', args: ['init'] },
      { cmd: 'git', args: ['config', 'user.name', `"${account.username}"`] },
      { cmd: 'git', args: ['config', 'user.email', `"${account.email}"`] },
      { cmd: 'git', args: ['branch', '-M', 'main'] },
      { cmd: 'git', args: ['remote', 'remove', 'origin'], ignoreError: true },
      { cmd: 'git', args: ['remote', 'add', 'origin', remoteUrl] },
      { cmd: 'git', args: ['add', '.'] },
      { cmd: 'git', args: ['commit', '-m', `"${commitMessage}"`], ignoreError: true },
      { cmd: 'git', args: ['push', '-u', 'origin', 'main', '--force'] },
    ];

    for (const step of commands) {
      const res = await runCommandStreaming(step.cmd, step.args, targetDir, (line) => {
        const masked = line.replace(account.token, '****');
        addLog(masked);
      });
      if (!res.success && !step.ignoreError) {
        throw new Error(`Git step failed: ${step.cmd} ${step.args[0]}`);
      }
    }

    addLog(`✅ Successfully deployed ZIP to https://github.com/${account.username}/${repoName}`);
    return res.json({
      success: true,
      repoName,
      repoUrl: `https://github.com/${account.username}/${repoName}`,
      logs,
    });
  } catch (err: any) {
    addLog(`❌ Deployment error: ${err.message}`);
    return res.status(500).json({ error: err.message, logs });
  }
});

// Clone / Pull repo (SSE streaming)
app.get('/api/git/clone/stream', async (req: Request, res: Response) => {
  const accountIndex = parseInt(req.query.accountIndex as string, 10) || 0;
  const cloneUrl = (req.query.cloneUrl as string || '').trim();
  const customFolderName = (req.query.folderName as string || '').trim();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendEvent = (event: string, data: any) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    broadcastWs({ type: event, ...data });
  };

  const account = cachedAccounts[accountIndex];
  if (!account) {
    sendEvent('error', { message: 'GitHub account not found' });
    return res.end();
  }

  const githubPattern = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:\.git)?$/;
  if (!githubPattern.test(cloneUrl)) {
    sendEvent('error', { message: 'Invalid GitHub URL format. Example: https://github.com/user/repo' });
    return res.end();
  }

  const repoNameFromUrl = cloneUrl.replace(/\.git$/, '').split('/').pop() || 'repo';
  const targetFolderName = customFolderName || repoNameFromUrl;
  const targetDir = path.join(BASE_DIR, targetFolderName);

  // Authenticate URL with account token if GitHub
  let authenticatedUrl = cloneUrl;
  if (cloneUrl.includes('github.com')) {
    authenticatedUrl = cloneUrl.replace(
      'https://github.com/',
      `https://${account.username}:${account.token}@github.com/`
    );
  }

  const folderExists = fs.existsSync(targetDir);

  if (folderExists) {
    sendEvent('log', { message: `Directory '${targetFolderName}' exists. Running 'git pull'...` });
    const pullRes = await runCommandStreaming('git', ['pull'], targetDir, (line, isErr) => {
      sendEvent('log', { message: line.replace(account.token, '****'), isError: isErr });
    });
    if (pullRes.success) {
      sendEvent('success', { message: `Repository updated successfully with git pull!`, folder: targetFolderName });
    } else {
      sendEvent('error', { message: 'git pull failed' });
    }
    return res.end();
  } else {
    sendEvent('log', { message: `Cloning repository ${cloneUrl} into ${targetFolderName}...` });
    const cloneRes = await runCommandStreaming(
      'git',
      ['clone', authenticatedUrl, targetFolderName],
      BASE_DIR,
      (line, isErr) => {
        sendEvent('log', { message: line.replace(account.token, '****'), isError: isErr });
      }
    );
    if (cloneRes.success) {
      sendEvent('success', { message: `Repository cloned successfully into ${targetFolderName}!`, folder: targetFolderName });
    } else {
      sendEvent('error', { message: 'git clone failed' });
    }
    return res.end();
  }
});

// Telegram test message sender
app.post('/api/telegram/test', async (req: Request, res: Response) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const { chatId, message = 'Hello from GitHub Deployer Webhook!' } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'TELEGRAM_BOT_TOKEN is not set in environment.' });
  }
  if (!chatId) {
    return res.status(400).json({ error: 'chatId is required.' });
  }

  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' }),
    });

    const data = await tgRes.json();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Setup Vite dev server or static file serving
const isProduction = process.env.NODE_ENV === 'production';

async function startApp() {
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 GitHub Deployer server running at http://0.0.0.0:${PORT}`);
    console.log(`📁 Base Directory: ${BASE_DIR}`);
    console.log(`👤 Active Accounts: ${cachedAccounts.length}`);
  });
}

startApp().catch(console.error);
