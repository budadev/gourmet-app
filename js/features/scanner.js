/* =============================
   Barcode Scanner (ZXing Integration) - Enhanced for multi-orientation
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

function handleSuccessfulScan(code) {
  el('scanHint').textContent = `Scanned: ${code}`;
  stopScan();
  if (onScanCallback) onScanCallback(code);
}

// Manual fallback decoding loop: captures frame and tries rotated versions
function startManualFallbackLoop(video) {
  if (manualLoopActive) return;
  manualLoopActive = true;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  const attempt = async () => {
    if (!manualLoopActive) return;
    try {
      if (!video.videoWidth || !video.videoHeight) {
        manualLoopTimeout = setTimeout(attempt, 300);return;
      }
      // Base orientation
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      try {
        const res = await codeReader.decodeFromCanvas(canvas);
        if (res) { handleSuccessfulScan(res.getText()); return; }
      } catch (_) {}

      // 90 degrees
      canvas.width = video.videoHeight;
      canvas.height = video.videoWidth;
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(video, -video.videoWidth / 2, -video.videoHeight / 2);
      ctx.restore();
      try {
        const res90 = await codeReader.decodeFromCanvas(canvas);
        if (res90) { handleSuccessfulScan(res90.getText()); return; }
      } catch (_) {}

      // 180 degrees
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(Math.PI);
      ctx.drawImage(video, -video.videoWidth / 2, -video.videoHeight / 2);
      ctx.restore();
      try {
        const res180 = await codeReader.decodeFromCanvas(canvas);
        if (res180) { handleSuccessfulScan(res180.getText()); return; }
      } catch (_) {}

      // 270 degrees
      canvas.width = video.videoHeight;
      canvas.height = video.videoWidth;
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(3 * Math.PI / 2);
      ctx.drawImage(video, -video.videoWidth / 2, -video.videoHeight / 2);
      ctx.restore();
      try {
        const res270 = await codeReader.decodeFromCanvas(canvas);
        if (res270) { handleSuccessfulScan(res270.getText()); return; }
      } catch (_) {}

    } finally {
      // Schedule next attempt if still active
      if (manualLoopActive) manualLoopTimeout = setTimeout(attempt, 400); // ~2.5 fps for fallback (light CPU)
    }
  };
  attempt();
}

async function startCamera(onScanComplete) {
  const vid = el('preview');
  onScanCallback = onScanComplete;
  try {
    availableCameras = await getAvailableCameras();
    const deviceId = availableCameras[currentCameraIndex]?.deviceId;
    if (currentStream) {
      currentStream.getTracks().forEach(t => t.stop());
    }
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

    // Primary continuous decode; may catch most orientations already
    codeReader.decodeFromVideoDevice(deviceId || undefined, vid, (res, err) => {
      if (res) {
        handleSuccessfulScan(res.getText());
      }
      // Ignore errors; manual loop handles rotated attempts
    });

    // Start manual fallback loop for rotated cases
    startManualFallbackLoop(vid);
    el('scanHint').textContent = 'Align barcode; rotation supported';
  } catch (e) {
    el('scanHint').textContent = 'Camera error: ' + e.message;
    setTimeout(stopScan, 3000);
  }
}

export async function startScan(onScanComplete) {
  el('scannerModal').classList.add('active');
  currentCameraIndex = 0;
  manualLoopActive = false;
  await startCamera(onScanComplete);
}

export function stopScan() {
  try { codeReader.reset(); } catch (_) { }
  if (currentStream) {
    currentStream.getTracks().forEach(t => t.stop());
    currentStream = null;
  }
  if (manualLoopTimeout) clearTimeout(manualLoopTimeout);
  manualLoopActive = false;
  el('scannerModal').classList.remove('active');
  el('scanHint').textContent = '';
  onScanCallback = null;
}

export async function startScanForInput(onScanComplete) {
  el('scannerModal').classList.add('active');
  currentCameraIndex = 0;
  manualLoopActive = false;
  await startCamera(onScanComplete);
}
