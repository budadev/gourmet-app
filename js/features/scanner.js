/* =============================
   Barcode Scanner (Simplified Fast Start Version)
   ============================= */

import { BrowserMultiFormatReader, BarcodeFormat, DecodeHintType } from 'https://cdn.jsdelivr.net/npm/@zxing/library@0.20.0/+esm';
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

let codeReader = new BrowserMultiFormatReader(hints);
let availableCameras = [];
let currentCameraIndex = 0;
let currentOnScanComplete = null;
let scanStarting = false; // prevent double starts

// NOTE: Previous implementation included advanced orientation handling,
// manual getUserMedia stream management, continuous focus tweaking, and
// restarting on orientation changes. This added noticeable startup delay
// (opening a stream, then ZXing opening its own stream) and visual flicker.
// For a smooth, fast open (esp. portrait-only usage) we drastically
// simplify: single decodeFromVideoDevice call, no orientation transforms,
// modest resolution request handled by library, immediate video visibility.

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
}

async function startCamera(onScanComplete) {
  if (scanStarting) return;
  scanStarting = true;
  currentOnScanComplete = onScanComplete;
  const vid = el('video');
  el('scanStatus').textContent = 'Starting camera…';
  let handled = false;

  resetReader();

  if (!availableCameras.length) {
    try { availableCameras = await getAvailableCameras(); } catch(_) {}
  }
  const deviceId = availableCameras[currentCameraIndex]?.deviceId;
  vid.style.visibility = 'visible';

  const clearStartingStatus = () => {
    if (el('scanStatus').textContent.startsWith('Starting')) {
      el('scanStatus').textContent = '';
    }
  };

  try {
    codeReader.decodeFromVideoDevice(deviceId || undefined, vid, async (res, err) => {
      if (res && !handled) {
        handled = true;
        clearStartingStatus();
        const code = res.getText();
        el('scanStatus').textContent = `Scanned: ${code}`;
        try { if (currentOnScanComplete) await currentOnScanComplete(code); } finally { stopScan(); }
      } else if (err) {
        // Ignore normal continuous scan misses (NotFound) – different browsers name it differently
        const msg = err?.message || '';
        if (
          msg.includes('No MultiFormat Readers were able to detect the code') ||
          err.name === 'NotFoundException'
        ) {
          clearStartingStatus();
          return; // silent
        }
        // Real camera error (permission / device) only show once while starting
        if (el('scanStatus').textContent.startsWith('Starting')) {
          showCameraError(err);
        } else {
          // Log to console for diagnostics without disturbing UI
          console.debug('Scan error (ignored):', err);
        }
      } else {
        // Neither res nor err (rare) – just clear starting message
        clearStartingStatus();
      }
    });
  } catch(e) {
    showCameraError(e);
  } finally {
    scanStarting = false;
  }

  // Safety clear if no frame triggers within 1s
  setTimeout(clearStartingStatus, 1000);
}

export async function startScan(onScanComplete) {
  el('scannerModal').classList.add('active');
  currentCameraIndex = 0;
  await startCamera(onScanComplete);
}

export function stopScan() {
  try { codeReader.reset(); } catch(_) {}
  el('scannerModal').classList.remove('active');
  el('scanStatus').textContent = '';
  currentOnScanComplete = null;
  // Video element stream will be stopped by codeReader.reset(); ensure tracks ended
  const vid = el('video');
  if (vid && vid.srcObject) {
    vid.srcObject.getTracks().forEach(t => t.stop());
    vid.srcObject = null;
  }
}

// Alias used elsewhere
export async function startScanForInput(onScanComplete) {
  await startScan(onScanComplete);
}
