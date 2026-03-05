/**
 * Canary demo web app — serves static frontend + /api/request endpoint.
 *
 * Deploy with VARIANT=BLUE (stable/v1) or VARIANT=YELLOW (canary/v2).
 * The K8s deployments set this env var so each pod returns its own color.
 */

const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;
const VARIANT = process.env.VARIANT || 'BLUE';
const VERSION = process.env.VERSION || 'v1';

let requestCounter = 0;

// --- Static frontend ---
app.use(express.static(path.join(__dirname, 'public')));

// --- API endpoint ---
app.get('/api/request', (_req, res) => {
  requestCounter += 1;
  res.json({
    variant: VARIANT,
    version: VERSION,
    pod: process.env.HOSTNAME || 'local',
    timestamp: new Date().toISOString(),
    request_id: requestCounter,
  });
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
