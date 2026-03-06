/**
 * Canary demo frontend
 * ---------------------
 * Sends requests at a configurable rate (default 10/s) to /api/request,
 * renders a flowing bubble stream, and updates a live summary.
 *
 * Variant names and colors are fully dynamic — works with any variant
 * (BLUE, YELLOW, GREEN, PURPLE, …) without code changes.
 */

(function () {
  'use strict';

  // ── Config ───────────────────────────────────────────────────────
  const DEFAULT_RPS = 10;
  const MAX_BUBBLES = 60;
  const BUBBLE_DRIFT_MS = 3000;
  const BUBBLE_SIZE = 18;
  const STREAM_PADDING = 8;
  const WINDOW_MS = 60 * 1000;

  // Palette cycle for unknown variants. Each entry: { fill, glow }.
  const PALETTE = [
    { fill: '#1976d2', glow: '#42a5f5' },   // blue
    { fill: '#f9a825', glow: '#fdd835' },   // yellow
    { fill: '#2e7d32', glow: '#66bb6a' },   // green
    { fill: '#6a1b9a', glow: '#ba68c8' },   // purple
    { fill: '#00838f', glow: '#4dd0e1' },   // teal
    { fill: '#bf360c', glow: '#ff7043' },   // orange
  ];

  // ── State ────────────────────────────────────────────────────────
  let requests = [];        // { variant, isError, ts }
  let running  = true;
  let rps      = DEFAULT_RPS;
  let intervalId = null;

  // Ordered list of variant names in first-seen order.
  // Index 0 = "stable" (first to respond), index 1 = "canary", etc.
  let knownVariants = [];

  function colorFor(variant) {
    var idx = knownVariants.indexOf(variant);
    if (idx === -1) idx = 0;
    return PALETTE[idx % PALETTE.length];
  }

  // ── DOM refs ─────────────────────────────────────────────────────
  const streamEl      = document.getElementById('bubble-stream');
  const legendEl      = document.getElementById('legend-items');
  const statCardsEl   = document.getElementById('stat-cards');
  const proportionBar = document.getElementById('proportion-bar');
  const barLabelsEl   = document.getElementById('bar-labels');
  const canarBadgeEl  = document.getElementById('canary-badge');
  const btnToggle          = document.getElementById('btn-toggle');
  const rateSelect         = document.getElementById('rate-select');
  const canaryErrorSelect  = document.getElementById('canary-error-select');

  // ── Register a new variant (first-seen) ─────────────────────────
  function registerVariant(variant) {
    if (knownVariants.indexOf(variant) !== -1) return;
    knownVariants.push(variant);
    rebuildStaticUI();
  }

  // ── Rebuild legend, stat cards, bar, error badge ─────────────────
  function rebuildStaticUI() {
    // Legend: variant dots + always-present ERROR dot
    legendEl.innerHTML = '';
    knownVariants.forEach(function (v) {
      var c = colorFor(v);
      var dot = document.createElement('span');
      dot.className = 'legend-dot';
      dot.style.background = c.glow;
      dot.style.boxShadow = '0 0 6px ' + c.fill;
      legendEl.appendChild(dot);
      legendEl.appendChild(document.createTextNode(' ' + v + ' '));
    });
    var errDot = document.createElement('span');
    errDot.className = 'legend-dot legend-error';
    legendEl.appendChild(errDot);
    legendEl.appendChild(document.createTextNode(' ERROR'));

    // Stat cards (slot 0, 1, … then total)
    statCardsEl.innerHTML = '';
    knownVariants.forEach(function (v, i) {
      var c = colorFor(v);
      var card = document.createElement('div');
      card.className = 'stat-card';
      card.id = 'stat-card-' + i;
      var label = document.createElement('span');
      label.className = 'stat-label';
      label.textContent = v;
      var countEl = document.createElement('span');
      countEl.className = 'stat-value';
      countEl.id = 'count-' + i;
      countEl.style.color = c.glow;
      countEl.textContent = '0';
      var pctEl = document.createElement('span');
      pctEl.className = 'stat-pct';
      pctEl.id = 'pct-' + i;
      pctEl.style.color = c.glow;
      pctEl.textContent = '0%';
      card.appendChild(label);
      card.appendChild(countEl);
      card.appendChild(pctEl);
      // Error count only for the canary slot (index 1+)
      if (i >= 1) {
        var errEl = document.createElement('span');
        errEl.className = 'stat-err';
        errEl.id = 'err-' + i;
        errEl.textContent = '0 errors';
        card.appendChild(errEl);
      }
      statCardsEl.appendChild(card);
    });
    // Total card always last
    var totalCard = document.createElement('div');
    totalCard.className = 'stat-card stat-total';
    totalCard.innerHTML = '<span class="stat-label">TOTAL</span>' +
      '<span id="count-total" class="stat-value">0</span>' +
      '<span class="stat-pct">&nbsp;</span>';
    statCardsEl.appendChild(totalCard);

    // Proportion bar segments
    proportionBar.innerHTML = '';
    knownVariants.forEach(function (v, i) {
      var c = colorFor(v);
      var seg = document.createElement('div');
      seg.className = 'bar-seg';
      seg.id = 'bar-seg-' + i;
      seg.style.background = 'linear-gradient(90deg, ' + c.fill + ', ' + c.glow + ')';
      seg.style.width = (knownVariants.length === 0 ? 100 : Math.floor(100 / knownVariants.length)) + '%';
      proportionBar.appendChild(seg);
    });

    // Bar labels
    barLabelsEl.innerHTML = '';
    knownVariants.forEach(function (v, i) {
      var c = colorFor(v);
      var lbl = document.createElement('span');
      lbl.className = 'bar-lbl';
      lbl.id = 'bar-lbl-' + i;
      lbl.style.color = c.glow;
      lbl.textContent = v + ' 0%';
      barLabelsEl.appendChild(lbl);
    });

    // Error injection badge — always the latest (last-seen) version, which is the current canary
    var canaryVariant = knownVariants.length > 0 ? knownVariants[knownVariants.length - 1] : 'CANARY';
    var cc = colorFor(canaryVariant);
    var badgeDot = document.createElement('span');
    badgeDot.className = 'legend-dot';
    badgeDot.style.background = cc.glow;
    badgeDot.style.boxShadow = '0 0 6px ' + cc.fill;
    canarBadgeEl.innerHTML = '';
    canarBadgeEl.style.color = cc.glow;
    canarBadgeEl.style.background = cc.fill + '14';  // ~8% opacity
    canarBadgeEl.style.border = '1px solid ' + cc.fill + '40';  // ~25% opacity
    canarBadgeEl.appendChild(badgeDot);
    canarBadgeEl.appendChild(document.createTextNode(' ' + canaryVariant));
  }

  // ── Summary update ───────────────────────────────────────────────
  function updateSummary() {
    var now = Date.now();
    var win = requests.filter(function (r) { return now - r.ts < WINDOW_MS; });
    var total = win.length;

    // Re-bind count-total (may have been recreated by rebuildStaticUI)
    var ctEl = document.getElementById('count-total');
    if (ctEl) ctEl.textContent = total;

    knownVariants.forEach(function (v, i) {
      var count = win.filter(function (r) { return r.variant === v; }).length;
      var pct   = total === 0 ? 0 : Math.round((count / total) * 100);
      var errCount = win.filter(function (r) { return r.variant === v && r.isError; }).length;

      var cEl   = document.getElementById('count-' + i);
      var pEl   = document.getElementById('pct-' + i);
      var segEl = document.getElementById('bar-seg-' + i);
      var lblEl = document.getElementById('bar-lbl-' + i);
      var errEl = document.getElementById('err-' + i);

      if (cEl)   cEl.textContent = count;
      if (pEl)   pEl.textContent = pct + '%';
      if (segEl) segEl.style.width = (total === 0 ? Math.floor(100 / knownVariants.length) : pct) + '%';
      if (lblEl) lblEl.textContent = v + ' ' + pct + '%';
      if (errEl) errEl.textContent = errCount + ' error' + (errCount === 1 ? '' : 's');
    });
  }

  // ── Bubble management ────────────────────────────────────────────
  function addBubble(variant, isError) {
    while (streamEl.children.length >= MAX_BUBBLES) {
      streamEl.removeChild(streamEl.firstChild);
    }

    var c = colorFor(variant);
    var streamH = streamEl.clientHeight;
    var top = Math.random() * (streamH - BUBBLE_SIZE - STREAM_PADDING * 2) + STREAM_PADDING;

    var el = document.createElement('div');
    el.className = 'bubble' + (isError ? ' bubble--error' : '');
    el.style.top = top + 'px';
    el.style.right = '-' + BUBBLE_SIZE + 'px';
    el.style.background = 'radial-gradient(circle at 35% 35%, ' + c.glow + ', ' + c.fill + ')';
    if (!isError) {
      el.style.boxShadow = '0 0 10px ' + c.fill + '99';
    }

    var streamW = streamEl.clientWidth;
    el.style.animationDuration = BUBBLE_DRIFT_MS + 'ms';
    el.style.setProperty('--drift-distance', (streamW + BUBBLE_SIZE * 2) + 'px');

    streamEl.appendChild(el);
    el.addEventListener('animationend', function () { el.remove(); });
  }

  // ── Request tick ─────────────────────────────────────────────────
  function tick() {
    var cRate = canaryErrorSelect.value;
    var url = '/api/request?canaryErrorRate=' + cRate;

    fetch(url)
      .then(function (res) {
        return res.json().then(function (data) { return { ok: res.ok, data: data }; });
      })
      .then(function (result) {
        var v = result.data.version;
        if (!v) return;
        registerVariant(v);
        var isError = result.data.error || !result.ok;
        requests.push({ variant: v, isError: isError, ts: Date.now() });
        addBubble(v, isError);
        updateSummary();
      })
      .catch(function () { /* silently skip network errors */ });
  }

  // ── Interval control ─────────────────────────────────────────────
  function startLoop() {
    stopLoop();
    intervalId = setInterval(tick, 1000 / rps);
  }

  function stopLoop() {
    if (intervalId !== null) { clearInterval(intervalId); intervalId = null; }
  }

  // ── Controls ─────────────────────────────────────────────────────
  btnToggle.addEventListener('click', function () {
    running = !running;
    btnToggle.textContent = running ? 'Pause' : 'Resume';
    if (running) startLoop(); else stopLoop();
  });

  rateSelect.addEventListener('change', function () {
    rps = parseInt(rateSelect.value, 10) || DEFAULT_RPS;
    if (running) startLoop();
  });

  // ── Prune old requests every 10s ─────────────────────────────────
  setInterval(function () {
    var cutoff = Date.now() - WINDOW_MS;
    requests = requests.filter(function (r) { return r.ts >= cutoff; });
    updateSummary();
  }, 10000);

  // ── Boot ─────────────────────────────────────────────────────────
  updateSummary();
  startLoop();
})();
