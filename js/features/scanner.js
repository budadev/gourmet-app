/* =============================
   Barcode Scanner (ZXing Integration) — Any-Angle Decoding
   Works in iOS Safari PWA (Add to Home Screen)
   ============================= */

import {
  BrowserMultiFormatReader,
  DecodeHintType,
  BarcodeFormat
} from 'https://cdn.jsdelivr.net/npm/@zxing/library@0.20.0/+esm';
import { el } from '../utils.js';

/** ZXing setup with stronger hints */
const hints = new Map();
hints.set(DecodeHintType.TRY_HARDER, true);
hints.set(DecodeHintType.POSSIBLE_FORMATS, [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.ITF,
  BarcodeFormat.QR_CODE
]);

const reader = new BrowserMultiFormatReader(hints);

/** State */
let opening = false;
let currentStream = null;
let rafId = null;
let loopActive = false;
let preferredBackCameraId = null;
const BACK_CAM_KEY = 'gourmetapp_preferred_back_camera';

try { preferredBackCameraId = localStorage.getItem(BACK_CAM_KEY) || null; } catch (_) {}

/** Helpers */
function status(msg) { el('scanStatus').textContent = msg || ''; }

function openModal() {
  el('scannerModal').classList.add('active');
}
function closeModal() {
  el('scannerModal').classList.remove('active');
}

function getConstraints() {
  const base = {
    width: { ideal: 1920, max: 1920 },
    height: { ideal: 1080, max: 1080 },
    advanced: [{ focusMode: 'continuous' }]
  };
  if (preferredBackCameraId) {
    return { video: { ...base, deviceId: { exact: preferredBackCameraId } } };
  }
  return { video: { ...base, facingMode: { ideal: 'environment' } } };
}

/**
 * Draw the current video frame to the canvas with an optional rotation.
 * @param {HTMLVideoElement} video
 * @param {HTMLCanvasElement} canvas
 * @param {0|90|180|270} rotation
 */
function drawFrame(video, canvas, rotation = 0) {
  const vw = video.videoWidth || 1280;
  const vh = video.videoHeight || 720;

  if (rotation === 90 || rotation === 270) {
    canvas.width = vh;
    canvas.height = vw;
  } else {
    canvas.width = vw;
    canvas.height = vh;
  }

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.save();
  switch (rotation) {
    case 90:
      ctx.translate(canvas.width, 0);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(video, 0, 0, vw, vh);
      break;
    case 180:
      ctx.translate(canvas.width, canvas.height);
      ctx.rotate(Math.PI);
      ctx.drawImage(video, 0, 0, vw, vh);
      break;
    case 270:
      ctx.translate(0, canvas.height);
      ctx.rotate(3 * Math.PI / 2);
      ctx.drawImage(video, 0, 0, vw, vh);
      break;
    default:
      ctx.drawImage(video, 0, 0, vw, vh);
  }
  ctx.restore();
}

/**
 * Try to decode from the provided canvas. Returns text or null.
 */
async function tryDecode(canvas) {
  try {
    const res = await reader.decodeFromCanvas(canvas);
    return res?.getText?.() || null;
  } catch (_) {
    return null;
  }
}

/**
 * Attempt decode at angles 0°, 90°, 180°, 270°.
 * iOS + ZXing sometimes fail for “vertical” codes; rotating the bitmap fixes it.
 */
async function decodeAnyAngle(video, canvas) {
  // Fast path: try 0° first
  drawFrame(video, canvas, 0);
  let text = await tryDecode(canvas);
  if (text) return text;

  // Then 90°, 270° (common for wine bottles), then 180°
  drawFrame(video, canvas, 90);
  text = await tryDecode(canvas);
  if (text) return text;

  drawFrame(video, canvas, 270);
  text = await tryDecode(canvas);
  if (text) return text;

  drawFrame(video, canvas, 180);
  text = await tryDecode(canvas);
  return text;
}

/** Stop everything (camera + loop) */
export async function stopScan() {
  loopActive = false;
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  try { reader.reset(); } catch (_) {}
  if (currentStream) {
    try { currentStream.getTracks().forEach(t => t.stop()); } catch (_) {}
    currentStream = null;
  }
  status('');
  closeModal();
  opening = false;
}

/**
 * Start scan modal & camera, decode continuously, and resolve via callback.
 * @param {(code:string) => (void|Promise<void>)} onScanComplete
 */
export async function startScan(onScanComplete) {
  if (opening) return;
  opening = true;

  openModal();
  status('📷 Initializing camera…');

  const video = el('video');
  const canvas = el('canvas');

  // Clean previous
  try { reader.reset(); } catch (_) {}
  if (video.srcObject) {
    try { video.srcObject.getTracks().forEach(t => t.stop()); } catch (_) {}
    video.srcObject = null;
  }

  // Start camera
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia(getConstraints());
  } catch (e) {
    // fallback if stored back camera id invalid
    if (preferredBackCameraId) {
      preferredBackCameraId = null;
      try { localStorage.removeItem(BACK_CAM_KEY); } catch (_) {}
      stream = await navigator.mediaDevices.getUserMedia(getConstraints());
    } else {
      status(cameraErrorToMessage(e));
      opening = false;
      setTimeout(() => stopScan(), 3000);
      return;
    }
  }

  currentStream = stream;
  video.srcObject = stream;

  // Wait for dimensions to be ready
  await new Promise(r => {
    if (video.readyState >= 2 && video.videoWidth) return r();
    video.addEventListener('loadedmetadata', () => r(), { once: true });
  });

  // Remember environment deviceId when known
  try {
    const track = stream.getVideoTracks()[0];
    const s = track?.getSettings?.() || {};
    if (s.deviceId && s.facingMode === 'environment' && !preferredBackCameraId) {
      preferredBackCameraId = s.deviceId;
      try { localStorage.setItem(BACK_CAM_KEY, preferredBackCameraId); } catch (_) {}
    }
  } catch (_) {}

  status('Point camera at barcode');
  loopActive = true;

  // Decode loop (throttled by rAF + inner delay)
  const TICK_MS = 140; // balance between speed and CPU
  let lastTick = 0;

  const tick = async (ts) => {
    if (!loopActive) return;
    rafId = requestAnimationFrame(tick);

    if (ts - lastTick < TICK_MS) return;
    lastTick = ts;

    // Try decode at multiple angles
    const result = await decodeAnyAngle(video, canvas);
    if (result) {
      status(`✅ ${result}`);
      await stopScan();
      try { await onScanComplete?.(result); } catch (_) {}
    }
  };
  rafId = requestAnimationFrame(tick);

  // Wire up back button (escape hatch)
  const backBtn = document.getElementById('backScanBtn');
  if (backBtn && !backBtn.__wiredClose) {
    backBtn.__wiredClose = true;
    backBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await stopScan();
    }, { passive: false });
  }

  opening = false;
}

/** Map camera errors to friendly messages */
function cameraErrorToMessage(e) {
  switch (e?.name) {
    case 'NotAllowedError':
      return '❌ Camera permission denied. Enable it in Settings > Safari > Camera to scan.';
    case 'NotFoundError':
      return '📷 No camera available on this device.';
    case 'NotReadableError':
    case 'TrackStartError':
      return '⚠️ Camera is busy (used by another app). Close it and retry.';
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return '⚙️ Camera constraints not satisfied. Retrying might help.';
    default:
      return 'Camera error: ' + (e?.message || e);
  }
}

// Keep a compatibility export for previous code
export async function startScanForInput(onScanComplete) {
  return startScan(onScanComplete);
}
