/* =============================
   Barcode Scanner (ZXing Integration) - Any-Angle, iPhone-Ready
   ============================= */

import {
  BrowserMultiFormatReader,
  DecodeHintType,
  BarcodeFormat
} from 'https://cdn.jsdelivr.net/npm/@zxing/library@0.20.0/+esm';
import { el } from '../utils.js';

/* ---------- ZXing hints (more robust on iPhone) ---------- */
const hints = new Map();
hints.set(DecodeHintType.TRY_HARDER, true);
hints.set(DecodeHintType.ALSO_INVERTED, true); // catch white-on-black / odd exposure cases
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

const codeReader = new BrowserMultiFormatReader(hints);

/* ---------- State ---------- */
let currentStream = null;
let availableCameras = [];
let currentCameraIndex = 0;

let onScanCallback = null;
let hasResult = false;
let closeDelayTimer = null;

let rafId = null;
let fallbackStarted = false;
let fallbackCanvas = null;
let fallbackCtx = null;

/* serialize decode calls so video + canvas don’t race on iOS */
let decodingNow = false;

/* ---------- Tuning ---------- */
const FALLBACK_DELAY_MS = 600; // wait before starting rotation attempts
// fast angles every frame; diagonals staggered to avoid heavy CPU load
const ROTATION_TIERS = [
  [0, 90, 180, 270],
  [15, 105, 195, 285],
  [30, 120, 210, 300],
  [45, 135, 225, 315]
];

/* ---------- Utilities ---------- */
async function getAvailableCameras() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const videoDevices = devices.filter(d => d.kind === 'videoinput');
  // prefer back/environment cameras first
  videoDevices.sort((a, b) => {
    const aBack = /back|rear|environment/i.test(a.label);
    const bBack = /back|rear|environment/i.test(b.label);
    if (aBack && !bBack) return -1;
    if (!aBack && bBack) return 1;
    return 0;
  });
  return videoDevices;
}

function resetState() {
  hasResult = false;
  fallbackStarted = false;
  if (closeDelayTimer) clearTimeout(closeDelayTimer);
  closeDelayTimer = null;
}

function isValidCode(text) {
  if (!text) return false;
  const t = text.trim();
  // accept common linear barcode lengths or any 6+ chars (QR / Code128, etc.)
  if (/^[0-9]{8,14}$/.test(t)) return true;
  if (t.length >= 6) return true;
  return false;
}

function handleSuccessfulScan(code) {
  if (hasResult) return;
  if (!isValidCode(code)) return;
  hasResult = true;
  try {
    el('scanHint').textContent = `Scanned: ${code}`;
  } catch {}
  Promise.resolve(onScanCallback ? onScanCallback(code) : null)
      .finally(() => {
        closeDelayTimer = setTimeout(() => stopScan(), 400); // brief visual confirmation
      });
}

/* ---------- Fallback: rotated canvas decoding ---------- */
function startFallbackLoop(video) {
  if (fallbackStarted || hasResult) return;
  fallbackStarted = true;
  if (!fallbackCanvas) {
    fallbackCanvas = document.createElement('canvas');
    fallbackCtx = fallbackCanvas.getContext('2d', { willReadFrequently: true });
  }

  let frameCount = 0;

  const loop = () => {
    if (hasResult || !fallbackStarted) return;

    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) { rafId = requestAnimationFrame(loop); return; }

    // downscale large frames to keep decode fast (~<=1280px on long edge)
    const scale = Math.min(1280 / Math.max(vw, vh), 1);
    const w = Math.round(vw * scale), h = Math.round(vh * scale);

    const tier0 = ROTATION_TIERS[0];
    const tier1 = ROTATION_TIERS[1];
    const tier2 = ROTATION_TIERS[2];
    const tier3 = ROTATION_TIERS[3];

    const tryAngles = [
      ...tier0,
      ...(frameCount % 3 === 0 ? tier1 : []),
      ...(frameCount % 3 === 0 ? tier2 : []),
      ...(frameCount % 6 === 0 ? tier3 : [])
    ];

    for (const deg of tryAngles) {
      if (hasResult) break;

      // set canvas size for current rotation
      const rotIsStraight = (deg === 0 || deg === 180);
      fallbackCanvas.width = rotIsStraight ? w : h;
      fallbackCanvas.height = rotIsStraight ? h : w;

      fallbackCtx.save();
      fallbackCtx.translate(fallbackCanvas.width / 2, fallbackCanvas.height / 2);
      fallbackCtx.rotate(deg * Math.PI / 180);
      // draw centered
      fallbackCtx.drawImage(video, -w / 2, -h / 2, w, h);
      fallbackCtx.restore();

      try {
        if (decodingNow) continue;
        decodingNow = true;
        const res = codeReader.decodeFromCanvas(fallbackCanvas);
        decodingNow = false;
        if (res) {
          handleSuccessfulScan(res.getText());
          break;
        }
      } catch {
        decodingNow = false;
      }
    }

    frameCount++;
    if (!hasResult) rafId = requestAnimationFrame(loop);
  };

  rafId = requestAnimationFrame(loop);
}

