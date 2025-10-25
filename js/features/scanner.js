/* =============================
   Barcode Scanner (ZXing Integration)
   - Primary fast loop (no hints) for 0°/180°  ✅
   - Lightweight periodic hinted probe (TRY_HARDER) for 90°/270° ✅
   ============================= */

import {
  BrowserMultiFormatReader,
  DecodeHintType
} from 'https://cdn.jsdelivr.net/npm/@zxing/library@0.20.0/+esm';
import { el } from '../utils.js';

/* ---------- Readers ---------- */
// Primary reader: original behavior (no hints) — keeps normal scan fast & stable
const primaryReader = new BrowserMultiFormatReader();

// Rotated-probe reader: TRY_HARDER — only used as a short "decode once" probe
const hintedHints = new Map();
hintedHints.set(DecodeHintType.TRY_HARDER, true);
// You can optionally restrict formats if you like:
// hintedHints.set(DecodeHintType.POSSIBLE_FORMATS, [ ... ]);
const hintedReader = new BrowserMultiFormatReader(hintedHints);

/* ---------- State ---------- */
let currentStream = null;
let opening = false;
let preferredBackCameraId = null;
const BACK_CAM_KEY = 'gourmetapp_preferred_back_camera';
try { preferredBackCameraId = localStorage.getItem(BACK_CAM_KEY) || null; } catch(_) {}

let focusInterval = null;

// Rotated-probe loop controls
let probeTimer = null;
let probeBusy = false;
let lastPrimaryHitAt = 0;

