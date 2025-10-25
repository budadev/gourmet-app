/* =============================
   Barcode Scanner (ZXing Integration)
   — Primary: BrowserMultiFormatReader (fast, stable for 0°/180°)
   — Fallback: MultiFormatReader snapshots at 90°/270° with multi-band/multi-binarizer
   ============================= */

import {
  BrowserMultiFormatReader,
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

/* ---------- Readers & Hints ---------- */
const codeReader = new BrowserMultiFormatReader();

const hintMap = new Map();
hintMap.set(DecodeHintType.TRY_HARDER, true);
// broaden a bit; EAN-13 is typical for wine
hintMap.set(DecodeHintType.POSSIBLE_FORMATS, [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.ITF,
  BarcodeFormat.CODE_93,
  BarcodeFormat.CODABAR,
  BarcodeFormat.QR_CODE
]);

/* ---------- State ---------- */
let currentStream = null;
let currentCameraIndex = 0;
let opening = false;
let preferredBackCameraId = null;
const BACK_CAM_KEY = 'gourmetapp_preferred_back_camera';
try { preferredBackCameraId = localStorage.getItem(BACK_CAM_KEY) || null; } catch(_) {}

let fallbackInterval = null;
let lastPrimaryHitAt = 0;
let lastFallbackRunAt = 0;
let fallbackCooldownMs = 120;   // max ~8fps for fallback sampling
let fallbackIdleBeforeMs = 220; // wait this long since last primary hit
let fallbackRotationPhase = 90; // 90 -> 270 -> 90 ...

// Offscreen canvas reused
const offCanvas = document.createElement('canvas');
const offCtx = offCanvas.getContext('2d', { willReadFrequently: true });
offCtx.imageSmoothingEnabled = false;

/* ---------- Camera helpers ---------- */
async function maybeEnableTorch(track) {
  try {
    const caps = track.getCapabilities?.();
    if (caps && 'torch' in caps && caps.torch) {
      await track.applyConstraints({ advanced: [{ torch: true }] });
      return true;
    }
  } catch (_) {}
  return false;
}

async function applyAdvancedCameraSettings(track) {
  const interval = setInterval(async () => {
    try {
      await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
    } catch (_) {}
  }, 1500);
  return interval;
}

/* ---------- Fallback: draw & decode at 90° / 270° ---------- */
function drawRotated(video, rotation) {
  const vw = Math.max(1, video.videoWidth || 1280);
  const vh = Math.max(1, video.videoHeight || 720);

  // keep good detail; iOS handles this fine
  const MAX_W = 1440;
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
      break;
  }
  offCtx.drawImage(video, 0, 0, sw, sh);
  offCtx.restore();
}

function bandROIs5() {
  const cw = offCanvas.width;
  const ch = offCanvas.height;

  // 5 horizontal bands tuned for 1D barcodes
  const pad = Math.floor(ch * 0.04);
  const bandH = Math.floor(ch * 0.22);
  const midY = Math.floor((ch - bandH) / 2);

  return [
    { x: 0, y: Math.max(pad, midY - Math.floor(bandH * 1.2)), w: cw, h: bandH },          // upper-mid
    { x: 0, y: Math.max(pad, midY - Math.floor(bandH * 0.4)), w: cw, h: bandH },          // near-center top
    { x: 0, y: midY,                                           w: cw, h: bandH },          // center
    { x: 0, y: Math.min(ch - bandH - pad, midY + Math.floor(bandH * 0.4)), w: cw, h: bandH }, // near-center bottom
    { x: 0, y: Math.min(ch - bandH - pad, midY + Math.floor(bandH * 1.2)), w: cw, h: bandH }  // lower-mid
  ];
}

function buildLuminance(roi, inverted) {
  const { x, y, w, h } = roi;
  if (w <= 0 || h <= 0) return null;
  const img = offCtx.getImageData(x, y, w, h);
  const base = new RGBLuminanceSource(img.data, w, h);
  return inverted ? new InvertedLuminanceSource(base) : base;
}

