import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Clock,
  FolderPlus,
  Grid2X2,
  HardDrive,
  Heart,
  List,
  Music,
  Pencil,
  Plus,
  Search,
  Settings,
  Sparkles,
  Star,
  Trash2,
  Upload,
  X,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../services/db';
import {
  ACCEPT_ATTR,
  createCollection,
  deleteCollection,
  deleteScore,
  ensureDefaultCollections,
  importFiles,
  renameCollection,
  toggleFavorite,
  updateScore,
} from '../services/libraryRepo';
import { EMPTY_FILTER, filterScores, sortScores, uniqueValues, type LibraryFilter } from './query';
import { DIFFICULTY_LABELS, type Collection, type Difficulty, type LibrarySort, type Score } from '../types';
import { useSettings } from '../settings/SettingsContext';
import { ScoreModal } from './ScoreModal';
import { generateSamplePianoPdf } from './sampleScore';
import { formatBytes } from '../services/backup';

export interface LibraryViewProps {
  onOpenScore: (scoreId: string) => void;
  onOpenSettings: () => void;
}

function ScoreThumbnail({ score }: { score: Score }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!score.thumbnail) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(score.thumbnail);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [score.thumbnail]);

  if (url) {
    return (
      <img
        src={url}
        alt={`Preview of ${score.title}`}
        className="w-full h-full object-cover object-top bg-white"
        loading="lazy"
      />
    );
  }
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-stone-100 dark:bg-stone-800 text-stone-400 p-4 text-center">
      <Music className="w-8 h-8 mb-1 opacity-60" />
      <span className="text-[10px] font-medium line-clamp-2">{score.title}</span>
    </div>
  );
}

