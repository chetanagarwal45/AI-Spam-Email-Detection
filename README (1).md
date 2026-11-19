# MailGuard — AI Spam Email & SMS Detection Workbench

A full-stack Machine Learning web application for real-time **SMS and Email Spam Classification**, built around a leakage-free NLP pipeline featuring **Regex Text Normalization**, **Sublinear Uni-gram & Bi-gram TF-IDF Vectorization**, and comparative **Linear SVC**, **Multinomial Naive Bayes**, and **L2 Logistic Regression** estimators.

Developed as part of the **B.Tech Computer Science & Engineering** Practical Training at **InternPe** (`Chapter 5.1: Automated SMS and Email Spam Detection Pipeline`).

---

## Author & Academic Details

- **Developer:** Chetan Agarwal (`Enrollment No.: A20405224295`)
- **Institution:** Amity School of Engineering & Technology, Amity University Rajasthan, Jaipur
- **Academic Guide:** Dr. Sanjay Jain (Assistant Professor, Dept. of CSE)
- **Internship Organization:** InternPe (`15 June 2026 – 29 July 2026`)
- **Certificate Verification ID:** `IPI#82342`
- **Industry Mentor:** Ms. Krati Porwal
- **GitHub:** [github.com/chetanagarwal45](https://github.com/chetanagarwal45)

---

## Key Features

- **Live Email & SMS Scanner (`Auto-Classify` + Manual Analysis)**
  - Real-time keystroke regex telemetry (`urltoken`, `currencytoken`, `numtoken`) and debounced classification.
  - Side-by-side predictions across all three trained classifiers (**Linear SVC**, **Multinomial Naive Bayes**, **L2 Logistic Regression**).
  - Interactive **Decision Threshold** slider to explore the Precision vs. Recall trade-off.
  - Clickable token-level feature attributions highlighting spam-pushing and ham-pushing n-grams directly inside the message text.
  - Step-by-step **Pipeline Execution Trace** showing normalized text and TF-IDF matches.
- **Batch CSV & Multi-Message Triage**
  - Upload `.csv` / `.txt` files or paste multiple messages to classify an entire queue at once.
  - Filter by `All` / `Spam` / `Ham` and export results as a CSV file.
- **Model Benchmarks & Leakage-Free Validation**
  - Compare live 80/20 stratified holdout metrics against the **InternPe Report Table 5.1 Benchmark (n = 5,572)**.
  - Interactive SVG grouped bar charts, ROC-AUC curves, clickable Confusion Matrix quadrants, and learned Linear SVC global n-gram weights.
  - Automated **Verification & Leakage Audit** checks (Partition Disjointness, Zero Data Leakage Boundary, Baseline Sanity Benchmark, Deterministic `random_state = 42`).
- **Training Corpus Explorer & Live Retraining**
  - Search and filter labeled corpus records by label (`Spam` / `Ham`) and partition (`Train 80%` / `Holdout 20%`).
  - Add new labeled examples and retrain the TF-IDF vectorizer and all three classifiers live from the UI.
- **Inference Audit Log (Scan History)**
  - Persistent scan log with `Accurate` / `Flag Error` feedback controls, one-click re-inspection in the scanner, and RFC-4180 **Export CSV** support.

---

## Machine Learning Architecture

1. **Stratified 80 / 20 Split (`random_state = 42`)**
   - Splits labeled corpus records while preserving class balance before any statistical transformation.
2. **Stage 1 — Regex Text Normalization (`ml/spamPipeline.ts`)**
   - Lowercases text, replaces URLs with `urltoken`, emails with `emailtoken`, currency symbols (`$`, `£`, `€`, `₹`, `INR`, `USD`, `Rs`) with `currencytoken`, numeric/phone strings with `numtoken`, and strips non-alphabetic noise.
3. **Stage 2 — Sublinear TF-IDF Vectorizer (`ngram_range = (1, 2)`, `max_features = 5000`)**
   - Fitted **strictly on `X_train`** (zero data leakage) using sublinear term frequency scaling:
     $$\text{tf}_{\text{sub}}(t, d) = 1 + \log(\text{tf}(t, d))$$
   - Smooth IDF weighting and L2 unit-norm normalization.
4. **Stage 3 — Comparative Estimators**
   - **Class-Balanced Linear SVC:** L2-regularized hinge loss with Platt probability calibration.
   - **Multinomial Naive Bayes ($\alpha = 0.5$):** Lidstone-smoothed log-likelihood ratios.
   - **Logistic Regression (L2):** Binary cross-entropy optimization with balanced class weights.

### Report Benchmark Summary (Table 5.1, n = 5,572)

| Classifier Architecture | Precision | Recall | F1-Score | Engineering Observation |
| :--- | :---: | :---: | :---: | :--- |
| Multinomial Naive Bayes ($\alpha = 0.5$) | 99.3% | 88.6% | 93.6% | Ultra-low latency baseline |
| Logistic Regression (L2) | 98.6% | 85.2% | 91.4% | Calibrated log-odds probabilities |
| **Linear SVC (N-gram 1–2)** | **99.1%** | **93.3%** | **96.1%** | **Optimal precision–recall balance** |

---

## Tech Stack

- **Frontend:** React 19, TypeScript, Tailwind CSS v4, Vite, Lucide Icons, Custom SVG Charts
- **Backend:** Node.js (v22+), Express, TypeScript (`server.ts`)
- **ML Engine:** Native TypeScript NLP pipeline (`ml/spamPipeline.ts`, `ml/corpus.ts`)

---

## Getting Started (Local Development)

### Prerequisites
- **Node.js v22+** and **npm**

### Installation & Running

```bash
# 1. Install dependencies
npm install

# 2. Start the full-stack development server (Express API + Vite frontend on port 3000)
npm run dev
```

Open `http://localhost:3000` in your browser.

### Production Build & Start

```bash
# Type-check TypeScript
npm run lint

# Build frontend assets into dist/
npm run build

# Run production server (uses process.env.PORT or 3000)
NODE_ENV=production npm start
```

---

## API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Server health and trained vocabulary statistics |
| `GET` | `/api/presets` | Curated phishing, SMS scam, and legitimate email presets |
| `POST` | `/api/predict` | Classify a single email/SMS with 3-model scores & token attributions |
| `POST` | `/api/batch` | Classify an array of messages in batch |
| `GET` | `/api/metrics` | Holdout evaluation metrics, ROC curves, confusion matrices & audit checks |
| `GET` | `/api/dataset` | Retrieve labeled corpus with `train` / `test` split tags |
| `POST` | `/api/dataset` | Add a new labeled record and trigger live retraining |
| `DELETE` | `/api/dataset/:id` | Remove a user-submitted record and retrain |
| `POST` | `/api/train` | Manually re-run stratified training and validation |
| `GET` | `/api/history` | Fetch persisted scan history |
| `PATCH` | `/api/history/:id` | Record `correct` / `incorrect` verification feedback |
| `DELETE` | `/api/history` | Clear scan history |

---

## Project Structure

```text
├── ml/
│   ├── corpus.ts          # Labeled SMS & email dataset + demonstration presets
│   └── spamPipeline.ts    # Regex normalizer, Sublinear TF-IDF & 3 classifiers
├── src/
│   ├── components/
│   │   ├── BatchTriageView.tsx
│   │   ├── Charts.tsx
│   │   ├── CorpusDatasetView.tsx
│   │   ├── HistoryView.tsx
│   │   ├── MetricsBenchmarksView.tsx
│   │   └── ScannerView.tsx
│   ├── App.tsx
│   ├── index.css
│   ├── main.tsx
│   └── types.ts
├── index.html
├── package.json
├── server.ts              # Express server & Vite middleware integration
└── vite.config.ts
```

---

## Deploying for Free (Render)

1. Push this repository to GitHub.
2. Create a new **Web Service** on [Render](https://render.com) connected to your repository.
3. Configure:
   - **Runtime:** `Node`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - **Environment Variable:** `NODE_ENV=production`
