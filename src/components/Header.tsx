import React from 'react';
import { 
  GitBranch, 
  UploadCloud, 
  FolderGit2, 
  DownloadCloud, 
  ListFilter, 
  Key, 
  Activity, 
  Radio, 
  Bot, 
  ChevronDown,
  ExternalLink,
  ShieldCheck
} from 'lucide-react';
import { GitHubAccount, SystemStatus } from '../types';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  accounts: GitHubAccount[];
  selectedAccountIndex: number;
  setSelectedAccountIndex: (index: number) => void;
  systemStatus: SystemStatus | null;
  wsConnected: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  accounts,
  selectedAccountIndex,
  setSelectedAccountIndex,
  systemStatus,
  wsConnected,
}) => {
  const currentAccount = accounts[selectedAccountIndex];

  const navItems = [
    { id: 'dashboard', label: 'Overview', icon: Activity },
    { id: 'deploy-folder', label: 'Deploy Folder', icon: FolderGit2 },
    { id: 'unzip-deploy', label: 'Unzip & Deploy', icon: UploadCloud },
    { id: 'clone-repo', label: 'Clone / Pull', icon: DownloadCloud },
    { id: 'repos', label: 'Repositories', icon: ListFilter, count: currentAccount?.public_repos },
    { id: 'accounts', label: 'Accounts & Bot', icon: Key, count: accounts.length },
  ];

  return (
    <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Top bar */}
        <div className="flex h-16 items-center justify-between gap-4">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-sky-400 shadow-lg shadow-indigo-500/20 text-white font-bold">
              <GitBranch className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-100 tracking-tight text-base sm:text-lg">
                  GitHub Pull <span className="text-indigo-400">& Deployer</span>
                </span>
                <span className="rounded bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-400 border border-indigo-500/20">
                  v2.0 Multi-Acc
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                Automated Git Push, Folder Deployer & Repositories Manager
              </p>
            </div>
          </div>

          {/* Right Controls: Account Selector + WS Status */}
          <div className="flex items-center gap-3">
            {/* WebSocket connection badge */}
            <div
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border ${
                wsConnected
                  ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800/40'
                  : 'bg-amber-950/40 text-amber-400 border-amber-800/40'
              }`}
              title={wsConnected ? 'Realtime WebSocket Active' : 'WebSocket Reconnecting...'}
            >
              <Radio className={`h-3 w-3 ${wsConnected ? 'animate-pulse text-emerald-400' : ''}`} />
              <span className="hidden md:inline">{wsConnected ? 'Live WS' : 'Offline'}</span>
            </div>

            {/* Telegram indicator */}
            {systemStatus?.telegramConfigured && (
              <div
                className="hidden lg:flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium bg-sky-950/40 text-sky-400 border border-sky-800/40"
                title={`Telegram bot configured: @${systemStatus.telegramBotName || 'active'}`}
              >
                <Bot className="h-3 w-3" />
                <span>@{systemStatus.telegramBotName || 'Telegram Bot'}</span>
              </div>
            )}

            {/* Account Switcher */}
            {accounts.length > 0 ? (
              <div className="relative group">
                <select
                  value={selectedAccountIndex}
                  onChange={(e) => setSelectedAccountIndex(Number(e.target.value))}
                  className="appearance-none bg-slate-800 hover:bg-slate-750 text-slate-100 text-xs font-medium pl-9 pr-8 py-2 rounded-lg border border-slate-700/80 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-sm"
                >
                  {accounts.map((acc, idx) => (
                    <option key={acc.username || idx} value={idx}>
                      {acc.username} {acc.email ? `(${acc.email})` : ''}
                    </option>
                  ))}
                </select>
                {currentAccount?.avatar_url ? (
                  <img
                    src={currentAccount.avatar_url}
                    alt={currentAccount.username}
                    className="absolute left-2.5 top-2.5 h-4 w-4 rounded-full pointer-events-none ring-1 ring-slate-600"
                  />
                ) : (
                  <ShieldCheck className="absolute left-2.5 top-2.5 h-4 w-4 text-indigo-400 pointer-events-none" />
                )}
                <ChevronDown className="absolute right-2.5 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setActiveTab('accounts')}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white transition-colors shadow-md shadow-indigo-600/20"
              >
                <Key className="h-3.5 w-3.5" />
                <span>Add GitHub Token</span>
              </button>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <nav className="flex space-x-1 sm:space-x-2 overflow-x-auto py-2 scrollbar-none border-t border-slate-800/60">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-2 whitespace-nowrap px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span>{item.label}</span>
                {item.count !== undefined && item.count > 0 && (
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[10px] font-semibold ${
                      isActive ? 'bg-indigo-900/60 text-white' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
