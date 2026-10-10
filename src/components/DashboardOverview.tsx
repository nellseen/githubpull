import React from 'react';
import { 
  Users, 
  FolderGit2, 
  UploadCloud, 
  DownloadCloud, 
  ListFilter, 
  CheckCircle2, 
  Terminal, 
  ArrowRight, 
  Zap, 
  ShieldCheck, 
  Sparkles, 
  RefreshCw,
  FolderOpen,
  Calendar
} from 'lucide-react';
import { GitHubAccount, SystemStatus, WorkspaceFolder } from '../types';

interface DashboardOverviewProps {
  accounts: GitHubAccount[];
  selectedAccountIndex: number;
  systemStatus: SystemStatus | null;
  folders: WorkspaceFolder[];
  onNavigate: (tab: string, meta?: any) => void;
  onRefresh: () => void;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  accounts,
  selectedAccountIndex,
  systemStatus,
  folders,
  onNavigate,
  onRefresh,
}) => {
  const currentAccount = accounts[selectedAccountIndex];

  return (
    <div className="space-y-6">
      {/* Top Banner / Welcome */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950/60 to-slate-900 p-6 sm:p-8 border border-slate-800 shadow-xl">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-400 border border-indigo-500/20">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Multi-Account GitHub Automation Engine</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              GitHub Push, Deployer & Repositories Hub
            </h1>
            <p className="text-sm text-slate-300 max-w-2xl leading-relaxed">
              Automate local folder deployment, unzip archives directly into GitHub repos, clone code securely with multi-account tokens, and manage repositories in real time.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onRefresh}
              className="flex items-center gap-2 rounded-xl bg-slate-800/80 hover:bg-slate-750 px-4 py-2.5 text-xs font-semibold text-slate-200 border border-slate-700 transition-colors shadow-sm"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Refresh Status</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('deploy-folder')}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-indigo-600/30 transition-all"
            >
              <Zap className="h-3.5 w-3.5" />
              <span>Start Deployment</span>
            </button>
          </div>
        </div>

        {/* Ambient background decoration */}
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">GitHub Accounts</span>
            <div className="rounded-lg bg-indigo-500/10 p-2 text-indigo-400">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">{accounts.length}</span>
            <span className="text-xs text-slate-400">active tokens</span>
          </div>
          <p className="mt-2 text-xs text-slate-400 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 text-emerald-400" />
            {currentAccount ? `Active: ${currentAccount.username}` : 'No accounts loaded'}
          </p>
        </div>

        {/* Metric 2 */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Current Repos</span>
            <div className="rounded-lg bg-sky-500/10 p-2 text-sky-400">
              <ListFilter className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">
              {currentAccount?.public_repos !== undefined ? currentAccount.public_repos : '—'}
            </span>
            <span className="text-xs text-slate-400">public repos</span>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            {currentAccount?.total_private_repos ? `+ ${currentAccount.total_private_repos} private` : 'Ready to manage'}
          </p>
        </div>

        {/* Metric 3 */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Workspace Folders</span>
            <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-400">
              <FolderGit2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">{folders.length}</span>
            <span className="text-xs text-slate-400">in base directory</span>
          </div>
          <p className="mt-2 text-xs text-slate-400 truncate">
            Path: {systemStatus?.baseDir || 'deployments/'}
          </p>
        </div>

        {/* Metric 4 */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">API Rate Limit</span>
            <div className="rounded-lg bg-purple-500/10 p-2 text-purple-400">
              <ShieldCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">
              {currentAccount?.rateLimit ? currentAccount.rateLimit.remaining : '5000'}
            </span>
            <span className="text-xs text-slate-400">
              / {currentAccount?.rateLimit ? currentAccount.rateLimit.limit : '5000'} reqs
            </span>
          </div>
          <p className="mt-2 text-xs text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> GitHub API Healthy
          </p>
        </div>
      </div>

      {/* Main Action Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* Action 1: Deploy Folder */}
        <div
          onClick={() => onNavigate('deploy-folder')}
          className="group relative cursor-pointer overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50 p-6 hover:border-indigo-500/60 hover:bg-slate-850/80 transition-all shadow-md hover:shadow-indigo-500/10"
        >
          <div className="flex items-center justify-between">
            <div className="rounded-xl bg-indigo-500/10 p-3 text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
              <FolderGit2 className="h-6 w-6" />
            </div>
            <ArrowRight className="h-5 w-5 text-slate-500 group-hover:text-indigo-400 group-hover:translate-x-1 transition-all" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-white group-hover:text-indigo-300 transition-colors">
            🚀 Auto Deploy Folder
          </h3>
          <p className="mt-2 text-xs text-slate-400 leading-relaxed">
            Select any local folder or sub-path. Initializes Git, creates remote GitHub repo if not found, commits, and force pushes.
          </p>
          <div className="mt-4 flex items-center gap-2 text-xs font-medium text-indigo-400">
            <span>Configure folder deployment</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </div>
        </div>

        {/* Action 2: Unzip & Deploy */}
        <div
          onClick={() => onNavigate('unzip-deploy')}
          className="group relative cursor-pointer overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50 p-6 hover:border-sky-500/60 hover:bg-slate-850/80 transition-all shadow-md hover:shadow-sky-500/10"
        >
          <div className="flex items-center justify-between">
            <div className="rounded-xl bg-sky-500/10 p-3 text-sky-400 group-hover:bg-sky-600 group-hover:text-white transition-colors">
              <UploadCloud className="h-6 w-6" />
            </div>
            <ArrowRight className="h-5 w-5 text-slate-500 group-hover:text-sky-400 group-hover:translate-x-1 transition-all" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-white group-hover:text-sky-300 transition-colors">
            📦 Unzip & Deploy ZIP
          </h3>
          <p className="mt-2 text-xs text-slate-400 leading-relaxed">
            Upload a .zip package. Automatically unzips, cleans junk (.DS_Store, cache), flattens directories, and pushes to GitHub.
          </p>
          <div className="mt-4 flex items-center gap-2 text-xs font-medium text-sky-400">
            <span>Upload archive</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </div>
        </div>

        {/* Action 3: Clone Repo */}
        <div
          onClick={() => onNavigate('clone-repo')}
          className="group relative cursor-pointer overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50 p-6 hover:border-emerald-500/60 hover:bg-slate-850/80 transition-all shadow-md hover:shadow-emerald-500/10"
        >
          <div className="flex items-center justify-between">
            <div className="rounded-xl bg-emerald-500/10 p-3 text-emerald-400 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              <DownloadCloud className="h-6 w-6" />
            </div>
            <ArrowRight className="h-5 w-5 text-slate-500 group-hover:text-emerald-400 group-hover:translate-x-1 transition-all" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-white group-hover:text-emerald-300 transition-colors">
            📥 Clone Repo to Workspace
          </h3>
          <p className="mt-2 text-xs text-slate-400 leading-relaxed">
            Clone or git-pull any public or private repository using authenticated GitHub credentials with real-time stream logs.
          </p>
          <div className="mt-4 flex items-center gap-2 text-xs font-medium text-emerald-400">
            <span>Clone repository</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </div>
        </div>
      </div>

      {/* Workspace Folders Quick Access */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-indigo-400" />
            <h2 className="text-sm font-semibold text-white">Local Workspace Folders</h2>
            <span className="text-xs text-slate-400">({folders.length} available)</span>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('deploy-folder')}
            className="text-xs font-medium text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
          >
            <span>Deploy a folder</span>
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>

        {folders.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-xs">
            No folders in workspace directory yet. Create one or clone a repository to get started.
          </div>
        ) : (
          <div className="divide-y divide-slate-800 overflow-x-auto">
            {folders.slice(0, 5).map((folder) => (
              <div key={folder.name} className="py-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-300">
                    <FolderGit2 className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-slate-200">{folder.name}</span>
                      {folder.hasGit && (
                        <span className="rounded bg-emerald-500/10 px-1.5 py-0.2 text-[10px] font-medium text-emerald-400 border border-emerald-500/20">
                          Git initialized
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-500">{folder.fileCount} items</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onNavigate('deploy-folder', { selectedFolder: folder.name })}
                    className="flex items-center gap-1.5 rounded-lg bg-indigo-600/80 hover:bg-indigo-600 px-3 py-1 text-xs font-medium text-white transition-colors"
                  >
                    <Zap className="h-3 w-3" />
                    <span>Deploy</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