/* ---------- Camera helpers ---------- */
async function applyAdvancedCameraSettings(track) {
  // keep continuous focus if available (best-effort, safe)
  const interval = setInterval(async () => {
    try { await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch (_) {}
  }, 1500);
  return interval;
}

function buildVideoConstraints() {
  const base = {
    width:  { ideal: 1920, max: 1920 },
    height: { ideal: 1080, max: 1080 },
    focusMode: 'continuous',
    advanced: [{ focusMode: 'continuous' }, { focusDistance: 0.5 }]
  };
  if (preferredBackCameraId) return { ...base, deviceId: { exact: preferredBackCameraId } };
  return { ...base, facingMode: { ideal: 'environment' } };
}

/* ---------- Primary fast loop (your original approach) ---------- */
async function startPrimaryLoop(vid, onScanComplete) {
  // Reset & clean
  try { primaryReader.reset(); } catch(_) {}
  if (vid && vid.srcObject) {
    try { vid.srcObject.getTracks().forEach(t => t.stop()); } catch(_) {}
    vid.srcObject = null;
  }

  // Validate stored back camera
  try {
    const devs = await navigator.mediaDevices.enumerateDevices();
    const vidsList = devs.filter(d => d.kind === 'videoinput');
    if (preferredBackCameraId && !vidsList.some(d => d.deviceId === preferredBackCameraId)) {
      preferredBackCameraId = null;
      try { localStorage.removeItem(BACK_CAM_KEY); } catch(_) {}
    }
  } catch(_) {}

  const constraints = { video: buildVideoConstraints() };

  // Start continuous decode with primary reader (no hints)
  await primaryReader.decodeFromConstraints(constraints, vid, async (res /*, err */) => {
    if (res) {
      lastPrimaryHitAt = performance.now();
      const code = res.getText();
      el('scanStatus').textContent = `✅ ${code}`;
      stopScan(); // will cleanup both loops
      if (onScanComplete) await onScanComplete(code);
    }
  });

  // Wait for video to be ready
  await new Promise(r => {
    if (vid.readyState >= vid.HAVE_METADATA && vid.videoWidth) return r();
    vid.addEventListener('loadedmetadata', () => r(), { once: true });
  });

  currentStream = vid.srcObject;
  if (currentStream) {
    const track = currentStream.getVideoTracks()[0];
    if (track) {
      const s = track.getSettings?.() || {};
      if (s.deviceId && s.facingMode === 'environment' && !preferredBackCameraId) {
        preferredBackCameraId = s.deviceId;
        try { localStorage.setItem(BACK_CAM_KEY, preferredBackCameraId); } catch(_) {}
      }
      try {
        focusInterval = await applyAdvancedCameraSettings(track);
        currentStream._focusInterval = focusInterval;
      } catch(_) {}
    }
  }
}

/* ---------- Rotated “hinted” probe (decode once, throttled) ---------- */
/** Try a single hinted decode pass, but bail out if it takes too long */
function decodeOnceWithTimeout(reader, vid, ms = 120) {
  const p = reader.decodeOnceFromVideoElement(vid);
  const t = new Promise((_, rej) => setTimeout(() => rej(new Error('probe-timeout')), ms));
  return Promise.race([p, t]);
}

async function runRotatedProbe(vid, onScanComplete) {
  if (probeBusy) return;
  // If primary recently hit (or is very active), skip probing to save CPU
  const now = performance.now();
  if (now - lastPrimaryHitAt < 250) return;

  probeBusy = true;
  try {
    // iOS autoplay friendliness
    try {
      vid.setAttribute('playsinline', 'true');
      vid.setAttribute('webkit-playsinline', 'true');
      vid.muted = true;
      vid.autoplay = true;
      if (vid.paused) await vid.play().catch(() => {});
    } catch (_) {}

    // Do a fast hinted "decode once". This is where rotated labels worked for you.
    const res = await decodeOnceWithTimeout(hintedReader, vid, 140);
    if (res && res.getText) {
      const code = res.getText();
      el('scanStatus').textContent = `✅ ${code}`;
      stopScan();
      if (onScanComplete) await onScanComplete(code);
      return;
    }
  } catch (_) {
    // ignore errors/timeouts — it’s a probe
  } finally {
    // Important: reset the hintedReader so it doesn’t hold state between probes
    try { hintedReader.reset(); } catch(_) {}
    probeBusy = false;
  }
}

function startProbeLoop(vid, onScanComplete) {
  stopProbeLoop();
  // Short interval; each probe is internally timed out & skips if primary is hot
  probeTimer = setInterval(() => {
    if (!el('scannerModal').classList.contains('active')) return;
    if (!vid || !vid.videoWidth) return;
    runRotatedProbe(vid, onScanComplete);
  }, 160);
}

function stopProbeLoop() {
  if (probeTimer) clearInterval(probeTimer);
  probeTimer = null;
  probeBusy = false;
  try { hintedReader.reset(); } catch(_) {}
}

/* ---------- Public API ---------- */
export async function startScan(onScanComplete) {
  if (opening) return;
  opening = true;

  const vid = el('video');
  el('scannerModal').classList.add('active');
  el('scanStatus').textContent = '📷 Initializing camera…';

  // iOS PWA video flags
  try {
    vid.setAttribute('playsinline', 'true');
    vid.setAttribute('webkit-playsinline', 'true');
    vid.muted = true;
    vid.autoplay = true;
  } catch (_) {}

  try {
    await startPrimaryLoop(vid, onScanComplete);
    el('scanStatus').textContent = 'Point camera at barcode';

    // Start the lightweight rotated-probe loop
    startProbeLoop(vid, onScanComplete);
  } catch (e) {
    let msg;
    switch (e?.name) {
      case 'OverconstrainedError':
      case 'ConstraintNotSatisfiedError':
        msg = '⚙️ Camera constraints not satisfied. Retrying might help.'; break;
      case 'NotAllowedError':   msg = '❌ Camera permission denied. Enable it in Settings > Safari > Camera.'; break;
      case 'NotFoundError':     msg = '📷 No camera available on this device.'; break;
      case 'NotReadableError':
      case 'TrackStartError':   msg = '⚠️ Camera is busy (another app may be using it).'; break;
      default:                  msg = 'Camera error: ' + (e?.message || e);
    }
    el('scanStatus').textContent = msg;
    setTimeout(stopScan, 4500);
  } finally {
    opening = false;
  }
}

export function stopScan() {
  // Stop both readers/loops
  try { primaryReader.reset(); } catch(_) {}
  stopProbeLoop();

  const vid = el('video');
  if (vid && vid.srcObject) {
    try { vid.srcObject.getTracks().forEach(t => t.stop()); } catch(_) {}
    vid.srcObject = null;
  }
  if (currentStream) {
    if (currentStream._focusInterval) {
      clearInterval(currentStream._focusInterval);
      currentStream._focusInterval = null;
    }
    try { currentStream.getTracks().forEach(t => t.stop()); } catch(_) {}
    currentStream = null;
  }
  el('scannerModal').classList.remove('active');
  el('scanStatus').textContent = '';
  opening = false;
}

export async function startScanForInput(onScanComplete) {
  await startScan(onScanComplete);
}
