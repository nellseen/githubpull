import React, { useState } from 'react';
import { 
  FolderGit2, 
  Play, 
  Lock, 
  Globe, 
  ExternalLink, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  Plus, 
  RefreshCw 
} from 'lucide-react';
import { GitHubAccount, WorkspaceFolder } from '../types';
import { LogTerminal } from './LogTerminal';

interface DeployFolderTabProps {
  accounts: GitHubAccount[];
  selectedAccountIndex: number;
  setSelectedAccountIndex: (index: number) => void;
  folders: WorkspaceFolder[];
  onRefreshFolders: () => void;
  initialFolder?: string;
}

export const DeployFolderTab: React.FC<DeployFolderTabProps> = ({
  accounts,
  selectedAccountIndex,
  setSelectedAccountIndex,
  folders,
  onRefreshFolders,
  initialFolder,
}) => {
  const [folderName, setFolderName] = useState(initialFolder || (folders[0]?.name || 'sample-app'));
  const [repoName, setRepoName] = useState(initialFolder || (folders[0]?.name || 'sample-app'));
  const [isPrivate, setIsPrivate] = useState(false);
  const [commitMessage, setCommitMessage] = useState('Auto deploy via GitHub Pull & Deployer');
  
  // New folder dialog
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderNameInput, setNewFolderNameInput] = useState('');

  // Execution state
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const currentAccount = accounts[selectedAccountIndex];

  const handleFolderSelect = (name: string) => {
    setFolderName(name);
    setRepoName(name.replace(/\s+/g, '-'));
  };

  const handleCreateNewFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderNameInput.trim()) return;

    try {
      const res = await fetch('/api/workspace/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderName: newFolderNameInput.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        onRefreshFolders();
        setFolderName(data.folderName);
        setRepoName(data.folderName);
        setIsCreatingFolder(false);
        setNewFolderNameInput('');
      } else {
        alert(data.error || 'Failed to create folder');
      }
    } catch (err: any) {
      alert(err.message || 'Error creating folder');
    }
  };

  const startDeployment = () => {
    if (!currentAccount) {
      alert('Please select or configure a GitHub account first.');
      return;
    }
    if (!folderName.trim()) {
      alert('Please select or enter a folder to deploy.');
      return;
    }

    setIsRunning(true);
    setStatus('running');
    setLogs([]);
    setResultUrl(null);

    const params = new URLSearchParams({
      accountIndex: String(selectedAccountIndex),
      folderName: folderName.trim(),
      repoName: (repoName || folderName).trim(),
      isPrivate: String(isPrivate),
      commitMessage: commitMessage.trim(),
    });

    const eventSource = new EventSource(`/api/deploy/folder/stream?${params.toString()}`);

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
        if (data.repoUrl) setResultUrl(data.repoUrl);
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
        setLogs((prev) => [...prev, '❌ An error occurred during deployment.']);
      }
      setStatus('error');
      setIsRunning(false);
      eventSource.close();
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left Config Panel */}
      <div className="lg:col-span-5 space-y-6">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl backdrop-blur">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                <FolderGit2 className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">Auto Deploy Folder</h2>
                <p className="text-xs text-slate-400">Push any workspace directory to GitHub</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onRefreshFolders}
              className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition-colors"
              title="Refresh workspace folders"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              startDeployment();
            }}
            className="space-y-4 pt-4"
          >
            {/* Account Selection */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Target GitHub Account
              </label>
              {accounts.length > 0 ? (
                <select
                  value={selectedAccountIndex}
                  onChange={(e) => setSelectedAccountIndex(Number(e.target.value))}
                  disabled={isRunning}
                  className="w-full bg-slate-850 text-slate-100 text-xs rounded-xl border border-slate-700 p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  {accounts.map((acc, i) => (
                    <option key={acc.username || i} value={i}>
                      {acc.username} ({acc.email})
                    </option>
                  ))}
                </select>
              ) : (
                <div className="text-xs text-rose-400 bg-rose-500/10 p-2.5 rounded-xl border border-rose-500/20">
                  No GitHub account configured. Add a token first.
                </div>
              )}
            </div>

            {/* Folder Selection */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  Select Local Folder
                </label>
                <button
                  type="button"
                  onClick={() => setIsCreatingFolder(!isCreatingFolder)}
                  className="text-[11px] font-medium text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                >
                  <Plus className="h-3 w-3" />
                  <span>New Folder</span>
                </button>
              </div>

              {isCreatingFolder && (
                <div className="mb-3 p-3 rounded-xl bg-slate-800/80 border border-slate-700 space-y-2">
                  <input
                    type="text"
                    placeholder="e.g. my-awesome-project"
                    value={newFolderNameInput}
                    onChange={(e) => setNewFolderNameInput(e.target.value)}
                    className="w-full bg-slate-900 text-slate-100 text-xs rounded-lg border border-slate-650 px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsCreatingFolder(false)}
                      className="px-2.5 py-1 text-xs text-slate-400 hover:text-slate-200"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleCreateNewFolder}
                      className="px-2.5 py-1 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium"
                    >
                      Create
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-1.5 max-h-40 overflow-y-auto p-1 border border-slate-750 rounded-xl bg-slate-950/60">
                {folders.length === 0 ? (
                  <div className="p-3 text-center text-xs text-slate-500">
                    No folders found in workspace
                  </div>
                ) : (
                  folders.map((f) => {
                    const isSelected = folderName === f.name;
                    return (
                      <button
                        key={f.name}
                        type="button"
                        onClick={() => handleFolderSelect(f.name)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-all text-left ${
                          isSelected
                            ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/40 font-semibold'
                            : 'text-slate-300 hover:bg-slate-800/60'
                        }`}
                      >
                        <span className="truncate">{f.name}</span>
                        <span className="text-[10px] text-slate-400 ml-2 shrink-0">
                          {f.fileCount} items
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Custom Repository Name */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                GitHub Repository Name
              </label>
              <input
                type="text"
                value={repoName}
                onChange={(e) => setRepoName(e.target.value)}
                disabled={isRunning}
                placeholder="Repository name"
                className="w-full bg-slate-850 text-slate-100 text-xs rounded-xl border border-slate-700 p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                required
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Will be created on GitHub under <code>{currentAccount?.username || 'user'}</code> if it doesn't already exist.
              </p>
            </div>

            {/* Visibility Options */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Repository Visibility
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setIsPrivate(false)}
                  className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-medium border transition-all ${
                    !isPrivate
                      ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-300 font-semibold'
                      : 'bg-slate-850 border-slate-700/80 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Globe className="h-3.5 w-3.5" />
                  <span>Public</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsPrivate(true)}
                  className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-medium border transition-all ${
                    isPrivate
                      ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-300 font-semibold'
                      : 'bg-slate-850 border-slate-700/80 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Lock className="h-3.5 w-3.5" />
                  <span>Private</span>
                </button>
              </div>
            </div>

            {/* Commit Message */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Commit Message
              </label>
              <input
                type="text"
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                disabled={isRunning}
                className="w-full bg-slate-850 text-slate-100 text-xs rounded-xl border border-slate-700 p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            {/* Deploy Trigger Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isRunning || !currentAccount || !folderName}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
              >
                {isRunning ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Deploying to GitHub...</span>
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 fill-current" />
                    <span>Deploy & Push to GitHub</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Right Stream Console */}
      <div className="lg:col-span-7 space-y-4">
        {resultUrl && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/30 p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-emerald-500/20 p-2 text-emerald-400">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-emerald-300">Repository Deployed Successfully!</p>
                <p className="text-[11px] text-emerald-400/80 truncate max-w-sm">{resultUrl}</p>
              </div>
            </div>
            <a
              href={resultUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors"
            >
              <span>View on GitHub</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        )}

        <LogTerminal
          logs={logs}
          title={`Deployment Stream — ${folderName}`}
          isRunning={isRunning}
          status={status}
          onClear={() => setLogs([])}
        />
      </div>
    </div>
  );
};
