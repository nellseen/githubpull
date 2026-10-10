import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { 
  loadVercelAccounts, 
  scaffoldStarterProject, 
  readVercelConfig, 
  detectFramework 
} from '../src/vercel';
import { GitHubDeployerBot } from '../src/bot';
import { VercelAccount } from '../src/types';

test('Feature Test: Vercel Multi-Account Token Parser (loadVercelAccounts)', async () => {
  // Empty tokens
  const empty = await loadVercelAccounts('');
  assert.equal(Array.isArray(empty), true);
  assert.equal(empty.length, 0);

  // Parsing invalid dummy tokens gracefully returns empty array without crashing
  const dummyTokens = 'vercel_token_1, vercel_token_2';
  const accounts = await loadVercelAccounts(dummyTokens, true);
  assert.equal(Array.isArray(accounts), true);
  assert.equal(accounts.length, 0);
});

test('Feature Test: Vercel Bot Keyboards (No Clone Feature)', () => {
  const bot = new GitHubDeployerBot();
  const vercelKeyboard: any = bot.getVercelKeyboard();
  assert.equal(Boolean(vercelKeyboard.reply_markup), true);

  const flatKeyboard = vercelKeyboard.reply_markup.keyboard.flat();

  // Must have Vercel features
  assert.equal(flatKeyboard.includes('▲ Deploy Folder ke Vercel'), true);
  assert.equal(flatKeyboard.includes('📦 Unzip & Deploy ke Vercel'), true);
  assert.equal(flatKeyboard.includes('⚡ Deploy Starter HTML'), true);
  assert.equal(flatKeyboard.includes('🗑 List & Hapus Project Vercel'), true);
  assert.equal(flatKeyboard.includes('ℹ️ Cek Status Bot'), true);
  assert.equal(flatKeyboard.includes('🔄 Ganti Akun / Platform'), true);

  // IMPORTANT: As requested, Clone MUST NOT exist in Vercel features!
  assert.equal(flatKeyboard.some((btn: string) => btn.toLowerCase().includes('clone')), false);
});

test('Feature Test: Vercel Starter Scaffolding (scaffoldStarterProject)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-scaffold-'));
  try {
    const indexPath = scaffoldStarterProject(tmp, 'test-project');
    assert.equal(fs.existsSync(indexPath), true, 'index.html must exist');
    const content = fs.readFileSync(indexPath, 'utf-8');
    assert.equal(content.includes('test-project'), true, 'index.html must contain project name');
    assert.equal(content.includes('▲ Vercel'), true, 'index.html must contain Vercel badge');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('Feature Test: Vercel Session Management & State Machine', () => {
  const bot = new GitHubDeployerBot();
  const session = bot.getSession(55555);

  const mockVercelAcc: VercelAccount = {
    index: 0,
    name: 'Akun Vercel 1 (developer)',
    username: 'developer',
    email: 'dev@vercel.com',
    token: 'vercel_mock_token_123',
    id: 'user_123',
  };

  session.active_platform = 'vercel';
  session.selected_vercel_account = mockVercelAcc;
  session.state = 'WAITING_VERCEL_FOLDER_NAME';

  assert.equal(session.active_platform, 'vercel');
  assert.equal(session.selected_vercel_account.username, 'developer');
  assert.equal(session.state, 'WAITING_VERCEL_FOLDER_NAME');

  // Transition to ZIP project state
  session.state = 'WAITING_VERCEL_ZIP_PROJECT_NAME';
  session.temp_zip_path = '/tmp/my-app.zip';

  assert.equal(session.state, 'WAITING_VERCEL_ZIP_PROJECT_NAME');
  assert.equal(session.temp_zip_path, '/tmp/my-app.zip');
});

test('Feature Test: vercel.json Configuration Detection & Parsing', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-json-test-'));
  try {
    const customConfig = {
      framework: 'nextjs',
      buildCommand: 'npm run build',
      outputDirectory: '.next',
      cleanUrls: true,
      rewrites: [{ source: '/api/(.*)', destination: '/api/$1' }],
    };

    fs.writeFileSync(path.join(tmp, 'vercel.json'), JSON.stringify(customConfig, null, 2));

    const cfg = readVercelConfig(tmp);
    assert.notEqual(cfg, null, 'Must detect vercel.json');
    assert.equal(cfg?.framework, 'nextjs', 'Must read framework from vercel.json');
    assert.equal(cfg?.buildCommand, 'npm run build', 'Must read buildCommand');
    assert.equal(cfg?.outputDirectory, '.next', 'Must read outputDirectory');
    assert.equal(cfg?.cleanUrls, true, 'Must read cleanUrls');
    assert.equal(cfg?.rewrites?.length, 1, 'Must read rewrites');

    // detectFramework must prioritize framework from vercel.json
    const detected = detectFramework(tmp);
    assert.equal(detected, 'nextjs', 'detectFramework must use framework from vercel.json');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
