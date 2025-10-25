/* =============================
   Barcode Scanner (Orientation-Agnostic Fast Start Version)
   ============================= */

import { BrowserMultiFormatReader, BarcodeFormat, DecodeHintType, MultiFormatReader, RGBLuminanceSource, BinaryBitmap, HybridBinarizer, Exception } from 'https://cdn.jsdelivr.net/npm/@zxing/library@0.20.0/+esm';
import { el } from '../utils.js';

// Configure hints to focus on common linear + QR formats for faster, more reliable detection
const hints = new Map();
try {
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.QR_CODE
  ]);
  hints.set(DecodeHintType.TRY_HARDER, true);
} catch(_) { /* library guards */ }

let codeReader = new BrowserMultiFormatReader(hints); // kept for API parity (not used for streaming decode now)
let mfReader = new MultiFormatReader();
try { mfReader.setHints(hints); } catch(_) {}

let availableCameras = [];
let currentCameraIndex = 0;
let currentOnScanComplete = null;
let scanStarting = false; // prevent double starts
let scanRaf = null; // requestAnimationFrame id
let scanningActive = false;

/* Camera setup and management */

async function getAvailableCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videos = devices.filter(d => d.kind === 'videoinput');
    // Prefer back/environment cameras first
    videos.sort((a, b) => {
      const aBack = /back|rear|environment/i.test(a.label);
      const bBack = /back|rear|environment/i.test(b.label);
      if (aBack && !bBack) return -1;
      if (!aBack && bBack) return 1;
      return 0;
    });
    return videos;
  } catch (e) {
    console.warn('Could not enumerate cameras:', e);
    return [];
  }
}

function showCameraError(e) {
  let msg = 'Camera error';
  if (!e) {
    el('scanStatus').textContent = msg;
    return;
  }
  if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
    msg = '❌ Camera access denied. Allow camera in browser settings.';
  } else if (e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError') {
    msg = '📷 No camera found.';
  } else if (e.name === 'NotReadableError' || e.name === 'TrackStartError') {
    msg = '⚠️ Camera busy (used by another app). Close others and retry.';
  } else {
    msg = 'Camera error: ' + e.message;
  }
  el('scanStatus').textContent = msg;
}

function resetReader() {
  try { codeReader.reset(); } catch(_) {}
  try { codeReader = new BrowserMultiFormatReader(hints); } catch(_) {}
  try { mfReader = new MultiFormatReader(); mfReader.setHints(hints); } catch(_) {}
}

function stopScanLoop() {
  scanningActive = false;
  if (scanRaf) cancelAnimationFrame(scanRaf);
  scanRaf = null;
}

/* Frame decoding */

function attemptDecodeFrame(ctx, w, h, sx=0, sy=0, sw=w, sh=h) {
  try {
    const imgData = ctx.getImageData(sx, sy, sw, sh);
    const luminance = new RGBLuminanceSource(imgData.data, sw, sh);
    const bitmap = new BinaryBitmap(new HybridBinarizer(luminance));
    return mfReader.decode(bitmap);
  } catch (e) {
    if (e instanceof Exception) return null;
    return null;
  }
}

function startScanLoop(video, onResult) {
  const baseCanvas = document.createElement('canvas');
  const rotCanvas = document.createElement('canvas');
  const baseCtx = baseCanvas.getContext('2d');
  const rotCtx = rotCanvas.getContext('2d');

  // Target a manageable working resolution to reduce CPU (downscale if very large)
  const targetMax = 720; // max longer side

  scanningActive = true;
  let lastTryTs = 0;

  const loop = (ts) => {
    if (!scanningActive) return;
    scanRaf = requestAnimationFrame(loop);
    // Throttle actual decode attempts (~ every 120ms) for performance
    if (ts - lastTryTs < 120) return;
    lastTryTs = ts;

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return;

    // Compute scaling
    let dw = vw;
    let dh = vh;
    const longer = Math.max(vw, vh);
    if (longer > targetMax) {
      const scale = targetMax / longer;
      dw = Math.round(vw * scale);
      dh = Math.round(vh * scale);
    }

    // Draw upright frame
    baseCanvas.width = dw;
    baseCanvas.height = dh;
    try { baseCtx.drawImage(video, 0, 0, dw, dh); } catch(_) { return; }

    // Attempt decode in natural orientation
    let result = attemptDecodeFrame(baseCtx, dw, dh);
    if (!result) {
      // Prepare 90° rotated frame (clockwise)
      rotCanvas.width = dh;
      rotCanvas.height = dw;
      rotCtx.save();
      rotCtx.translate(dh / 2, dw / 2);
      rotCtx.rotate(Math.PI / 2); // 90°
      rotCtx.drawImage(baseCanvas, -dw / 2, -dh / 2, dw, dh);
      rotCtx.restore();
      result = attemptDecodeFrame(rotCtx, dh, dw);
    }

    if (result) {
      onResult(result.getText());
    }
  };
  scanRaf = requestAnimationFrame(loop);
}

async function startCamera(onScanComplete) {
  if (scanStarting) return;
  scanStarting = true;
  currentOnScanComplete = onScanComplete;
  const vid = el('video');
  el('scanStatus').textContent = 'Starting camera…';
  let handled = false;

  resetReader();
  stopScanLoop();

  if (!availableCameras.length) {
    try { availableCameras = await getAvailableCameras(); } catch(_) {}
  }
  const deviceId = availableCameras[currentCameraIndex]?.deviceId;

  const isPortrait = window.innerHeight >= window.innerWidth;
  const constraints = {
    video: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      facingMode: deviceId ? undefined : { ideal: 'environment' },
      width: { ideal: isPortrait ? 1080 : 1920 },
      height: { ideal: isPortrait ? 1920 : 1080 },
      aspectRatio: { ideal: isPortrait ? 9/16 : 16/9 }
    }
  };

  let stream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch(e) {
    showCameraError(e);
    scanStarting = false;
    return;
  }
  vid.srcObject = stream;
  vid.playsInline = true;
  vid.muted = true;
  vid.style.visibility = 'visible';

  await new Promise(res => {
    if (vid.readyState >= vid.HAVE_METADATA) return res();
    const h = () => { vid.removeEventListener('loadedmetadata', h); res(); };
    vid.addEventListener('loadedmetadata', h);
    setTimeout(() => { vid.removeEventListener('loadedmetadata', h); res(); }, 800);
  });

  try { await vid.play(); } catch(_) {}

  const clearStartingStatus = () => {
    if (el('scanStatus').textContent.startsWith('Starting')) {
      el('scanStatus').textContent = '';
    }
  };
  setTimeout(clearStartingStatus, 900);

  startScanLoop(vid, async (code) => {
    if (handled) return;
    handled = true;
    el('scanStatus').textContent = `Scanned: ${code}`;
    try {
      if (currentOnScanComplete) await currentOnScanComplete(code);
    } finally {
      stopScan();
    }
  });

  scanStarting = false;
}

export async function startScan(onScanComplete) {
  el('scannerModal').classList.add('active');
  currentCameraIndex = 0;
  await startCamera(onScanComplete);
}

export function stopScan() {
  stopScanLoop();
  try { codeReader.reset(); } catch(_) {}
  el('scannerModal').classList.remove('active');
  el('scanStatus').textContent = '';
  currentOnScanComplete = null;
  const vid = el('video');
  if (vid && vid.srcObject) {
    vid.srcObject.getTracks().forEach(t => t.stop());
    vid.srcObject = null;
  }
}

export async function startScanForInput(onScanComplete) {
  await startScan(onScanComplete);
}
