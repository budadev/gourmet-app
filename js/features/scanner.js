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
let hasResult = false; // prevent double fires
let closeDelayTimer = null;

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

function isValidCode(text) {
  if (!text) return false;
  const trimmed = text.trim();
  // Accept numeric barcodes of typical lengths or any QR (alphanumeric > 4 chars)
  if (/^[0-9]{8,14}$/.test(trimmed)) return true;
  if (trimmed.length >= 4) return true; // allow other formats (QR, CODE_128 with letters)
  return false;
}

function handleSuccessfulScan(code) {
  if (hasResult) return; // already processed
  if (!isValidCode(code)) return; // ignore noise / partial reads
  hasResult = true;
  el('scanHint').textContent = `Scanned: ${code}`;
  // Defer closing until callback resolves to avoid race conditions
  Promise.resolve(onScanCallback ? onScanCallback(code) : null)
    .catch(err => console.error('Scan callback error:', err))
    .finally(() => {
      // Give user brief visual confirmation before closing
      closeDelayTimer = setTimeout(() => {
        stopScan();
      }, 450); // ~0.45s visual pause
    });
}

// Manual fallback decoding loop: captures frame and tries rotated versions
function startManualFallbackLoop(video) {
  if (manualLoopActive) return;
  manualLoopActive = true;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  const orientations = [0, 90, 180, 270];

  const attempt = async () => {
    if (!manualLoopActive || hasResult) return;
    try {
      if (!video.videoWidth || !video.videoHeight) {
        manualLoopTimeout = setTimeout(attempt, 300);return;
      }
      for (const angle of orientations) {
        if (hasResult) break;
        if (angle === 0 || angle === 180) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        } else {
          canvas.width = video.videoHeight;
          canvas.height = video.videoWidth;
        }
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(angle * Math.PI / 180);
        ctx.drawImage(video, -video.videoWidth / 2, -video.videoHeight / 2);
        ctx.restore();
        try {
          const res = await codeReader.decodeFromCanvas(canvas);
          if (res) {
            handleSuccessfulScan(res.getText());
            break;
          }
        } catch (_) {
          // ignore per orientation
        }
      }
    } finally {
      if (!hasResult && manualLoopActive) manualLoopTimeout = setTimeout(attempt, 500); // throttle to reduce CPU
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
    el('scanHint').textContent = '';
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
  hasResult = false;
  if (closeDelayTimer) clearTimeout(closeDelayTimer);
  closeDelayTimer = null;
}

export async function startScanForInput(onScanComplete) {
  el('scannerModal').classList.add('active');
  currentCameraIndex = 0;
  manualLoopActive = false;
  await startCamera(onScanComplete);
}
