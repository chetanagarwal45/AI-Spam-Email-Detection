import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Loader2,
  RotateCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import type {
  FullPredictionResponse,
  ModelId,
  SamplePreset,
  TokenAttribution,
} from '../types';

interface ScannerViewProps {
  presets: SamplePreset[];
  initialDraft?: { sender: string; subject: string; body: string; modelId?: ModelId } | null;
  onScanComplete: () => void;
}

const MODEL_OPTIONS: Array<{ id: ModelId; label: string; subtitle: string }> = [
  { id: 'linear_svc', label: 'Linear SVC (Balanced)', subtitle: 'Optimal precision-recall balance' },
  { id: 'multinomial_nb', label: 'Multinomial NB (α=0.5)', subtitle: 'Probabilistic Lidstone smoothing' },
  { id: 'logistic_regression', label: 'Logistic Regression (L2)', subtitle: 'Calibrated log-odds classifier' },
];

function computeLiveRegexPreview(text: string) {
  const urlMatches = text.match(/(?:https?:\/\/|www\.)[^\s<>"']+|(?:\b[a-zA-Z0-9-]+\.(?:com|net|org|xyz|info|biz|co|tk|ru|io|in)\b(?:\/[^\s<>"']*)?)/gi) || [];
  const currencyMatches = text.match(/(?:[$£€₹]|(?:\b(?:INR|USD|GBP|EUR|Rs\.?)\b))\s*\d[\d,.]*/gi) || [];
  const standaloneCurrency = text.match(/[$£€₹]/g) || [];
  const numMatches = text.match(/(?:\+?\d[\d\s-]{6,}\d|\b\d+(?:[.,]\d+)?%?\b)/g) || [];
  return {
    urls: urlMatches.length,
    currencies: currencyMatches.length + standaloneCurrency.length,
    numbers: numMatches.length,
  };
}

function renderHighlightedText(
  text: string,
  attributions: TokenAttribution[],
  focusedTerm: string | null
) {
  if (!text.trim()) return null;

  const unigramMap = new Map<string, TokenAttribution>();
  for (const attr of attributions) {
    if (attr.ngramType === 'unigram' && Math.abs(attr.contribution) > 0.01) {
      unigramMap.set(attr.term.toLowerCase(), attr);
    }
  }

  const parts = text.split(/(\s+|[.,!?;:()"']+)/);
  return parts.map((part, idx) => {
    const clean = part.toLowerCase().replace(/[^a-z]/g, '');
    const attr = clean ? unigramMap.get(clean) : undefined;
    const isUrl = /(?:https?:\/\/|www\.|[a-z0-9-]+\.(?:xyz|tk|ru|biz|info|co|com|in|net))/i.test(part);
    const isCurrency = /(?:[$£€₹]|INR|USD|Rs\.?)\s*\d*/i.test(part) && /\d|[$£€₹]/.test(part);

    const isFocused = (term: string) =>
      focusedTerm !== null && (focusedTerm === term || focusedTerm.split(' ').includes(term));

    if (isUrl && unigramMap.has('urltoken')) {
      const urlAttr = unigramMap.get('urltoken')!;
      const focused = isFocused('urltoken');
      return (
        <mark
          key={idx}
          title={`Normalized to urltoken · Weight ${urlAttr.contribution > 0 ? '+' : ''}${urlAttr.contribution.toFixed(3)}`}
          className={`rounded px-1 py-0.5 font-mono text-[13px] transition-all ${
            urlAttr.direction === 'spam'
              ? 'bg-rose-500/25 text-rose-200 underline decoration-rose-400'
              : 'bg-emerald-500/25 text-emerald-200'
          } ${focused ? 'ring-2 ring-amber-400' : ''}`}
        >
          {part}
        </mark>
      );
    }

    if (isCurrency && unigramMap.has('currencytoken')) {
      const curAttr = unigramMap.get('currencytoken')!;
      const focused = isFocused('currencytoken');
      return (
        <mark
          key={idx}
          title={`Normalized to currencytoken · Weight ${curAttr.contribution > 0 ? '+' : ''}${curAttr.contribution.toFixed(3)}`}
          className={`rounded px-1 py-0.5 font-mono text-[13px] transition-all ${
            curAttr.direction === 'spam'
              ? 'bg-rose-500/25 text-rose-200'
              : 'bg-emerald-500/25 text-emerald-200'
          } ${focused ? 'ring-2 ring-amber-400' : ''}`}
        >
          {part}
        </mark>
      );
    }

    if (attr) {
      const focused = isFocused(attr.term);
      return (
        <mark
          key={idx}
          title={`Term "${attr.term}" · TF-IDF ${attr.tfidfWeight.toFixed(3)} · Contribution ${attr.contribution > 0 ? '+' : ''}${attr.contribution.toFixed(3)}`}
          className={`rounded px-1 py-0.5 transition-all ${
            attr.direction === 'spam'
              ? 'bg-rose-500/25 text-rose-200 font-medium'
              : 'bg-emerald-500/25 text-emerald-200 font-medium'
          } ${focused ? 'ring-2 ring-amber-400' : ''}`}
        >
          {part}
        </mark>
      );
    }

    return <span key={idx}>{part}</span>;
  });
}

export const ScannerView: React.FC<ScannerViewProps> = ({ presets, initialDraft, onScanComplete }) => {
  const [sender, setSender] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [modelId, setModelId] = useState<ModelId>('linear_svc');
  const [threshold, setThreshold] = useState<number>(0.5);
  const [liveMode, setLiveMode] = useState<boolean>(true);
  const [focusedTerm, setFocusedTerm] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FullPredictionResponse | null>(null);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);

  const liveRegex = useMemo(() => computeLiveRegexPreview(`${subject} ${body}`), [subject, body]);

  useEffect(() => {
    if (initialDraft) {
      setSender(initialDraft.sender || '');
      setSubject(initialDraft.subject || '');
      setBody(initialDraft.body || '');
      if (initialDraft.modelId) setModelId(initialDraft.modelId);
      setActivePresetId(null);
      setFocusedTerm(null);
      void runAnalysis({
        sender: initialDraft.sender,
        subject: initialDraft.subject,
        body: initialDraft.body,
        chosenModel: initialDraft.modelId || modelId,
        chosenThreshold: threshold,
        recordHistory: false,
      });
    } else if (presets.length > 0 && !body && !result) {
      const first = presets[0];
      setSender(first.sender);
      setSubject(first.subject);
      setBody(first.body);
      setActivePresetId(first.id);
      void runAnalysis({
        sender: first.sender,
        subject: first.subject,
        body: first.body,
        chosenModel: 'linear_svc',
        chosenThreshold: 0.5,
        recordHistory: false,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDraft, presets]);

  // Real-time debounced auto-classification when liveMode is enabled
  useEffect(() => {
    if (!liveMode || !body.trim()) return;
    const timer = window.setTimeout(() => {
      void runAnalysis({
        sender,
        subject,
        body,
        chosenModel: modelId,
        chosenThreshold: threshold,
        recordHistory: false,
      });
    }, 320);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, subject, liveMode]);

  async function runAnalysis(opts?: {
    sender?: string;
    subject?: string;
    body?: string;
    chosenModel?: ModelId;
    chosenThreshold?: number;
    recordHistory?: boolean;
  }) {
    const targetBody = opts?.body ?? body;
    if (!targetBody.trim()) {
      setError('Please enter an email or SMS message body to classify.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: opts?.sender ?? sender,
          subject: opts?.subject ?? subject,
          body: targetBody,
          modelId: opts?.chosenModel ?? modelId,
          threshold: opts?.chosenThreshold ?? threshold,
          recordHistory: opts?.recordHistory ?? true,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Classification request failed.');
      }
      setResult(data);
      if (opts?.recordHistory !== false) {
        onScanComplete();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reach classification server.');
    } finally {
      setLoading(false);
    }
  }

  const handleLoadPreset = (preset: SamplePreset) => {
    setActivePresetId(preset.id);
    setFocusedTerm(null);
    setSender(preset.sender);
    setSubject(preset.subject);
    setBody(preset.body);
    void runAnalysis({
      sender: preset.sender,
      subject: preset.subject,
      body: preset.body,
      chosenModel: modelId,
      chosenThreshold: threshold,
      recordHistory: true,
    });
  };

  const handleReset = () => {
    setActivePresetId(null);
    setFocusedTerm(null);
    setSender('');
    setSubject('');
    setBody('');
    setResult(null);
    setError(null);
  };

  const handleModelSwitch = (nextModel: ModelId) => {
    setModelId(nextModel);
    setFocusedTerm(null);
    if (body.trim()) {
      void runAnalysis({ chosenModel: nextModel, recordHistory: false });
    }
  };

  const handleThresholdChange = (nextThreshold: number) => {
    setThreshold(nextThreshold);
    if (result) {
      const updatedAll = { ...result.allModels };
      (Object.keys(updatedAll) as ModelId[]).forEach((k) => {
        updatedAll[k] = {
          ...updatedAll[k],
          threshold: nextThreshold,
          verdict: updatedAll[k].spamProbability >= nextThreshold ? 'spam' : 'ham',
        };
      });
      setResult({
        ...result,
        allModels: updatedAll,
        primaryPrediction: updatedAll[modelId],
      });
    }
  };

  const primary = result?.primaryPrediction;
  const maxAbsContribution = Math.max(
    0.05,
    ...(primary?.topAttributions.map((a) => Math.abs(a.contribution)) || [0.1])
  );

  return (
    <div className="space-y-6">
      {/* Preset Quick-Load Bar */}
      <div className="bg-[#111a2e] border border-slate-800/90 rounded-xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Quick Demonstration Samples</h2>
            <p className="text-xs text-slate-400">
              Load curated phishing, lottery spam, or legitimate academic and engineering messages for instant inspection
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setLiveMode((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                liveMode
                  ? 'bg-teal-500/15 border-teal-500/40 text-teal-300'
                  : 'bg-[#0b1120] border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              Auto-Classify: {liveMode ? 'On' : 'Off'}
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white border border-slate-700 rounded-lg hover:bg-slate-800/70 transition-colors whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Clear Composer
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {presets.map((preset) => {
            const active = activePresetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleLoadPreset(preset)}
                className={`px-3 py-2 rounded-lg text-left border text-xs transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-blue-600/20 border-blue-500/60 text-blue-200 font-medium'
                    : 'bg-[#0b1120] border-slate-800 text-slate-300 hover:bg-slate-800/80 hover:text-white'
                }`}
              >
                {preset.title}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Two-Column Workbench */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left: Composer & Classifier Configuration (5 cols) */}
        <div className="xl:col-span-5 bg-[#111a2e] border border-slate-800/90 rounded-xl p-5 space-y-5">
          <div>
            <h2 className="text-base font-semibold text-white">Message Input & Estimator Controls</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Raw inputs pass atomically through regex normalization and the frozen training-fold TF-IDF transformer
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void runAnalysis({ recordHistory: true });
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="sender-input" className="block text-xs font-medium text-slate-300 mb-1">
                  Sender Address / Phone
                </label>
                <input
                  id="sender-input"
                  type="text"
                  value={sender}
                  onChange={(e) => setSender(e.target.value)}
                  placeholder="e.g. alerts@bank-kyc.xyz"
                  className="w-full px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 bg-[#0b1120] border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                />
              </div>
              <div>
                <label htmlFor="subject-input" className="block text-xs font-medium text-slate-300 mb-1">
                  Email Subject (Optional)
                </label>
                <input
                  id="subject-input"
                  type="text"
                  value={subject}
                  onChange={(e) => {
                    setActivePresetId(null);
                    setSubject(e.target.value);
                  }}
                  placeholder="e.g. Urgent KYC Verification"
                  className="w-full px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 bg-[#0b1120] border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <textarea
                id="body-input"
                aria-label="Message Body (Email or SMS)"
                rows={7}
                value={body}
                onChange={(e) => {
                  setActivePresetId(null);
                  setBody(e.target.value);
                }}
                placeholder="Type or paste any email or SMS text here to watch live regex normalization and classification..."
                className="w-full px-3 py-2.5 text-sm leading-relaxed text-slate-100 placeholder:text-slate-500 bg-[#0b1120] border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 resize-y"
              />
              <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 font-mono tabular-nums">
                <span>
                  {body.length} chars · {body.trim() ? body.trim().split(/\s+/).length : 0} words
                </span>
                <span>
                  Live Regex: {liveRegex.urls} URL · {liveRegex.currencies} Currency · {liveRegex.numbers} Num
                </span>
              </div>
            </div>

            {/* Estimator Selector */}
            <div>
              <span className="block text-xs font-medium text-slate-300 mb-2">Primary Classifier Architecture</span>
              <div className="grid grid-cols-1 gap-2">
                {MODEL_OPTIONS.map((opt) => {
                  const selected = modelId === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleModelSwitch(opt.id)}
                      className={`flex items-center justify-between px-3 py-2.5 rounded-lg border text-left transition-colors ${
                        selected
                          ? 'bg-blue-600/15 border-blue-500/60 text-white'
                          : 'bg-[#0b1120] border-slate-800 text-slate-300 hover:bg-slate-800/70'
                      }`}
                    >
                      <div>
                        <div className="text-xs font-semibold">{opt.label}</div>
                        <div className="text-[11px] text-slate-400">{opt.subtitle}</div>
                      </div>
                      <span
                        className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                          selected ? 'border-blue-400 bg-blue-500' : 'border-slate-600'
                        }`}
                      >
                        {selected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Threshold Tuning Slider */}
            <div className="pt-3 border-t border-slate-800">
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="threshold-slider" className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-300">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
                  Spam Decision Threshold
                </label>
                <span className="text-xs font-mono font-semibold tabular-nums text-blue-400">
                  {(threshold * 100).toFixed(0)}%
                </span>
              </div>
              <input
                id="threshold-slider"
                type="range"
                min={0.15}
                max={0.85}
                step={0.05}
                value={threshold}
                onChange={(e) => handleThresholdChange(parseFloat(e.target.value))}
                className="w-full accent-blue-500 cursor-pointer"
              />
              <div className="flex justify-between text-[11px] text-slate-400 mt-1">
                <span>High Recall (Catch more spam)</span>
                <span>High Precision (Protect ham)</span>
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-800 text-xs text-rose-200 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !body.trim()}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed rounded-lg transition-colors whitespace-nowrap"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              {loading ? 'Running Pipeline...' : 'Analyze & Log to History'}
            </button>
          </form>
        </div>

        {/* Right: Classification Verdict, Side-by-Side Models & Pipeline Trace (7 cols) */}
        <div className="xl:col-span-7 space-y-6">
          {!result && !loading && (
            <div className="bg-[#111a2e] border border-slate-800/90 rounded-xl p-10 text-center">
              <ShieldCheck className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-white">Ready for Inference</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                Select a demonstration preset above or start typing any email or SMS body on the left to inspect its real-time classification and TF-IDF feature attributions.
              </p>
            </div>
          )}

          {result && primary && (
            <>
              {/* Verdict Card */}
              <div className="bg-[#111a2e] border border-slate-800/90 rounded-xl p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    <div
                      className={`p-2.5 rounded-lg border shrink-0 ${
                        primary.verdict === 'spam'
                          ? 'bg-rose-950/70 border-rose-700/70 text-rose-400'
                          : 'bg-emerald-950/70 border-emerald-700/70 text-emerald-400'
                      }`}
                    >
                      {primary.verdict === 'spam' ? (
                        <AlertTriangle className="w-6 h-6" />
                      ) : (
                        <ShieldCheck className="w-6 h-6" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`text-lg font-bold tracking-tight ${
                            primary.verdict === 'spam' ? 'text-rose-400' : 'text-emerald-400'
                          }`}
                        >
                          {primary.verdict === 'spam' ? 'SPAM DETECTED' : 'LEGITIMATE (HAM)'}
                        </span>
                        <span className="text-xs text-slate-600">·</span>
                        <span className="text-xs font-medium text-slate-300">{primary.modelName}</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        {primary.verdict === 'spam'
                          ? 'High-risk promotional, phishing, or fraudulent n-gram signature exceeded the decision threshold.'
                          : 'Message feature vector aligns with legitimate communication below the spam decision threshold.'}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-xs text-slate-400">Spam Probability</div>
                    <div
                      className={`text-2xl font-bold font-mono tabular-nums ${
                        primary.verdict === 'spam' ? 'text-rose-400' : 'text-emerald-400'
                      }`}
                    >
                      {(primary.spamProbability * 100).toFixed(1)}%
                    </div>
                    <div className="text-[11px] font-mono tabular-nums text-slate-400">
                      Margin {primary.decisionScore >= 0 ? '+' : ''}
                      {primary.decisionScore.toFixed(3)} · {result.latencyMs} ms
                    </div>
                  </div>
                </div>

                {/* Probability Gauge Bar */}
                <div className="mt-5">
                  <div className="relative h-2.5 w-full bg-[#0b1120] border border-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-200 ${
                        primary.verdict === 'spam' ? 'bg-rose-500' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(2, primary.spamProbability * 100))}%` }}
                    />
                    <div
                      title={`Decision Threshold: ${(primary.threshold * 100).toFixed(0)}%`}
                      className="absolute top-0 bottom-0 w-0.5 bg-white"
                      style={{ left: `${primary.threshold * 100}%` }}
                    />
                  </div>
                  <div className="mt-1.5 flex justify-between text-[11px] font-mono tabular-nums text-slate-400">
                    <span>0% Ham</span>
                    <span>Threshold: {(primary.threshold * 100).toFixed(0)}%</span>
                    <span>100% Spam</span>
                  </div>
                </div>

                {/* Side-by-Side 3-Classifier Comparison Strip */}
                <div className="mt-5 pt-4 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {(Object.keys(result.allModels) as ModelId[]).map((mId) => {
                    const pred = result.allModels[mId];
                    const isSelected = mId === modelId;
                    return (
                      <button
                        key={mId}
                        type="button"
                        onClick={() => handleModelSwitch(mId)}
                        className={`p-3 rounded-lg border text-left transition-colors ${
                          isSelected
                            ? 'border-blue-500/60 bg-blue-600/15'
                            : 'border-slate-800 bg-[#0b1120] hover:bg-slate-800/70'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-slate-300 truncate">
                            {pred.modelName.split(' (')[0]}
                          </span>
                          <span
                            className={`text-[11px] font-semibold uppercase ${
                              pred.verdict === 'spam' ? 'text-rose-400' : 'text-emerald-400'
                            }`}
                          >
                            {pred.verdict}
                          </span>
                        </div>
                        <div className="mt-1 flex items-baseline justify-between font-mono tabular-nums">
                          <span className="text-base font-semibold text-white">
                            {(pred.spamProbability * 100).toFixed(1)}%
                          </span>
                          <span className="text-[11px] text-slate-400">
                            score {pred.decisionScore >= 0 ? '+' : ''}
                            {pred.decisionScore.toFixed(2)}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Token Attribution & Highlighted Inspection */}
              <div className="bg-[#111a2e] border border-slate-800/90 rounded-xl p-5 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-white">Explainable Feature Attribution</h3>
                    <p className="text-xs text-slate-400">
                      Click any n-gram row below to highlight its exact occurrences inside the message
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-300">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm bg-rose-500/40 border border-rose-500/60" />
                      Pushes Spam
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/40 border border-emerald-500/60" />
                      Pushes Ham
                    </span>
                  </div>
                </div>

                {/* Highlighted Message View */}
                <div className="p-4 rounded-lg bg-[#0b1120] border border-slate-800 text-sm leading-relaxed text-slate-200 space-y-1.5">
                  {subject && (
                    <div className="font-semibold text-white pb-1.5 border-b border-slate-800">
                      Subject: {renderHighlightedText(subject, primary.topAttributions, focusedTerm)}
                    </div>
                  )}
                  <div className="whitespace-pre-wrap">
                    {renderHighlightedText(body, primary.topAttributions, focusedTerm)}
                  </div>
                </div>

                {/* Ranked Feature Contribution Bars */}
                {primary.topAttributions.length > 0 ? (
                  <div className="space-y-1.5">
                    <div className="grid grid-cols-12 text-[11px] font-medium text-slate-400 pb-1 border-b border-slate-800">
                      <div className="col-span-4">Extracted N-Gram</div>
                      <div className="col-span-2 text-right">TF-IDF</div>
                      <div className="col-span-4 px-3">Directional Impact</div>
                      <div className="col-span-2 text-right">Weight Δ</div>
                    </div>
                    {primary.topAttributions.slice(0, 8).map((attr) => {
                      const widthPct = Math.min(100, (Math.abs(attr.contribution) / maxAbsContribution) * 100);
                      const isSpam = attr.direction === 'spam';
                      const isFocused = focusedTerm === attr.term;
                      return (
                        <button
                          key={attr.term}
                          type="button"
                          onClick={() => setFocusedTerm(isFocused ? null : attr.term)}
                          className={`w-full grid grid-cols-12 items-center text-xs py-1.5 px-1.5 rounded-md transition-colors text-left ${
                            isFocused ? 'bg-slate-800/90 ring-1 ring-amber-400/50' : 'hover:bg-slate-800/50'
                          }`}
                        >
                          <div className="col-span-4 flex items-center gap-2 min-w-0">
                            <span className="font-mono text-slate-100 truncate" title={attr.term}>
                              {attr.term}
                            </span>
                            <span className="text-[10px] text-slate-500 shrink-0">
                              {attr.ngramType === 'bigram' ? '2-gram' : '1-gram'}
                            </span>
                          </div>
                          <div className="col-span-2 text-right font-mono tabular-nums text-slate-300">
                            {attr.tfidfWeight.toFixed(3)}
                          </div>
                          <div className="col-span-4 px-3">
                            <div className="h-2 w-full bg-[#0b1120] rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${isSpam ? 'bg-rose-500' : 'bg-emerald-500'}`}
                                style={{ width: `${Math.max(6, widthPct)}%` }}
                              />
                            </div>
                          </div>
                          <div
                            className={`col-span-2 text-right font-mono tabular-nums font-medium ${
                              isSpam ? 'text-rose-400' : 'text-emerald-400'
                            }`}
                          >
                            {attr.contribution >= 0 ? '+' : ''}
                            {attr.contribution.toFixed(3)}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">No training vocabulary tokens matched this input.</p>
                )}
              </div>

              {/* Stage-by-Stage Leakage-Free Pipeline Trace */}
              <div className="bg-[#111a2e] border border-slate-800/90 rounded-xl p-5 space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-white">Pipeline Execution Trace</h3>
                  <p className="text-xs text-slate-400">
                    Step-by-step transformation from raw message string to canonical regex tokens and L2-normalized TF-IDF vector
                  </p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 rounded-lg bg-[#0b1120] border border-slate-800">
                    <div className="text-slate-400">URLs Normalized</div>
                    <div className="mt-1 text-base font-semibold font-mono tabular-nums text-white">
                      {result.pipelineTrace.regexStats.urlCount}{' '}
                      <span className="text-[11px] font-normal text-blue-400">urltoken</span>
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-[#0b1120] border border-slate-800">
                    <div className="text-slate-400">Currency Tokens</div>
                    <div className="mt-1 text-base font-semibold font-mono tabular-nums text-white">
                      {result.pipelineTrace.regexStats.currencyCount}{' '}
                      <span className="text-[11px] font-normal text-teal-400">currencytoken</span>
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-[#0b1120] border border-slate-800">
                    <div className="text-slate-400">Numeric Strings</div>
                    <div className="mt-1 text-base font-semibold font-mono tabular-nums text-white">
                      {result.pipelineTrace.regexStats.numberCount}{' '}
                      <span className="text-[11px] font-normal text-amber-400">numtoken</span>
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-[#0b1120] border border-slate-800">
                    <div className="text-slate-400">Active Vocab Matches</div>
                    <div className="mt-1 text-base font-semibold font-mono tabular-nums text-white">
                      {result.pipelineTrace.activeVocabMatches}{' '}
                      <span className="text-[11px] font-normal text-slate-400">features</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
                    <span>Stage 1 Output: Regex-Normalized Text</span>
                    <ArrowRight className="w-3 h-3 text-slate-500" />
                    <span className="text-slate-400 font-normal">
                      {result.pipelineTrace.unigramCount} uni-grams · {result.pipelineTrace.bigramCount} bi-grams
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-[#060a14] border border-slate-800 text-teal-300 font-mono text-xs leading-relaxed break-words">
                    {result.pipelineTrace.normalizedText || '(empty after stop-word & noise stripping)'}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
