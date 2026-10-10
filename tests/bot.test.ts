import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubDeployerBot } from '../src/bot';
import { GitHubAccount } from '../src/types';

test('Feature Test: Telegram Bot Session & Keyboard Management', async () => {
  const bot = new GitHubDeployerBot();

  // 1. Session Isolation
  const session1 = bot.getSession(111);
  const session2 = bot.getSession(222);

  assert.notEqual(session1, session2, 'Different chats must have isolated sessions');

  session1.state = 'WAITING_FOLDER_NAME';
  assert.equal(session2.state, undefined, 'Session 2 state must not be modified by Session 1');

  // 2. Keyboard Markup Structure (termasuk tombol '🔄 Ganti Akun GitHub')
  const mainKeyboard: any = bot.getMainKeyboard();
  assert.equal(Boolean(mainKeyboard.reply_markup), true);

  const flatKeyboard = mainKeyboard.reply_markup.keyboard.flat();
  const expectedButtons = [
    '🚀 Auto Deploy Folder',
    '📦 Unzip & Deploy ZIP',
    '📥 Clone Repo ke VPS',
    '🗑 List & Hapus Repo',
    'ℹ️ Cek Status Bot',
    '🔄 Ganti Akun / Platform',
  ];

  for (const btn of expectedButtons) {
    assert.equal(flatKeyboard.includes(btn), true, `Main keyboard must include button: ${btn}`);
  }

  // 3. Mock Account Setup
  const mockAcc: GitHubAccount = {
    index: 0,
    name: 'Akun 1 (dev-user)',
    username: 'dev-user',
    email: 'dev@example.com',
    token: 'ghp_fake123',
  };
  bot.accounts = [mockAcc];

  // 4. Initial state before choosing account
  assert.equal(session1.selected_account, undefined, 'Account must not be selected initially');

  // 5. Selecting account unlocks feature state
  session1.selected_account = mockAcc;
  session1.state = 'WAITING_ZIP_REPO_NAME';
  session1.temp_zip_path = '/tmp/fake.zip';

  assert.equal(session1.selected_account.username, 'dev-user');
  assert.equal(session1.state, 'WAITING_ZIP_REPO_NAME');
});
