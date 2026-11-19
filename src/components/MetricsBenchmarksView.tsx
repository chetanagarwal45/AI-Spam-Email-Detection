import React, { useState } from 'react';
import { CheckCircle2, RefreshCw, XCircle } from 'lucide-react';
import type { ModelId, PipelineMetricsSummary } from '../types';
import { ConfusionMatrixGrid, ModelBenchmarkBarChart, RocCurveChart } from './Charts';

interface MetricsBenchmarksViewProps {
  metrics: PipelineMetricsSummary | null;
  onRetrain: () => Promise<void>;
  retraining: boolean;
}

export const MetricsBenchmarksView: React.FC<MetricsBenchmarksViewProps> = ({
  metrics,
  onRetrain,
  retraining,
}) => {
  const [chartMode, setChartMode] = useState<'live' | 'report'>('live');
  const [selectedConfusionModel, setSelectedConfusionModel] = useState<ModelId>('linear_svc');

  if (!metrics) {
    return (
      <div className="bg-[#111a2e] border border-slate-800/90 rounded-xl p-8 text-center text-sm text-slate-400">
        Loading model evaluation metrics...
      </div>
    );
  }

  const modelList = [
    metrics.models.linear_svc,
    metrics.models.multinomial_nb,
    metrics.models.logistic_regression,
  ];

  const activeConfusion = metrics.models[selectedConfusionModel];

  return (
    <div className="space-y-6">
      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#111a2e] border border-slate-800/90 rounded-xl p-4">
          <div className="text-xs text-slate-400">Stratified Partition (80 / 20)</div>
          <div className="mt-1 text-xl font-bold font-mono tabular-nums text-white">
            {metrics.trainCount} / {metrics.testCount}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            {metrics.spamCount} Spam · {metrics.hamCount} Ham · seed={metrics.randomState}
          </div>
        </div>

        <div className="bg-[#111a2e] border border-slate-800/90 rounded-xl p-4">
          <div className="text-xs text-slate-400">TF-IDF Vocabulary Size</div>
          <div className="mt-1 text-xl font-bold font-mono tabular-nums text-white">
            {metrics.vocabularySize.toLocaleString()}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            Uni-gram + Bi-gram · Sublinear TF (1 + log tf)
          </div>
        </div>

        <div className="bg-[#111a2e] border border-slate-800/90 rounded-xl p-4">
          <div className="text-xs text-slate-400">Linear SVC Holdout F1</div>
          <div className="mt-1 text-xl font-bold font-mono tabular-nums text-blue-400">
            {metrics.models.linear_svc.f1Score.toFixed(1)}%
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            Precision {metrics.models.linear_svc.precision.toFixed(1)}% · Recall {metrics.models.linear_svc.recall.toFixed(1)}%
          </div>
        </div>

        <div className="bg-[#111a2e] border border-slate-800/90 rounded-xl p-4 flex flex-col justify-between">
          <div>
            <div className="text-xs text-slate-400">UCI Corpus Benchmark (n=5,572)</div>
            <div className="mt-1 text-xl font-bold font-mono tabular-nums text-teal-400">96.1% F1</div>
          </div>
          <button
            type="button"
            onClick={() => void onRetrain()}
            disabled={retraining}
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${retraining ? 'animate-spin' : ''}`} />
            {retraining ? 'Retraining Estimators...' : 'Re-run Stratified Validation'}
          </button>
        </div>
      </div>

      {/* Comparative Table (Live Runtime vs Report Table 5.1) */}
      <div className="bg-[#111a2e] border border-slate-800/90 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-white">Comparative Classifier Benchmarks</h2>
            <p className="text-xs text-slate-400">
              Side-by-side holdout performance of all three estimators trained strictly on the 80% training partition
            </p>
          </div>
          <div className="flex items-center gap-1 p-1 bg-[#0b1120] border border-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setChartMode('live')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                chartMode === 'live' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Live Runtime Holdout (n={metrics.testCount})
            </button>
            <button
              type="button"
              onClick={() => setChartMode('report')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                chartMode === 'report' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Report Table 5.1 (n=5,572)
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-[#0b1120] text-[11px] font-semibold text-slate-400">
                <th className="py-2.5 px-4">Classifier Architecture</th>
                <th className="py-2.5 px-4 text-right">Precision</th>
                <th className="py-2.5 px-4 text-right">Recall</th>
                <th className="py-2.5 px-4 text-right">F1-Score</th>
                <th className="py-2.5 px-4 text-right">Accuracy</th>
                <th className="py-2.5 px-4 text-right">ROC-AUC</th>
                <th className="py-2.5 px-4">Engineering Observation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-xs">
              {modelList.map((m) => {
                const prec = chartMode === 'live' ? m.precision : m.reportBenchmark.precision;
                const rec = chartMode === 'live' ? m.recall : m.reportBenchmark.recall;
                const f1 = chartMode === 'live' ? m.f1Score : m.reportBenchmark.f1Score;
                return (
                  <tr key={m.modelId} className="hover:bg-slate-800/40">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-white">{m.modelName}</div>
                      <div className="text-[11px] text-slate-400">{m.shortDesc}</div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-medium text-slate-200">
                      {prec.toFixed(1)}%
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-medium text-slate-200">
                      {rec.toFixed(1)}%
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-blue-400">
                      {f1.toFixed(1)}%
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-300">
                      {chartMode === 'live' ? `${m.accuracy.toFixed(1)}%` : '—'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-300">
                      {chartMode === 'live' ? m.rocAuc.toFixed(3) : '—'}
                    </td>
                    <td className="py-3 px-4 text-slate-400">{m.reportBenchmark.note}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Charts Row: Bar Comparison + ROC Curves */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-[#111a2e] border border-slate-800/90 rounded-xl p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-white">
              {chartMode === 'live'
                ? 'Live Holdout Precision, Recall & F1-Score'
                : 'UCI Benchmark: TF-IDF Spam Classifier Metrics'}
            </h3>
            <p className="text-xs text-slate-400">
              Comparing false-alarm suppression (Precision) vs. spam capture coverage (Recall)
            </p>
          </div>
          <ModelBenchmarkBarChart models={modelList} mode={chartMode} />
        </div>

        <div className="lg:col-span-5 bg-[#111a2e] border border-slate-800/90 rounded-xl p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-white">Holdout ROC-AUC Curves</h3>
            <p className="text-xs text-slate-400">
              True Positive Rate vs. False Positive Rate on unseen 20% test messages
            </p>
          </div>
          <RocCurveChart models={modelList} />
        </div>
      </div>

      {/* Confusion Matrix & Top Global Features */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 bg-[#111a2e] border border-slate-800/90 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-white">Holdout Confusion Matrix</h3>
              <p className="text-xs text-slate-400">Error distribution on unseen test fold (n={metrics.testCount})</p>
            </div>
            <select
              aria-label="Select model for confusion matrix"
              value={selectedConfusionModel}
              onChange={(e) => setSelectedConfusionModel(e.target.value as ModelId)}
              className="px-2.5 py-1.5 text-xs bg-[#0b1120] border border-slate-700 rounded-lg text-slate-200"
            >
              <option value="linear_svc">Linear SVC</option>
              <option value="multinomial_nb">Multinomial NB</option>
              <option value="logistic_regression">Logistic Reg. (L2)</option>
            </select>
          </div>

          <ConfusionMatrixGrid matrix={activeConfusion.confusionMatrix} />
        </div>

        <div className="lg:col-span-7 bg-[#111a2e] border border-slate-800/90 rounded-xl p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-white">Learned Global N-Gram Weights (Linear SVC)</h3>
            <p className="text-xs text-slate-400">
              Highest-magnitude positive (Spam) and negative (Ham) hyperplane coefficients fitted on X_train
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <div className="text-xs font-semibold text-rose-400 mb-2 pb-1 border-b border-rose-900/60">
                Top Spam Indicators (+w)
              </div>
              <div className="space-y-1.5">
                {metrics.topSpamFeatures.slice(0, 10).map((f) => (
                  <div key={f.term} className="flex items-center justify-between text-xs py-0.5">
                    <span className="font-mono text-slate-200 truncate">{f.term}</span>
                    <span className="font-mono tabular-nums text-rose-400 font-medium">
                      +{f.weight.toFixed(3)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-emerald-400 mb-2 pb-1 border-b border-emerald-900/60">
                Top Legitimate Indicators (−w)
              </div>
              <div className="space-y-1.5">
                {metrics.topHamFeatures.slice(0, 10).map((f) => (
                  <div key={f.term} className="flex items-center justify-between text-xs py-0.5">
                    <span className="font-mono text-slate-200 truncate">{f.term}</span>
                    <span className="font-mono tabular-nums text-emerald-400 font-medium">
                      {f.weight.toFixed(3)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Verification Matrix */}
      <div className="bg-[#111a2e] border border-slate-800/90 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800">
          <h3 className="text-sm font-semibold text-white">Pipeline Verification & Leakage Audit</h3>
          <p className="text-xs text-slate-400">
            Automated structural and statistical assertions executed after every training cycle
          </p>
        </div>
        <div className="divide-y divide-slate-800/70">
          {metrics.verificationChecks.map((chk) => (
            <div key={chk.id} className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-4 text-xs">
              <div className="flex items-start gap-3">
                {chk.passed ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="font-semibold text-slate-100">
                    {chk.id} · {chk.name}
                  </div>
                  <div className="text-slate-400 mt-0.5">{chk.description}</div>
                </div>
              </div>
              <div className="font-mono text-[11px] text-slate-300 bg-[#0b1120] border border-slate-800 rounded-md px-2.5 py-1">
                {chk.detail}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
