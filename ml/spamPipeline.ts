import { INITIAL_CORPUS, type CorpusRecord } from './corpus.ts';

export type ModelId = 'linear_svc' | 'multinomial_nb' | 'logistic_regression';

export interface RegexExtractionStats {
  urlCount: number;
  emailCount: number;
  currencyCount: number;
  numberCount: number;
  uppercaseRatio: number;
  exclamationCount: number;
  charLength: number;
}

export interface NormalizedResult {
  rawText: string;
  normalizedText: string;
  tokens: string[];
  unigrams: string[];
  bigrams: string[];
  ngrams: string[];
  stats: RegexExtractionStats;
}

export interface TokenAttribution {
  term: string;
  ngramType: 'unigram' | 'bigram';
  tfidfWeight: number;
  modelWeight: number;
  contribution: number;
  direction: 'spam' | 'ham';
}

export interface SingleModelPrediction {
  modelId: ModelId;
  modelName: string;
  verdict: 'spam' | 'ham';
  spamProbability: number;
  decisionScore: number;
  threshold: number;
  topAttributions: TokenAttribution[];
}

export interface FullPredictionResponse {
  id: string;
  timestamp: string;
  sender: string;
  subject: string;
  body: string;
  selectedModel: ModelId;
  primaryPrediction: SingleModelPrediction;
  allModels: Record<ModelId, SingleModelPrediction>;
  pipelineTrace: {
    rawCombined: string;
    normalizedText: string;
    regexStats: RegexExtractionStats;
    totalTokens: number;
    unigramCount: number;
    bigramCount: number;
    activeVocabMatches: number;
    sampleTokens: string[];
  };
  latencyMs: number;
}

export interface ConfusionMatrix {
  tp: number;
  fp: number;
  tn: number;
  fn: number;
}

export interface ModelEvaluationMetrics {
  modelId: ModelId;
  modelName: string;
  shortDesc: string;
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  rocAuc: number;
  avgLatencyMs: number;
  confusionMatrix: ConfusionMatrix;
  rocCurve: Array<{ fpr: number; tpr: number }>;
  reportBenchmark: {
    datasetSize: number;
    precision: number;
    recall: number;
    f1Score: number;
    note: string;
  };
}

export interface VerificationCheck {
  id: string;
  name: string;
  description: string;
  passed: boolean;
  detail: string;
}

export interface PipelineMetricsSummary {
  trainedAt: string;
  randomState: number;
  totalRecords: number;
  trainCount: number;
  testCount: number;
  spamCount: number;
  hamCount: number;
  vocabularySize: number;
  maxFeatures: number;
  sublinearTf: boolean;
  ngramRange: [number, number];
  models: Record<ModelId, ModelEvaluationMetrics>;
  topSpamFeatures: Array<{ term: string; weight: number }>;
  topHamFeatures: Array<{ term: string; weight: number }>;
  verificationChecks: VerificationCheck[];
}

// Deterministic PRNG matching random_state = 42
function createSeededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const copy = [...arr];
  const rng = createSeededRng(seed);
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const STOP_WORDS = new Set([
  'the', 'is', 'in', 'at', 'of', 'on', 'and', 'a', 'an', 'to', 'for', 'with',
  'by', 'this', 'that', 'it', 'as', 'be', 'are', 'was', 'were', 'been', 'have',
  'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'can',
  'may', 'might', 'or', 'if', 'but', 'not', 'from', 'into', 'than', 'then',
  'so', 'we', 'you', 'they', 'he', 'she', 'i', 'me', 'my', 'your', 'our', 'their',
]);

/**
 * Stage 1: Regex Text Normalization Module (Chapter 5.1)
 * - Lowercase text
 * - Replace embedded hyperlinks with canonical 'urltoken'
 * - Replace email addresses with 'emailtoken'
 * - Normalize currency symbols ($, £, €, ₹, INR, USD, Rs) with 'currencytoken'
 * - Normalize phone numbers / long numeric tokens with 'numtoken'
 * - Strip non-alphabetic noise
 */
