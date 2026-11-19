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

export interface DatasetRecord {
  id: string;
  label: 'spam' | 'ham';
  channel: 'email' | 'sms';
  subject: string;
  text: string;
  source: 'corpus' | 'user';
  split: 'train' | 'test';
  normalizedText: string;
}

export interface SamplePreset {
  id: string;
  title: string;
  category: string;
  channel: 'email' | 'sms';
  sender: string;
  subject: string;
  body: string;
}

export interface HistoryEntry {
  id: string;
  timestamp: string;
  sender: string;
  subject: string;
  body: string;
  selectedModel: ModelId;
  verdict: 'spam' | 'ham';
  spamProbability: number;
  decisionScore: number;
  threshold: number;
  latencyMs: number;
  feedback?: 'correct' | 'incorrect' | null;
}

export interface BatchResultRow {
  rowIndex: number;
  id: string;
  sender: string;
  subject: string;
  body: string;
  verdict: 'spam' | 'ham';
  spamProbability: number;
  decisionScore: number;
  topTerms: string[];
  urlCount: number;
  currencyCount: number;
}

export interface BatchResponse {
  modelId: ModelId;
  threshold: number;
  total: number;
  spamCount: number;
  hamCount: number;
  totalLatencyMs: number;
  results: BatchResultRow[];
}
