/* =============================
   Barcode Scanner (ZXing Integration)
   ============================= */

import { BrowserMultiFormatReader, DecodeHintType, MultiFormatReader, RGBLuminanceSource, BinaryBitmap, HybridBinarizer } from 'https://cdn.jsdelivr.net/npm/@zxing/library@0.20.0/+esm';
import { el } from '../utils.js';

// Primary streaming reader
const codeReader = new BrowserMultiFormatReader();
// Snapshot reader (used for rotated fallback decoding)
const snapshotReader = new MultiFormatReader();

// Hints increase robustness (TRY_HARDER lets ZXing internally attempt rotations for some formats)
try {
  const hints = new Map();
  hints.set(DecodeHintType.TRY_HARDER, true);
  hints.set(DecodeHintType.ALSO_INVERTED, true); // Sometimes dark-on-light vs light-on-dark
  codeReader.setHints(hints);
  snapshotReader.setHints(hints);
} catch(_) {}

let currentStream = null;
let availableCameras = [];
let currentCameraIndex = 0;
let opening = false; // prevent overlapping opens
let preferredBackCameraId = null; // remembered back camera id after first successful environment capture
const BACK_CAM_KEY = 'gourmetapp_preferred_back_camera';
try { preferredBackCameraId = localStorage.getItem(BACK_CAM_KEY) || null; } catch(_) {}

// Interval id for rotation assist snapshot decoding
let rotationAssistInterval = null;

// Helper: apply advanced focus etc. (placeholder if existed earlier)
async function applyAdvancedCameraSettings(track) { /* no-op placeholder if missing */ return null; }

/* ...existing code... */

async function startCamera(onScanComplete) {
  if (opening) return; // guard
  opening = true;
  const vid = el('video');
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

    // Build constraints only referencing deviceId if we already know the back cam
    const constraints = { video: buildVideoConstraints() };
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
        if (preferredBackCameraId) {
          // Stored back camera no longer valid; clear and retry with environment
            preferredBackCameraId = null;
            try { localStorage.removeItem(BACK_CAM_KEY); } catch(_) {}
            el('scanStatus').textContent = '🔄 Back camera changed, retrying…';
            await codeReader.decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } } }, vid, async (res, e2) => {
              if (res) {
                const code = res.getText();
                el('scanStatus').textContent = `✅ ${code}`;
                stopScan();
                if (onScanComplete) await onScanComplete(code);
              }
            });
            decodeSucceeded = true;
        } else if (!preferredBackCameraId) {
          // Retry minimal fallback (still prefer environment)
          el('scanStatus').textContent = '🔄 Adjusting camera settings…';
          await codeReader.decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } } }, vid, async (res, e2) => {
            if (res) {
              const code = res.getText();
              el('scanStatus').textContent = `✅ ${code}`;
              stopScan();
              if (onScanComplete) await onScanComplete(code);
            }
          });
          decodeSucceeded = true;
        }
      } else {
        throw err;
      }
    }
    if (!decodeSucceeded) throw new Error('Could not start decoder');

    // Wait for readiness
    await new Promise(r => {
      if (vid.readyState >= vid.HAVE_METADATA) return r();
      vid.addEventListener('loadedmetadata', () => r(), { once: true });
    });

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
              await codeReader.decodeFromConstraints({ video: { deviceId: { exact: preferredBackCameraId }, width: { ideal:1920,max:1920 }, height:{ ideal:1080,max:1080 }, focusMode:'continuous', advanced:[{focusMode:'continuous'},{focusDistance:0.5}] } }, vid, async (res, err2) => {
                if (res) {
                  const code = res.getText();
                  el('scanStatus').textContent = `✅ ${code}`;
                  stopScan();
                  if (onScanComplete) await onScanComplete(code);
                }
              });
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
              focusInterval = await applyAdvancedCameraSettings(newTrack);
              currentStream._focusInterval = focusInterval;
            }
          } catch(_) {}
        }

        // Start rotation assist AFTER initial stream established
        startRotationAssist(vid, onScanComplete);
      }
    }
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

// Rotation Assist: periodically snapshot the video, attempt 90° / 270° rotated decode for vertical barcodes (e.g., wine bottles held naturally while phone portrait)
function startRotationAssist(videoEl, onScanComplete) {
  if (rotationAssistInterval) clearInterval(rotationAssistInterval);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let busy = false;
  rotationAssistInterval = setInterval(async () => {
    if (busy) return;
    if (!videoEl || !videoEl.srcObject) { clearInterval(rotationAssistInterval); rotationAssistInterval = null; return; }
    if (el('scanStatus').textContent.startsWith('✅')) { clearInterval(rotationAssistInterval); rotationAssistInterval = null; return; }
    if (videoEl.readyState < videoEl.HAVE_ENOUGH_DATA) return;
    busy = true;
    try {
      const w = videoEl.videoWidth;
      const h = videoEl.videoHeight;
      if (!w || !h) { busy = false; return; }
      // First draw original orientation into canvas sized to video
      canvas.width = w;
      canvas.height = h;
      ctx.save();
      ctx.drawImage(videoEl, 0, 0, w, h);
      ctx.restore();
      // Extract image data for original (ZXing already trying this via streaming reader)
      // Now test rotated 90° clockwise and counter-clockwise
      const attemptRotations = [90, 270];
      for (const angle of attemptRotations) {
        const rw = angle % 180 === 0 ? w : h;
        const rh = angle % 180 === 0 ? h : w;
        // Resize canvas to rotated dimensions
        canvas.width = rw;
        canvas.height = rh;
        ctx.save();
        // Move origin to center then rotate
        ctx.translate(rw/2, rh/2);
        ctx.rotate(angle * Math.PI/180);
        // Draw the video frame so that it fits after rotation
        // When rotated 90/270, width/height swap
        ctx.drawImage(videoEl, -w/2, -h/2, w, h);
        ctx.restore();
        const imgData = ctx.getImageData(0, 0, rw, rh);
        const luminance = new RGBLuminanceSource(imgData.data, rw, rh);
        const bitmap = new BinaryBitmap(new HybridBinarizer(luminance));
        try {
          const result = snapshotReader.decode(bitmap);
          if (result && result.getText()) {
            el('scanStatus').textContent = `✅ ${result.getText()} (rot ${angle}°)`;
            stopScan();
            if (onScanComplete) await onScanComplete(result.getText());
            clearInterval(rotationAssistInterval);
            rotationAssistInterval = null;
            break;
          }
        } catch(inner) {
          // Ignore not-found errors
          if (inner && inner.name && inner.name !== 'NotFoundException') {
            // console.debug('Rotation decode error', inner);
          }
        } finally {
          try { snapshotReader.reset(); } catch(_) {}
        }
        if (!videoEl.srcObject) break;
      }
    } catch(err) {
      // console.debug('Rotation assist failure', err);
    } finally {
      busy = false;
    }
  }, 800); // every 0.8s to limit CPU usage
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
  try { snapshotReader.reset(); } catch(_) {}
  if (rotationAssistInterval) { clearInterval(rotationAssistInterval); rotationAssistInterval = null; }
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
