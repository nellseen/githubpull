import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { DashboardOverview } from './components/DashboardOverview';
import { DeployFolderTab } from './components/DeployFolderTab';
import { UnzipDeployTab } from './components/UnzipDeployTab';
import { CloneRepoTab } from './components/CloneRepoTab';
import { RepoListTab } from './components/RepoListTab';
import { AccountsSettingsTab } from './components/AccountsSettingsTab';
import { GitHubAccount, SystemStatus, WorkspaceFolder } from './types';
import { GitBranch, ShieldCheck } from 'lucide-react';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [accounts, setAccounts] = useState<GitHubAccount[]>([]);
  const [selectedAccountIndex, setSelectedAccountIndex] = useState(0);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [folders, setFolders] = useState<WorkspaceFolder[]>([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [selectedFolderForDeploy, setSelectedFolderForDeploy] = useState<string | undefined>(undefined);

  // Fetch accounts
  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/accounts');
      if (res.ok) {
        const data = await res.json();
        setAccounts(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to fetch accounts:', err);
    }
  }, []);

  // Fetch status
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data = await res.json();
        setSystemStatus(data);
      }
    } catch (err) {
      console.error('Failed to fetch system status:', err);
    }
  }, []);

  // Fetch folders
  const fetchFolders = useCallback(async () => {
    try {
      const res = await fetch('/api/workspace/folders');
      if (res.ok) {
        const data = await res.json();
        setFolders(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to fetch folders:', err);
    }
  }, []);

  const refreshAll = useCallback(() => {
    fetchAccounts();
    fetchStatus();
    fetchFolders();
  }, [fetchAccounts, fetchStatus, fetchFolders]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // WebSocket Connection
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: any = null;

    const connectWs = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setWsConnected(true);
      };

      ws.onclose = () => {
        setWsConnected(false);
        reconnectTimeout = setTimeout(connectWs, 3000);
      };

      ws.onerror = () => {
        setWsConnected(false);
      };
    };

    connectWs();

    return () => {
      if (ws) ws.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, []);

  const handleNavigate = (tab: string, meta?: any) => {
    if (meta?.selectedFolder) {
      setSelectedFolderForDeploy(meta.selectedFolder);
    }
    setActiveTab(tab);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        accounts={accounts}
        selectedAccountIndex={selectedAccountIndex}
        setSelectedAccountIndex={setSelectedAccountIndex}
        systemStatus={systemStatus}
        wsConnected={wsConnected}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'dashboard' && (
          <DashboardOverview
            accounts={accounts}
            selectedAccountIndex={selectedAccountIndex}
            systemStatus={systemStatus}
            folders={folders}
            onNavigate={handleNavigate}
            onRefresh={refreshAll}
          />
        )}

        {activeTab === 'deploy-folder' && (
          <DeployFolderTab
            accounts={accounts}
            selectedAccountIndex={selectedAccountIndex}
            setSelectedAccountIndex={setSelectedAccountIndex}
            folders={folders}
            onRefreshFolders={fetchFolders}
            initialFolder={selectedFolderForDeploy}
          />
        )}

        {activeTab === 'unzip-deploy' && (
          <UnzipDeployTab
            accounts={accounts}
            selectedAccountIndex={selectedAccountIndex}
            setSelectedAccountIndex={setSelectedAccountIndex}
            onRefreshFolders={fetchFolders}
          />
        )}

        {activeTab === 'clone-repo' && (
          <CloneRepoTab
            accounts={accounts}
            selectedAccountIndex={selectedAccountIndex}
            setSelectedAccountIndex={setSelectedAccountIndex}
            onRefreshFolders={fetchFolders}
          />
        )}

        {activeTab === 'repos' && (
          <RepoListTab
            accounts={accounts}
            selectedAccountIndex={selectedAccountIndex}
            setSelectedAccountIndex={setSelectedAccountIndex}
            onDeployRepoFolder={(repoName) => {
              setSelectedFolderForDeploy(repoName);
              setActiveTab('deploy-folder');
            }}
          />
        )}

        {activeTab === 'accounts' && (
          <AccountsSettingsTab
            accounts={accounts}
            systemStatus={systemStatus}
            onRefresh={refreshAll}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-900/40 py-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-indigo-400" />
            <span>GitHub Pull & Multi-Account Deployer</span>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-slate-500">
            <span>WebSocket Live Logs</span>
            <span>•</span>
            <span>Multi-Account Personal Access Tokens</span>
            <span>•</span>
            <span>Auto Git Init & Push</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
export default App;
