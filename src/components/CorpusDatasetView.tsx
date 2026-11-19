import React, { useMemo, useState } from 'react';
import { Loader2, Plus, Search, Trash2 } from 'lucide-react';
import type { DatasetRecord } from '../types';

interface CorpusDatasetViewProps {
  records: DatasetRecord[];
  onRefresh: () => Promise<void>;
}

export const CorpusDatasetView: React.FC<CorpusDatasetViewProps> = ({ records, onRefresh }) => {
  const [query, setQuery] = useState('');
  const [labelFilter, setLabelFilter] = useState<'all' | 'spam' | 'ham'>('all');
  const [splitFilter, setSplitFilter] = useState<'all' | 'train' | 'test'>('all');

  const [newLabel, setNewLabel] = useState<'spam' | 'ham'>('spam');
  const [newChannel, setNewChannel] = useState<'email' | 'sms'>('email');
  const [newSubject, setNewSubject] = useState('');
  const [newText, setNewText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formMsg, setFormMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return records.filter((r) => {
      if (labelFilter !== 'all' && r.label !== labelFilter) return false;
      if (splitFilter !== 'all' && r.split !== splitFilter) return false;
      if (!q) return true;
      return (
        r.subject.toLowerCase().includes(q) ||
        r.text.toLowerCase().includes(q) ||
        r.normalizedText.toLowerCase().includes(q)
      );
    });
  }, [records, query, labelFilter, splitFilter]);

  const handleAddSample = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newText.trim().length < 8) {
      setFormMsg({ type: 'err', text: 'Message body must be at least 8 characters long.' });
      return;
    }

    setSubmitting(true);
    setFormMsg(null);
    try {
      const res = await fetch('/api/dataset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: newLabel,
          channel: newChannel,
          subject: newSubject,
          text: newText,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add training record.');
      setNewSubject('');
      setNewText('');
      setFormMsg({
        type: 'ok',
        text: `Added sample and retrained TF-IDF + all 3 classifiers (${data.metrics.vocabularySize} vocab features).`,
      });
      await onRefresh();
    } catch (err) {
      setFormMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to save sample.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/dataset/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await onRefresh();
      }
    } catch {
      // Ignore network hiccup
    }
  };

  return (
    <div className="space-y-6">
      {/* Add Labeled Sample & Live Retrain Form */}
      <div className="bg-[#111a2e] border border-slate-800/90 rounded-xl p-5">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-white">Add Labeled Sample & Live Retrain</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Submit a new Spam or Ham example to dynamically refit the sublinear TF-IDF vectorizer and all three classifiers
          </p>
        </div>

        <form onSubmit={handleAddSample} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label htmlFor="new-label" className="block text-xs font-medium text-slate-300 mb-1">
                Ground Truth Label
              </label>
              <select
                id="new-label"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value as 'spam' | 'ham')}
                className="w-full px-3 py-2 text-xs text-slate-200 bg-[#0b1120] border border-slate-700 rounded-lg"
              >
                <option value="spam">SPAM (Malicious / Promotional)</option>
                <option value="ham">HAM (Legitimate Message)</option>
              </select>
            </div>

            <div>
              <label htmlFor="new-channel" className="block text-xs font-medium text-slate-300 mb-1">
                Channel
              </label>
              <select
                id="new-channel"
                value={newChannel}
                onChange={(e) => setNewChannel(e.target.value as 'email' | 'sms')}
                className="w-full px-3 py-2 text-xs text-slate-200 bg-[#0b1120] border border-slate-700 rounded-lg"
              >
                <option value="email">Email</option>
                <option value="sms">SMS</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="new-subject" className="block text-xs font-medium text-slate-300 mb-1">
                Subject (Optional for SMS)
              </label>
              <input
                id="new-subject"
                type="text"
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
                placeholder="e.g. Urgent Crypto Wallet Verification"
                className="w-full px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 bg-[#0b1120] border border-slate-700 rounded-lg"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
            <div className="flex-1">
              <label htmlFor="new-text" className="block text-xs font-medium text-slate-300 mb-1">
                Message Body
              </label>
              <input
                id="new-text"
                type="text"
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                placeholder="Enter full email or SMS content to add to corpus..."
                className="w-full px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 bg-[#0b1120] border border-slate-700 rounded-lg"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 rounded-lg whitespace-nowrap shrink-0"
            >
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              {submitting ? 'Retraining...' : 'Add & Retrain Pipeline'}
            </button>
          </div>

          {formMsg && (
            <div
              className={`p-3 rounded-lg text-xs border ${
                formMsg.type === 'ok'
                  ? 'bg-emerald-950/60 border-emerald-700 text-emerald-200'
                  : 'bg-rose-950/60 border-rose-700 text-rose-200'
              }`}
            >
              {formMsg.text}
            </div>
          )}
        </form>
      </div>

      {/* Dataset Browser */}
      <div className="bg-[#111a2e] border border-slate-800/90 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search raw text, subject, or normalized tokens..."
              className="w-full pl-8 pr-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 bg-[#0b1120] border border-slate-700 rounded-lg focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 p-1 bg-[#0b1120] border border-slate-800 rounded-lg">
              {(['all', 'spam', 'ham'] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLabelFilter(l)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    labelFilter === l ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {l === 'all' ? 'All Labels' : l.toUpperCase()}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 p-1 bg-[#0b1120] border border-slate-800 rounded-lg">
              {(['all', 'train', 'test'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSplitFilter(s)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    splitFilter === s ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {s === 'all' ? 'All Splits' : s === 'train' ? 'Train (80%)' : 'Holdout (20%)'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[540px]">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-[#0b1120] border-b border-slate-800 text-[11px] font-semibold text-slate-400">
              <tr>
                <th className="py-2.5 px-4 w-20">Label</th>
                <th className="py-2.5 px-4 w-28">Partition</th>
                <th className="py-2.5 px-4">Message & Regex-Normalized Tokens</th>
                <th className="py-2.5 px-4 w-16 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-xs">
              {filtered.map((rec) => (
                <tr key={rec.id} className="hover:bg-slate-800/40">
                  <td className="py-3 px-4 align-top">
                    <span
                      className={`font-semibold uppercase ${
                        rec.label === 'spam' ? 'text-rose-400' : 'text-emerald-400'
                      }`}
                    >
                      {rec.label}
                    </span>
                    <div className="text-[11px] text-slate-500 uppercase mt-0.5">{rec.channel}</div>
                  </td>
                  <td className="py-3 px-4 align-top font-mono text-[11px] text-slate-300">
                    {rec.split === 'train' ? 'Train 80%' : 'Holdout 20%'}
                    <div className="text-slate-500">{rec.source === 'user' ? 'User Added' : 'Corpus'}</div>
                  </td>
                  <td className="py-3 px-4 align-top">
                    <div className="font-medium text-slate-100">{rec.subject}</div>
                    <div className="text-slate-400 mt-0.5 leading-relaxed">{rec.text}</div>
                    <div className="mt-1.5 font-mono text-[11px] text-teal-300 bg-[#0b1120] px-2.5 py-1.5 rounded border border-slate-800">
                      {rec.normalizedText}
                    </div>
                  </td>
                  <td className="py-3 px-4 align-top text-right">
                    {rec.source === 'user' ? (
                      <button
                        type="button"
                        onClick={() => void handleDelete(rec.id)}
                        title="Delete user sample and retrain"
                        className="p-1.5 text-slate-400 hover:text-rose-400 rounded-md hover:bg-rose-950/60"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <span className="text-[11px] text-slate-600">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-400">
                    No corpus records match your search query.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
