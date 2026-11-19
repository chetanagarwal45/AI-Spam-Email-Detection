import React, { useState } from 'react';
import type { ConfusionMatrix, ModelEvaluationMetrics, ModelId } from '../types';

interface ModelBarChartProps {
  models: ModelEvaluationMetrics[];
  mode: 'live' | 'report';
}

export const ModelBenchmarkBarChart: React.FC<ModelBarChartProps> = ({ models, mode }) => {
  const [hoveredBar, setHoveredBar] = useState<string | null>(null);

  const width = 560;
  const height = 264;
  const padLeft = 44;
  const padRight = 20;
  const padTop = 26;
  const padBottom = 46;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const minVal = 70;
  const maxVal = 100;
  const ticks = [70, 75, 80, 85, 90, 95, 100];

  const yPos = (val: number) => {
    const clamped = Math.max(minVal, Math.min(maxVal, val));
    return padTop + plotH - ((clamped - minVal) / (maxVal - minVal)) * plotH;
  };

  const groupWidth = plotW / Math.max(1, models.length);
  const barWidth = 28;
  const barGap = 8;

  const shortNames: Record<ModelId, string> = {
    linear_svc: 'Linear SVC',
    multinomial_nb: 'Multinomial NB',
    logistic_regression: 'Logistic Reg. (L2)',
  };

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible" role="img" aria-label="Classifier comparison bar chart">
        {ticks.map((t) => {
          const y = yPos(t);
          return (
            <g key={t}>
              <line x1={padLeft} y1={y} x2={width - padRight} y2={y} stroke="#1e293b" strokeDasharray={t === 70 ? undefined : '3 3'} />
              <text x={padLeft - 8} y={y + 4} textAnchor="end" className="fill-slate-400 text-[11px] font-mono tabular-nums">
                {t}%
              </text>
            </g>
          );
        })}

        {models.map((m, idx) => {
          const precision = mode === 'live' ? m.precision : m.reportBenchmark.precision;
          const recall = mode === 'live' ? m.recall : m.reportBenchmark.recall;
          const f1 = mode === 'live' ? m.f1Score : m.reportBenchmark.f1Score;

          const metrics = [
            { label: 'Precision', value: precision, color: '#3b82f6' },
            { label: 'Recall', value: recall, color: '#14b8a6' },
            { label: 'F1-Score', value: f1, color: '#a855f7' },
          ];

          const groupCenter = padLeft + idx * groupWidth + groupWidth / 2;
          const totalGroupBarsW = metrics.length * barWidth + (metrics.length - 1) * barGap;
          const startX = groupCenter - totalGroupBarsW / 2;

          return (
            <g key={m.modelId}>
              {metrics.map((metric, bIdx) => {
                const key = `${m.modelId}-${metric.label}`;
                const isHovered = hoveredBar === key;
                const x = startX + bIdx * (barWidth + barGap);
                const y = yPos(metric.value);
                const h = Math.max(2, padTop + plotH - y);
                return (
                  <g
                    key={metric.label}
                    onMouseEnter={() => setHoveredBar(key)}
                    onMouseLeave={() => setHoveredBar(null)}
                    className="cursor-pointer"
                  >
                    <rect
                      x={x}
                      y={y}
                      width={barWidth}
                      height={h}
                      rx={3}
                      fill={metric.color}
                      opacity={hoveredBar && !isHovered ? 0.45 : 1}
                      className="transition-opacity duration-150"
                    />
                    <text
                      x={x + barWidth / 2}
                      y={y - 6}
                      textAnchor="middle"
                      className="fill-slate-200 text-[10px] font-mono font-medium tabular-nums"
                    >
                      {metric.value.toFixed(1)}
                    </text>
                  </g>
                );
              })}
              <text
                x={groupCenter}
                y={height - 16}
                textAnchor="middle"
                className="fill-slate-200 text-[12px] font-medium"
              >
                {shortNames[m.modelId]}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-6 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-sm bg-[#3b82f6]" />
          <span>Spam Precision (%)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-sm bg-[#14b8a6]" />
          <span>Spam Recall (%)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-sm bg-[#a855f7]" />
          <span>Spam F1-Score (%)</span>
        </div>
      </div>
    </div>
  );
};

interface RocCurveChartProps {
  models: ModelEvaluationMetrics[];
}

export const RocCurveChart: React.FC<RocCurveChartProps> = ({ models }) => {
  const width = 480;
  const height = 264;
  const padLeft = 44;
  const padRight = 20;
  const padTop = 18;
  const padBottom = 42;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const xPos = (fpr: number) => padLeft + fpr * plotW;
  const yPos = (tpr: number) => padTop + (1 - tpr) * plotH;

  const colors: Record<ModelId, string> = {
    linear_svc: '#3b82f6',
    multinomial_nb: '#14b8a6',
    logistic_regression: '#f59e0b',
  };

  const dashArrays: Record<ModelId, string | undefined> = {
    linear_svc: undefined,
    multinomial_nb: '6 3',
    logistic_regression: '2 3',
  };

  const ticks = [0, 0.25, 0.5, 0.75, 1.0];

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible" role="img" aria-label="ROC-AUC curve comparison">
        {ticks.map((t) => (
          <g key={`y-${t}`}>
            <line x1={padLeft} y1={yPos(t)} x2={width - padRight} y2={yPos(t)} stroke="#1e293b" strokeDasharray={t === 0 ? undefined : '3 3'} />
            <text x={padLeft - 8} y={yPos(t) + 4} textAnchor="end" className="fill-slate-400 text-[10px] font-mono tabular-nums">
              {t.toFixed(2)}
            </text>
          </g>
        ))}

        {ticks.map((t) => (
          <g key={`x-${t}`}>
            <line x1={xPos(t)} y1={padTop} x2={xPos(t)} y2={padTop + plotH} stroke="#1e293b" strokeDasharray={t === 0 ? undefined : '3 3'} />
            <text x={xPos(t)} y={padTop + plotH + 16} textAnchor="middle" className="fill-slate-400 text-[10px] font-mono tabular-nums">
              {t.toFixed(2)}
            </text>
          </g>
        ))}

        <line
          x1={xPos(0)}
          y1={yPos(0)}
          x2={xPos(1)}
          y2={yPos(1)}
          stroke="#475569"
          strokeWidth={1.5}
          strokeDasharray="4 4"
        />

        {models.map((m) => {
          const pts = m.rocCurve.map((p) => `${xPos(p.fpr).toFixed(1)},${yPos(p.tpr).toFixed(1)}`).join(' ');
          return (
            <polyline
              key={m.modelId}
              fill="none"
              stroke={colors[m.modelId]}
              strokeWidth={2.4}
              strokeDasharray={dashArrays[m.modelId]}
              points={pts}
            />
          );
        })}

        <text x={padLeft + plotW / 2} y={height - 4} textAnchor="middle" className="fill-slate-400 text-[11px]">
          False Positive Rate (1 − Specificity)
        </text>
      </svg>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-5 text-xs text-slate-300">
        {models.map((m) => (
          <div key={m.modelId} className="flex items-center gap-2">
            <span className="inline-block w-4 h-0.5" style={{ backgroundColor: colors[m.modelId] }} />
            <span className="font-medium text-slate-200">{m.modelName.split(' (')[0]}</span>
            <span className="font-mono tabular-nums text-slate-400">AUC {m.rocAuc.toFixed(3)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

interface ConfusionMatrixGridProps {
  matrix: ConfusionMatrix;
}

export const ConfusionMatrixGrid: React.FC<ConfusionMatrixGridProps> = ({ matrix }) => {
  const [selectedCell, setSelectedCell] = useState<'tn' | 'fp' | 'fn' | 'tp' | null>(null);
  const total = matrix.tp + matrix.fp + matrix.tn + matrix.fn || 1;
  const pct = (v: number) => `${((v / total) * 100).toFixed(1)}%`;

  const explanations: Record<'tn' | 'fp' | 'fn' | 'tp', string> = {
    tn: 'True Negative (TN): Legitimate (Ham) messages correctly delivered to the inbox.',
    fp: 'False Positive (FP): Legitimate emails mistakenly flagged as Spam. Minimized via high Precision (99.1%).',
    fn: 'False Negative (FN): Spam messages that bypassed the filter into the inbox.',
    tp: 'True Positive (TP): Phishing, lottery, or promotional spam correctly intercepted.',
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[auto_1fr_1fr] gap-2.5 items-center text-sm">
        <div />
        <div className="text-center text-xs font-medium text-slate-400 pb-1">Predicted Ham</div>
        <div className="text-center text-xs font-medium text-slate-400 pb-1">Predicted Spam</div>

        <div className="text-right text-xs font-medium text-slate-400 pr-2">Actual Ham</div>
        <button
          type="button"
          onClick={() => setSelectedCell(selectedCell === 'tn' ? null : 'tn')}
          className={`rounded-lg border p-4 text-center transition-colors ${
            selectedCell === 'tn'
              ? 'border-emerald-400 bg-emerald-950/80'
              : 'border-emerald-800/60 bg-emerald-950/40 hover:bg-emerald-950/60'
          }`}
        >
          <div className="text-xs font-medium text-emerald-300">True Negative (TN)</div>
          <div className="mt-1 text-2xl font-semibold font-mono tabular-nums text-white">{matrix.tn}</div>
          <div className="mt-0.5 text-xs font-mono tabular-nums text-emerald-400">{pct(matrix.tn)}</div>
        </button>

        <button
          type="button"
          onClick={() => setSelectedCell(selectedCell === 'fp' ? null : 'fp')}
          className={`rounded-lg border p-4 text-center transition-colors ${
            selectedCell === 'fp'
              ? 'border-amber-400 bg-amber-950/80'
              : 'border-amber-800/60 bg-amber-950/40 hover:bg-amber-950/60'
          }`}
        >
          <div className="text-xs font-medium text-amber-300">False Positive (FP)</div>
          <div className="mt-1 text-2xl font-semibold font-mono tabular-nums text-white">{matrix.fp}</div>
          <div className="mt-0.5 text-xs font-mono tabular-nums text-amber-400">{pct(matrix.fp)}</div>
        </button>

        <div className="text-right text-xs font-medium text-slate-400 pr-2">Actual Spam</div>
        <button
          type="button"
          onClick={() => setSelectedCell(selectedCell === 'fn' ? null : 'fn')}
          className={`rounded-lg border p-4 text-center transition-colors ${
            selectedCell === 'fn'
              ? 'border-rose-400 bg-rose-950/80'
              : 'border-rose-800/60 bg-rose-950/40 hover:bg-rose-950/60'
          }`}
        >
          <div className="text-xs font-medium text-rose-300">False Negative (FN)</div>
          <div className="mt-1 text-2xl font-semibold font-mono tabular-nums text-white">{matrix.fn}</div>
          <div className="mt-0.5 text-xs font-mono tabular-nums text-rose-400">{pct(matrix.fn)}</div>
        </button>

        <button
          type="button"
          onClick={() => setSelectedCell(selectedCell === 'tp' ? null : 'tp')}
          className={`rounded-lg border p-4 text-center transition-colors ${
            selectedCell === 'tp'
              ? 'border-blue-400 bg-blue-950/80'
              : 'border-blue-800/60 bg-blue-950/40 hover:bg-blue-950/60'
          }`}
        >
          <div className="text-xs font-medium text-blue-300">True Positive (TP)</div>
          <div className="mt-1 text-2xl font-semibold font-mono tabular-nums text-white">{matrix.tp}</div>
          <div className="mt-0.5 text-xs font-mono tabular-nums text-blue-400">{pct(matrix.tp)}</div>
        </button>
      </div>

      <div className="p-2.5 rounded-lg bg-[#0b1120] border border-slate-800 text-xs text-slate-300">
        {selectedCell ? explanations[selectedCell] : 'Click any matrix quadrant above to inspect its operational security meaning.'}
      </div>
    </div>
  );
};
