import { GitHubAccount } from './types';

export const GITHUB_URL_PATTERN = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:\.git)?$/;

export function validateGitHubUrl(url: string): boolean {
  return GITHUB_URL_PATTERN.test(url.trim());
}

export function buildAuthenticatedUrl(cloneUrl: string, account: GitHubAccount): string {
  const trimmed = cloneUrl.trim();
  if (trimmed.includes('github.com') && !trimmed.includes(`${account.username}:`)) {
    return trimmed.replace(
      'https://github.com/',
      `https://${account.username}:${account.token}@github.com/`
    );
  }
  return trimmed;
}

export async function fetchAccountDetails(token: string, index: number): Promise<GitHubAccount | null> {
  const headers = {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'githubpull-bot-engine',
  };

  try {
    const res = await fetch('https://api.github.com/user', { headers });
    if (!res.ok) {
      console.warn(`[GitHub] Token #${index + 1} validation failed (Status: ${res.status})`);
      return null;
    }

    const userData = (await res.json()) as any;
    const username = userData.login;
    let email = userData.email;

    // If email is private, attempt fetching primary verified email
    if (!email) {
      try {
        const emailRes = await fetch('https://api.github.com/user/emails', { headers });
        if (emailRes.ok) {
          const emails = (await emailRes.json()) as any[];
          for (const e of emails) {
            if (e.primary && e.verified) {
              email = e.email;
              break;
            }
          }
        }
      } catch {
        // ignore
      }
    }

    if (!email) {
      email = `${username}@users.noreply.github.com`;
    }

    const rateLimit = {
      limit: parseInt(res.headers.get('x-ratelimit-limit') || '5000', 10),
      remaining: parseInt(res.headers.get('x-ratelimit-remaining') || '5000', 10),
      reset: parseInt(res.headers.get('x-ratelimit-reset') || '0', 10),
    };

    const account: GitHubAccount = {
      index,
      name: `Akun ${index + 1} (${username})`,
      username,
      email,
      token,
      avatar_url: userData.avatar_url,
      public_repos: userData.public_repos,
      total_private_repos: userData.total_private_repos,
      rateLimit,
    };

    console.log(`[GitHub] Berhasil mendeteksi akun: ${username}`);
    return account;
  } catch (err: any) {
    console.error(`[GitHub] Error saat mendeteksi token #${index + 1}: ${err.message}`);
    return null;
  }
}

export async function loadGithubAccounts(tokensRaw?: string): Promise<GitHubAccount[]> {
  const envRaw = tokensRaw !== undefined ? tokensRaw : (process.env.GH_TOKENS || '');
  let tokens: string[] = [];

  if (!envRaw) {
    const singleToken = process.env.GH_TOKEN || '';
    tokens = singleToken ? [singleToken.trim()] : [];
  } else {
    tokens = envRaw.split(',').map((t) => t.trim()).filter(Boolean);
  }

  const accounts: GitHubAccount[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const acc = await fetchAccountDetails(tokens[i], i);
    if (acc) {
      accounts.push(acc);
    }
  }

  return accounts;
}

export async function checkOrCreateRepo(
  account: GitHubAccount,
  repoName: string,
  isPrivate: boolean = false
): Promise<{ exists: boolean; created: boolean; repoData: any }> {
  const headers = {
    Authorization: `token ${account.token}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'githubpull-bot-engine',
  };

  const checkRes = await fetch(
    `https://api.github.com/repos/${account.username}/${repoName}`,
    { headers }
  );

  if (checkRes.status === 200) {
    const data = await checkRes.json();
    return { exists: true, created: false, repoData: data };
  }

  if (checkRes.status === 404) {
    const createRes = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: repoName,
        private: Boolean(isPrivate),
      }),
    });

    if (!createRes.ok) {
      const err = (await createRes.json()) as any;
      throw new Error(`Gagal membuat repo di GitHub: ${err?.message || createRes.statusText}`);
    }

    const createdData = await createRes.json();
    return { exists: false, created: true, repoData: createdData };
  }

  throw new Error(`Unexpected status ${checkRes.status} saat memeriksa repository.`);
}

export async function listRepos(account: GitHubAccount): Promise<any[]> {
  const headers = {
    Authorization: `token ${account.token}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'githubpull-bot-engine',
  };

  const res = await fetch(
    'https://api.github.com/user/repos?per_page=50&sort=updated',
    { headers }
  );

  if (!res.ok) {
    throw new Error(`Gagal mengambil daftar repo: ${res.statusText}`);
  }

  return (await res.json()) as any[];
}

export async function deleteRepo(account: GitHubAccount, repoName: string): Promise<boolean> {
  const headers = {
    Authorization: `token ${account.token}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'githubpull-bot-engine',
  };

  const res = await fetch(
    `https://api.github.com/repos/${account.username}/${repoName}`,
    {
      method: 'DELETE',
      headers,
    }
  );

  return res.status === 204;
}