function tryDecodeWith(lum, useGlobal) {
  const reader = new MultiFormatReader();  // fresh instance per attempt → clean state
  reader.setHints(hintMap);
  const bin = useGlobal ? new GlobalHistogramBinarizer(lum) : new HybridBinarizer(lum);
  const bmp = new BinaryBitmap(bin);
  try {
    const res = reader.decodeWithState(bmp);
    return res?.getText?.() || null;
  } catch (e) {
    if (e instanceof NotFoundException) return null;
    return null;
  }
}

function tryBandsThenFull(rotation) {
  drawRotated(el('video'), rotation);

  // 1) five bands: Hybrid → Global → Inverted Hybrid
  const bands = bandROIs5();
  for (let i = 0; i < bands.length; i++) {
    const roi = bands[i];

    // Hybrid
    let lum = buildLuminance(roi, false);
    if (lum) {
      let t = tryDecodeWith(lum, false);
      if (t) return t;
    }

    // Global
    lum = buildLuminance(roi, false);
    if (lum) {
      let t = tryDecodeWith(lum, true);
      if (t) return t;
    }

    // Inverted Hybrid
    lum = buildLuminance(roi, true);
    if (lum) {
      let t = tryDecodeWith(lum, false);
      if (t) return t;
    }
  }

  // 2) Cheap full-frame as last try
  const full = { x: 0, y: 0, w: offCanvas.width, h: offCanvas.height };
  let lum = buildLuminance(full, false);
  if (lum) {
    let t = tryDecodeWith(lum, false);
    if (t) return t;
  }
  lum = buildLuminance(full, true);
  if (lum) {
    let t = tryDecodeWith(lum, false);
    if (t) return t;
  }

  return null;
}

