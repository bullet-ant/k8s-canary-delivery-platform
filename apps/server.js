/**
 * Canary demo web app — serves static frontend + /api/request endpoint.
 *
 * Deploy with VARIANT=BLUE (stable/v1) or VARIANT=YELLOW (canary/v2).
 * The K8s deployments set this env var so each pod returns its own color.
 */

const express = require('express');
const path = require('path');
const { register, Counter, Histogram, collectDefaultMetrics } = require('prom-client');

const app = express();
const PORT = process.env.PORT || 5000;
const VARIANT = process.env.VARIANT || 'BLUE';
const VERSION = process.env.VERSION || 'v1';

// --- Prometheus metrics ---
collectDefaultMetrics({ labels: { variant: VARIANT } });

const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'path', 'status', 'variant'],
});

const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'path', 'variant'],
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
app.get('/api/request', (_req, res) => {
  const end = httpRequestDuration.startTimer({ method: 'GET', path: '/api/request', variant: VARIANT });
  requestCounter += 1;
  res.json({
    variant: VARIANT,
    version: VERSION,
    pod: process.env.HOSTNAME || 'local',
    timestamp: new Date().toISOString(),
    request_id: requestCounter,
  });
  const status = String(res.statusCode);
  httpRequestsTotal.inc({ method: 'GET', path: '/api/request', status, variant: VARIANT });
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
  console.log(`Canary demo [${VERSION}/${VARIANT}] listening on http://localhost:${PORT}`);
});
