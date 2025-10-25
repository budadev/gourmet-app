/* =============================
   Barcode Scanner (ZXing Integration)
   ============================= */

import { BrowserMultiFormatReader, DecodeHintType } from 'https://cdn.jsdelivr.net/npm/@zxing/library@0.20.0/+esm';
import { el } from '../utils.js';

// Configure decoder with hints for better rotation detection
const hints = new Map();
hints.set(DecodeHintType.TRY_HARDER, true); // Enable more thorough detection including rotations
hints.set(DecodeHintType.POSSIBLE_FORMATS, []); // Allow all formats
const codeReader = new BrowserMultiFormatReader(hints);
let currentStream = null;
let availableCameras = [];
let currentCameraIndex = 0;
let opening = false; // prevent overlapping opens
let preferredBackCameraId = null; // remembered back camera id after first successful environment capture
const BACK_CAM_KEY = 'gourmetapp_preferred_back_camera';
try { preferredBackCameraId = localStorage.getItem(BACK_CAM_KEY) || null; } catch(_) {}

/**
 * Helper function to detect barcode from video with manual rotation attempts
 * ZXing should handle rotations automatically, but this provides a fallback
 * for difficult orientations (especially 90° rotations on wine labels)
 */
async function detectWithRotation(video) {
  const canvas = el('canvas');
  if (!canvas) return null;

  const ctx = canvas.getContext('2d');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  // Try normal orientation first (ZXing handles 0° and 180° well)
  try {
    const result = await codeReader.decodeFromVideoElement(video);
    if (result) return result;
  } catch (e) {
    // Continue to rotated attempts
  }

  // If normal detection failed, manually try 90° and 270° rotations
  // This is especially helpful for wine bottle barcodes
  const rotations = [90, 270];

  for (const angle of rotations) {
    try {
      // Set canvas dimensions for rotated image
      if (angle === 90 || angle === 270) {
        canvas.width = video.videoHeight;
        canvas.height = video.videoWidth;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();

      // Apply rotation transformation
      if (angle === 90) {
        ctx.translate(canvas.width, 0);
        ctx.rotate(Math.PI / 2);
      } else if (angle === 270) {
        ctx.translate(0, canvas.height);
        ctx.rotate(-Math.PI / 2);
      }

      ctx.drawImage(video, 0, 0);
      ctx.restore();

      // Try to decode the rotated image
      const result = await codeReader.decodeFromCanvas(canvas);
      if (result) return result;
    } catch (e) {
      // Continue to next rotation
    }
  }

  return null;
}

/**
 * Apply advanced camera settings for better barcode detection
 * Attempts to set continuous autofocus and optimal zoom
 */
async function applyAdvancedCameraSettings(track) {
  if (!track) return null;

  try {
    const capabilities = track.getCapabilities();
    const constraints = {};

    // Try to enable continuous autofocus
    if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
      constraints.focusMode = 'continuous';
    }

    // Set focus distance if supported (0.5 = medium distance, good for scanning)
    if (capabilities.focusDistance) {
      constraints.focusDistance = 0.5;
    }

    // Apply torch/flash if available (commented out - usually not needed)
    // if (capabilities.torch) {
    //   constraints.torch = false;
    // }

    if (Object.keys(constraints).length > 0) {
      await track.applyConstraints({ advanced: [constraints] });
    }

    // Set up periodic refocus (helps with autofocus on some devices)
    let focusInterval = null;
    if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
      focusInterval = setInterval(async () => {
        try {
          await track.applyConstraints({
            advanced: [{ focusMode: 'continuous' }]
          });
        } catch (e) {
          // Ignore errors during periodic refocus
        }
      }, 3000); // Refocus every 3 seconds
    }

    return focusInterval;
  } catch (e) {
    console.log('Could not apply advanced camera settings:', e);
    return null;
  }
}

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
    let stream = null;

    // Get the camera stream
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      if (err.name === 'OverconstrainedError' || err.name === 'ConstraintNotSatisfiedError') {
        if (preferredBackCameraId) {
          // Stored back camera no longer valid; clear and retry with environment
          preferredBackCameraId = null;
          try { localStorage.removeItem(BACK_CAM_KEY); } catch(_) {}
          el('scanStatus').textContent = '🔄 Back camera changed, retrying…';
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
        } else {
          // Retry minimal fallback (still prefer environment)
          el('scanStatus').textContent = '🔄 Adjusting camera settings…';
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
        }
      } else {
        throw err;
      }
    }

    if (!stream) throw new Error('Could not get camera stream');

    vid.srcObject = stream;
    currentStream = stream;

    // Set up custom scanning loop with rotation support
    let scanning = true;
    let lastScanTime = 0;
    const SCAN_INTERVAL = 250; // Try to scan every 250ms

    const scanLoop = async (timestamp) => {
      if (!scanning || !el('scannerModal').classList.contains('active')) {
        return;
      }

      // Throttle scanning attempts
      if (timestamp - lastScanTime >= SCAN_INTERVAL) {
        lastScanTime = timestamp;

        if (vid.readyState === vid.HAVE_ENOUGH_DATA) {
          try {
            // Try detection with automatic rotation support
            const result = await detectWithRotation(vid);
            if (result) {
              const code = result.getText();
              el('scanStatus').textContent = `✅ ${code}`;
              scanning = false;
              stopScan();
              if (onScanComplete) await onScanComplete(code);
              return;
            }
          } catch (e) {
            // Continue scanning on error
          }
        }
      }

      if (scanning) {
        requestAnimationFrame(scanLoop);
      }
    };

    // Start the scanning loop
    requestAnimationFrame(scanLoop);

    // Store the scanning flag so we can stop it later
    currentStream._scanning = () => scanning;
    currentStream._stopScanning = () => { scanning = false; };

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
              // Restart with explicit back camera
              try { codeReader.reset(); } catch(_) {}
              if (currentStream._stopScanning) currentStream._stopScanning();
              try { currentStream.getTracks().forEach(t=>t.stop()); } catch(_) {}
              vid.srcObject = null;
              el('scanStatus').textContent = '🔁 Switching to back camera…';

              // Restart the decoder with the preferred camera
              await runDecoder();
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
    if (currentStream._stopScanning) {
      currentStream._stopScanning();
    }
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
