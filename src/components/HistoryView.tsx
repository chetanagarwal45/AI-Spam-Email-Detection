import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Download,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  Trash2,
} from 'lucide-react';
import type { HistoryEntry, ModelId } from '../types';

interface HistoryViewProps {
  history: HistoryEntry[];
  onRefresh: () => Promise<void>;
  onOpenInScanner: (draft: { sender: string; subject: string; body: string; modelId: ModelId }) => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  history,
  onRefresh,
  onOpenInScanner,
}) => {
  const [filter, setFilter] = useState<'all' | 'spam' | 'ham'>('all');

  const filtered = history.filter((item) => (filter === 'all' ? true : item.verdict === filter));

  const updateFeedback = async (id: string, next: 'correct' | 'incorrect' | null) => {
    await fetch(`/api/history/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedback: next }),
    });
    await onRefresh();
  };

  const deleteEntry = async (id: string) => {
    await fetch(`/api/history/${id}`, { method: 'DELETE' });
    await onRefresh();
  };

  const clearAll = async () => {
    await fetch('/api/history', { method: 'DELETE' });
    await onRefresh();
  };

  const escapeCsvField = (value: string | number | null | undefined): string => {
    const str = value === null || value === undefined ? '' : String(value);
    if (/[",\r\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const exportCsv = () => {
    if (filtered.length === 0) return;
    const header = [
      'ID',
      'Timestamp',
      'Verdict',
      'Spam_Probability',
      'Decision_Score',
      'Threshold',
      'Model',
      'Latency_ms',
      'Feedback',
      'Sender',
      'Subject',
      'Body',
    ];
    const rows = filtered.map((entry) => [
      escapeCsvField(entry.id),
      escapeCsvField(entry.timestamp),
      escapeCsvField(entry.verdict.toUpperCase()),
      escapeCsvField(`${(entry.spamProbability * 100).toFixed(2)}%`),
      escapeCsvField(entry.decisionScore.toFixed(4)),
      escapeCsvField(entry.threshold.toFixed(2)),
      escapeCsvField(entry.selectedModel),
      escapeCsvField(entry.latencyMs),
      escapeCsvField(entry.feedback ?? 'unverified'),
      escapeCsvField(entry.sender),
      escapeCsvField(entry.subject),
      escapeCsvField(entry.body),
    ]);

    const csvContent = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `mailguard-audit-log-${filter}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#111a2e] border border-slate-800/90 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-white">Inference Audit Log</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Persisted history of classified emails and SMS messages with human-in-the-loop verification feedback
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 p-1 bg-[#0b1120] border border-slate-800 rounded-lg">
              {(['all', 'spam', 'ham'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setFilter(tab)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    filter === tab ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {tab === 'all' ? `All (${history.length})` : tab.toUpperCase()}
                </button>
              ))}
            </div>

            {filtered.length > 0 && (
              <button
                type="button"
                onClick={exportCsv}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-[#0b1120] border border-slate-700 rounded-lg hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </button>
            )}

            {history.length > 0 && (
              <button
                type="button"
                onClick={() => void clearAll()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-300 bg-rose-950/60 border border-rose-800 rounded-lg hover:bg-rose-900/60 whitespace-nowrap shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear Log
              </button>
            )}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-400">
            No scan records found. Analyze a message in the Live Scanner to record inference logs.
          </div>
        ) : (
          <div className="divide-y divide-slate-800/70">
            {filtered.map((entry) => (
              <div
                key={entry.id}
                className="px-5 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-800/40 transition-colors"
              >
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className={`inline-flex items-center gap-1 font-semibold ${
                        entry.verdict === 'spam' ? 'text-rose-400' : 'text-emerald-400'
                      }`}
                    >
                      {entry.verdict === 'spam' ? (
                        <AlertTriangle className="w-3.5 h-3.5" />
                      ) : (
                        <ShieldCheck className="w-3.5 h-3.5" />
                      )}
                      {entry.verdict.toUpperCase()}
                    </span>
                    <span className="text-slate-600">·</span>
                    <span className="font-mono tabular-nums font-medium text-white">
                      {(entry.spamProbability * 100).toFixed(1)}%
                    </span>
                    <span className="text-slate-600">·</span>
                    <span className="text-slate-400">{entry.selectedModel.replace('_', ' ')}</span>
                    <span className="text-slate-600">·</span>
                    <span className="font-mono text-[11px] text-slate-400">
                      {new Date(entry.timestamp).toLocaleTimeString()} · {entry.latencyMs} ms
                    </span>
                  </div>

                  <div className="text-sm font-medium text-slate-100 truncate">
                    {entry.subject || '(No Subject)'}
                  </div>
                  <div className="text-xs text-slate-400 line-clamp-2">{entry.body}</div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      void updateFeedback(entry.id, entry.feedback === 'correct' ? null : 'correct')
                    }
                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border transition-colors whitespace-nowrap ${
                      entry.feedback === 'correct'
                        ? 'bg-emerald-950/70 border-emerald-700 text-emerald-300 font-medium'
                        : 'bg-[#0b1120] border-slate-700 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <ThumbsUp className="w-3.5 h-3.5" />
                    Accurate
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      void updateFeedback(entry.id, entry.feedback === 'incorrect' ? null : 'incorrect')
                    }
                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border transition-colors whitespace-nowrap ${
                      entry.feedback === 'incorrect'
                        ? 'bg-rose-950/70 border-rose-700 text-rose-300 font-medium'
                        : 'bg-[#0b1120] border-slate-700 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <ThumbsDown className="w-3.5 h-3.5" />
                    Flag Error
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      onOpenInScanner({
                        sender: entry.sender,
                        subject: entry.subject,
                        body: entry.body,
                        modelId: entry.selectedModel,
                      })
                    }
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-300 bg-blue-600/15 border border-blue-500/40 rounded-lg hover:bg-blue-600/25 whitespace-nowrap"
                  >
                    Inspect
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => void deleteEntry(entry.id)}
                    title="Delete entry"
                    className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-rose-950/60"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
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
