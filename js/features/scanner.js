/* =============================
   Barcode Scanner (ZXing Integration)
   — Primary: BrowserMultiFormatReader (fast, reliable for 0°/180°)
   — Fallback: MultiFormatReader snapshot at 90°/270° (for vertical labels)
   ============================= */

import {
  BrowserMultiFormatReader,
  MultiFormatReader,
  DecodeHintType,
  BarcodeFormat,
  RGBLuminanceSource,
  HybridBinarizer,
  BinaryBitmap,
  NotFoundException
} from 'https://cdn.jsdelivr.net/npm/@zxing/library@0.20.0/+esm';
import { el } from '../utils.js';

/* ---------- Readers & Hints ---------- */
const codeReader = new BrowserMultiFormatReader();

const fallbackHints = new Map();
fallbackHints.set(DecodeHintType.TRY_HARDER, true);
fallbackHints.set(DecodeHintType.POSSIBLE_FORMATS, [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.ITF,
  BarcodeFormat.QR_CODE
]);

const coreReader = new MultiFormatReader();
coreReader.setHints(fallbackHints);

/* ---------- State ---------- */
let currentStream = null;
let availableCameras = [];
let currentCameraIndex = 0;
let opening = false; // prevent overlapping opens
let preferredBackCameraId = null; // remembered back camera id after first successful environment capture
const BACK_CAM_KEY = 'gourmetapp_preferred_back_camera';
try { preferredBackCameraId = localStorage.getItem(BACK_CAM_KEY) || null; } catch(_) {}

let fallbackInterval = null;       // snapshot-based 90°/270° decode
let lastPrimaryHitAt = 0;          // throttle fallback when primary is hot
let lastFallbackRunAt = 0;         // throttle fallback frequency
let fallbackCooldownMs = 240;      // how often we try rotated snapshot (kept low-CPU)
let fallbackIdleBeforeMs = 350;    // how long to wait since last primary attempt

// One offscreen canvas for fallback decoding (keeps perf stable)
const offCanvas = document.createElement('canvas');
const offCtx = offCanvas.getContext('2d', { willReadFrequently: true });

/* ---------- Camera Focus Helper (unchanged) ---------- */
async function applyAdvancedCameraSettings(track) {
  // keep your existing focusing behavior if you had any external helper
  // here we just periodically call applyConstraints for continuous focus
  const interval = setInterval(async () => {
    try {
      await track.applyConstraints({
        advanced: [{ focusMode: 'continuous' }]
      });
    } catch (_) {}
  }, 1500);
  return interval;
}

/* ---------- Fallback decoding from snapshot ---------- */
function drawRotated(video, rotation) {
  const vw = Math.max(1, video.videoWidth || 1280);
  const vh = Math.max(1, video.videoHeight || 720);

  // modest downscale to keep CPU low
  const MAX_W = 1024;
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
      // 0°
      break;
  }
  offCtx.drawImage(video, 0, 0, sw, sh);
  offCtx.restore();
}

function decodeCanvas() {
  const { width, height } = offCanvas;
  if (!width || !height) return null;

  const img = offCtx.getImageData(0, 0, width, height);
  const lum = new RGBLuminanceSource(img.data, width, height);
  const bitmap = new BinaryBitmap(new HybridBinarizer(lum));
  try {
    const res = coreReader.decodeWithState(bitmap);
    return res?.getText?.() || null;
  } catch (e) {
    if (e instanceof NotFoundException) return null;
    return null;
  }
}

function tryFallbackAngles(video) {
  // Only 90° and 270° — that’s what fixes "vertical" bottle labels.
  drawRotated(video, 90);
  let text = decodeCanvas();
  if (text) return text;

  drawRotated(video, 270);
  text = decodeCanvas();
  if (text) return text;

  return null;
}

