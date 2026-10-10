import fs from 'fs';
import path from 'path';
import os from 'os';
import AdmZip from 'adm-zip';
import http from 'http';
import WebSocket from 'ws';

import { cleanJunkFiles, flattenDirectory, extractZip } from '../src/fs_utils';
import { validateGitHubUrl, buildAuthenticatedUrl, loadGithubAccounts } from '../src/github';
import { runCommandWithLiveLog } from '../src/git';
import { BotWebSocketManager } from '../src/websocket';
import { GitHubDeployerBot } from '../src/bot';
import { GitHubAccount } from '../src/types';

interface TestResult {
  name: string;
  category: string;
  passed: boolean;
  error?: string;
  durationMs: number;
}

const results: TestResult[] = [];

async function runTest(category: string, name: string, fn: () => Promise<void> | void) {
  const start = Date.now();
  try {
    await fn();
    const durationMs = Date.now() - start;
    results.push({ category, name, passed: true, durationMs });
    console.log(`  ✅ [PASS] ${name} (${durationMs}ms)`);
  } catch (err: any) {
    const durationMs = Date.now() - start;
    results.push({ category, name, passed: false, error: err.message, durationMs });
    console.error(`  ❌ [FAIL] ${name} (${durationMs}ms)`);
    console.error(`     Error: ${err.message}`);
  }
}