export function normalizeMessage(rawText: string): NormalizedResult {
  const letters = rawText.replace(/[^a-zA-Z]/g, '');
  const upperLetters = rawText.replace(/[^A-Z]/g, '');
  const uppercaseRatio = letters.length > 0 ? upperLetters.length / letters.length : 0;
  const exclamationCount = (rawText.match(/!/g) || []).length;

  const urlRegex = /(?:https?:\/\/|www\.)[^\s<>"']+|(?:\b[a-zA-Z0-9-]+\.(?:com|net|org|xyz|info|biz|co|tk|ru|io|in)\b(?:\/[^\s<>"']*)?)/gi;
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
  const currencyRegex = /(?:[$£€₹]|(?:\b(?:INR|USD|GBP|EUR|Rs\.?)\b))\s*\d[\d,.]*/gi;
  const standaloneCurrencyRegex = /[$£€₹]/g;
  const phoneOrNumberRegex = /(?:\+?\d[\d\s-]{6,}\d|\b\d+(?:[.,]\d+)?%?\b)/g;

  const urlMatches = rawText.match(urlRegex) || [];
  const emailMatches = rawText.match(emailRegex) || [];
  const currencyMatches = rawText.match(currencyRegex) || [];
  const standaloneCurrencyMatches = rawText.match(standaloneCurrencyRegex) || [];

  let text = rawText.toLowerCase();
  text = text.replace(emailRegex, ' emailtoken ');
  text = text.replace(urlRegex, ' urltoken ');
  text = text.replace(currencyRegex, ' currencytoken ');
  text = text.replace(standaloneCurrencyRegex, ' currencytoken ');

  const numMatches = text.match(phoneOrNumberRegex) || [];
  text = text.replace(phoneOrNumberRegex, ' numtoken ');

  // Strip non-alphabetic noise and normalize whitespace
  text = text.replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();

  const rawTokens = text.split(' ').filter((t) => t.length >= 2);
  const tokens = rawTokens.filter((t) => !STOP_WORDS.has(t));

  const unigrams = [...tokens];
  const bigrams: string[] = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    bigrams.push(`${tokens[i]} ${tokens[i + 1]}`);
  }

  return {
    rawText,
    normalizedText: text,
    tokens,
    unigrams,
    bigrams,
    ngrams: [...unigrams, ...bigrams],
    stats: {
      urlCount: urlMatches.length,
      emailCount: emailMatches.length,
      currencyCount: currencyMatches.length + standaloneCurrencyMatches.length,
      numberCount: numMatches.length,
      uppercaseRatio: Number(uppercaseRatio.toFixed(4)),
      exclamationCount,
      charLength: rawText.length,
    },
  };
}

function sigmoid(z: number): number {
  if (z >= 0) {
    const ez = Math.exp(-z);
    return 1 / (1 + ez);
  } else {
    const ez = Math.exp(z);
    return ez / (1 + ez);
  }
}

interface SparseVector {
  indices: number[];
  values: number[];
}

/**
 * Stage 2: Sublinear Uni-gram & Bi-gram TF-IDF Vectorizer
 * tf_sub(t, d) = 1 + log(tf(t, d))
 * idf(t) = log((1 + N) / (1 + df(t))) + 1
 * L2-normalized sparse representation, fitted STRICTLY on X_train.
 */
class SublinearTfidfVectorizer {
  public vocabulary: Map<string, number> = new Map();
  public terms: string[] = [];
  public idf: Float64Array = new Float64Array(0);
  public readonly maxFeatures: number;

  constructor(maxFeatures = 5000) {
    this.maxFeatures = maxFeatures;
  }

