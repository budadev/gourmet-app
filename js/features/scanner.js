/* =============================
   Barcode Scanner — Any-Angle (iOS PWA-safe)
   Uses ZXing MultiFormatReader on canvas pixels with multiple strategies.
   ============================= */

import {
  MultiFormatReader,
  DecodeHintType,
  BarcodeFormat,
  RGBLuminanceSource,
  HybridBinarizer,
  GlobalHistogramBinarizer,
  BinaryBitmap,
  InvertedLuminanceSource,
  NotFoundException
} from 'https://cdn.jsdelivr.net/npm/@zxing/library@0.20.0/+esm';
import { el } from '../utils.js';

/* ---------- Hints ---------- */
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

/* Use core reader (more reliable for manual BinaryBitmap decoding) */
const coreReader = new MultiFormatReader();
coreReader.setHints(hints);

/* ---------- State ---------- */
let opening = false;
let currentStream = null;
let rafId = null;
let loopActive = false;
let preferredBackCameraId = null;
const BACK_CAM_KEY = 'gourmetapp_preferred_back_camera';

/* Offscreen canvas to avoid CSS/layout affecting decode */
const offCanvas = document.createElement('canvas');
const offCtx = offCanvas.getContext('2d', { willReadFrequently: true });

try { preferredBackCameraId = localStorage.getItem(BACK_CAM_KEY) || null; } catch (_) {}

/* ---------- Helpers ---------- */
function status(msg) { el('scanStatus').textContent = msg || ''; }
function openModal() { el('scannerModal').classList.add('active'); }
function closeModal() { el('scannerModal').classList.remove('active'); }

function getConstraints() {
  const base = {
    width: { ideal: 1280, max: 1920 },
    height: { ideal: 720, max: 1080 },
    advanced: [{ focusMode: 'continuous' }]
  };
  if (preferredBackCameraId) {
    return { video: { ...base, deviceId: { exact: preferredBackCameraId } } };
  }
  return { video: { ...base, facingMode: { ideal: 'environment' } } };
}

function ensureReadyVideo(video) {
  try {
    video.setAttribute('playsinline', 'true');
    video.setAttribute('webkit-playsinline', 'true');
    video.muted = true;
    video.autoplay = true;
  } catch (_) {}
}

/* Draw video → offCanvas with rotation; allow optional ROI crop box */
function drawToCanvas(video, rotation = 0, roi = null) {
  const vw = Math.max(1, video.videoWidth || 1280);
  const vh = Math.max(1, video.videoHeight || 720);

  // Downscale for speed if camera is huge
  const MAX_W = 1280;
  const scale = Math.min(1, MAX_W / vw);
  const sw = Math.round(vw * scale);
  const sh = Math.round(vh * scale);

  if (rotation === 90 || rotation === 270) {
    offCanvas.width = sh;
    offCanvas.height = sw;
  } else {
    offCanvas.width = sw;
    offCanvas.height = sh;
  }

  offCtx.save();
  switch (rotation) {
    case 90:
      offCtx.translate(offCanvas.width, 0);
      offCtx.rotate(Math.PI / 2);
      break;
    case 180:
      offCtx.translate(offCanvas.width, offCanvas.height);
      offCtx.rotate(Math.PI);
      break;
    case 270:
      offCtx.translate(0, offCanvas.height);
      offCtx.rotate(3 * Math.PI / 2);
      break;
    default:
      // 0° no transform
      break;
  }

  // Draw whole frame scaled
  offCtx.drawImage(video, 0, 0, sw, sh);
  offCtx.restore();

  if (!roi) return { x: 0, y: 0, w: offCanvas.width, h: offCanvas.height };

  // Apply ROI clipping for subsequent getImageData
  // ROI = { x, y, w, h } in canvas coordinates
  return roi;
}

/* Build luminance source from a region of offCanvas (with optional invert) */
function buildLuminance({ x, y, w, h }, invert = false) {
  const img = offCtx.getImageData(x, y, w, h);
  const base = new RGBLuminanceSource(img.data, w, h);
  return invert ? new InvertedLuminanceSource(base) : base;
}

/* Try multiple decoding strategies quickly */
function tryDecode(roi, binarizer = 'hybrid', invert = false) {
  const lum = buildLuminance(roi, invert);
  const bin =
    binarizer === 'global'
      ? new GlobalHistogramBinarizer(lum)
      : new HybridBinarizer(lum);

  const bitmap = new BinaryBitmap(bin);
  try {
    // decodeWithState allows reusing hints set on reader
    const res = coreReader.decodeWithState(bitmap);
    return res?.getText?.() || null;
  } catch (e) {
    if (e instanceof NotFoundException) return null;
    return null;
  }
}

/* Central horizontal band ROI (good for 1D barcodes) */
function makeHorizontalBandROI() {
  const cw = offCanvas.width;
  const ch = offCanvas.height;
  const bandH = Math.floor(ch * 0.38); // 38% tall center band
  const y = Math.floor((ch - bandH) / 2);
  return { x: 0, y, w: cw, h: bandH };
}

/* Try angles & strategies: full → band, hybrid → global, normal → inverted */
function decodeAnyAngle(video) {
  const rotations = [0, 90, 270, 180];
  for (const rot of rotations) {
    // Full frame first
    const fullROI = drawToCanvas(video, rot, null);

    // 1) Hybrid binarizer, normal
    let t = tryDecode(fullROI, 'hybrid', false);
    if (t) return t;

    // 2) Hybrid, inverted (helps with glare/contrast)
    t = tryDecode(fullROI, 'hybrid', true);
    if (t) return t;

    // 3) Global histogram, normal
    t = tryDecode(fullROI, 'global', false);
    if (t) return t;

    // 4) Central band, hybrid normal (favors 1D on bottles)
    const bandROI = makeHorizontalBandROI();
    t = tryDecode(bandROI, 'hybrid', false);
    if (t) return t;

    // 5) Central band, hybrid inverted
    t = tryDecode(bandROI, 'hybrid', true);
    if (t) return t;

    // 6) Central band, global normal
    t = tryDecode(bandROI, 'global', false);
    if (t) return t;
  }
  return null;
}

/* ---------- Public API ---------- */
export async function stopScan() {
  loopActive = false;
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  try { coreReader.reset(); } catch (_) {}
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
  ensureReadyVideo(video);

  // Clean previous
  try { coreReader.reset(); } catch (_) {}
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
      try {
        stream = await navigator.mediaDevices.getUserMedia(getConstraints());
      } catch (ee) {
        status(cameraErrorToMessage(ee));
        opening = false;
        setTimeout(() => stopScan(), 3000);
        return;
      }
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
  await new Promise((r) => {
    if (video.readyState >= 2 && video.videoWidth) return r();
    video.addEventListener('loadedmetadata', () => r(), { once: true });
  });

  // iOS sometimes needs explicit play()
  try { await video.play(); } catch (_) {}

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

  // Decode loop (rAF + throttle)
  const TICK_MS = 120;
  let lastTick = 0;

  const tick = (ts) => {
    if (!loopActive) return;
    rafId = requestAnimationFrame(tick);

    if (ts - lastTick < TICK_MS) return;
    lastTick = ts;

    const result = decodeAnyAngle(video);
    if (result) {
      status(`✅ ${result}`);
      stopScan().then(async () => {
        try { await onScanComplete?.(result); } catch (_) {}
      });
    }
  };
  rafId = requestAnimationFrame(tick);

  // Back button
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

/* ---------- Errors ---------- */
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

/* Back-compat export */
export async function startScanForInput(onScanComplete) {
  return startScan(onScanComplete);
}