async function runAllRuntimeTests() {
  console.log('\n======================================================');
  console.log('🧪 RUNTIME TEST SUITE — GITHUB DEPLOYER TELEGRAM BOT');
  console.log('======================================================\n');

  // --- 1. FS UTILITIES & ARCHIVE TESTS ---
  console.log('📁 1. Filesystem Utilities & Cleanup');
  await runTest('Filesystem', 'Junk File Cleaner (cleanJunkFiles)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'test-clean-'));
    try {
      fs.writeFileSync(path.join(tmp, 'app.js'), 'code');
      fs.writeFileSync(path.join(tmp, '.DS_Store'), 'junk');
      fs.writeFileSync(path.join(tmp, 'thumbs.db'), 'junk');
      const pycache = path.join(tmp, '__pycache__');
      fs.mkdirSync(pycache);
      fs.writeFileSync(path.join(pycache, 'a.pyc'), 'junk');

      const cleaned = cleanJunkFiles(tmp);
      if (cleaned < 3) throw new Error(`Expected at least 3 cleaned items, got ${cleaned}`);
      if (fs.existsSync(path.join(tmp, '.DS_Store'))) throw new Error('.DS_Store was not removed');
      if (fs.existsSync(pycache)) throw new Error('__pycache__ was not removed');
      if (!fs.existsSync(path.join(tmp, 'app.js'))) throw new Error('Legitimate file was wrongly removed');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  await runTest('Filesystem', 'Directory Flattener (flattenDirectory)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'test-flat-'));
    try {
      const nested = path.join(tmp, 'my-subfolder');
      fs.mkdirSync(nested);
      fs.writeFileSync(path.join(nested, 'index.ts'), 'export const a = 1;');

      const levels = flattenDirectory(tmp);
      if (levels !== 1) throw new Error(`Expected 1 level flattened, got ${levels}`);
      if (!fs.existsSync(path.join(tmp, 'index.ts'))) throw new Error('index.ts not hoisted');
      if (fs.existsSync(nested)) throw new Error('Nested folder still exists');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  await runTest('Filesystem', 'ZIP Extraction & Verification (extractZip)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'test-zip-'));
    const zipPath = path.join(tmp, 'archive.zip');
    const targetDir = path.join(tmp, 'extracted');
    try {
      const zip = new AdmZip();
      zip.addFile('main.py', Buffer.from('print("hello")'));
      zip.writeZip(zipPath);

      extractZip(zipPath, targetDir);
      if (!fs.existsSync(path.join(targetDir, 'main.py'))) throw new Error('main.py not found in extracted output');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  // --- 2. GITHUB API & AUTH TESTS ---
  console.log('\n🐙 2. GitHub Automation & Authentication');
  await runTest('GitHub', 'GitHub URL Format Validation (validateGitHubUrl)', () => {
    const valid = validateGitHubUrl('https://github.com/octocat/Hello-World.git');
    const invalid = validateGitHubUrl('http://insecure.com/repo');
    if (!valid) throw new Error('Valid URL rejected');
    if (invalid) throw new Error('Invalid URL accepted');
  });

  await runTest('GitHub', 'Authenticated Clone URL Injection (buildAuthenticatedUrl)', () => {
    const acc: GitHubAccount = {
      index: 0,
      name: 'Acc 1',
      username: 'johndoe',
      email: 'john@example.com',
      token: 'ghp_secretTokenABC',
    };
    const url = 'https://github.com/johndoe/repo.git';
    const authed = buildAuthenticatedUrl(url, acc);
    const expected = 'https://johndoe:ghp_secretTokenABC@github.com/johndoe/repo.git';
    if (authed !== expected) throw new Error(`Expected ${expected}, got ${authed}`);
  });

  await runTest('GitHub', 'Multi-Account Token Parsing (loadGithubAccounts)', async () => {
    const empty = await loadGithubAccounts('');
    if (!Array.isArray(empty)) throw new Error('Expected array');
  });

  // --- 3. GIT COMMAND & EXECUTION TESTS ---
  console.log('\n⚡ 3. Git Operations & Live Logging Engine');
  await runTest('Git Engine', 'Live Command Execution & Secret Masking', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'test-git-'));
    try {
      const secret = 'ghp_superSecretTokenXYZ';
      let captured = '';
      const res = await runCommandWithLiveLog(
        `echo "Deploying with token ${secret}"`,
        tmp,
        (line) => { captured += line + '\n'; },
        secret
      );
      if (!res.success) throw new Error('Command failed');
      if (captured.includes(secret)) throw new Error('Secret was NOT masked');
      if (!captured.includes('****')) throw new Error('Mask placeholder **** missing');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  await runTest('Git Engine', 'Local Git Init, Branch, and Commit Sequence', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'test-gitrepo-'));
    try {
      fs.writeFileSync(path.join(tmp, 'app.txt'), 'version 1');
      const cmd = `
        git init && \
        git config user.name "BotRunner" && \
        git config user.email "bot@ci.local" && \
        git branch -M main && \
        git add . && \
        git commit -m "Test automated commit"
      `;
      const res = await runCommandWithLiveLog(cmd, tmp);
      if (!res.success) throw new Error(`Git sequence failed: ${res.finalOutput}`);
      if (!fs.existsSync(path.join(tmp, '.git'))) throw new Error('.git directory missing');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  // --- 4. WEBSOCKET REAL-TIME TESTS ---
  console.log('\n📡 4. WebSocket Server & Subscriber Broadcast');
  await runTest('WebSocket', 'WebSocket Server Connection and Streaming', async () => {
    const server = http.createServer();
    const ws = new BotWebSocketManager();

    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as any).port;

    ws.init(server, '/ws');

    const client = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const received = await new Promise<string>((resolve) => {
      client.on('message', (d) => resolve(d.toString()));
    });

    if (!received.includes('CONNECTED')) {
      throw new Error(`Did not receive connection greeting: ${received}`);
    }

    client.close();
    ws.close();
    await new Promise<void>((r) => server.close(() => r()));
  });

  // --- 5. TELEGRAM BOT ARCHITECTURE TESTS ---
  console.log('\n🤖 5. Telegram Bot Framework & State Machine');
  await runTest('Telegram Bot', 'Keyboard Layout & Menu Button Matching', () => {
    const bot = new GitHubDeployerBot();
    const keyboard: any = bot.getMainKeyboard();
    const buttons = keyboard.reply_markup.keyboard.flat();
    const required = [
      '🚀 Auto Deploy Folder',
      '📦 Unzip & Deploy ZIP',
      '📥 Clone Repo ke VPS',
      '🗑 List & Hapus Repo',
      'ℹ️ Cek Status Bot',
    ];
    for (const r of required) {
      if (!buttons.includes(r)) throw new Error(`Missing button: ${r}`);
    }
  });

  await runTest('Telegram Bot', 'Session State Isolation & Action Transitions', () => {
    const bot = new GitHubDeployerBot();
    const s1 = bot.getSession(1001);
    const s2 = bot.getSession(1002);
    s1.state = 'WAITING_ZIP_REPO_NAME';
    s1.temp_zip_name = 'my-project.zip';
    if (s2.state === 'WAITING_ZIP_REPO_NAME') throw new Error('State leakage between sessions');
    if (s1.temp_zip_name !== 'my-project.zip') throw new Error('Session data not preserved');
  });

  // --- SUMMARY REPORT ---
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;

  console.log('\n======================================================');
  console.log(`📊 TEST EXECUTION SUMMARY: ${passedCount}/${results.length} PASSED`);
  if (failedCount > 0) {
    console.log(`❌ ${failedCount} TESTS FAILED`);
    process.exit(1);
  } else {
    console.log('🎉 ALL FEATURE RUNTIME TESTS EXECUTED SUCCESSFULLY!');
    console.log('======================================================\n');
    process.exit(0);
  }
}

runAllRuntimeTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