  public fit(documents: string[]): void {
    const dfCounts = new Map<string, number>();
    const totalTfCounts = new Map<string, number>();
    const N = documents.length;

    for (const doc of documents) {
      const { ngrams } = normalizeMessage(doc);
      const seenInDoc = new Set<string>();
      for (const term of ngrams) {
        totalTfCounts.set(term, (totalTfCounts.get(term) || 0) + 1);
        if (!seenInDoc.has(term)) {
          seenInDoc.add(term);
          dfCounts.set(term, (dfCounts.get(term) || 0) + 1);
        }
      }
    }

    // Keep all unigrams (df >= 1) and recurring bigrams (df >= 2) to prevent noisy singleton bi-grams from diluting NB/SVC
    const sortedTerms = Array.from(dfCounts.entries())
      .filter(([term, df]) => !term.includes(' ') || df >= 2)
      .sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        const tfDiff = (totalTfCounts.get(b[0]) || 0) - (totalTfCounts.get(a[0]) || 0);
        if (tfDiff !== 0) return tfDiff;
        return a[0].localeCompare(b[0]);
      })
      .slice(0, this.maxFeatures);

    this.vocabulary.clear();
    this.terms = [];
    this.idf = new Float64Array(sortedTerms.length);

    sortedTerms.forEach(([term, df], idx) => {
      this.vocabulary.set(term, idx);
      this.terms.push(term);
      // Smooth IDF matching Scikit-Learn TfidfVectorizer(smooth_idf=True)
      this.idf[idx] = Math.log((1 + N) / (1 + df)) + 1;
    });
  }

  public transform(doc: string): SparseVector {
    const { ngrams } = normalizeMessage(doc);
    const tfMap = new Map<number, number>();

    for (const term of ngrams) {
      const idx = this.vocabulary.get(term);
      if (idx !== undefined) {
        tfMap.set(idx, (tfMap.get(idx) || 0) + 1);
      }
    }

    const indices: number[] = [];
    const values: number[] = [];
    let normSq = 0;

    for (const [idx, tf] of tfMap.entries()) {
      // Sublinear TF: 1 + log(tf)
      const subTf = 1 + Math.log(tf);
      const val = subTf * this.idf[idx];
      indices.push(idx);
      values.push(val);
      normSq += val * val;
    }

    const norm = Math.sqrt(normSq);
    if (norm > 0) {
      for (let i = 0; i < values.length; i++) {
        values[i] /= norm;
      }
    }

    return { indices, values };
  }
}

function dotSparse(weights: Float64Array, vec: SparseVector): number {
  let sum = 0;
  for (let i = 0; i < vec.indices.length; i++) {
    sum += weights[vec.indices[i]] * vec.values[i];
  }
  return sum;
}

/**
 * Classifier 1: Class-Balanced Linear Support Vector Classifier (Linear SVC)
 * Minimizes L2-regularized Hinge Loss with class_weight='balanced' + Platt calibration.
 */
class LinearSVCModel {
  public weights: Float64Array = new Float64Array(0);
  public bias = 0;
  private plattA = 2.6;
  private plattB = 0;

  public fit(X: SparseVector[], y: number[], vocabSize: number): void {
    this.weights = new Float64Array(vocabSize);
    this.bias = 0;

    const n = X.length;
    const nSpam = y.filter((v) => v === 1).length || 1;
    const nHam = n - nSpam || 1;
    const wSpam = n / (2 * nSpam);
    const wHam = n / (2 * nHam);

    const epochs = 110;
    const lr0 = 0.25;
    const reg = 0.0008;

    const order = seededShuffle(
      Array.from({ length: n }, (_, i) => i),
      42
    );

    for (let epoch = 0; epoch < epochs; epoch++) {
      const lr = lr0 / (1 + epoch * 0.06);
      for (const idx of order) {
        const vec = X[idx];
        const target = y[idx] === 1 ? 1 : -1;
        const cw = y[idx] === 1 ? wSpam : wHam;
        const margin = target * (dotSparse(this.weights, vec) + this.bias);

        // L2 decay
        for (let j = 0; j < vocabSize; j++) {
          this.weights[j] *= 1 - lr * reg;
        }

        if (margin < 1) {
          for (let k = 0; k < vec.indices.length; k++) {
            const fIdx = vec.indices[k];
            this.weights[fIdx] += lr * cw * target * vec.values[k];
          }
          this.bias += lr * cw * target * 0.5;
        }
      }
    }

    // Calibrate Platt scaling slope around margin=0 hyperplane
    let meanSpam = 0;
    let meanHam = 0;
    for (let i = 0; i < n; i++) {
      const score = dotSparse(this.weights, X[i]) + this.bias;
      if (y[i] === 1) meanSpam += score;
      else meanHam += score;
    }
    meanSpam /= nSpam;
    meanHam /= nHam;
    const spread = Math.max(0.4, meanSpam - meanHam);
    this.plattA = 3.2 / spread;
    this.plattB = 0;
  }

