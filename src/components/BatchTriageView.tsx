import React, { useState } from 'react';
import {
  AlertTriangle,
  Download,
  FileSpreadsheet,
  Loader2,
  Play,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import type { BatchResponse, ModelId } from '../types';

const SAMPLE_BATCH_TEXT = `subject,sender,body
URGENT: KYC Verification Expired,alert@sbi-kyc.xyz,Your SBI YONO account will be blocked today! Click http://sbi-yono-kyc.xyz to verify PAN immediately.
Practical Training Viva Schedule,sanjay.jain@jaipur.amity.edu,Dear Chetan, report to Seminar Hall 2 at 11:00 AM for your internship project demonstration.
Congratulations! £1000 Cash Winner,promo@uk-draw.net,WINNER!! You have won a £1000 guaranteed cash prize! Call 09064012160 with claim code KL341.
[GitHub] PR #18 Merged,notifications@github.com,Your pull request for sublinear TF-IDF normalization passed all unit tests and was merged into main.
Overdue Customs Duty #FX99201,dispatch@dhl-clearance.co,Your parcel is held at customs. Pay ₹490 clearance fee at http://track-parcel-redelivery.com within 24 hours.
Library Return Reminder,library@amity.edu,Courtesy notice: Introduction to Algorithms (CLRS) is due for return on 22 November 2026.
Claim Free 1.42 ETH Airdrop,airdrop@crypto-vault.io,Connect your wallet seed phrase at https://eth-claim-vault.io to withdraw $4,100 unclaimed crypto balance.
Dinner Plans Tonight,rahul@campus.edu,Hey are we meeting at the canteen after the afternoon ML lab session?`;

function parseBatchInput(raw: string): Array<{ subject: string; sender: string; body: string }> {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return [];

  const firstLower = lines[0].toLowerCase();
  const hasCsvHeader = firstLower.includes('body') && (firstLower.includes('subject') || firstLower.includes(','));
  const dataLines = hasCsvHeader ? lines.slice(1) : lines;

  return dataLines.map((line, idx) => {
    const cols: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes && cols.length < 2) {
        cols.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    cols.push(current.trim());

    if (cols.length >= 3) {
      return { subject: cols[0], sender: cols[1], body: cols[2] };
    }
    if (cols.length === 2) {
      return { subject: cols[0], sender: '', body: cols[1] };
    }
    return { subject: `Batch Message #${idx + 1}`, sender: '', body: cols[0] };
  });
}

export const BatchTriageView: React.FC = () => {
  const [rawInput, setRawInput] = useState<string>(SAMPLE_BATCH_TEXT);
  const [modelId, setModelId] = useState<ModelId>('linear_svc');
  const [filter, setFilter] = useState<'all' | 'spam' | 'ham'>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batchResult, setBatchResult] = useState<BatchResponse | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setRawInput(reader.result);
      }
    };
    reader.readAsText(file);
  };

  const runBatch = async () => {
    const items = parseBatchInput(rawInput);
    if (items.length === 0) {
      setError('No valid messages found. Paste one message per line or upload a CSV with subject,sender,body columns.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, modelId, threshold: 0.5 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Batch classification failed.');
      setBatchResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to execute batch scan.');
    } finally {
      setLoading(false);
    }
  };

  const exportCsv = () => {
    if (!batchResult) return;
    const header = ['Row', 'Verdict', 'Spam_Probability', 'Decision_Score', 'Subject', 'Sender', 'Top_Tokens'];
    const rows = batchResult.results.map((r) => [
      r.rowIndex,
      r.verdict.toUpperCase(),
      (r.spamProbability * 100).toFixed(2) + '%',
      r.decisionScore.toFixed(4),
      `"${(r.subject || '').replace(/"/g, '""')}"`,
      `"${(r.sender || '').replace(/"/g, '""')}"`,
      `"${r.topTerms.join('; ')}"`,
    ]);
    const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mailguard-batch-triage-${modelId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredRows =
    batchResult?.results.filter((r) => (filter === 'all' ? true : r.verdict === filter)) || [];

  return (
    <div className="space-y-6">
      {/* Batch Input & Controls */}
      <div className="bg-[#111a2e] border border-slate-800/90 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-white">Batch CSV & Multi-Email Triage</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Upload a CSV (`subject,sender,body`) or paste multiple messages (one per line) to classify an entire inbox queue at once
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-200 bg-[#0b1120] border border-slate-700 rounded-lg hover:bg-slate-800 cursor-pointer whitespace-nowrap shrink-0">
              <Upload className="w-3.5 h-3.5" />
              Upload CSV / TXT
              <input type="file" accept=".csv,.txt" onChange={handleFileUpload} className="hidden" />
            </label>
            <button
              type="button"
              onClick={() => setRawInput(SAMPLE_BATCH_TEXT)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-200 bg-[#0b1120] border border-slate-700 rounded-lg hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Load Sample Batch
            </button>
          </div>
        </div>

        <textarea
          rows={7}
          value={rawInput}
          onChange={(e) => setRawInput(e.target.value)}
          className="w-full px-3 py-2.5 font-mono text-xs leading-relaxed text-slate-200 bg-[#0b1120] border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
          placeholder="subject,sender,body"
        />

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <label htmlFor="batch-model" className="text-xs font-medium text-slate-300">
              Classifier:
            </label>
            <select
              id="batch-model"
              value={modelId}
              onChange={(e) => setModelId(e.target.value as ModelId)}
              className="px-3 py-1.5 text-xs bg-[#0b1120] border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500"
            >
              <option value="linear_svc">Linear SVC (Balanced)</option>
              <option value="multinomial_nb">Multinomial Naive Bayes (α=0.5)</option>
              <option value="logistic_regression">Logistic Regression (L2)</option>
            </select>
          </div>

          <button
            type="button"
            onClick={runBatch}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            {loading ? 'Classifying Batch...' : 'Run Batch Classification'}
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-800 text-xs text-rose-200">{error}</div>
        )}
      </div>

      {/* Results Summary & Table */}
      {batchResult && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-[#111a2e] border border-slate-800/90 rounded-xl p-4">
              <div className="text-xs text-slate-400">Messages Processed</div>
              <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-white">
                {batchResult.total}
              </div>
            </div>
            <div className="bg-[#111a2e] border border-slate-800/90 rounded-xl p-4">
              <div className="text-xs text-slate-400">Spam Flagged</div>
              <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-rose-400">
                {batchResult.spamCount}
              </div>
            </div>
            <div className="bg-[#111a2e] border border-slate-800/90 rounded-xl p-4">
              <div className="text-xs text-slate-400">Legitimate (Ham)</div>
              <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-emerald-400">
                {batchResult.hamCount}
              </div>
            </div>
            <div className="bg-[#111a2e] border border-slate-800/90 rounded-xl p-4">
              <div className="text-xs text-slate-400">Total Batch Runtime</div>
              <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-teal-400">
                {batchResult.totalLatencyMs} ms
              </div>
            </div>
          </div>

          <div className="bg-[#111a2e] border border-slate-800/90 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
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
                    {tab === 'all'
                      ? `All (${batchResult.total})`
                      : tab === 'spam'
                        ? `Spam (${batchResult.spamCount})`
                        : `Ham (${batchResult.hamCount})`}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={exportCsv}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-[#0b1120] border border-slate-700 rounded-lg hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                Export Results CSV
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-[#0b1120] text-[11px] font-semibold text-slate-400">
                    <th className="py-2.5 px-4 w-12">#</th>
                    <th className="py-2.5 px-4 w-28">Verdict</th>
                    <th className="py-2.5 px-4 w-28 text-right">Spam Prob</th>
                    <th className="py-2.5 px-4">Subject & Content</th>
                    <th className="py-2.5 px-4 w-56">Key Matched N-Grams</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 text-xs">
                  {filteredRows.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4 font-mono tabular-nums text-slate-500">{row.rowIndex}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 font-semibold ${
                            row.verdict === 'spam' ? 'text-rose-400' : 'text-emerald-400'
                          }`}
                        >
                          {row.verdict === 'spam' ? (
                            <AlertTriangle className="w-3.5 h-3.5" />
                          ) : (
                            <ShieldCheck className="w-3.5 h-3.5" />
                          )}
                          {row.verdict.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-medium text-white">
                        {(row.spamProbability * 100).toFixed(1)}%
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-100 truncate max-w-md">{row.subject || '(No Subject)'}</div>
                        <div className="text-slate-400 truncate max-w-lg mt-0.5">{row.body}</div>
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-teal-300">
                        {row.topTerms.join(' · ') || '—'}
                      </td>
                    </tr>
                  ))}
                  {filteredRows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        No messages match the selected filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
