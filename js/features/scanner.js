/* =============================
   Barcode Scanner (Simplified Fast Start Version)
   ============================= */

import { BrowserMultiFormatReader } from 'https://cdn.jsdelivr.net/npm/@zxing/library@0.20.0/+esm';
import { el } from '../utils.js';

const codeReader = new BrowserMultiFormatReader();
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

async function startCamera(onScanComplete) {
  if (scanStarting) return; // debounce rapid taps
  scanStarting = true;
  currentOnScanComplete = onScanComplete;
  const vid = el('video');
  el('scanStatus').textContent = 'Starting camera…';

  // Reset any prior decoding session
  try { codeReader.reset(); } catch(_) {}

  // Enumerate once (permission prompt may occur here if not yet granted)
  if (!availableCameras.length) {
    availableCameras = await getAvailableCameras();
  }
  const deviceId = availableCameras[currentCameraIndex]?.deviceId;

  // Ensure video element is immediately visible (CSS now shows it black until frames come)
  vid.classList.add('active');

  // Use ZXing to manage the stream (single stream open = faster, less flicker)
  try {
    codeReader.decodeFromVideoDevice(deviceId || undefined, vid, async (res, err) => {
      // On first error before frames, show status (ignore decode errors after running)
      if (err && !res && el('scanStatus').textContent.startsWith('Starting')) {
        showCameraError(err);
      }
      if (res) {
        const code = res.getText();
        el('scanStatus').textContent = `Scanned: ${code}`;
        stopScan();
        if (currentOnScanComplete) await currentOnScanComplete(code);
      }
    });
  } catch(e) {
    showCameraError(e);
  } finally {
    scanStarting = false;
  }

  // When metadata loads, clear the status (gives quick feedback while camera warms up)
  const onMeta = () => {
    vid.removeEventListener('loadedmetadata', onMeta);
    if (el('scanStatus').textContent.startsWith('Starting')) {
      el('scanStatus').textContent = '';
    }
  };
  vid.addEventListener('loadedmetadata', onMeta);
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
