/**
 * Canary demo web app — serves static frontend + /api/request endpoint.
 *
 * Deploy with:
 *   VERSION=v1  ROLE=stable  (stable pods)
 *   VERSION=v2  ROLE=canary  (canary pods)
 *
 * VERSION is the identity shown in the UI and used as a Prometheus label.
 * ROLE controls error-injection routing (stable vs canary slider).
 * Argo Rollouts injects ROLE via pod labels (Downward API).
 */

const express = require('express');
const path = require('path');
const { register, Counter, Histogram, collectDefaultMetrics } = require('prom-client');

const app = express();
const PORT = process.env.PORT || 5000;
const VERSION = process.env.VERSION || 'v2';
const ROLE    = process.env.ROLE    || 'canary';  // 'stable' | 'canary'

// --- Prometheus metrics ---
collectDefaultMetrics({ labels: { version: VERSION } });

const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'path', 'status', 'version'],
});

const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'path', 'version'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
});

let requestCounter = 0;

// --- Metrics endpoint (before other routes) ---
app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// --- Static frontend ---
app.use(express.static(path.join(__dirname, 'public')));

// --- API endpoint ---
app.get('/api/request', (req, res) => {
  const end = httpRequestDuration.startTimer({ method: 'GET', path: '/api/request', version: VERSION });
  requestCounter += 1;

  const errorRate = ROLE === 'stable'
    ? parseFloat(req.query.stableErrorRate) || 0
    : parseFloat(req.query.canaryErrorRate) || 0;
  const isError = Math.random() * 100 < errorRate;
  const status = isError ? 500 : 200;

  res.status(status).json({
    version: VERSION,
    role: ROLE,
    pod: process.env.HOSTNAME || 'local',
    timestamp: new Date().toISOString(),
    request_id: requestCounter,
    error: isError,
  });
  httpRequestsTotal.inc({ method: 'GET', path: '/api/request', status: String(status), version: VERSION });
  end();
});

// --- Health check ---
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// --- SPA fallback ---
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Canary demo [${VERSION}/${ROLE}] listening on http://localhost:${PORT}`);
});