/* ---------- Real-time decode from video, plus fallback ---------- */
function beginContinuousDecode(video, deviceId) {
  try {
    codeReader.decodeFromVideoDevice(deviceId || undefined, video, (result /*, err */) => {
      if (decodingNow) return; // let canvas fallbacks run if busy
      if (result) handleSuccessfulScan(result.getText());
    });
  } catch (e) {
    console.warn('Base decode error:', e);
  }
  // schedule rotated attempts if still no result
  setTimeout(() => { if (!hasResult) startFallbackLoop(video); }, FALLBACK_DELAY_MS);
}

/* ---------- Camera lifecycle ---------- */
async function startCamera(onScanComplete) {
  const vid = el('preview');
  onScanCallback = onScanComplete;

  // iOS Safari: ensure inline playback (no fullscreen), keep frames flowing
  vid.setAttribute('playsinline', 'true');
  vid.setAttribute('muted', 'true'); // harmless for capture

  try {
    availableCameras = await getAvailableCameras();
    const deviceId = availableCameras[currentCameraIndex]?.deviceId;

    if (currentStream) currentStream.getTracks().forEach(t => t.stop());

    currentStream = await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        facingMode: deviceId ? undefined : { ideal: 'environment' },
        width: { ideal: 1920 },   // better detail for 1D codes
        height: { ideal: 1080 }
      },
      audio: false
    });

    vid.srcObject = currentStream;
    await vid.play();

    try { el('scanHint').textContent = ''; } catch {}
    resetState();
    beginContinuousDecode(vid, deviceId);
  } catch (e) {
    try { el('scanHint').textContent = 'Camera error: ' + e.message; } catch {}
    setTimeout(stopScan, 2500);
  }
}

/* ---------- Public API ---------- */
export async function startScan(onScanComplete) {
  el('scannerModal').classList.add('active');
  currentCameraIndex = 0;
  await startCamera(onScanComplete);
}

export function stopScan() {
  try { codeReader.reset(); } catch {}
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  if (currentStream) { currentStream.getTracks().forEach(t => t.stop()); currentStream = null; }

  el('scannerModal').classList.remove('active');
  try { el('scanHint').textContent = ''; } catch {}
  onScanCallback = null;
  resetState();
  fallbackCanvas = null; fallbackCtx = null;
}

/* same as startScan, kept for compatibility with your code */
export async function startScanForInput(onScanComplete) {
  el('scannerModal').classList.add('active');
  currentCameraIndex = 0;
  await startCamera(onScanComplete);
}

/* Optional: Torch control for iPhone (bind to a button) */
export async function toggleTorch(on) {
  try {
    const track = currentStream?.getVideoTracks?.()[0];
    const caps = track?.getCapabilities?.();
    if (caps?.torch) {
      await track.applyConstraints({ advanced: [{ torch: !!on }] });
      return true;
    }
  } catch {}
  return false;
}

/* Optional: camera switcher if you expose a UI control */
export async function switchCamera(next = 1, onScanComplete = onScanCallback) {
  if (!availableCameras.length) return false;
  currentCameraIndex = (currentCameraIndex + next + availableCameras.length) % availableCameras.length;
  // restart pipeline with new device
  try { codeReader.reset(); } catch {}
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  await startCamera(onScanComplete);
  return true;
}
