/**
 * Canary demo frontend
 * ---------------------
 * Sends requests at a configurable rate (default 10/s) to /api/request,
 * renders a flowing bubble stream, and updates a live summary.
 */

(function () {
  'use strict';

  // ── Config ───────────────────────────────────────────────────────
  const DEFAULT_RPS = 10;
  const MAX_BUBBLES = 60;          // cap visible DOM bubbles
  const BUBBLE_DRIFT_MS = 3000;    // matches CSS animation duration
  const BUBBLE_SIZE = 18;
  const STREAM_PADDING = 8;        // px padding inside stream box

  // ── DOM refs ─────────────────────────────────────────────────────
  const streamEl       = document.getElementById('bubble-stream');
  const countBlueEl    = document.getElementById('count-blue');
  const countYellowEl  = document.getElementById('count-yellow');
  const countTotalEl   = document.getElementById('count-total');
  const pctBlueEl      = document.getElementById('pct-blue');
  const pctYellowEl    = document.getElementById('pct-yellow');
  const barBlueEl      = document.getElementById('bar-blue');
  const barYellowEl    = document.getElementById('bar-yellow');
  const barLabelBlueEl = document.getElementById('bar-label-blue');
  const barLabelYellowEl = document.getElementById('bar-label-yellow');
  const btnToggle      = document.getElementById('btn-toggle');
  const rateSelect     = document.getElementById('rate-select');

  // ── State ────────────────────────────────────────────────────────
  let totalBlue = 0;
  let totalYellow = 0;
  let running = true;
  let rps = DEFAULT_RPS;
  let intervalId = null;
  let bubbleCount = 0;

  // ── Summary update ───────────────────────────────────────────────
  function updateSummary() {
    const total = totalBlue + totalYellow;
    const pB = total === 0 ? 0 : Math.round((totalBlue / total) * 100);
    const pY = total === 0 ? 0 : 100 - pB;

    countBlueEl.textContent   = totalBlue;
    countYellowEl.textContent = totalYellow;
    countTotalEl.textContent  = total;
    pctBlueEl.textContent     = pB + '%';
    pctYellowEl.textContent   = pY + '%';

    barBlueEl.style.width   = (total === 0 ? 50 : pB) + '%';
    barYellowEl.style.width = (total === 0 ? 50 : pY) + '%';
    barLabelBlueEl.textContent   = 'BLUE ' + pB + '%';
    barLabelYellowEl.textContent = 'YELLOW ' + pY + '%';
  }

  // ── Bubble management ────────────────────────────────────────────
  function addBubble(variant) {
    // Enforce cap — remove oldest if needed
    while (streamEl.children.length >= MAX_BUBBLES) {
      streamEl.removeChild(streamEl.firstChild);
    }

    const streamH = streamEl.clientHeight;
    const maxTop = streamH - BUBBLE_SIZE - STREAM_PADDING;
    const minTop = STREAM_PADDING;
    const top = Math.random() * (maxTop - minTop) + minTop;

    const el = document.createElement('div');
    el.className = 'bubble bubble--' + variant.toLowerCase();
    el.style.top = top + 'px';
    el.style.right = '-' + BUBBLE_SIZE + 'px';  // start just outside right edge

    // Use JS-driven transform so width is always correct
    const streamW = streamEl.clientWidth;
    el.style.animationDuration = BUBBLE_DRIFT_MS + 'ms';
    el.style.setProperty('--drift-distance', (streamW + BUBBLE_SIZE * 2) + 'px');

    streamEl.appendChild(el);

    // Self-cleanup after animation
    el.addEventListener('animationend', function () { el.remove(); });
  }

  // ── Request tick ─────────────────────────────────────────────────
  function tick() {
    fetch('/api/request')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var v = data.variant;
        if (v === 'BLUE')        totalBlue++;
        else if (v === 'YELLOW') totalYellow++;
        else return;
        addBubble(v);
        updateSummary();
      })
      .catch(function () { /* silently skip network errors */ });
  }

  // ── Interval control ────────────────────────────────────────────
  function startLoop() {
    stopLoop();
    intervalId = setInterval(tick, 1000 / rps);
  }

  function stopLoop() {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
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

  // ── Boot ─────────────────────────────────────────────────────────
  updateSummary();
  startLoop();
})();