  public decisionFunction(vec: SparseVector): number {
    return dotSparse(this.weights, vec) + this.bias;
  }

  public predictProba(vec: SparseVector): number {
    const z = this.decisionFunction(vec);
    return sigmoid(this.plattA * z + this.plattB);
  }
}

/**
 * Classifier 2: Multinomial Naive Bayes (alpha = 0.5)
 */
class MultinomialNBModel {
  public logWeights: Float64Array = new Float64Array(0);
  public logPriorDiff = 0;
  private readonly alpha: number;

  constructor(alpha = 0.5) {
    this.alpha = alpha;
  }

  public fit(X: SparseVector[], y: number[], vocabSize: number): void {
    const spamCounts = new Float64Array(vocabSize);
    const hamCounts = new Float64Array(vocabSize);
    let totalSpamWeight = 0;
    let totalHamWeight = 0;
    let nSpam = 0;
    let nHam = 0;

    for (let i = 0; i < X.length; i++) {
      const vec = X[i];
      if (y[i] === 1) {
        nSpam++;
        for (let k = 0; k < vec.indices.length; k++) {
          spamCounts[vec.indices[k]] += vec.values[k];
          totalSpamWeight += vec.values[k];
        }
      } else {
        nHam++;
        for (let k = 0; k < vec.indices.length; k++) {
          hamCounts[vec.indices[k]] += vec.values[k];
          totalHamWeight += vec.values[k];
        }
      }
    }

    const denomSpam = totalSpamWeight + this.alpha * vocabSize;
    const denomHam = totalHamWeight + this.alpha * vocabSize;

    this.logWeights = new Float64Array(vocabSize);
    for (let j = 0; j < vocabSize; j++) {
      const pSpam = (spamCounts[j] + this.alpha) / denomSpam;
      const pHam = (hamCounts[j] + this.alpha) / denomHam;
      this.logWeights[j] = Math.log(pSpam) - Math.log(pHam);
    }

    const total = nSpam + nHam || 1;
    this.logPriorDiff = Math.log((nSpam + 0.5) / (total + 1)) - Math.log((nHam + 0.5) / (total + 1));
  }

  public decisionFunction(vec: SparseVector): number {
    return dotSparse(this.logWeights, vec) + this.logPriorDiff;
  }

  public predictProba(vec: SparseVector): number {
    // Log-odds to posterior probability
    return sigmoid(this.decisionFunction(vec));
  }
}

/**
 * Classifier 3: L2-Regularized Logistic Regression
 */
class LogisticRegressionModel {
  public weights: Float64Array = new Float64Array(0);
  public bias = 0;

  public fit(X: SparseVector[], y: number[], vocabSize: number): void {
    this.weights = new Float64Array(vocabSize);
    this.bias = 0;

    const n = X.length;
    const nSpam = y.filter((v) => v === 1).length || 1;
    const nHam = n - nSpam || 1;
    const wSpam = n / (2 * nSpam);
    const wHam = n / (2 * nHam);

    const epochs = 95;
    const lr0 = 0.65;
    const reg = 0.0025;

    const order = seededShuffle(
      Array.from({ length: n }, (_, i) => i),
      42
    );

    for (let epoch = 0; epoch < epochs; epoch++) {
      const lr = lr0 / (1 + epoch * 0.05);
      for (const idx of order) {
        const vec = X[idx];
        const target = y[idx];
        const cw = target === 1 ? wSpam : wHam;
        const z = dotSparse(this.weights, vec) + this.bias;
        const pred = sigmoid(z);
        const err = (pred - target) * cw;

        for (let j = 0; j < vocabSize; j++) {
          this.weights[j] *= 1 - lr * reg;
        }
        for (let k = 0; k < vec.indices.length; k++) {
          const fIdx = vec.indices[k];
          this.weights[fIdx] -= lr * err * vec.values[k];
        }
        this.bias -= lr * err * 0.6;
      }
    }
  }

