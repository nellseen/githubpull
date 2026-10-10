import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runCommandWithLiveLog } from '../src/git';

test('Feature Test: Live Command Runner & Token Masking (runCommandWithLiveLog)', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmd-test-'));

  try {
    const receivedLogs: string[] = [];
    const secretToken = 'ghp_superSecretToken999';

    const cmd = `echo "Starting process" && echo "Token is: ${secretToken}" && echo "Process complete"`;

    const result = await runCommandWithLiveLog(
      cmd,
      tmpDir,
      (line) => {
        receivedLogs.push(line);
      },
      secretToken // maskToken
    );

    assert.equal(result.success, true, 'Command execution should succeed');
    assert.equal(receivedLogs.length >= 3, true, 'Should receive streamed lines');

    // Token must be masked
    const combined = receivedLogs.join(' ');
    assert.equal(combined.includes(secretToken), false, 'Raw token must never leak into logs');
    assert.equal(combined.includes('****'), true, 'Token must be masked with ****');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Feature Test: Git Initialization and Local Workflow', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-workflow-test-'));

  try {
    fs.writeFileSync(path.join(tmpDir, 'test.txt'), 'Hello Git');

    const cmd = `
      git init && \
      git config user.name "TestBot" && \
      git config user.email "bot@test.local" && \
      git branch -M main && \
      git add . && \
      git commit -m "Initial test commit"
    `;

    const result = await runCommandWithLiveLog(cmd, tmpDir);

    assert.equal(result.success, true, 'Local git sequence must succeed');
    assert.equal(fs.existsSync(path.join(tmpDir, '.git')), true, '.git directory must exist');

    // Check log output
    const logCheck = await runCommandWithLiveLog('git log -1 --pretty=%B', tmpDir);
    assert.equal(logCheck.success, true);
    assert.equal(logCheck.finalOutput.includes('Initial test commit'), true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
