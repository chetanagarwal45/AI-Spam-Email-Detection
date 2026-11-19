import React, { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  Database,
  FileSpreadsheet,
  History,
  MailCheck,
  Menu,
  RefreshCw,
  ShieldAlert,
  X,
} from 'lucide-react';
import { BatchTriageView } from './components/BatchTriageView';
import { CorpusDatasetView } from './components/CorpusDatasetView';
import { HistoryView } from './components/HistoryView';
import { MetricsBenchmarksView } from './components/MetricsBenchmarksView';
import { ScannerView } from './components/ScannerView';
import type {
  DatasetRecord,
  HistoryEntry,
  ModelId,
  PipelineMetricsSummary,
  SamplePreset,
} from './types';

type NavTab = 'scanner' | 'batch' | 'benchmarks' | 'corpus' | 'history';

const NAV_ITEMS: Array<{ id: NavTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'scanner', label: 'Live Scanner', icon: MailCheck },
  { id: 'batch', label: 'Batch Triage', icon: FileSpreadsheet },
  { id: 'benchmarks', label: 'Model Benchmarks', icon: BarChart3 },
  { id: 'corpus', label: 'Training Corpus', icon: Database },
  { id: 'history', label: 'Scan History', icon: History },
];

const TAB_TITLES: Record<NavTab, string> = {
  scanner: 'Live Email & SMS Scanner',
  batch: 'Batch CSV Triage',
  benchmarks: 'Model Benchmarks & Validation',
  corpus: 'Training Corpus & Retraining',
  history: 'Inference Audit Log',
};

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('scanner');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [presets, setPresets] = useState<SamplePreset[]>([]);
  const [metrics, setMetrics] = useState<PipelineMetricsSummary | null>(null);
  const [dataset, setDataset] = useState<DatasetRecord[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [retraining, setRetraining] = useState(false);
  const [scannerDraft, setScannerDraft] = useState<{
    sender: string;
    subject: string;
    body: string;
    modelId: ModelId;
  } | null>(null);

  const fetchMetricsAndDataset = useCallback(async () => {
    const [mRes, dRes] = await Promise.all([fetch('/api/metrics'), fetch('/api/dataset')]);
    if (mRes.ok) {
      setMetrics(await mRes.json());
    }
    if (dRes.ok) {
      const dData = await dRes.json();
      setDataset(dData.records || []);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    const res = await fetch('/api/history');
    if (res.ok) {
      const data = await res.json();
      setHistory(data.history || []);
    }
  }, []);

  useEffect(() => {
    async function init() {
      const [pRes] = await Promise.all([
        fetch('/api/presets'),
        fetchMetricsAndDataset(),
        fetchHistory(),
      ]);
      if (pRes.ok) {
        const pData = await pRes.json();
        setPresets(pData.presets || []);
      }
    }
    void init();
  }, [fetchMetricsAndDataset, fetchHistory]);

  const handleRetrain = async () => {
    setRetraining(true);
    try {
      const res = await fetch('/api/train', { method: 'POST' });
      if (res.ok) {
        setMetrics(await res.json());
        const dRes = await fetch('/api/dataset');
        if (dRes.ok) {
          const dData = await dRes.json();
          setDataset(dData.records || []);
        }
      }
    } finally {
      setRetraining(false);
    }
  };

  const handleOpenInScanner = (draft: {
    sender: string;
    subject: string;
    body: string;
    modelId: ModelId;
  }) => {
    setScannerDraft(draft);
    setActiveTab('scanner');
  };

  const handleNavClick = (tab: NavTab) => {
    setActiveTab(tab);
    setMobileNavOpen(false);
  };

  return (
    <div className="min-h-screen flex bg-[#0b1120] text-slate-100">
      {/* Desktop Left Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-[#0f172a] border-r border-slate-800/90 z-20">
        <div className="h-16 px-5 flex items-center gap-3 border-b border-slate-800/90 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
            <ShieldAlert className="w-4 h-4" />
          </div>
          <span className="font-display font-bold text-lg tracking-tight text-white whitespace-nowrap">
            MailGuard
          </span>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto" aria-label="Primary Navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-blue-600/15 text-blue-300 border border-blue-500/30'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 border border-transparent'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-blue-400' : 'text-slate-500'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800/90 text-xs text-slate-400 space-y-1">
          <div className="font-semibold text-slate-200">Chetan Agarwal</div>
          <div>B.Tech CSE · A20405224295</div>
          <div>InternPe CID: IPI#82342</div>
        </div>
      </aside>

      {/* Mobile Navigation Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/60"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative w-64 max-w-full bg-[#0f172a] h-full flex flex-col border-r border-slate-800 z-50">
            <div className="h-16 px-5 flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center">
                  <ShieldAlert className="w-4 h-4" />
                </div>
                <span className="font-display font-bold text-lg text-white">MailGuard</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white"
                aria-label="Close navigation menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavClick(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-blue-600/15 text-blue-300 border border-blue-500/30'
                        : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 border border-transparent'
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-blue-400' : 'text-slate-500'}`} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Top Bar Contract: Breadcrumb on Left, Single Primary Action on Right */}
        <header className="h-16 bg-[#0f172a]/95 border-b border-slate-800/90 px-4 sm:px-8 flex items-center justify-between gap-4 sticky top-0 z-10 backdrop-blur-sm">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden p-2 -ml-2 text-slate-400 hover:text-white"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="hidden sm:inline text-slate-500 whitespace-nowrap">Projects</span>
              <span className="hidden sm:inline text-slate-700">/</span>
              <span className="hidden md:inline text-slate-500 whitespace-nowrap">NLP Spam Detection</span>
              <span className="hidden md:inline text-slate-700">/</span>
              <h1 className="font-display font-semibold text-base sm:text-lg text-white truncate">
                {TAB_TITLES[activeTab]}
              </h1>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void handleRetrain()}
            disabled={retraining}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${retraining ? 'animate-spin' : ''}`} />
            {retraining ? 'Retraining...' : 'Retrain Pipeline'}
          </button>
        </header>

        <main className="flex-1 px-4 sm:px-8 py-6 max-w-7xl w-full mx-auto">
          {activeTab === 'scanner' && (
            <ScannerView
              presets={presets}
              initialDraft={scannerDraft}
              onScanComplete={() => void fetchHistory()}
            />
          )}

          {activeTab === 'batch' && <BatchTriageView />}

          {activeTab === 'benchmarks' && (
            <MetricsBenchmarksView
              metrics={metrics}
              onRetrain={handleRetrain}
              retraining={retraining}
            />
          )}

          {activeTab === 'corpus' && (
            <CorpusDatasetView records={dataset} onRefresh={fetchMetricsAndDataset} />
          )}

          {activeTab === 'history' && (
            <HistoryView
              history={history}
              onRefresh={fetchHistory}
              onOpenInScanner={handleOpenInScanner}
            />
          )}
        </main>
      </div>
    </div>
  );
}
