import { useState } from 'react';
import { Star, Trash2, X, Check } from 'lucide-react';
import { DIFFICULTY_LABELS, type Collection, type Difficulty, type Score } from '../types';
import { formatBytes } from '../services/backup';

export interface ScoreModalProps {
  score: Score;
  collections: Collection[];
  onSave: (id: string, changes: Partial<Omit<Score, 'id'>>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}

const GENRE_SUGGESTIONS = [
  'Classical',
  'Romantic',
  'Baroque',
  'Impressionist',
  'Film Soundtrack',
  'Video Game',
  'Jazz & Blues',
  'Pop & Rock',
  'Technical Exercise',
];

export function ScoreModal({ score, collections, onSave, onDelete, onClose }: ScoreModalProps) {
  const [title, setTitle] = useState(score.title);
  const [composer, setComposer] = useState(score.composer);
  const [genre, setGenre] = useState(score.genre);
  const [difficulty, setDifficulty] = useState<Difficulty>(score.difficulty);
  const [tagsText, setTagsText] = useState(score.tags.join(', '));
  const [collectionIds, setCollectionIds] = useState<string[]>(score.collectionIds);
  const [favorite, setFavorite] = useState(score.favorite);
  const [notes, setNotes] = useState(score.notes);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);

  const toggleCollection = (id: string) => {
    setCollectionIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const tags = tagsText
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    await onSave(score.id, {
      title: title.trim() || 'Untitled score',
      composer: composer.trim(),
      genre: genre.trim(),
      difficulty,
      tags,
      collectionIds,
      favorite,
      notes,
    });
    setSaving(false);
    onClose();
  };

  return (
    <div
      data-testid="score-edit-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl max-h-[90vh] flex flex-col rounded-2xl bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 border border-stone-200 dark:border-stone-700 shadow-2xl overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Edit Sheet Music Details</h2>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              {score.fileName} · {score.pageCount} {score.pageCount === 1 ? 'page' : 'pages'} · {formatBytes(score.fileSize)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFavorite((f) => !f)}
              aria-label="Toggle favourite"
              className={`p-2 rounded-xl border ${
                favorite
                  ? 'bg-amber-500/15 border-amber-400 text-amber-500'
                  : 'border-stone-200 dark:border-stone-700 text-stone-400'
              }`}
            >
              <Star className={`w-4 h-4 ${favorite ? 'fill-current' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close modal"
              className="p-2 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-500"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto space-y-4 text-xs flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-medium text-stone-700 dark:text-stone-300 mb-1">Title</label>
              <input
                type="text"
                data-testid="edit-score-title"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block font-medium text-stone-700 dark:text-stone-300 mb-1">Composer</label>
              <input
                type="text"
                data-testid="edit-score-composer"
                value={composer}
                onChange={(e) => setComposer(e.target.value)}
                placeholder="e.g. Frédéric Chopin"
                className="w-full px-3 py-2 rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-medium text-stone-700 dark:text-stone-300 mb-1">Musical Genre</label>
              <input
                type="text"
                list="genre-suggestions"
                data-testid="edit-score-genre"
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                placeholder="e.g. Classical, Film Soundtrack"
                className="w-full px-3 py-2 rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 focus:outline-none focus:border-amber-500"
              />
              <datalist id="genre-suggestions">
                {GENRE_SUGGESTIONS.map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="block font-medium text-stone-700 dark:text-stone-300 mb-1">Difficulty Level</label>
              <select
                data-testid="edit-score-difficulty"
                value={difficulty}
                onChange={(e) => setDifficulty(Number(e.target.value) as Difficulty)}
                className="w-full px-3 py-2 rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 focus:outline-none focus:border-amber-500"
              >
                {([0, 1, 2, 3, 4, 5] as Difficulty[]).map((d) => (
                  <option key={d} value={d}>
                    {d === 0 ? DIFFICULTY_LABELS[0] : `${d}/5 — ${DIFFICULTY_LABELS[d]}`}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block font-medium text-stone-700 dark:text-stone-300 mb-1">
              Tags <span className="text-stone-400 font-normal">(comma-separated)</span>
            </label>
            <input
              type="text"
              data-testid="edit-score-tags"
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="e.g. nocturne, arpeggios, recital, op.66"
              className="w-full px-3 py-2 rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Collections */}
          <div>
            <label className="block font-medium text-stone-700 dark:text-stone-300 mb-1.5">Collections & Folders</label>
            <div className="flex flex-wrap gap-1.5">
              {collections.map((c) => {
                const selected = collectionIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleCollection(c.id)}
                    className={`px-2.5 py-1.5 rounded-xl border text-xs flex items-center gap-1.5 transition-colors ${
                      selected
                        ? 'bg-amber-500/15 border-amber-500 text-amber-700 dark:text-amber-300 font-semibold'
                        : 'bg-stone-50 dark:bg-stone-800 border-stone-300 dark:border-stone-700 text-stone-600 dark:text-stone-300'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                    <span>{c.name}</span>
                    {selected && <Check className="w-3 h-3" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Personal Notes */}
          <div>
            <label className="block font-medium text-stone-700 dark:text-stone-300 mb-1">Personal Practice Notes</label>
            <textarea
              rows={3}
              data-testid="edit-score-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Fingering reminders, pedalling notes, target tempo, teacher feedback…"
              className="w-full px-3 py-2 rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-stone-50 dark:bg-stone-950/60 border-t border-stone-200 dark:border-stone-800 flex items-center justify-between gap-3">
          {!confirmDelete ? (
            <button
              type="button"
              data-testid="delete-score-btn"
              onClick={() => setConfirmDelete(true)}
              className="px-3 py-2 rounded-xl text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 flex items-center gap-1.5"
            >
              <Trash2 className="w-4 h-4" />
              Delete Score
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="confirm-delete-score-btn"
                onClick={async () => {
                  await onDelete(score.id);
                  onClose();
                }}
                className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold"
              >
                Confirm Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="px-2.5 py-1.5 rounded-xl bg-stone-200 dark:bg-stone-800 text-xs"
              >
                Cancel
              </button>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-stone-300 dark:border-stone-700 text-xs font-medium hover:bg-stone-100 dark:hover:bg-stone-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid="save-score-metadata-btn"
              disabled={saving}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold text-xs"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