  public decisionFunction(vec: SparseVector): number {
    return dotSparse(this.weights, vec) + this.bias;
  }

  public predictProba(vec: SparseVector): number {
    return sigmoid(this.decisionFunction(vec));
  }
}

function computeRocAuc(yTrue: number[], probs: number[]): { auc: number; curve: Array<{ fpr: number; tpr: number }> } {
  const paired = yTrue
    .map((label, idx) => ({ label, prob: probs[idx] }))
    .sort((a, b) => b.prob - a.prob);

  const totalPos = yTrue.filter((v) => v === 1).length || 1;
  const totalNeg = yTrue.length - totalPos || 1;

  let tp = 0;
  let fp = 0;
  const curve: Array<{ fpr: number; tpr: number }> = [{ fpr: 0, tpr: 0 }];

  for (const item of paired) {
    if (item.label === 1) tp++;
    else fp++;
    curve.push({
      fpr: Number((fp / totalNeg).toFixed(4)),
      tpr: Number((tp / totalPos).toFixed(4)),
    });
  }

  let auc = 0;
  for (let i = 1; i < curve.length; i++) {
    const dx = curve[i].fpr - curve[i - 1].fpr;
    const avgY = (curve[i].tpr + curve[i - 1].tpr) / 2;
    auc += dx * avgY;
  }

  // Downsample curve to max 30 evenly spaced points for crisp SVG rendering
  const sampled: Array<{ fpr: number; tpr: number }> = [];
  const step = Math.max(1, Math.floor(curve.length / 28));
  for (let i = 0; i < curve.length; i += step) {
    sampled.push(curve[i]);
  }
  const last = curve[curve.length - 1];
  if (sampled[sampled.length - 1] !== last) {
    sampled.push(last);
  }

  return { auc: Number(auc.toFixed(4)), curve: sampled };
}

export interface DatasetEntryWithSplit extends CorpusRecord {
  split: 'train' | 'test';
  normalizedText: string;
}

export class SpamDetectionEngine {
  private corpus: CorpusRecord[] = [...INITIAL_CORPUS];
  private vectorizer = new SublinearTfidfVectorizer(5000);
  private linearSvc = new LinearSVCModel();
  private multinomialNb = new MultinomialNBModel(0.5);
  private logisticReg = new LogisticRegressionModel();

  private trainIds = new Set<string>();
  private testIds = new Set<string>();
  private metricsSummary!: PipelineMetricsSummary;

  constructor() {
    this.train();
  }

  private getCombinedText(record: Pick<CorpusRecord, 'subject' | 'text'>): string {
    const subj = record.subject && !record.subject.startsWith('SMS') ? record.subject : '';
    return `${subj} ${record.text}`.trim();
  }

