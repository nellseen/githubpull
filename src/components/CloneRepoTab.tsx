import React, { useState } from 'react';
import { 
  DownloadCloud, 
  GitPullRequest, 
  ExternalLink, 
  CheckCircle2, 
  RefreshCw, 
  Play, 
  FolderDown, 
  ShieldCheck 
} from 'lucide-react';
import { GitHubAccount } from '../types';
import { LogTerminal } from './LogTerminal';

interface CloneRepoTabProps {
  accounts: GitHubAccount[];
  selectedAccountIndex: number;
  setSelectedAccountIndex: (index: number) => void;
  onRefreshFolders: () => void;
}

export const CloneRepoTab: React.FC<CloneRepoTabProps> = ({
  accounts,
  selectedAccountIndex,
  setSelectedAccountIndex,
  onRefreshFolders,
}) => {
  const [cloneUrl, setCloneUrl] = useState('');
  const [folderName, setFolderName] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [successInfo, setSuccessInfo] = useState<string | null>(null);

  const currentAccount = accounts[selectedAccountIndex];

  const handleUrlChange = (val: string) => {
    setCloneUrl(val);
    const cleaned = val.trim().replace(/\.git$/, '');
    const parts = cleaned.split('/');
    if (parts.length > 1) {
      setFolderName(parts[parts.length - 1]);
    }
  };

  const handleStartClone = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cloneUrl.trim()) {
      alert('Please enter a GitHub repository URL');
      return;
    }

    const githubPattern = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:\.git)?$/;
    if (!githubPattern.test(cloneUrl.trim())) {
      alert('Invalid GitHub URL format. Example: https://github.com/username/repository');
      return;
    }

    setIsRunning(true);
    setStatus('running');
    setLogs([]);
    setSuccessInfo(null);

    const params = new URLSearchParams({
      accountIndex: String(selectedAccountIndex),
      cloneUrl: cloneUrl.trim(),
      folderName: folderName.trim(),
    });

    const eventSource = new EventSource(`/api/git/clone/stream?${params.toString()}`);

    eventSource.addEventListener('log', (e) => {
      try {
        const data = JSON.parse(e.data);
        setLogs((prev) => [...prev, data.message]);
      } catch {
        setLogs((prev) => [...prev, e.data]);
      }
    });

    eventSource.addEventListener('success', (e) => {
      try {
        const data = JSON.parse(e.data);
        setLogs((prev) => [...prev, `🎉 ${data.message}`]);
        setSuccessInfo(data.message);
      } catch {
        // ignore
      }
      setStatus('success');
      setIsRunning(false);
      eventSource.close();
      onRefreshFolders();
    });

    eventSource.addEventListener('error', (e: any) => {
      try {
        const data = JSON.parse(e.data || '{}');
        if (data.message) {
          setLogs((prev) => [...prev, `❌ Error: ${data.message}`]);
        }
      } catch {
        setLogs((prev) => [...prev, '❌ Git clone/pull failed']);
      }
      setStatus('error');
      setIsRunning(false);
      eventSource.close();
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Config Form */}
      <div className="lg:col-span-5 space-y-6">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl backdrop-blur">
          <div className="flex items-center gap-2.5 pb-4 border-b border-slate-800">
            <div className="h-9 w-9 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <DownloadCloud className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Clone Repo to Workspace</h2>
              <p className="text-xs text-slate-400">Clone or git pull into local workspace directory</p>
            </div>
          </div>

          <form onSubmit={handleStartClone} className="space-y-4 pt-4">
            {/* Account Selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Authenticated GitHub Account (for private repos)
              </label>
              {accounts.length > 0 ? (
                <select
                  value={selectedAccountIndex}
                  onChange={(e) => setSelectedAccountIndex(Number(e.target.value))}
                  disabled={isRunning}
                  className="w-full bg-slate-850 text-slate-100 text-xs rounded-xl border border-slate-700 p-2.5 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  {accounts.map((acc, i) => (
                    <option key={acc.username || i} value={i}>
                      {acc.username} ({acc.email})
                    </option>
                  ))}
                </select>
              ) : (
                <div className="text-xs text-slate-400 bg-slate-800/80 p-2.5 rounded-xl border border-slate-700">
                  No accounts loaded. Will clone using unauthenticated HTTPS.
                </div>
              )}
            </div>

            {/* Repo URL */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                GitHub Repository URL
              </label>
              <input
                type="url"
                value={cloneUrl}
                onChange={(e) => handleUrlChange(e.target.value)}
                placeholder="https://github.com/owner/repository"
                disabled={isRunning}
                className="w-full bg-slate-850 text-slate-100 text-xs rounded-xl border border-slate-700 p-2.5 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                required
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Supports public and private GitHub repositories.
              </p>
            </div>

            {/* Target Folder Name */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Target Folder Name
              </label>
              <input
                type="text"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                placeholder="e.g. my-project"
                disabled={isRunning}
                className="w-full bg-slate-850 text-slate-100 text-xs rounded-xl border border-slate-700 p-2.5 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                If the folder already exists in workspace, it will run <code>git pull</code> automatically!
              </p>
            </div>

            {/* Quick URL Suggestions */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                Quick Examples
              </label>
              <div className="flex flex-wrap gap-1.5">
                {[
                  'https://github.com/nellseen/githubpull',
                  'https://github.com/octocat/Hello-World',
                  'https://github.com/facebook/react',
                ].map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => handleUrlChange(example)}
                    className="text-[10px] rounded-lg bg-slate-800 hover:bg-slate-750 px-2 py-1 text-slate-300 border border-slate-700"
                  >
                    {example.split('/').pop()}
                  </button>
                ))}
              </div>
            </div>

            {/* Submit */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isRunning || !cloneUrl.trim()}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-600/30 transition-all cursor-pointer"
              >
                {isRunning ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Executing Git Operation...</span>
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 fill-current" />
                    <span>Clone or Pull Repository</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Right Stream Console */}
      <div className="lg:col-span-7 space-y-4">
        {successInfo && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/30 p-4 flex items-center gap-3">
            <div className="rounded-full bg-emerald-500/20 p-2 text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-emerald-300">{successInfo}</p>
              <p className="text-[11px] text-emerald-400/80">Folder is ready in local workspace for edits and deployment.</p>
            </div>
          </div>
        )}

        <LogTerminal
          logs={logs}
          title={`Git Clone/Pull Stream — ${folderName || 'Ready'}`}
          isRunning={isRunning}
          status={status}
          onClear={() => setLogs([])}
        />
      </div>
    </div>
  );
};