export function LibraryView({ onOpenScore, onOpenSettings }: LibraryViewProps) {
  const { settings, update: updateSettings } = useSettings();
  const scores = useLiveQuery(() => db.scores.toArray(), [], []);
  const collections = useLiveQuery(() => db.collections.orderBy('order').toArray(), [], []);

  const [filter, setFilter] = useState<LibraryFilter>(EMPTY_FILTER);
  const [recentOnly, setRecentOnly] = useState(false);
  const [combineImages, setCombineImages] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState<{ done: number; total: number; current: string } | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editingScore, setEditingScore] = useState<Score | null>(null);

  // Collection management state
  const [addingCollection, setAddingCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [renamingCollectionId, setRenamingCollectionId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void ensureDefaultCollections();
  }, []);

  const genres = useMemo(() => uniqueValues(scores, (s) => s.genre), [scores]);
  const tags = useMemo(() => uniqueValues(scores, (s) => s.tags), [scores]);

  const filteredScores = useMemo(() => {
    let base = filterScores(scores, filter);
    if (recentOnly) {
      base = base.filter((s) => Boolean(s.lastOpenedAt));
    }
    return sortScores(base, recentOnly ? 'lastOpenedAt' : settings.librarySort);
  }, [scores, filter, recentOnly, settings.librarySort]);

  const collectionMap = useMemo(() => {
    const m = new Map<string, Collection>();
    for (const c of collections) m.set(c.id, c);
    return m;
  }, [collections]);

  const handleFiles = async (fileList: FileList | File[]) => {
    const arr = Array.from(fileList);
    if (arr.length === 0) return;
    setNotice(null);
    setImporting({ done: 0, total: arr.length, current: arr[0].name });
    try {
      const res = await importFiles(arr, {
        combineImages,
        collectionId: filter.collectionId,
        onProgress: (done, total, current) => setImporting({ done, total, current }),
      });
      setImporting(null);
      if (res.failed.length > 0) {
        setNotice({
          type: 'error',
          text: `Imported ${res.imported.length} score(s). Failed: ${res.failed.map((f) => `${f.name} (${f.reason})`).join('; ')}`,
        });
      } else if (res.imported.length > 0) {
        setNotice({
          type: 'success',
          text:
            res.imported.length === 1
              ? `Imported “${res.imported[0].title}” (${res.imported[0].pageCount} pages).`
              : `Imported ${res.imported.length} scores into your library.`,
        });
      }
    } catch (err) {
      setImporting(null);
      setNotice({ type: 'error', text: (err as Error)?.message ?? 'Import failed.' });
    }
  };

  const handleLoadSample = async () => {
    setImporting({ done: 0, total: 1, current: 'Prelude in C Major BWV 846' });
    try {
      const file = await generateSamplePianoPdf();
      const res = await importFiles([file], { collectionId: filter.collectionId });
      if (res.imported[0]) {
        await updateScore(res.imported[0].id, {
          title: 'Prelude in C Major, BWV 846',
          composer: 'Johann Sebastian Bach',
          genre: 'Baroque',
          difficulty: 3,
          tags: ['wtc', 'prelude', 'arpeggios'],
        });
      }
      setImporting(null);
      setNotice({ type: 'success', text: 'Added “Prelude in C Major, BWV 846” (3 pages) to your library.' });
    } catch (err) {
      setImporting(null);
      setNotice({ type: 'error', text: (err as Error)?.message ?? 'Could not create sample score.' });
    }
  };

  const handleCreateCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCollectionName.trim()) return;
    const created = await createCollection(newCollectionName);
    setNewCollectionName('');
    setAddingCollection(false);
    setFilter((f) => ({ ...f, collectionId: created.id }));
    setRecentOnly(false);
  };

  const activeHeading = useMemo(() => {
    if (filter.favoritesOnly) return 'Favourite Scores';
    if (recentOnly) return 'Recently Practised';
    if (filter.collectionId) return collectionMap.get(filter.collectionId)?.name ?? 'Collection';
    return 'All Sheet Music';
  }, [filter.favoritesOnly, recentOnly, filter.collectionId, collectionMap]);

  return (
    <div
      data-testid="library-view"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer?.files?.length) void handleFiles(e.dataTransfer.files);
      }}
      className="min-h-screen flex flex-col bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100"
    >
      {/* Hidden file picker */}
      <input
        ref={fileInputRef}
        type="file"
        data-testid="file-upload-input"
        accept={ACCEPT_ATTR}
        multiple
        onChange={(e) => {
          if (e.target.files) void handleFiles(e.target.files);
          e.target.value = '';
        }}
        className="hidden"
      />

      {/* Full-window drag-and-drop overlay */}
      {dragging && (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer?.files?.length) void handleFiles(e.dataTransfer.files);
          }}
          className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-sm flex items-center justify-center p-8"
        >
          <div className="w-full max-w-lg rounded-3xl border-2 border-dashed border-amber-400 bg-stone-900/90 p-10 text-center text-stone-100">
            <Upload className="w-12 h-12 text-amber-400 mx-auto mb-3" />
            <h3 className="text-lg font-semibold mb-1">Drop PDF or Image Scores Here</h3>
            <p className="text-xs text-stone-400">
              Supports multipage PDFs, PNG and JPG sheet music. Stored 100% locally in your browser.
            </p>
          </div>
        </div>
      )}

      {/* Top Navigation Header */}
      <header className="sticky top-0 z-20 border-b border-stone-200 dark:border-stone-800/80 bg-white/90 dark:bg-stone-900/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-stone-900 dark:bg-amber-500 flex items-center justify-center text-amber-400 dark:text-stone-950 shadow-xs">
              <Music className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight leading-none font-serif">MusicFlow</h1>
              <p className="text-[11px] text-stone-500 dark:text-stone-400">Digital Sheet Music Studio</p>
            </div>
          </div>

          {/* Search bar */}
          <div className="flex-1 max-w-md relative">
            <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              data-testid="library-search-input"
              value={filter.query}
              onChange={(e) => setFilter((f) => ({ ...f, query: e.target.value }))}
              placeholder="Search title, composer, genre, tags or notes…"
              className="w-full pl-9 pr-8 py-2 rounded-xl text-xs bg-stone-100 dark:bg-stone-800/90 border border-stone-200 dark:border-stone-700/80 focus:outline-none focus:border-amber-500"
            />
            {filter.query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setFilter((f) => ({ ...f, query: '' }))}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Actions: Import + Settings */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="import-scores-btn"
              onClick={() => fileInputRef.current?.click()}
              className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold text-xs flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <Upload className="w-4 h-4" />
              <span>Import Scores</span>
            </button>
            <button
              type="button"
              data-testid="open-settings-btn"
              onClick={onOpenSettings}
              aria-label="Settings and Backups"
              title="Settings, Shortcuts & Backups"
              className="p-2 rounded-xl border border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Layout */}
      <div className="max-w-7xl w-full mx-auto flex-1 grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6 px-4 sm:px-6 py-6">
        {/* Left Sidebar: Views & Collections */}
        <aside className="space-y-5">
          <nav className="space-y-1" aria-label="Library sections">
            <button
              type="button"
              data-testid="nav-all-scores"
              onClick={() => {
                setFilter((f) => ({ ...f, collectionId: null, favoritesOnly: false }));
                setRecentOnly(false);
              }}
              className={`w-full px-3 py-2 rounded-xl text-xs font-medium flex items-center justify-between transition-colors ${
                !filter.collectionId && !filter.favoritesOnly && !recentOnly
                  ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 font-semibold'
                  : 'text-stone-600 dark:text-stone-300 hover:bg-stone-200/60 dark:hover:bg-stone-800/60'
              }`}
            >
              <span className="flex items-center gap-2">
                <BookOpen className="w-4 h-4" />
                All Sheet Music
              </span>
              <span className="font-mono text-[11px] opacity-75">{scores.length}</span>
            </button>

            <button
              type="button"
              data-testid="nav-recent-scores"
              onClick={() => {
                setFilter((f) => ({ ...f, collectionId: null, favoritesOnly: false }));
                setRecentOnly(true);
              }}
              className={`w-full px-3 py-2 rounded-xl text-xs font-medium flex items-center justify-between transition-colors ${
                recentOnly
                  ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 font-semibold'
                  : 'text-stone-600 dark:text-stone-300 hover:bg-stone-200/60 dark:hover:bg-stone-800/60'
              }`}
            >
              <span className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Recently Opened
              </span>
              <span className="font-mono text-[11px] opacity-75">
                {scores.filter((s) => Boolean(s.lastOpenedAt)).length}
              </span>
            </button>

            <button
              type="button"
              data-testid="nav-favourite-scores"
              onClick={() => {
                setFilter((f) => ({ ...f, collectionId: null, favoritesOnly: true }));
                setRecentOnly(false);
              }}
              className={`w-full px-3 py-2 rounded-xl text-xs font-medium flex items-center justify-between transition-colors ${
                filter.favoritesOnly
                  ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 font-semibold'
                  : 'text-stone-600 dark:text-stone-300 hover:bg-stone-200/60 dark:hover:bg-stone-800/60'
              }`}
            >
              <span className="flex items-center gap-2">
                <Heart className="w-4 h-4" />
                Favourites
              </span>
              <span className="font-mono text-[11px] opacity-75">{scores.filter((s) => s.favorite).length}</span>
            </button>
          </nav>

          {/* Collections */}
          <div>
            <div className="px-3 mb-1.5 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">Collections</span>
              <button
                type="button"
                data-testid="new-collection-btn"
                onClick={() => setAddingCollection((v) => !v)}
                title="Create collection"
                className="p-1 rounded-lg hover:bg-stone-200 dark:hover:bg-stone-800 text-stone-500 dark:text-stone-400"
              >
                <FolderPlus className="w-3.5 h-3.5" />
              </button>
            </div>

            {addingCollection && (
              <form onSubmit={handleCreateCollection} className="mb-2 flex items-center gap-1 px-2">
                <input
                  type="text"
                  data-testid="new-collection-input"
                  autoFocus
                  value={newCollectionName}
                  onChange={(e) => setNewCollectionName(e.target.value)}
                  placeholder="Collection name…"
                  className="flex-1 px-2.5 py-1.5 rounded-lg text-xs bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700"
                />
                <button
                  type="submit"
                  className="px-2.5 py-1.5 rounded-lg bg-amber-500 text-stone-950 font-semibold text-xs"
                >
                  Add
                </button>
              </form>
            )}

            <div className="space-y-0.5">
              {collections.map((c) => {
                const count = scores.filter((s) => s.collectionIds.includes(c.id)).length;
                const active = filter.collectionId === c.id;
                if (renamingCollectionId === c.id) {
                  return (
                    <form
                      key={c.id}
                      onSubmit={async (e) => {
                        e.preventDefault();
                        await renameCollection(c.id, renameText);
                        setRenamingCollectionId(null);
                      }}
                      className="flex items-center gap-1 px-2 py-1"
                    >
                      <input
                        type="text"
                        autoFocus
                        value={renameText}
                        onChange={(e) => setRenameText(e.target.value)}
                        className="flex-1 px-2 py-1 rounded text-xs bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700"
                      />
                      <button type="submit" className="px-2 py-1 rounded bg-amber-500 text-stone-950 text-xs font-semibold">
                        OK
                      </button>
                    </form>
                  );
                }
                return (
                  <div
                    key={c.id}
                    className={`group flex items-center justify-between px-3 py-1.5 rounded-xl text-xs transition-colors ${
                      active
                        ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 font-semibold'
                        : 'text-stone-600 dark:text-stone-300 hover:bg-stone-200/60 dark:hover:bg-stone-800/60'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setFilter((f) => ({ ...f, collectionId: c.id, favoritesOnly: false }));
                        setRecentOnly(false);
                      }}
                      className="flex items-center gap-2 flex-1 text-left truncate"
                    >
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                      <span className="truncate">{c.name}</span>
                    </button>
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-[11px] opacity-70 group-hover:hidden">{count}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setRenamingCollectionId(c.id);
                          setRenameText(c.name);
                        }}
                        aria-label={`Rename ${c.name}`}
                        className="hidden group-hover:inline-flex p-0.5 rounded hover:bg-stone-300 dark:hover:bg-stone-700"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (filter.collectionId === c.id) setFilter((f) => ({ ...f, collectionId: null }));
                          await deleteCollection(c.id);
                        }}
                        aria-label={`Delete ${c.name}`}
                        className="hidden group-hover:inline-flex p-0.5 rounded hover:bg-stone-300 dark:hover:bg-stone-700 text-rose-500"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Local-first storage notice */}
          <div
            data-testid="local-storage-notice"
            className="p-3.5 rounded-2xl bg-stone-100 dark:bg-stone-900/90 border border-stone-200/80 dark:border-stone-800 text-[11px] text-stone-600 dark:text-stone-400 space-y-2"
          >
            <div className="flex items-center gap-1.5 font-semibold text-stone-800 dark:text-stone-200">
              <HardDrive className="w-3.5 h-3.5 text-amber-500" />
              Local-First & Private
            </div>
            <p className="leading-relaxed">
              Your sheet music and annotations are stored directly in this browser’s IndexedDB and work offline. Local browser storage does not automatically sync across devices.
            </p>
            <button
              type="button"
              onClick={onOpenSettings}
              className="text-amber-600 dark:text-amber-400 font-semibold hover:underline"
            >
              Export backup or manage storage →
            </button>
          </div>
        </aside>

        {/* Main Score Area */}
        <main className="space-y-4">
          {/* Status / Import feedback banners */}
          {importing && (
            <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/40 text-xs flex items-center justify-between">
              <span className="font-medium text-amber-800 dark:text-amber-200">
                Importing {importing.current || 'files'} ({importing.done}/{importing.total})…
              </span>
            </div>
          )}

          {notice && (
            <div
              data-testid="library-notice"
              className={`p-3.5 rounded-2xl border text-xs flex items-center justify-between gap-2 ${
                notice.type === 'error'
                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-200'
              }`}
            >
              <span className="flex items-center gap-2">
                {notice.type === 'error' ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
                {notice.text}
              </span>
              <button type="button" onClick={() => setNotice(null)} className="p-1 opacity-70 hover:opacity-100">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Toolbar: Heading, Filters, Sort & Layout Toggle */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-stone-200 dark:border-stone-800">
            <div>
              <h2 className="text-base font-semibold">{activeHeading}</h2>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                Showing {filteredScores.length} of {scores.length} {scores.length === 1 ? 'score' : 'scores'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              {/* Genre filter */}
              {genres.length > 0 && (
                <select
                  aria-label="Filter by genre"
                  value={filter.genre ?? ''}
                  onChange={(e) => setFilter((f) => ({ ...f, genre: e.target.value || null }))}
                  className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700"
                >
                  <option value="">All Genres</option>
                  {genres.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              )}

              {/* Difficulty filter */}
              <select
                aria-label="Filter by difficulty"
                value={filter.difficulty === null ? '' : String(filter.difficulty)}
                onChange={(e) =>
                  setFilter((f) => ({
                    ...f,
                    difficulty: e.target.value === '' ? null : (Number(e.target.value) as Difficulty),
                  }))
                }
                className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700"
              >
                <option value="">All Difficulties</option>
                {([1, 2, 3, 4, 5] as Difficulty[]).map((d) => (
                  <option key={d} value={d}>
                    {d}/5 — {DIFFICULTY_LABELS[d]}
                  </option>
                ))}
              </select>

              {/* Tag filter */}
              {tags.length > 0 && (
                <select
                  aria-label="Filter by tag"
                  value={filter.tag ?? ''}
                  onChange={(e) => setFilter((f) => ({ ...f, tag: e.target.value || null }))}
                  className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700"
                >
                  <option value="">All Tags</option>
                  {tags.map((t) => (
                    <option key={t} value={t}>
                      #{t}
                    </option>
                  ))}
                </select>
              )}

              {/* Sort */}
              <select
                aria-label="Sort scores"
                data-testid="library-sort-select"
                value={settings.librarySort}
                onChange={(e) => updateSettings({ librarySort: e.target.value as LibrarySort })}
                className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700"
              >
                <option value="lastOpenedAt">Sort: Last Opened</option>
                <option value="createdAt">Sort: Date Added</option>
                <option value="title">Sort: Title (A–Z)</option>
                <option value="composer">Sort: Composer (A–Z)</option>
                <option value="difficulty">Sort: Difficulty</option>
              </select>

              {/* Grid / List layout toggle */}
              <div className="flex rounded-xl overflow-hidden border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900">
                <button
                  type="button"
                  data-testid="layout-grid-btn"
                  onClick={() => updateSettings({ libraryLayout: 'grid' })}
                  aria-label="Grid layout"
                  className={`p-1.5 ${
                    settings.libraryLayout === 'grid'
                      ? 'bg-amber-500 text-stone-950'
                      : 'text-stone-500 hover:text-stone-900 dark:hover:text-stone-100'
                  }`}
                >
                  <Grid2X2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  data-testid="layout-list-btn"
                  onClick={() => updateSettings({ libraryLayout: 'list' })}
                  aria-label="List layout"
                  className={`p-1.5 ${
                    settings.libraryLayout === 'list'
                      ? 'bg-amber-500 text-stone-950'
                      : 'text-stone-500 hover:text-stone-900 dark:hover:text-stone-100'
                  }`}
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Multi-image combine toggle bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-stone-500 dark:text-stone-400">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={combineImages}
                onChange={(e) => setCombineImages(e.target.checked)}
                className="accent-amber-500 rounded"
              />
              Combine multiple uploaded PNG/JPG images into a single multi-page score
            </label>
            {(filter.genre || filter.difficulty !== null || filter.tag || filter.query) && (
              <button
                type="button"
                onClick={() => setFilter((f) => ({ ...EMPTY_FILTER, collectionId: f.collectionId }))}
                className="text-amber-600 dark:text-amber-400 font-medium hover:underline"
              >
                Reset filters
              </button>
            )}
          </div>

          {/* Empty State */}
          {scores.length === 0 ? (
            <div
              data-testid="library-empty-state"
              className="rounded-3xl border-2 border-dashed border-stone-300 dark:border-stone-800 bg-white/60 dark:bg-stone-900/40 p-10 text-center max-w-xl mx-auto my-8 space-y-4"
            >
              <div className="w-14 h-14 rounded-2xl bg-amber-500/15 text-amber-500 flex items-center justify-center mx-auto">
                <Upload className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-semibold">Import Your Piano Sheet Music</h3>
                <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
                  Drag and drop PDF scores or PNG/JPG pages anywhere on this window, or use the file picker. Your library stays stored locally in your browser between sessions.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold text-xs flex items-center gap-1.5 shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  Select PDF or Image Files
                </button>
                <button
                  type="button"
                  data-testid="load-sample-score-btn"
                  onClick={() => void handleLoadSample()}
                  className="px-4 py-2.5 rounded-xl bg-stone-200/80 dark:bg-stone-800 hover:bg-stone-300/80 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 font-medium text-xs flex items-center gap-1.5"
                >
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  Load Starter Bach Prelude (3-Page PDF)
                </button>
              </div>
            </div>
          ) : filteredScores.length === 0 ? (
            <div className="rounded-2xl border border-stone-200 dark:border-stone-800 p-10 text-center text-xs text-stone-500">
              No scores match your current search or filter criteria.
            </div>
          ) : settings.libraryLayout === 'grid' ? (
            /* Grid View */
            <div
              data-testid="score-grid"
              className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4"
            >
              {filteredScores.map((s) => (
                <div
                  key={s.id}
                  data-testid={`score-card-${s.title}`}
                  onClick={() => onOpenScore(s.id)}
                  className="group relative flex flex-col rounded-2xl bg-white dark:bg-stone-900 border border-stone-200/90 dark:border-stone-800 hover:border-amber-500/70 shadow-xs hover:shadow-xl transition-all cursor-pointer overflow-hidden"
                >
                  {/* Thumbnail Preview */}
                  <div className="relative aspect-[3/4] w-full bg-stone-100 dark:bg-stone-800 border-b border-stone-200/60 dark:border-stone-800 overflow-hidden">
                    <ScoreThumbnail score={s} />
                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-stone-900/75 text-stone-100 font-mono text-[10px] backdrop-blur-xs">
                      {s.pageCount} {s.pageCount === 1 ? 'p' : 'pp'}
                    </div>
                    <div
                      className="absolute top-2 right-2 flex items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        data-testid={`fav-btn-${s.title}`}
                        onClick={() => void toggleFavorite(s)}
                        aria-label={s.favorite ? 'Remove from favourites' : 'Add to favourites'}
                        className={`p-1.5 rounded-lg backdrop-blur-xs transition-colors ${
                          s.favorite
                            ? 'bg-amber-500 text-stone-950'
                            : 'bg-stone-900/65 text-stone-200 opacity-0 group-hover:opacity-100 hover:bg-stone-900'
                        }`}
                      >
                        <Star className={`w-3.5 h-3.5 ${s.favorite ? 'fill-current' : ''}`} />
                      </button>
                      <button
                        type="button"
                        data-testid={`edit-btn-${s.title}`}
                        onClick={() => setEditingScore(s)}
                        aria-label={`Edit details for ${s.title}`}
                        className="p-1.5 rounded-lg bg-stone-900/65 text-stone-200 opacity-0 group-hover:opacity-100 hover:bg-stone-900 backdrop-blur-xs"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Metadata */}
                  <div className="p-3.5 flex-1 flex flex-col justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold leading-snug line-clamp-1 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                        {s.title}
                      </h3>
                      <p className="text-xs text-stone-500 dark:text-stone-400 line-clamp-1">
                        {s.composer || 'Unknown composer'}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-1 pt-1">
                      {s.difficulty > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 font-medium text-[10px]">
                          {DIFFICULTY_LABELS[s.difficulty]}
                        </span>
                      )}
                      {s.genre && (
                        <span className="px-1.5 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 text-[10px]">
                          {s.genre}
                        </span>
                      )}
                      {s.collectionIds.slice(0, 2).map((cid) => {
                        const col = collectionMap.get(cid);
                        if (!col) return null;
                        return (
                          <span
                            key={cid}
                            className="px-1.5 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 text-[10px] flex items-center gap-1"
                          >
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: col.color }} />
                            {col.name}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* List View */
            <div
              data-testid="score-list"
              className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 divide-y divide-stone-200 dark:divide-stone-800 overflow-hidden"
            >
              {filteredScores.map((s) => (
                <div
                  key={s.id}
                  data-testid={`score-row-${s.title}`}
                  onClick={() => onOpenScore(s.id)}
                  className="px-4 py-3 flex items-center justify-between gap-4 hover:bg-stone-50 dark:hover:bg-stone-800/60 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-10 h-14 rounded overflow-hidden shrink-0 border border-stone-200 dark:border-stone-700">
                      <ScoreThumbnail score={s} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold truncate">{s.title}</div>
                      <div className="text-xs text-stone-500 dark:text-stone-400 truncate">
                        {s.composer || 'Unknown composer'}
                        {s.genre ? ` · ${s.genre}` : ''}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {s.tags.map((t) => (
                          <span
                            key={t}
                            className="px-1.5 py-0.2 rounded bg-stone-100 dark:bg-stone-800 text-[10px] text-stone-500"
                          >
                            #{t}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-xs shrink-0" onClick={(e) => e.stopPropagation()}>
                    {s.difficulty > 0 && (
                      <span className="hidden sm:inline px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[11px] font-medium">
                        {DIFFICULTY_LABELS[s.difficulty]}
                      </span>
                    )}
                    <span className="font-mono text-stone-400 text-[11px]">
                      {s.pageCount}p · {formatBytes(s.fileSize)}
                    </span>
                    <button
                      type="button"
                      onClick={() => void toggleFavorite(s)}
                      aria-label={s.favorite ? 'Remove from favourites' : 'Add to favourites'}
                      className={`p-1.5 rounded-lg ${
                        s.favorite ? 'text-amber-500' : 'text-stone-400 hover:text-stone-600'
                      }`}
                    >
                      <Star className={`w-4 h-4 ${s.favorite ? 'fill-current' : ''}`} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingScore(s)}
                      aria-label={`Edit details for ${s.title}`}
                      className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Edit Metadata Modal */}
      {editingScore && (
        <ScoreModal
          score={editingScore}
          collections={collections}
          onSave={updateScore}
          onDelete={deleteScore}
          onClose={() => setEditingScore(null)}
        />
      )}
    </div>
  );
}
