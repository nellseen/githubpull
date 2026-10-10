import test from 'node:test';
import assert from 'node:assert/strict';
import { 
  validateGitHubUrl, 
  buildAuthenticatedUrl, 
  loadGithubAccounts,
  GITHUB_URL_PATTERN 
} from '../src/github';
import { GitHubAccount } from '../src/types';

test('Feature Test: GitHub URL Validator (validateGitHubUrl)', () => {
  const validUrls = [
    'https://github.com/octocat/Hello-World',
    'https://github.com/octocat/Hello-World.git',
    'https://github.com/nellseen/githubpull',
    'https://github.com/username/my-project_1.0',
  ];

  const invalidUrls = [
    'http://github.com/octocat/Hello-World', // Not HTTPS
    'https://gitlab.com/octocat/Hello-World', // Not GitHub
    'https://github.com/octocat',             // Missing repo name
    'https://github.com/octocat/Hello-World/extra/path', // Trailing subpaths
    'git@github.com:octocat/Hello-World.git', // SSH not HTTPS
    'invalid-url',
  ];

  for (const url of validUrls) {
    assert.equal(validateGitHubUrl(url), true, `URL should be valid: ${url}`);
  }

  for (const url of invalidUrls) {
    assert.equal(validateGitHubUrl(url), false, `URL should be invalid: ${url}`);
  }
});

test('Feature Test: Authenticated URL Builder (buildAuthenticatedUrl)', () => {
  const mockAccount: GitHubAccount = {
    index: 0,
    name: 'Akun 1 (octocat)',
    username: 'octocat',
    email: 'octocat@github.com',
    token: 'ghp_secretToken12345',
  };

  const plainUrl = 'https://github.com/octocat/Hello-World.git';
  const authenticated = buildAuthenticatedUrl(plainUrl, mockAccount);

  assert.equal(
    authenticated,
    'https://octocat:ghp_secretToken12345@github.com/octocat/Hello-World.git',
    'Should correctly inject username and token into clone URL'
  );

  // If already authenticated, should not duplicate
  const alreadyAuth = 'https://octocat:ghp_secretToken12345@github.com/octocat/Hello-World.git';
  assert.equal(
    buildAuthenticatedUrl(alreadyAuth, mockAccount),
    alreadyAuth,
    'Should not double-inject credentials'
  );
});

test('Feature Test: Multi-Account Token Parser (loadGithubAccounts)', async () => {
  // Test with empty string
  const emptyAccounts = await loadGithubAccounts('');
  assert.equal(Array.isArray(emptyAccounts), true);
  assert.equal(emptyAccounts.length, 0);

  // Test parsing comma-separated tokens (invalid tokens gracefully handled without crash)
  const invalidTokens = 'ghp_dummy1, ghp_dummy2';
  const accounts = await loadGithubAccounts(invalidTokens);
  assert.equal(Array.isArray(accounts), true);
  // Both dummy tokens will fail GitHub API 401 gracefully, returning empty array
  assert.equal(accounts.length, 0);
});
