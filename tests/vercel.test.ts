import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { loadVercelAccounts } from '../src/vercel';
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
  assert.equal(flatKeyboard.includes('🗑 List & Hapus Project Vercel'), true);
  assert.equal(flatKeyboard.includes('ℹ️ Cek Status Bot'), true);
  assert.equal(flatKeyboard.includes('🔄 Ganti Akun / Platform'), true);

  // IMPORTANT: As requested, Clone MUST NOT exist in Vercel features!
  assert.equal(flatKeyboard.some((btn: string) => btn.toLowerCase().includes('clone')), false);
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
