import React, { useState } from 'react';
import { 
  Key, 
  Plus, 
  Trash2, 
  ShieldCheck, 
  AlertCircle, 
  CheckCircle2, 
  Bot, 
  Radio, 
  Send, 
  RefreshCw, 
  ExternalLink,
  Clock,
  Database
} from 'lucide-react';
import { GitHubAccount, SystemStatus } from '../types';

interface AccountsSettingsTabProps {
  accounts: GitHubAccount[];
  systemStatus: SystemStatus | null;
  onRefresh: () => void;
}

export const AccountsSettingsTab: React.FC<AccountsSettingsTabProps> = ({
  accounts,
  systemStatus,
  onRefresh,
}) => {
  const [newToken, setNewToken] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);

  // Telegram test state
  const [telegramChatId, setTelegramChatId] = useState('');
  const [telegramMsg, setTelegramMsg] = useState('Hello from GitHub Deployer Dashboard!');
  const [isSendingTelegram, setIsSendingTelegram] = useState(false);
  const [telegramResult, setTelegramResult] = useState<string | null>(null);

  const handleAddToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newToken.trim()) return;

    setIsAdding(true);
    setAddError(null);
    setAddSuccess(null);

    try {
      const res = await fetch('/api/accounts/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: newToken.trim() }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setAddSuccess(`Token validated successfully! Connected as @${data.account.username}`);
        setNewToken('');
        onRefresh();
      } else {
        setAddError(data.error || 'Failed to add token. Check permissions and validity.');
      }
    } catch (err: any) {
      setAddError(err.message || 'Network error');
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteAccount = async (index: number, username: string) => {
    if (!confirm(`Are you sure you want to remove token for @${username}?`)) return;

    try {
      const res = await fetch(`/api/accounts/${index}`, { method: 'DELETE' });
      if (res.ok) {
        onRefresh();
      } else {
        alert('Failed to remove account');
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleSendTelegramTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!telegramChatId.trim()) return;

    setIsSendingTelegram(true);
    setTelegramResult(null);

    try {
      const res = await fetch('/api/telegram/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: telegramChatId.trim(),
          message: telegramMsg.trim(),
        }),
      });

      const data = await res.json();
      if (data.ok) {
        setTelegramResult('Message sent successfully to Telegram chat!');
      } else {
        setTelegramResult(`Error: ${data.description || 'Failed to send'}`);
      }
    } catch (err: any) {
      setTelegramResult(`Error: ${err.message}`);
    } finally {
      setIsSendingTelegram(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* GitHub Tokens Section */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl backdrop-blur">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400">
              <Key className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">GitHub Accounts & Tokens</h2>
              <p className="text-xs text-slate-400">
                Multi-account tokens loaded from <code>GH_TOKENS</code> environment or added below
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition-colors"
            title="Refresh accounts"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        {/* Existing Accounts List */}
        <div className="mt-4 space-y-3">
          {accounts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-800 p-8 text-center">
              <Key className="h-8 w-8 mx-auto text-slate-600 mb-2" />
              <p className="text-xs font-semibold text-slate-300">No GitHub Accounts Connected</p>
              <p className="text-[11px] text-slate-500 mt-1 max-w-sm mx-auto">
                Add a Personal Access Token below with <code>repo</code> scope to enable folder deployments, ZIP uploads, and repository controls.
              </p>
            </div>
          ) : (
            accounts.map((acc, i) => (
              <div
                key={acc.username || i}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-slate-800 bg-slate-850/60"
              >
                <div className="flex items-center gap-3">
                  {acc.avatar_url ? (
                    <img
                      src={acc.avatar_url}
                      alt={acc.username}
                      className="h-10 w-10 rounded-full ring-2 ring-indigo-500/30"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-indigo-600/20 text-indigo-400 flex items-center justify-center font-bold">
                      {acc.username[0]?.toUpperCase() || 'U'}
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-white">{acc.username}</span>
                      <span className="rounded bg-indigo-500/10 px-1.5 py-0.2 text-[10px] font-medium text-indigo-400 border border-indigo-500/20">
                        Account {i + 1}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">{acc.email}</p>
                    <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1">
                      <span>Token: <code className="text-slate-400">{acc.tokenMasked || '••••••••'}</code></span>
                      {acc.public_repos !== undefined && (
                        <span>• {acc.public_repos} repos</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {acc.rateLimit && (
                    <div className="text-right text-[11px]">
                      <span className="text-slate-400 block">Rate Limit:</span>
                      <span className="text-emerald-400 font-semibold">
                        {acc.rateLimit.remaining} / {acc.rateLimit.limit} reqs
                      </span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => handleDeleteAccount(acc.index, acc.username)}
                    className="p-2 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-rose-950/40 transition-colors"
                    title="Remove token"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Add New Token Form */}
        <form onSubmit={handleAddToken} className="mt-6 pt-5 border-t border-slate-800 space-y-3">
          <h3 className="text-xs font-bold text-slate-200 flex items-center gap-2">
            <Plus className="h-4 w-4 text-indigo-400" />
            <span>Add Additional GitHub Token</span>
          </h3>

          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="password"
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxx (GitHub Personal Access Token)"
              value={newToken}
              onChange={(e) => setNewToken(e.target.value)}
              className="flex-1 bg-slate-950 text-slate-100 text-xs rounded-xl border border-slate-700 px-3 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={isAdding || !newToken.trim()}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold disabled:opacity-40 shadow-md shadow-indigo-600/20 transition-all shrink-0"
            >
              {isAdding ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Validating...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>Verify & Add</span>
                </>
              )}
            </button>
          </div>

          {addError && (
            <p className="text-xs text-rose-400 flex items-center gap-1.5 mt-2">
              <AlertCircle className="h-3.5 w-3.5" />
              <span>{addError}</span>
            </p>
          )}

          {addSuccess && (
            <p className="text-xs text-emerald-400 flex items-center gap-1.5 mt-2">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>{addSuccess}</span>
            </p>
          )}

          <p className="text-[11px] text-slate-500">
            Requires permissions: <code>repo</code> (Full control of private repositories) and <code>user:email</code>.
          </p>
        </form>
      </div>

      {/* Two Column Section: Telegram & System Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Telegram Integration Panel */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl backdrop-blur space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-slate-800">
            <div className="h-9 w-9 rounded-xl bg-sky-500/10 flex items-center justify-center text-sky-400">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Telegram Bot Status</h3>
              <p className="text-xs text-slate-400">Configured via <code>TELEGRAM_BOT_TOKEN</code></p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-850/60 text-xs">
              <span className="text-slate-400">Token Status</span>
              {systemStatus?.telegramConfigured ? (
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Active
                </span>
              ) : (
                <span className="text-slate-500">Not configured in .env</span>
              )}
            </div>

            {systemStatus?.telegramBotName && (
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-850/60 text-xs">
                <span className="text-slate-400">Bot Username</span>
                <span className="text-sky-400 font-mono font-semibold">
                  @{systemStatus.telegramBotName}
                </span>
              </div>
            )}

            {/* Test Message */}
            {systemStatus?.telegramConfigured && (
              <form onSubmit={handleSendTelegramTest} className="space-y-2 pt-2">
                <label className="block text-xs font-semibold text-slate-300">
                  Send Test Notification to Chat ID
                </label>
                <input
                  type="text"
                  placeholder="Telegram Chat ID (e.g. 123456789)"
                  value={telegramChatId}
                  onChange={(e) => setTelegramChatId(e.target.value)}
                  className="w-full bg-slate-950 text-slate-100 text-xs rounded-xl border border-slate-700 p-2.5 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={isSendingTelegram || !telegramChatId.trim()}
                  className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold disabled:opacity-40 transition-colors"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>Send Test Message</span>
                </button>
                {telegramResult && (
                  <p className="text-xs text-slate-300 p-2 rounded bg-slate-800">
                    {telegramResult}
                  </p>
                )}
              </form>
            )}
          </div>
        </div>

        {/* WebSocket & Workspace Info */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl backdrop-blur space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-slate-800">
            <div className="h-9 w-9 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400">
              <Radio className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">System & Realtime WS</h3>
              <p className="text-xs text-slate-400">Live event and log streamer details</p>
            </div>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-850/60">
              <span className="text-slate-400">WebSocket Endpoint</span>
              <span className="text-indigo-400 font-mono font-medium">ws://host:3000/ws</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-850/60">
              <span className="text-slate-400">Connected WS Clients</span>
              <span className="text-white font-semibold">
                {systemStatus?.wsClientsCount || 1} client(s)
              </span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-850/60">
              <span className="text-slate-400">Base Deployment Directory</span>
              <span className="text-slate-300 font-mono truncate max-w-[200px]" title={systemStatus?.baseDir}>
                {systemStatus?.baseDir || 'deployments/'}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-850/60">
              <span className="text-slate-400">Runtime Environment</span>
              <span className="text-emerald-400 font-medium">Node.js 22 (Express + Vite)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