/* ---------- Your original camera start with minimal changes ---------- */
async function startCamera(onScanComplete) {
  if (opening) return;
  opening = true;
  const vid = el('video');

  try {
    vid.setAttribute('playsinline', 'true');
    vid.setAttribute('webkit-playsinline', 'true');
    vid.muted = true;
    vid.autoplay = true;
  } catch (_) {}

  el('scanStatus').textContent = '📷 Initializing camera…';
  let triedBackSwitch = false;

  const buildVideoConstraints = () => {
    const base = {
      width: { ideal: 1920, max: 1920 },
      height: { ideal: 1080, max: 1080 },
      focusMode: 'continuous',
      advanced: [{ focusMode: 'continuous' }, { focusDistance: 0.5 }]
    };
    if (preferredBackCameraId) return { ...base, deviceId: { exact: preferredBackCameraId } };
    return { ...base, facingMode: { ideal: 'environment' } };
  };

  const runDecoder = async () => {
    try { codeReader.reset(); } catch(_) {}
    if (vid && vid.srcObject) {
      try { vid.srcObject.getTracks().forEach(t=>t.stop()); } catch(_) {}
      vid.srcObject = null;
    }

    try {
      const devs = await navigator.mediaDevices.enumerateDevices();
      const vidsList = devs.filter(d=>d.kind==='videoinput');
      if (preferredBackCameraId && !vidsList.some(d=>d.deviceId === preferredBackCameraId)) {
        preferredBackCameraId = null;
        try { localStorage.removeItem(BACK_CAM_KEY); } catch(_) {}
      }
    } catch(_) {}

    const constraints = { video: buildVideoConstraints() };

    try {
      await codeReader.decodeFromConstraints(constraints, vid, async (res) => {
        if (res) {
          lastPrimaryHitAt = performance.now();
          const code = res.getText();
          el('scanStatus').textContent = `✅ ${code}`;
          stopScan();
          if (onScanComplete) await onScanComplete(code);
        }
      });
    } catch (err) {
      if (err.name === 'OverconstrainedError' || err.name === 'ConstraintNotSatisfiedError') {
        if (preferredBackCameraId) {
          preferredBackCameraId = null;
          try { localStorage.removeItem(BACK_CAM_KEY); } catch(_) {}
          el('scanStatus').textContent = '🔄 Back camera changed, retrying…';
          await codeReader.decodeFromConstraints(
            { video: { facingMode: { ideal: 'environment' } } },
            vid,
            async (res) => {
              if (res) {
                lastPrimaryHitAt = performance.now();
                const code = res.getText();
                el('scanStatus').textContent = `✅ ${code}`;
                stopScan();
                if (onScanComplete) await onScanComplete(code);
              }
            }
          );
        } else {
          el('scanStatus').textContent = '🔄 Adjusting camera settings…';
          await codeReader.decodeFromConstraints(
            { video: { facingMode: { ideal: 'environment' } } },
            vid,
            async (res) => {
              if (res) {
                lastPrimaryHitAt = performance.now();
                const code = res.getText();
                el('scanStatus').textContent = `✅ ${code}`;
                stopScan();
                if (onScanComplete) await onScanComplete(code);
              }
            }
          );
        }
      } else {
        throw err;
      }
    }

    await new Promise(r => {
      if (vid.readyState >= vid.HAVE_METADATA) return r();
      vid.addEventListener('loadedmetadata', () => r(), { once: true });
    });

    try { await vid.play(); } catch (_) {}

    currentStream = vid.srcObject;
    if (currentStream) {
      const track = currentStream.getVideoTracks()[0];
      if (track) {
        const settings = track.getSettings?.() || {};
        if (settings.deviceId && settings.facingMode === 'environment' && !preferredBackCameraId) {
          preferredBackCameraId = settings.deviceId;
          try { localStorage.setItem(BACK_CAM_KEY, preferredBackCameraId); } catch(_) {}
        }
        // Try torch (best effort; ignore failures)
        maybeEnableTorch(track);
        // Continuous focus assist
        try {
          const f = await applyAdvancedCameraSettings(track);
          currentStream._focusInterval = f;
        } catch(_) {}
      }
    }

    // ---- Rotated fallback loop (alternating 90°/270°) ----
    stopFallbackLoop();
    fallbackRotationPhase = 90;
    fallbackInterval = setInterval(() => {
      const now = performance.now();
      if ((now - lastPrimaryHitAt) < fallbackIdleBeforeMs) return; // primary likely active
      if ((now - lastFallbackRunAt) < fallbackCooldownMs) return;  // throttle
      lastFallbackRunAt = now;

      const video = el('video');
      if (!video || !video.videoWidth || !video.videoHeight) return;
      if (!el('scannerModal').classList.contains('active')) return;

      const rot = fallbackRotationPhase;
      fallbackRotationPhase = (fallbackRotationPhase === 90) ? 270 : 90;

      const text = tryBandsThenFull(rot);
      if (text) {
        el('scanStatus').textContent = `✅ ${text}`;
        stopScan();
        if (onScanComplete) onScanComplete(text);
      }
    }, 80);
  };

  try {
    await runDecoder();
    el('scanStatus').textContent = 'Point camera at barcode';
  } catch(e) {
    let msg;
    switch(e.name) {
      case 'NotAllowedError': msg = '❌ Camera permission denied. Enable it in Settings > Safari > Camera to scan.'; break;
      case 'NotFoundError': msg = '📷 No camera available on this device.'; break;
      case 'NotReadableError':
      case 'TrackStartError': msg = '⚠️ Camera is busy (used by another app). Close it and retry.'; break;
      default: msg = 'Camera error: ' + e.message;
    }
    el('scanStatus').textContent = msg;
    setTimeout(stopScan, 4500);
  } finally {
    opening = false;
  }
}

/* ---------- Public API ---------- */
export async function startScan(onScanComplete) {
  if (opening) return;
  el('scannerModal').classList.add('active');
  currentCameraIndex = 0;
  startCamera(onScanComplete);
}

export function stopScan() {
  try { codeReader.reset(); } catch(_) {}
  stopFallbackLoop();

  const vid = el('video');
  if (vid && vid.srcObject) {
    try { vid.srcObject.getTracks().forEach(t=>t.stop()); } catch(_) {}
    vid.srcObject = null;
  }
  if (currentStream) {
    if (currentStream._focusInterval) {
      clearInterval(currentStream._focusInterval);
      currentStream._focusInterval = null;
    }
    try { currentStream.getTracks().forEach(t=>t.stop()); } catch(_) {}
    currentStream = null;
  }
  el('scannerModal').classList.remove('active');
  el('scanStatus').textContent = '';
  opening = false;
}

export async function startScanForInput(onScanComplete) {
  await startScan(onScanComplete);
}

/* ---------- Utils ---------- */
function stopFallbackLoop() {
  if (fallbackInterval) {
    clearInterval(fallbackInterval);
    fallbackInterval = null;
  }
}