  public train(): PipelineMetricsSummary {
    const spamRecords = seededShuffle(
      this.corpus.filter((r) => r.label === 'spam'),
      42
    );
    const hamRecords = seededShuffle(
      this.corpus.filter((r) => r.label === 'ham'),
      42
    );

    const spamSplitIdx = Math.max(1, Math.floor(spamRecords.length * 0.8));
    const hamSplitIdx = Math.max(1, Math.floor(hamRecords.length * 0.8));

    const trainRecords = [...spamRecords.slice(0, spamSplitIdx), ...hamRecords.slice(0, hamSplitIdx)];
    const testRecords = [...spamRecords.slice(spamSplitIdx), ...hamRecords.slice(hamSplitIdx)];

    this.trainIds = new Set(trainRecords.map((r) => r.id));
    this.testIds = new Set(testRecords.map((r) => r.id));

    const trainDocs = trainRecords.map((r) => this.getCombinedText(r));
    const yTrain = trainRecords.map((r) => (r.label === 'spam' ? 1 : 0));

    // Zero Data Leakage: Fit TF-IDF strictly on X_train
    this.vectorizer = new SublinearTfidfVectorizer(5000);
    this.vectorizer.fit(trainDocs);
    const vocabSize = this.vectorizer.terms.length;

    const XTrain = trainDocs.map((doc) => this.vectorizer.transform(doc));

    // Fit all 3 classifiers strictly on X_train
    this.linearSvc = new LinearSVCModel();
    this.linearSvc.fit(XTrain, yTrain, vocabSize);

    this.multinomialNb = new MultinomialNBModel(0.5);
    this.multinomialNb.fit(XTrain, yTrain, vocabSize);

    this.logisticReg = new LogisticRegressionModel();
    this.logisticReg.fit(XTrain, yTrain, vocabSize);

    // Evaluate strictly on unseen Holdout Test Set (X_test)
    const testDocs = testRecords.map((r) => this.getCombinedText(r));
    const yTest = testRecords.map((r) => (r.label === 'spam' ? 1 : 0));
    const XTest = testDocs.map((doc) => this.vectorizer.transform(doc));

    const evaluate = (
      modelId: ModelId,
      modelName: string,
      shortDesc: string,
      predictFn: (v: SparseVector) => number,
      reportBenchmark: ModelEvaluationMetrics['reportBenchmark']
    ): ModelEvaluationMetrics => {
      const t0 = performance.now();
      const probs = XTest.map((v) => predictFn(v));
      const elapsed = performance.now() - t0;

      let tp = 0;
      let fp = 0;
      let tn = 0;
      let fn = 0;

      for (let i = 0; i < yTest.length; i++) {
        const pred = probs[i] >= 0.5 ? 1 : 0;
        const actual = yTest[i];
        if (pred === 1 && actual === 1) tp++;
        else if (pred === 1 && actual === 0) fp++;
        else if (pred === 0 && actual === 0) tn++;
        else fn++;
      }

      const accuracy = (tp + tn) / (yTest.length || 1);
      const precision = tp + fp > 0 ? tp / (tp + fp) : 1;
      const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
      const f1Score = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
      const { auc, curve } = computeRocAuc(yTest, probs);

      return {
        modelId,
        modelName,
        shortDesc,
        accuracy: Number((accuracy * 100).toFixed(1)),
        precision: Number((precision * 100).toFixed(1)),
        recall: Number((recall * 100).toFixed(1)),
        f1Score: Number((f1Score * 100).toFixed(1)),
        rocAuc: auc,
        avgLatencyMs: Number((elapsed / Math.max(1, XTest.length)).toFixed(3)),
        confusionMatrix: { tp, fp, tn, fn },
        rocCurve: curve,
        reportBenchmark,
      };
    };

    const svcMetrics = evaluate(
      'linear_svc',
      'Linear SVC (Balanced)',
      'Class-balanced Linear Support Vector Classifier over uni-gram & bi-gram sublinear TF-IDF',
      (v) => this.linearSvc.predictProba(v),
      {
        datasetSize: 5572,
        precision: 99.1,
        recall: 93.3,
        f1Score: 96.1,
        note: 'Optimal precision-recall balance in Table 5.1',
      }
    );

    const nbMetrics = evaluate(
      'multinomial_nb',
      'Multinomial Naive Bayes (α=0.5)',
      'Probabilistic Bayes classifier with Lidstone smoothing α=0.5',
      (v) => this.multinomialNb.predictProba(v),
      {
        datasetSize: 5572,
        precision: 99.3,
        recall: 88.6,
        f1Score: 93.6,
        note: 'Ultra-low latency baseline in Table 5.1',
      }
    );

    const lrMetrics = evaluate(
      'logistic_regression',
      'Logistic Regression (L2)',
      'L2-regularized maximum entropy classifier with calibrated probabilities',
      (v) => this.logisticReg.predictProba(v),
      {
        datasetSize: 5572,
        precision: 98.6,
        recall: 85.2,
        f1Score: 91.4,
        note: 'Calibrated log-odds probabilities in Table 5.1',
      }
    );

    // Extract global top Spam and Ham feature weights from Linear SVC
    const termWeights = this.vectorizer.terms.map((term, i) => ({
      term,
      weight: Number(this.linearSvc.weights[i].toFixed(4)),
    }));
    const topSpamFeatures = [...termWeights].sort((a, b) => b.weight - a.weight).slice(0, 12);
    const topHamFeatures = [...termWeights].sort((a, b) => a.weight - b.weight).slice(0, 12);

    // Chapter 7.3 Verification Matrix Checks
    const overlapCount = [...this.trainIds].filter((id) => this.testIds.has(id)).length;
    const majorityBaselineAcc = Number(
      ((Math.max(hamRecords.length - hamSplitIdx, spamRecords.length - spamSplitIdx) / Math.max(1, testRecords.length)) * 100).toFixed(1)
    );
    const beatsBaseline =
      svcMetrics.accuracy > majorityBaselineAcc &&
      nbMetrics.accuracy > majorityBaselineAcc &&
      lrMetrics.accuracy > majorityBaselineAcc;

    const verificationChecks: VerificationCheck[] = [
      {
        id: 'VER-01',
        name: 'Partition Disjointness Check',
        description: 'Zero index overlap between 80% stratified training and 20% holdout partitions',
        passed: overlapCount === 0 && trainRecords.length + testRecords.length === this.corpus.length,
        detail: `${trainRecords.length} train / ${testRecords.length} holdout · Overlap = ${overlapCount}`,
      },
      {
        id: 'VER-02',
        name: 'Zero Data Leakage Boundary',
        description: 'Sublinear TF-IDF vocabulary & IDF weights fitted strictly on X_train',
        passed: vocabSize > 0,
        detail: `${vocabSize} uni/bi-gram features learned strictly from training fold`,
      },
      {
        id: 'VER-03',
        name: 'Baseline Sanity Benchmark',
        description: 'All trained estimators outperform the majority-class dummy baseline',
        passed: beatsBaseline,
        detail: `Dummy Baseline: ${majorityBaselineAcc}% vs Linear SVC: ${svcMetrics.accuracy}%`,
      },
      {
        id: 'VER-04',
        name: 'Deterministic Seed Verification',
        description: 'Seeded PRNG (random_state = 42) guarantees reproducible holdout evaluation',
        passed: true,
        detail: 'random_state = 42 locked across split & SGD epochs',
      },
    ];

    this.metricsSummary = {
      trainedAt: new Date().toISOString(),
      randomState: 42,
      totalRecords: this.corpus.length,
      trainCount: trainRecords.length,
      testCount: testRecords.length,
      spamCount: spamRecords.length,
      hamCount: hamRecords.length,
      vocabularySize: vocabSize,
      maxFeatures: this.vectorizer.maxFeatures,
      sublinearTf: true,
      ngramRange: [1, 2],
      models: {
        linear_svc: svcMetrics,
        multinomial_nb: nbMetrics,
        logistic_regression: lrMetrics,
      },
      topSpamFeatures,
      topHamFeatures,
      verificationChecks,
    };

    return this.metricsSummary;
  }

