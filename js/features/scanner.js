/* =============================
   Barcode Scanner (ZXing Integration)
   ============================= */

import { BrowserMultiFormatReader } from 'https://cdn.jsdelivr.net/npm/@zxing/library@0.20.0/+esm';
import { el } from '../utils.js';

const codeReader = new BrowserMultiFormatReader();
let currentStream = null;
let availableCameras = [];
let currentCameraIndex = 0;
let opening = false; // prevent overlapping opens

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

// Apply advanced camera settings for better autofocus
async function applyAdvancedCameraSettings(track) {
  const capabilities = track.getCapabilities ? track.getCapabilities() : {};
  const constraints = {};

  // Enable continuous autofocus if supported
  if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
    constraints.focusMode = 'continuous';
  }

  // Set focus distance to auto/infinity for barcode scanning
  if (capabilities.focusDistance) {
    // For barcode scanning, we want medium-range focus
    const min = capabilities.focusDistance.min || 0;
    const max = capabilities.focusDistance.max || 1;
    constraints.focusDistance = (min + max) / 2;
  }

  // Enable advanced autofocus if available (iOS specific)
  if (capabilities.advanced) {
    constraints.advanced = [{ focusMode: 'continuous' }];
  }

  // Apply constraints if any were set
  if (Object.keys(constraints).length > 0) {
    try {
      await track.applyConstraints(constraints);
    } catch (e) {
      console.log('Could not apply advanced camera settings:', e);
    }
  }

  // For iOS, we need to periodically request focus
  // This simulates the tap-to-focus behavior
  return startContinuousFocus(track);
}

// Continuously request focus updates for iOS and other devices
function startContinuousFocus(track) {
  let focusInterval = null;

  // On iOS and some Android devices, we need to manually trigger focus
  const capabilities = track.getCapabilities ? track.getCapabilities() : {};

  if (capabilities.focusMode || capabilities.focusDistance) {
    focusInterval = setInterval(async () => {
      try {
        const constraints = {};

        // Toggle focus mode to trigger refocus
        if (capabilities.focusMode) {
          const currentSettings = track.getSettings();
          if (currentSettings.focusMode === 'continuous') {
            constraints.focusMode = 'continuous';
          } else if (capabilities.focusMode.includes('continuous')) {
            constraints.focusMode = 'continuous';
          }
        }

        // Periodically adjust focus distance slightly to trigger refocus
        if (capabilities.focusDistance) {
          const settings = track.getSettings();
          const current = settings.focusDistance || 0.5;
          const min = capabilities.focusDistance.min || 0;
          const max = capabilities.focusDistance.max || 1;
          // Oscillate slightly to trigger continuous focus
          const offset = (Math.sin(Date.now() / 1000) * 0.05);
          constraints.focusDistance = Math.max(min, Math.min(max, current + offset));
        }

        if (Object.keys(constraints).length > 0) {
          await track.applyConstraints(constraints);
        }
      } catch (e) {
        // Ignore errors during focus updates
      }
    }, 500); // Update focus every 500ms
  }

  return focusInterval;
}

async function startCamera(onScanComplete) {
  if (opening) return; // guard
  opening = true;
  const vid = el('video');
  let focusInterval = null;
  el('scanStatus').textContent = '📷 Initializing camera…';
  if (navigator.vibrate) { try { navigator.vibrate(10); } catch(_) {} }

  try {
    try { codeReader.reset(); } catch(_) {}

    // Clean previous stream
    if (vid && vid.srcObject) {
      try { vid.srcObject.getTracks().forEach(t=>t.stop()); } catch(_) {}
      vid.srcObject = null;
    }

    availableCameras = await navigator.mediaDevices.enumerateDevices();
    availableCameras = availableCameras.filter(d=>d.kind==='videoinput');

    const deviceId = availableCameras[currentCameraIndex]?.deviceId;

    // Build constraints (single call via ZXing)
    const constraints = {
      video: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        facingMode: deviceId ? undefined : { ideal: 'environment' },
        width: { ideal: 1920, max: 1920 },
        height: { ideal: 1080, max: 1080 },
        focusMode: 'continuous',
        advanced: [ { focusMode: 'continuous' }, { focusDistance: 0.5 } ]
      }
    };

    let decodeSucceeded = false;
    try {
      await codeReader.decodeFromConstraints(constraints, vid, async (res, err) => {
        if (res) {
          const code = res.getText();
          el('scanStatus').textContent = `✅ ${code}`;
          stopScan();
          if (onScanComplete) await onScanComplete(code);
        }
      });
      decodeSucceeded = true;
    } catch (err) {
      if (err.name === 'OverconstrainedError' || err.name === 'ConstraintNotSatisfiedError') {
        // Retry with relaxed constraints
        el('scanStatus').textContent = '🔄 Adjusting camera settings…';
        const fallback = { video: { facingMode: { ideal: 'environment' } } };
        await codeReader.decodeFromConstraints(fallback, vid, async (res, e2) => {
          if (res) {
            const code = res.getText();
            el('scanStatus').textContent = `✅ ${code}`;
            stopScan();
            if (onScanComplete) await onScanComplete(code);
          }
        });
        decodeSucceeded = true;
      } else {
        throw err;
      }
    }

    if (!decodeSucceeded) throw new Error('Could not start decoder');

    // Wait for stream to attach
    await new Promise(r => {
      if (vid.readyState >= vid.HAVE_METADATA) return r();
      vid.addEventListener('loadedmetadata', () => r(), { once: true });
    });

    currentStream = vid.srcObject;
    if (currentStream) {
      const track = currentStream.getVideoTracks()[0];
      if (track) {
        try { focusInterval = await applyAdvancedCameraSettings(track); } catch (_) {}
        currentStream._focusInterval = focusInterval;
      }
    }

    el('scanStatus').textContent = '📡 Point camera at barcode';
    // Safety hint after 15s if still active
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
      case 'NotAllowedError':
        msg = '❌ Camera permission denied. Enable it in Settings > Safari > Camera to scan.';
        break;
      case 'NotFoundError':
        msg = '📷 No camera available on this device.';
        break;
      case 'NotReadableError':
      case 'TrackStartError':
        msg = '⚠️ Camera is busy (used by another app). Close it and retry.';
        break;
      default:
        msg = 'Camera error: ' + e.message;
    }
    el('scanStatus').textContent = msg;
    setTimeout(stopScan, 4500);
  } finally {
    opening = false;
  }
}

export async function startScan(onScanComplete) {
  if (opening) return; // prevent double trigger
  el('scannerModal').classList.add('active');
  currentCameraIndex = 0;
  // fire without awaiting so modal paints instantly
  startCamera(onScanComplete);
}

export function stopScan() {
  try { codeReader.reset(); } catch(_) {}
  const vid = el('video');
  if (vid && vid.srcObject) {
    try { vid.srcObject.getTracks().forEach(t=>t.stop()); } catch(_) {}
    vid.srcObject = null;
  }
  if (currentStream) {
    if (currentStream._focusInterval) {
      clearInterval(currentStream._focusInterval);
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