/* ---------- Original startCamera with minimal changes ---------- */
async function startCamera(onScanComplete) {
  if (opening) return; // guard
  opening = true;
  const vid = el('video');

  // iOS PWA autoplay friendliness
  try {
    vid.setAttribute('playsinline', 'true');
    vid.setAttribute('webkit-playsinline', 'true');
    vid.muted = true;
    vid.autoplay = true;
  } catch (_) {}

  let focusInterval = null;
  el('scanStatus').textContent = '📷 Initializing camera…';
  let triedBackSwitch = false;

  const buildVideoConstraints = () => {
    const base = {
      width: { ideal: 1920, max: 1920 },
      height: { ideal: 1080, max: 1080 },
      focusMode: 'continuous',
      advanced: [ { focusMode: 'continuous' }, { focusDistance: 0.5 } ]
    };
    if (preferredBackCameraId) {
      return { ...base, deviceId: { exact: preferredBackCameraId } };
    }
    // First attempt: let browser pick environment
    return { ...base, facingMode: { ideal: 'environment' } };
  };

  const runDecoder = async () => {
    try { codeReader.reset(); } catch(_) {}
    // Clean previous
    if (vid && vid.srcObject) {
      try { vid.srcObject.getTracks().forEach(t=>t.stop()); } catch(_) {}
      vid.srcObject = null;
    }

    // Validate stored preferred back camera still exists
    try {
      const devs = await navigator.mediaDevices.enumerateDevices();
      const vidsList = devs.filter(d=>d.kind==='videoinput');
      if (preferredBackCameraId && !vidsList.some(d=>d.deviceId === preferredBackCameraId)) {
        preferredBackCameraId = null;
        try { localStorage.removeItem(BACK_CAM_KEY); } catch(_) {}
      }
    } catch(_) {}

    const constraints = { video: buildVideoConstraints() };

    // --- Primary fast decoder (kept exactly as your working approach) ---
    try {
      await codeReader.decodeFromConstraints(constraints, vid, async (res, err) => {
        // ZXing calls this frequently; err is common when no code yet
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
          // Stored back camera no longer valid; clear and retry with environment
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
          // Retry minimal fallback (still prefer environment)
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

    // Wait for readiness
    await new Promise(r => {
      if (vid.readyState >= vid.HAVE_METADATA) return r();
      vid.addEventListener('loadedmetadata', () => r(), { once: true });
    });

    // iOS sometimes needs explicit play
    try { await vid.play(); } catch (_) {}

    currentStream = vid.srcObject;
    if (currentStream) {
      const track = currentStream.getVideoTracks()[0];
      if (track) {
        const settings = track.getSettings();
        // If we successfully got environment camera, remember it
        if (settings && settings.deviceId && settings.facingMode === 'environment' && !preferredBackCameraId) {
          preferredBackCameraId = settings.deviceId;
          try { localStorage.setItem(BACK_CAM_KEY, preferredBackCameraId); } catch(_) {}
        }
        // If we ended up on front/user camera and haven't switched yet, try to find environment and switch
        if (settings && settings.facingMode && settings.facingMode !== 'environment' && !triedBackSwitch) {
          triedBackSwitch = true;
          try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const vids = devices.filter(d=>d.kind==='videoinput');
            // Prefer labels containing environment/back/rear OR facingMode heuristic
            const env = vids.find(d => /back|rear|environment/i.test(d.label));
            if (env && env.deviceId && env.deviceId !== settings.deviceId) {
              preferredBackCameraId = env.deviceId;
              try { localStorage.setItem(BACK_CAM_KEY, preferredBackCameraId); } catch(_) {}
              // Restart decoder with explicit back camera
              try { codeReader.reset(); } catch(_) {}
              try { currentStream.getTracks().forEach(t=>t.stop()); } catch(_) {}
              vid.srcObject = null;
              el('scanStatus').textContent = '🔁 Switching to back camera…';
              await codeReader.decodeFromConstraints(
                { video: { deviceId: { exact: preferredBackCameraId },
                           width: { ideal:1920,max:1920 },
                           height:{ ideal:1080,max:1080 },
                           focusMode:'continuous',
                           advanced:[{focusMode:'continuous'},{focusDistance:0.5}] } },
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
              // Wait metadata again
              await new Promise(r2 => {
                if (vid.readyState >= vid.HAVE_METADATA) return r2();
                vid.addEventListener('loadedmetadata', () => r2(), { once: true });
              });
              currentStream = vid.srcObject;
            }
          } catch (switchErr) {
            console.log('Back camera switch attempt failed:', switchErr);
          }
        }
        // Apply advanced focusing
        if (currentStream) {
          try {
            const newTrack = currentStream.getVideoTracks()[0];
            if (newTrack) {
              const focusInterval = await applyAdvancedCameraSettings(newTrack);
              currentStream._focusInterval = focusInterval;
            }
          } catch(_) {}
        }
      }
    }

    // ---- Rotated fallback loop (low CPU) ----
    // Only runs if no primary hits recently, and only every ~240ms.
    stopFallbackLoop(); // ensure clean start
    fallbackInterval = setInterval(() => {
      const now = performance.now();
      if ((now - lastPrimaryHitAt) < fallbackIdleBeforeMs) return;      // primary is active
      if ((now - lastFallbackRunAt) < fallbackCooldownMs) return;       // throttle
      lastFallbackRunAt = now;

      const video = el('video');
      if (!video || !video.videoWidth || !video.videoHeight) return;
      if (!el('scannerModal').classList.contains('active')) return;

      const text = tryFallbackAngles(video);
      if (text) {
        el('scanStatus').textContent = `✅ ${text}`;
        stopScan();
        if (onScanComplete) onScanComplete(text);
      }
    }, 80); // small timer; internal throttles handle real cadence
  };

  try {
    await runDecoder();
    el('scanStatus').textContent = 'Point camera at barcode';
    setTimeout(() => {
      if (el('scannerModal').classList.contains('active') && el('video').srcObject) {
        const txt = el('scanStatus').textContent || '';
        if (txt.startsWith('📡')) {
          el('scanStatus').textContent = '⌛ Still scanning… Move closer, steady the camera, or improve lighting';
        }
      }
    }, 15000);
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

/* ---------- Public API (unchanged) ---------- */
export async function startScan(onScanComplete) {
  if (opening) return; // prevent double trigger
  el('scannerModal').classList.add('active');
  currentCameraIndex = 0;
  // fire without awaiting so modal paints instantly
  startCamera(onScanComplete);
}

export function stopScan() {
  try { codeReader.reset(); } catch(_) {}
  try { coreReader.reset(); } catch(_) {}
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
