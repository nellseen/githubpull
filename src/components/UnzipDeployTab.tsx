import React, { useState, useRef } from 'react';
import { 
  UploadCloud, 
  FileArchive, 
  CheckCircle2, 
  Lock, 
  Globe, 
  ExternalLink, 
  RefreshCw, 
  Trash2, 
  Filter, 
  Layers, 
  Play 
} from 'lucide-react';
import { GitHubAccount } from '../types';
import { LogTerminal } from './LogTerminal';

interface UnzipDeployTabProps {
  accounts: GitHubAccount[];
  selectedAccountIndex: number;
  setSelectedAccountIndex: (index: number) => void;
  onRefreshFolders: () => void;
}

export const UnzipDeployTab: React.FC<UnzipDeployTabProps> = ({
  accounts,
  selectedAccountIndex,
  setSelectedAccountIndex,
  onRefreshFolders,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [repoName, setRepoName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [flatten, setFlatten] = useState(true);
  const [commitMessage, setCommitMessage] = useState('Auto deploy ZIP via GitHub Pull & Deployer');

  // Execution state
  const [isUploading, setIsUploading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentAccount = accounts[selectedAccountIndex];

  const handleFileChange = (file: File | null) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.zip')) {
      alert('Please select a valid .zip file');
      return;
    }
    setSelectedFile(file);
    const inferred = file.name.replace(/\.zip$/i, '').replace(/\s+/g, '-').replace(/[^a-zA-Z0-9_\-\.]/g, '-');
    setRepoName(inferred);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleUploadAndDeploy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      alert('Please upload a ZIP file first.');
      return;
    }
    if (!currentAccount) {
      alert('Please select a GitHub account first.');
      return;
    }

    setIsUploading(true);
    setStatus('running');
    setLogs([
      `📤 Uploading ${selectedFile.name} (${(selectedFile.size / 1024 / 1024).toFixed(2)} MB)...`,
      `Target GitHub Account: ${currentAccount.username}`,
      `Repository Name: ${repoName || 'auto'}`,
    ]);
    setResultUrl(null);

    const formData = new FormData();
    formData.append('zipFile', selectedFile);
    formData.append('accountIndex', String(selectedAccountIndex));
    formData.append('repoName', repoName.trim());
    formData.append('isPrivate', String(isPrivate));
    formData.append('flatten', String(flatten));
    formData.append('commitMessage', commitMessage);

    try {
      const response = await fetch('/api/deploy/zip', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data.logs && Array.isArray(data.logs)) {
        setLogs((prev) => [...prev, ...data.logs]);
      }

      if (response.ok && data.success) {
        setStatus('success');
        setResultUrl(data.repoUrl);
        setLogs((prev) => [...prev, `🎉 Deployed successfully to ${data.repoUrl}`]);
        onRefreshFolders();
      } else {
        setStatus('error');
        setLogs((prev) => [...prev, `❌ Error: ${data.error || 'Deployment failed'}`]);
      }
    } catch (err: any) {
      setStatus('error');
      setLogs((prev) => [...prev, `❌ Network error: ${err.message}`]);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Upload & Form Section */}
      <div className="lg:col-span-5 space-y-6">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl backdrop-blur">
          <div className="flex items-center gap-2.5 pb-4 border-b border-slate-800">
            <div className="h-9 w-9 rounded-xl bg-sky-500/10 flex items-center justify-center text-sky-400">
              <UploadCloud className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Unzip & Deploy ZIP</h2>
              <p className="text-xs text-slate-400">Upload archive, auto-unpack and push to GitHub</p>
            </div>
          </div>

          <form onSubmit={handleUploadAndDeploy} className="space-y-4 pt-4">
            {/* Account Selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Target GitHub Account
              </label>
              {accounts.length > 0 ? (
                <select
                  value={selectedAccountIndex}
                  onChange={(e) => setSelectedAccountIndex(Number(e.target.value))}
                  disabled={isUploading}
                  className="w-full bg-slate-850 text-slate-100 text-xs rounded-xl border border-slate-700 p-2.5 focus:ring-2 focus:ring-sky-500 focus:outline-none"
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

            {/* ZIP Drag and Drop Area */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                ZIP Archive File
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip,application/zip"
                onChange={(e) => handleFileChange(e.target.files ? e.target.files[0] : null)}
                className="hidden"
              />

              {!selectedFile ? (
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className="cursor-pointer border-2 border-dashed border-slate-700 hover:border-sky-500/60 rounded-xl p-6 text-center bg-slate-950/40 hover:bg-slate-900/60 transition-all group"
                >
                  <FileArchive className="h-9 w-9 mx-auto text-slate-500 group-hover:text-sky-400 transition-colors mb-2" />
                  <p className="text-xs font-semibold text-slate-200 group-hover:text-sky-300">
                    Click to browse or drop ZIP here
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">Accepts standard .zip archives</p>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700 flex items-center justify-between">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="h-8 w-8 rounded-lg bg-sky-500/20 flex items-center justify-center text-sky-400 shrink-0">
                      <FileArchive className="h-4 w-4" />
                    </div>
                    <div className="truncate">
                      <p className="text-xs font-semibold text-slate-100 truncate">{selectedFile.name}</p>
                      <p className="text-[11px] text-slate-400">
                        {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFile(null);
                      setRepoName('');
                    }}
                    className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-700/60 transition-colors"
                    title="Remove file"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Target Repo Name */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Target Repository Name
              </label>
              <input
                type="text"
                value={repoName}
                onChange={(e) => setRepoName(e.target.value)}
                placeholder="Repository name"
                disabled={isUploading}
                className="w-full bg-slate-850 text-slate-100 text-xs rounded-xl border border-slate-700 p-2.5 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                required
              />
            </div>

            {/* Visibility Toggle */}
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
                      ? 'bg-sky-600/20 border-sky-500/50 text-sky-300 font-semibold'
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
                      ? 'bg-sky-600/20 border-sky-500/50 text-sky-300 font-semibold'
                      : 'bg-slate-850 border-slate-700/80 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Lock className="h-3.5 w-3.5" />
                  <span>Private</span>
                </button>
              </div>
            </div>

            {/* Options Checkboxes */}
            <div className="space-y-2 pt-1">
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={flatten}
                  onChange={(e) => setFlatten(e.target.checked)}
                  className="rounded border-slate-700 text-sky-600 focus:ring-sky-500"
                />
                <span className="flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5 text-slate-400" />
                  Flatten single nested folder if present
                </span>
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-400 cursor-default">
                <Filter className="h-3.5 w-3.5 text-slate-500" />
                <span>Auto-clean junk files (.DS_Store, cache, thumbs.db) enabled</span>
              </label>
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
                disabled={isUploading}
                className="w-full bg-slate-850 text-slate-100 text-xs rounded-xl border border-slate-700 p-2.5 focus:ring-2 focus:ring-sky-500 focus:outline-none"
              />
            </div>

            {/* Submit */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isUploading || !selectedFile || !currentAccount}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-sky-600/30 transition-all cursor-pointer"
              >
                {isUploading ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Extracting & Pushing to GitHub...</span>
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 fill-current" />
                    <span>Unpack & Deploy to GitHub</span>
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
                <p className="text-xs font-bold text-emerald-300">ZIP Deployed to GitHub Successfully!</p>
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
          title={`ZIP Deployment Console — ${selectedFile?.name || 'Waiting for file'}`}
          isRunning={isUploading}
          status={status}
          onClear={() => setLogs([])}
        />
      </div>
    </div>
  );
};
