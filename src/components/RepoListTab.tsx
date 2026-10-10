import React, { useState, useEffect } from 'react';
import { 
  ListFilter, 
  Search, 
  Trash2, 
  ExternalLink, 
  Copy, 
  Check, 
  Lock, 
  Globe, 
  Star, 
  GitFork, 
  RefreshCw, 
  Plus, 
  AlertTriangle,
  FolderGit2
} from 'lucide-react';
import { GitHubAccount, RepoItem } from '../types';

interface RepoListTabProps {
  accounts: GitHubAccount[];
  selectedAccountIndex: number;
  setSelectedAccountIndex: (index: number) => void;
  onDeployRepoFolder?: (repoName: string) => void;
}

export const RepoListTab: React.FC<RepoListTabProps> = ({
  accounts,
  selectedAccountIndex,
  setSelectedAccountIndex,
}) => {
  const [repos, setRepos] = useState<RepoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'public' | 'private' | 'forks'>('all');
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // Delete modal state
  const [deleteModalRepo, setDeleteModalRepo] = useState<RepoItem | null>(null);
  const [deleteConfirmationInput, setDeleteConfirmationInput] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // Create repo modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRepoName, setNewRepoName] = useState('');
  const [newRepoDesc, setNewRepoDesc] = useState('');
  const [newRepoPrivate, setNewRepoPrivate] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const currentAccount = accounts[selectedAccountIndex];

  const fetchRepos = async () => {
    if (!currentAccount) {
      setRepos([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/repos?accountIndex=${selectedAccountIndex}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to fetch repositories');
      }
      const data = await res.json();
      setRepos(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRepos();
  }, [selectedAccountIndex]);

  const handleCopyClone = (repo: RepoItem) => {
    navigator.clipboard.writeText(repo.clone_url);
    setCopiedId(repo.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteModalRepo || !currentAccount) return;
    if (deleteConfirmationInput.trim() !== deleteModalRepo.name) {
      alert('The repository name entered does not match.');
      return;
    }

    setIsDeleting(true);
    try {
      const owner = deleteModalRepo.full_name.split('/')[0] || currentAccount.username;
      const res = await fetch(`/api/repos/${owner}/${deleteModalRepo.name}?accountIndex=${selectedAccountIndex}`, {
        method: 'DELETE',
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setRepos((prev) => prev.filter((r) => r.id !== deleteModalRepo.id));
        setDeleteModalRepo(null);
        setDeleteConfirmationInput('');
      } else {
        alert(data.error || 'Failed to delete repository');
      }
    } catch (err: any) {
      alert(err.message || 'Error deleting repository');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCreateRepo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRepoName.trim() || !currentAccount) return;

    setIsCreating(true);
    try {
      const res = await fetch('/api/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountIndex: selectedAccountIndex,
          name: newRepoName.trim(),
          description: newRepoDesc.trim(),
          isPrivate: newRepoPrivate,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setShowCreateModal(false);
        setNewRepoName('');
        setNewRepoDesc('');
        fetchRepos();
      } else {
        alert(data.error || 'Failed to create repository');
      }
    } catch (err: any) {
      alert(err.message || 'Error creating repository');
    } finally {
      setIsCreating(false);
    }
  };

  const filteredRepos = repos.filter((repo) => {
    const matchesSearch =
      repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (repo.description && repo.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (repo.language && repo.language.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;

    if (filterType === 'public') return !repo.private;
    if (filterType === 'private') return repo.private;
    if (filterType === 'forks') return repo.fork;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Controls Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <ListFilter className="h-5 w-5 text-indigo-400" />
            <span>GitHub Repositories Manager</span>
          </h2>
          <p className="text-xs text-slate-400">
            {currentAccount ? (
              <>Showing repositories for <strong>{currentAccount.username}</strong> ({filteredRepos.length} found)</>
            ) : (
              'Select a GitHub account to view repositories'
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {accounts.length > 1 && (
            <select
              value={selectedAccountIndex}
              onChange={(e) => setSelectedAccountIndex(Number(e.target.value))}
              className="bg-slate-800 text-slate-200 text-xs rounded-xl border border-slate-700 px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              {accounts.map((acc, i) => (
                <option key={acc.username || i} value={i}>
                  {acc.username}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={fetchRepos}
            disabled={loading}
            className="p-2 text-slate-300 hover:text-white rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 transition-colors"
            title="Refresh repository list"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            disabled={!currentAccount}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition-all"
          >
            <Plus className="h-4 w-4" />
            <span>New Repo</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-xl border border-slate-800 bg-slate-900/60">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search by repo name, description, or language..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-850 text-slate-100 text-xs rounded-lg pl-9 pr-3 py-2 border border-slate-750 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex items-center gap-1 overflow-x-auto">
          {(['all', 'public', 'private', 'forks'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setFilterType(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                filterType === t
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Repos Grid */}
      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-4 text-xs text-rose-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-slate-400">
          <RefreshCw className="h-8 w-8 mx-auto animate-spin text-indigo-400 mb-2" />
          <p className="text-xs">Fetching repositories from GitHub API...</p>
        </div>
      ) : filteredRepos.length === 0 ? (
        <div className="py-16 text-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/20">
          <ListFilter className="h-10 w-10 mx-auto text-slate-600 mb-2" />
          <p className="text-sm font-semibold text-slate-300">No repositories found</p>
          <p className="text-xs text-slate-500 mt-1">
            {searchQuery ? 'Try clearing your search query.' : 'Create or deploy a new repository to get started.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredRepos.map((repo) => (
            <div
              key={repo.id}
              className="flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-900/70 p-5 hover:border-slate-700 transition-all shadow-sm group"
            >
              <div className="space-y-3">
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <a
                        href={repo.html_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-bold text-sm text-slate-100 hover:text-indigo-400 truncate flex items-center gap-1 group-hover:underline"
                      >
                        <span className="truncate">{repo.name}</span>
                        <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
                      </a>
                    </div>
                    <span className="text-[11px] text-slate-500">{repo.full_name}</span>
                  </div>

                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold flex items-center gap-1 border ${
                      repo.private
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    }`}
                  >
                    {repo.private ? <Lock className="h-2.5 w-2.5" /> : <Globe className="h-2.5 w-2.5" />}
                    {repo.private ? 'Private' : 'Public'}
                  </span>
                </div>

                {/* Description */}
                <p className="text-xs text-slate-400 line-clamp-2 min-h-[32px]">
                  {repo.description || <span className="italic text-slate-600">No description provided</span>}
                </p>

                {/* Tags & Meta */}
                <div className="flex items-center gap-3 text-[11px] text-slate-500 flex-wrap">
                  {repo.language && (
                    <span className="flex items-center gap-1 text-slate-300">
                      <span className="h-2 w-2 rounded-full bg-indigo-400" />
                      {repo.language}
                    </span>
                  )}
                  {repo.stargazers_count > 0 && (
                    <span className="flex items-center gap-0.5 text-amber-300">
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                      {repo.stargazers_count}
                    </span>
                  )}
                  {repo.fork && (
                    <span className="flex items-center gap-0.5 text-sky-400">
                      <GitFork className="h-3 w-3" />
                      Fork
                    </span>
                  )}
                  <span>{(repo.size / 1024).toFixed(1)} MB</span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => handleCopyClone(repo)}
                  className="flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-slate-200 px-2 py-1 rounded hover:bg-slate-800 transition-colors"
                  title="Copy clone URL"
                >
                  {copiedId === repo.id ? (
                    <Check className="h-3 w-3 text-emerald-400" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                  <span>{copiedId === repo.id ? 'Copied URL' : 'Clone URL'}</span>
                </button>

                <div className="flex items-center gap-1.5">
                  <a
                    href={repo.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-slate-800 rounded-lg transition-colors"
                    title="Open on GitHub"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteModalRepo(repo);
                      setDeleteConfirmationInput('');
                    }}
                    className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors"
                    title="Delete repository"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModalRepo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-rose-500/30 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="rounded-xl bg-rose-500/10 p-2.5">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Delete Repository</h3>
                <p className="text-xs text-rose-300">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to permanently delete repository{' '}
              <strong className="text-white font-mono bg-slate-800 px-1.5 py-0.5 rounded">
                {deleteModalRepo.name}
              </strong>{' '}
              from GitHub account <strong>{currentAccount?.username}</strong>?
            </p>

            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                To confirm, type <span className="font-mono text-rose-300">{deleteModalRepo.name}</span> below:
              </label>
              <input
                type="text"
                value={deleteConfirmationInput}
                onChange={(e) => setDeleteConfirmationInput(e.target.value)}
                placeholder={deleteModalRepo.name}
                className="w-full bg-slate-950 text-slate-100 text-xs rounded-xl border border-slate-700 p-2.5 focus:ring-2 focus:ring-rose-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteModalRepo(null)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={isDeleting || deleteConfirmationInput.trim() !== deleteModalRepo.name}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-rose-600/30 transition-all"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>I understand, delete this repository</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Repo Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-indigo-500/10 p-2.5 text-indigo-400">
                <Plus className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Create New GitHub Repository</h3>
                <p className="text-xs text-slate-400">Under account: {currentAccount?.username}</p>
              </div>
            </div>

            <form onSubmit={handleCreateRepo} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Repository Name
                </label>
                <input
                  type="text"
                  value={newRepoName}
                  onChange={(e) => setNewRepoName(e.target.value)}
                  placeholder="e.g. awesome-tool"
                  className="w-full bg-slate-950 text-slate-100 text-xs rounded-xl border border-slate-700 p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Description (optional)
                </label>
                <input
                  type="text"
                  value={newRepoDesc}
                  onChange={(e) => setNewRepoDesc(e.target.value)}
                  placeholder="Short project description"
                  className="w-full bg-slate-950 text-slate-100 text-xs rounded-xl border border-slate-700 p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Visibility
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewRepoPrivate(false)}
                    className={`py-2 px-3 rounded-xl text-xs font-medium border flex items-center justify-center gap-1.5 ${
                      !newRepoPrivate
                        ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-300 font-semibold'
                        : 'bg-slate-950 border-slate-750 text-slate-400'
                    }`}
                  >
                    <Globe className="h-3 w-3" />
                    Public
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewRepoPrivate(true)}
                    className={`py-2 px-3 rounded-xl text-xs font-medium border flex items-center justify-center gap-1.5 ${
                      newRepoPrivate
                        ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-300 font-semibold'
                        : 'bg-slate-950 border-slate-750 text-slate-400'
                    }`}
                  >
                    <Lock className="h-3 w-3" />
                    Private
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating || !newRepoName.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 shadow-md shadow-indigo-600/30 transition-all"
                >
                  {isCreating ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Creating...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="h-3.5 w-3.5" />
                      <span>Create Repository</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