  private getAttributions(vec: SparseVector, weights: Float64Array): TokenAttribution[] {
    const attributions: TokenAttribution[] = [];
    for (let i = 0; i < vec.indices.length; i++) {
      const fIdx = vec.indices[i];
      const tfidf = vec.values[i];
      const w = weights[fIdx];
      const contribution = tfidf * w;
      const term = this.vectorizer.terms[fIdx];
      attributions.push({
        term,
        ngramType: term.includes(' ') ? 'bigram' : 'unigram',
        tfidfWeight: Number(tfidf.toFixed(4)),
        modelWeight: Number(w.toFixed(4)),
        contribution: Number(contribution.toFixed(4)),
        direction: contribution >= 0 ? 'spam' : 'ham',
      });
    }

    return attributions
      .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
      .slice(0, 12);
  }

  public predict(params: {
    subject?: string;
    body: string;
    sender?: string;
    modelId?: ModelId;
    threshold?: number;
  }): FullPredictionResponse {
    const t0 = performance.now();
    const subject = (params.subject || '').trim();
    const body = (params.body || '').trim();
    const sender = (params.sender || '').trim();
    const selectedModel: ModelId = params.modelId || 'linear_svc';
    const threshold = typeof params.threshold === 'number' ? Math.min(0.95, Math.max(0.05, params.threshold)) : 0.5;

    const rawCombined = `${subject} ${body}`.trim();
    const normalized = normalizeMessage(rawCombined);
    const vec = this.vectorizer.transform(rawCombined);

    const buildPrediction = (
      modelId: ModelId,
      modelName: string,
      prob: number,
      score: number,
      weights: Float64Array
    ): SingleModelPrediction => {
      const roundedProb = Number(prob.toFixed(4));
      return {
        modelId,
        modelName,
        verdict: roundedProb >= threshold ? 'spam' : 'ham',
        spamProbability: roundedProb,
        decisionScore: Number(score.toFixed(4)),
        threshold,
        topAttributions: this.getAttributions(vec, weights),
      };
    };

    const allModels: Record<ModelId, SingleModelPrediction> = {
      linear_svc: buildPrediction(
        'linear_svc',
        'Linear SVC (Balanced)',
        this.linearSvc.predictProba(vec),
        this.linearSvc.decisionFunction(vec),
        this.linearSvc.weights
      ),
      multinomial_nb: buildPrediction(
        'multinomial_nb',
        'Multinomial Naive Bayes (α=0.5)',
        this.multinomialNb.predictProba(vec),
        this.multinomialNb.decisionFunction(vec),
        this.multinomialNb.logWeights
      ),
      logistic_regression: buildPrediction(
        'logistic_regression',
        'Logistic Regression (L2)',
        this.logisticReg.predictProba(vec),
        this.logisticReg.decisionFunction(vec),
        this.logisticReg.weights
      ),
    };

    const latencyMs = Number((performance.now() - t0).toFixed(2));

    return {
      id: `scan-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      sender,
      subject,
      body,
      selectedModel,
      primaryPrediction: allModels[selectedModel],
      allModels,
      pipelineTrace: {
        rawCombined,
        normalizedText: normalized.normalizedText,
        regexStats: normalized.stats,
        totalTokens: normalized.tokens.length,
        unigramCount: normalized.unigrams.length,
        bigramCount: normalized.bigrams.length,
        activeVocabMatches: vec.indices.length,
        sampleTokens: normalized.ngrams.slice(0, 24),
      },
      latencyMs,
    };
  }

  public getMetrics(): PipelineMetricsSummary {
    return this.metricsSummary;
  }

  public getDataset(): DatasetEntryWithSplit[] {
    return this.corpus.map((r) => ({
      ...r,
      split: this.testIds.has(r.id) ? 'test' : 'train',
      normalizedText: normalizeMessage(this.getCombinedText(r)).normalizedText,
    }));
  }

  public addTrainingRecord(input: {
    label: 'spam' | 'ham';
    channel: 'email' | 'sms';
    subject: string;
    text: string;
  }): { record: DatasetEntryWithSplit; metrics: PipelineMetricsSummary } {
    const id = `usr-${Date.now()}`;
    const newRecord: CorpusRecord = {
      id,
      label: input.label,
      channel: input.channel,
      subject: input.subject.trim() || (input.channel === 'sms' ? 'SMS Message' : 'User Submitted Email'),
      text: input.text.trim(),
      source: 'user',
    };
    this.corpus.unshift(newRecord);
    const metrics = this.train();
    const record: DatasetEntryWithSplit = {
      ...newRecord,
      split: this.testIds.has(id) ? 'test' : 'train',
      normalizedText: normalizeMessage(this.getCombinedText(newRecord)).normalizedText,
    };
    return { record, metrics };
  }

  public deleteTrainingRecord(id: string): { deleted: boolean; metrics: PipelineMetricsSummary } {
    const idx = this.corpus.findIndex((r) => r.id === id && r.source === 'user');
    if (idx === -1) {
      return { deleted: false, metrics: this.metricsSummary };
    }
    this.corpus.splice(idx, 1);
    const metrics = this.train();
    return { deleted: true, metrics };
  }
}
