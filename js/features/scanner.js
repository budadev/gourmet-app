/* =============================
   Barcode Scanner (ZXing Integration) - Unified Any-Angle Decoding
   ============================= */

import { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } from 'https://cdn.jsdelivr.net/npm/@zxing/library@0.20.0/+esm';
import { el } from '../utils.js';

// Configure decode hints to improve robustness and orientation tolerance
const hints = new Map();
hints.set(DecodeHintType.TRY_HARDER, true);
// Limit to common linear + QR formats for performance
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
let currentStream = null;
let availableCameras = [];
let currentCameraIndex = 0;
let manualLoopActive = false;
let manualLoopTimeout = null;
let onScanCallback = null;
let hasResult = false; // prevent double fires
let closeDelayTimer = null;
let frameInterval = null;
const FRAME_DELAY_MS = 180; // capture cadence
const FALLBACK_DELAY_MS = 800; // wait before starting rotation attempts
let fallbackStarted = false;
let rafId = null;
let fallbackCanvas = null;
let fallbackCtx = null;
const ROTATIONS = [0, 90, 180, 270];

async function getAvailableCameras() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const videoDevices = devices.filter(d => d.kind === 'videoinput');
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
  // Accept common barcode lengths or any longer alphanumeric (QR / Code128 etc.)
  if (/^[0-9]{8,14}$/.test(t)) return true;
  if (t.length >= 6) return true;
  return false;
}

function handleSuccessfulScan(code) {
  if (hasResult) return;
  if (!isValidCode(code)) return;
  hasResult = true;
  el('scanHint').textContent = `Scanned: ${code}`;
  Promise.resolve(onScanCallback ? onScanCallback(code) : null)
    .finally(() => {
      closeDelayTimer = setTimeout(() => stopScan(), 400); // brief visual confirmation
    });
}

function startFallbackLoop(video) {
  if (fallbackStarted || hasResult) return;
  fallbackStarted = true;
  if (!fallbackCanvas) {
    fallbackCanvas = document.createElement('canvas');
    fallbackCtx = fallbackCanvas.getContext('2d');
  }
  const rotations = [0, 90, 180, 270];
  const loop = () => {
    if (hasResult || !fallbackStarted) return;
    const w = video.videoWidth; const h = video.videoHeight;
    if (!w || !h) { rafId = requestAnimationFrame(loop); return; }
    rotations.forEach(deg => {
      if (hasResult) return;
      if (deg === 0 || deg === 180){fallbackCanvas.width = w;fallbackCanvas.height = h;} else {fallbackCanvas.width = h;fallbackCanvas.height = w;}
      fallbackCtx.save();
      fallbackCtx.translate(fallbackCanvas.width/2, fallbackCanvas.height/2);
      fallbackCtx.rotate(deg * Math.PI/180);
      fallbackCtx.drawImage(video, -w/2, -h/2, w, h);
      fallbackCtx.restore();
      try {
        const res = codeReader.decodeFromCanvas(fallbackCanvas);
        if (res) handleSuccessfulScan(res.getText());
      } catch(_){}
    });
    if (!hasResult) rafId = requestAnimationFrame(loop);
  };
  rafId = requestAnimationFrame(loop);
}

function beginContinuousDecode(video, deviceId) {
  // Base real-time decode (vertical generally works best here)
  try {
    codeReader.decodeFromVideoDevice(deviceId || undefined, video, (result, err) => {
      if (result) handleSuccessfulScan(result.getText());
    });
  } catch(e){ console.warn('Base decode error:', e); }
  // Schedule fallback rotated attempts if still no result
  setTimeout(() => { if (!hasResult) startFallbackLoop(video); }, FALLBACK_DELAY_MS);
}

async function startCamera(onScanComplete) {
  const vid = el('preview');
  onScanCallback = onScanComplete;
  try {
    availableCameras = await getAvailableCameras();
    const deviceId = availableCameras[currentCameraIndex]?.deviceId;
    if (currentStream) currentStream.getTracks().forEach(t => t.stop());
    currentStream = await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        facingMode: deviceId ? undefined : { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    });
    vid.srcObject = currentStream;
    await vid.play();
    el('scanHint').textContent = '';
    resetState();
    beginContinuousDecode(vid, deviceId);
  } catch (e) {
    el('scanHint').textContent = 'Camera error: ' + e.message;
    setTimeout(stopScan, 2500);
  }
}

export async function startScan(onScanComplete) {
  el('scannerModal').classList.add('active');
  currentCameraIndex = 0;
  manualLoopActive = false; // legacy flag unused now
  await startCamera(onScanComplete);
}

export function stopScan() {
  try { codeReader.reset(); } catch(_){}
  if (frameInterval){clearInterval(frameInterval);frameInterval=null;} // legacy interval
  if (rafId){cancelAnimationFrame(rafId);rafId=null;}
  if (currentStream){currentStream.getTracks().forEach(t=>t.stop());currentStream=null;}
  manualLoopActive = false; // legacy
  el('scannerModal').classList.remove('active');
  el('scanHint').textContent='';
  onScanCallback=null;
  resetState();
  fallbackCanvas = null; fallbackCtx = null;
}

export async function startScanForInput(onScanComplete) {
  el('scannerModal').classList.add('active');
  currentCameraIndex = 0;
  manualLoopActive = false;
  await startCamera(onScanComplete);
}
