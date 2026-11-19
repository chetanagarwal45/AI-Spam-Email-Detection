import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { SAMPLE_PRESETS } from './ml/corpus.ts';
import {
  SpamDetectionEngine,
  type FullPredictionResponse,
  type ModelId,
} from './ml/spamPipeline.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const HISTORY_FILE = '/tmp/mailguard-scan-history.json';

interface HistoryEntry {
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

function loadHistory(): HistoryEntry[] {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const raw = fs.readFileSync(HISTORY_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // Ignore corrupt temp file and start fresh
  }
  return [];
}

function saveHistory(entries: HistoryEntry[]): void {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(entries.slice(0, 100), null, 2), 'utf-8');
  } catch {
    // Non-fatal in read-only sandboxes
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  const engine = new SpamDetectionEngine();
  let scanHistory: HistoryEntry[] = loadHistory();

  // Seed initial realistic history entries on first boot if empty
  if (scanHistory.length === 0) {
    const initialSeeds = [SAMPLE_PRESETS[0], SAMPLE_PRESETS[2], SAMPLE_PRESETS[1]];
    scanHistory = initialSeeds.map((preset) => {
      const res = engine.predict({
        sender: preset.sender,
        subject: preset.subject,
        body: preset.body,
        modelId: 'linear_svc',
        threshold: 0.5,
      });
      return {
        id: res.id,
        timestamp: res.timestamp,
        sender: res.sender,
        subject: res.subject,
        body: res.body,
        selectedModel: res.selectedModel,
        verdict: res.primaryPrediction.verdict,
        spamProbability: res.primaryPrediction.spamProbability,
        decisionScore: res.primaryPrediction.decisionScore,
        threshold: res.primaryPrediction.threshold,
        latencyMs: res.latencyMs,
        feedback: null,
      };
    });
    saveHistory(scanHistory);
  }

  // Health Check
  app.get('/api/health', (_req, res) => {
    const metrics = engine.getMetrics();
    res.json({
      status: 'ok',
      trainedAt: metrics.trainedAt,
      vocabularySize: metrics.vocabularySize,
      totalRecords: metrics.totalRecords,
    });
  });

  // Sample Presets
  app.get('/api/presets', (_req, res) => {
    res.json({ presets: SAMPLE_PRESETS });
  });

  // Model Metrics & Verification Checks
  app.get('/api/metrics', (_req, res) => {
    res.json(engine.getMetrics());
  });

  // Single Email/SMS Prediction
  app.post('/api/predict', (req, res) => {
    const { subject, body, sender, modelId, threshold, recordHistory = true } = req.body || {};

    if (typeof body !== 'string' || body.trim().length === 0) {
      res.status(400).json({ error: 'Email or SMS message body is required for classification.' });
      return;
    }

    const validModels: ModelId[] = ['linear_svc', 'multinomial_nb', 'logistic_regression'];
    const chosenModel: ModelId = validModels.includes(modelId) ? modelId : 'linear_svc';
    const numericThreshold = typeof threshold === 'number' && !Number.isNaN(threshold) ? threshold : 0.5;

    const result: FullPredictionResponse = engine.predict({
      subject: typeof subject === 'string' ? subject : '',
      body,
      sender: typeof sender === 'string' ? sender : '',
      modelId: chosenModel,
      threshold: numericThreshold,
    });

    if (recordHistory) {
      const entry: HistoryEntry = {
        id: result.id,
        timestamp: result.timestamp,
        sender: result.sender,
        subject: result.subject || (result.body.slice(0, 48) + (result.body.length > 48 ? '...' : '')),
        body: result.body,
        selectedModel: result.selectedModel,
        verdict: result.primaryPrediction.verdict,
        spamProbability: result.primaryPrediction.spamProbability,
        decisionScore: result.primaryPrediction.decisionScore,
        threshold: result.primaryPrediction.threshold,
        latencyMs: result.latencyMs,
        feedback: null,
      };
      scanHistory.unshift(entry);
      scanHistory = scanHistory.slice(0, 100);
      saveHistory(scanHistory);
    }

    res.json(result);
  });

  // Batch Email/SMS Triage
  app.post('/api/batch', (req, res) => {
    const { items, modelId, threshold } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'Provide a non-empty array of messages to classify.' });
      return;
    }
    if (items.length > 500) {
      res.status(400).json({ error: 'Batch limit is 500 messages per request.' });
      return;
    }

    const validModels: ModelId[] = ['linear_svc', 'multinomial_nb', 'logistic_regression'];
    const chosenModel: ModelId = validModels.includes(modelId) ? modelId : 'linear_svc';
    const numericThreshold = typeof threshold === 'number' && !Number.isNaN(threshold) ? threshold : 0.5;

    const t0 = performance.now();
    const results = items
      .filter((item) => item && typeof item.body === 'string' && item.body.trim().length > 0)
      .map((item, idx) => {
        const prediction = engine.predict({
          subject: typeof item.subject === 'string' ? item.subject : '',
          sender: typeof item.sender === 'string' ? item.sender : '',
          body: item.body,
          modelId: chosenModel,
          threshold: numericThreshold,
        });
        return {
          rowIndex: idx + 1,
          id: item.id || `batch-${idx + 1}`,
          sender: prediction.sender,
          subject: prediction.subject,
          body: prediction.body,
          verdict: prediction.primaryPrediction.verdict,
          spamProbability: prediction.primaryPrediction.spamProbability,
          decisionScore: prediction.primaryPrediction.decisionScore,
          topTerms: prediction.primaryPrediction.topAttributions.slice(0, 4).map((a) => a.term),
          urlCount: prediction.pipelineTrace.regexStats.urlCount,
          currencyCount: prediction.pipelineTrace.regexStats.currencyCount,
        };
      });

    const totalMs = Number((performance.now() - t0).toFixed(2));
    const spamCount = results.filter((r) => r.verdict === 'spam').length;
    const hamCount = results.length - spamCount;

    res.json({
      modelId: chosenModel,
      threshold: numericThreshold,
      total: results.length,
      spamCount,
      hamCount,
      totalLatencyMs: totalMs,
      results,
    });
  });

  // Corpus Dataset Endpoints
  app.get('/api/dataset', (_req, res) => {
    res.json({ records: engine.getDataset() });
  });

  app.post('/api/dataset', (req, res) => {
    const { label, channel, subject, text } = req.body || {};
    if (label !== 'spam' && label !== 'ham') {
      res.status(400).json({ error: 'Label must be either "spam" or "ham".' });
      return;
    }
    if (typeof text !== 'string' || text.trim().length < 8) {
      res.status(400).json({ error: 'Message text must be at least 8 characters long.' });
      return;
    }

    const added = engine.addTrainingRecord({
      label,
      channel: channel === 'sms' ? 'sms' : 'email',
      subject: typeof subject === 'string' ? subject : '',
      text,
    });

    res.status(201).json(added);
  });

  app.delete('/api/dataset/:id', (req, res) => {
    const result = engine.deleteTrainingRecord(req.params.id);
    if (!result.deleted) {
      res.status(404).json({ error: 'User-submitted record not found (built-in corpus records are locked).' });
      return;
    }
    res.json(result);
  });

  // Retrain Pipeline
  app.post('/api/train', (_req, res) => {
    const metrics = engine.train();
    res.json(metrics);
  });

  // Scan History Endpoints
  app.get('/api/history', (_req, res) => {
    res.json({ history: scanHistory });
  });

  app.patch('/api/history/:id', (req, res) => {
    const { feedback } = req.body || {};
    const entry = scanHistory.find((h) => h.id === req.params.id);
    if (!entry) {
      res.status(404).json({ error: 'History item not found.' });
      return;
    }
    if (feedback === 'correct' || feedback === 'incorrect' || feedback === null) {
      entry.feedback = feedback;
      saveHistory(scanHistory);
      res.json({ entry });
    } else {
      res.status(400).json({ error: 'Invalid feedback value.' });
    }
  });

  app.delete('/api/history/:id', (req, res) => {
    const initialLen = scanHistory.length;
    scanHistory = scanHistory.filter((h) => h.id !== req.params.id);
    if (scanHistory.length === initialLen) {
      res.status(404).json({ error: 'History item not found.' });
      return;
    }
    saveHistory(scanHistory);
    res.json({ deleted: true });
  });

  app.delete('/api/history', (_req, res) => {
    scanHistory = [];
    saveHistory(scanHistory);
    res.json({ cleared: true });
  });

  // Vite Dev Middleware or Static Production Serving
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MailGuard AI Spam Detection server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
