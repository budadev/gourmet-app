/* =============================
   Barcode Scanner (ZXing Integration)
   Enhanced with multi-orientation support for rotated barcodes
   ============================= */

import { BrowserMultiFormatReader, DecodeHintType } from 'https://cdn.jsdelivr.net/npm/@zxing/library@0.20.0/+esm';
import { el } from '../utils.js';

// Configure hints for better barcode detection including rotated barcodes
const hints = new Map();
hints.set(DecodeHintType.TRY_HARDER, true);
hints.set(DecodeHintType.POSSIBLE_FORMATS, [
  // Support common barcode formats
  'EAN_13', 'EAN_8', 'UPC_A', 'UPC_E',
  'CODE_128', 'CODE_39', 'CODE_93',
  'ITF', 'CODABAR'
]);

const codeReader = new BrowserMultiFormatReader(hints);
let currentStream = null;
let availableCameras = [];
let currentCameraIndex = 0;
let scanningActive = false;
let rotationScanInterval = null;

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

// Try to decode barcode at multiple orientations (0°, 90°, 180°, 270°)
async function tryDecodeWithRotations(video) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  // Set canvas size to match video
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  // Draw current frame
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  // Try decoding at original orientation first (fastest)
  try {
    const result = await codeReader.decodeFromImageElement(video);
    if (result) return result;
  } catch (e) {
    // No barcode found at 0°, try other orientations
  }

  // Try 90° rotation (most common case for vertical barcodes)
  try {
    const rotated90 = document.createElement('canvas');
    const ctx90 = rotated90.getContext('2d');
    rotated90.width = canvas.height;
    rotated90.height = canvas.width;
    ctx90.translate(rotated90.width / 2, rotated90.height / 2);
    ctx90.rotate(90 * Math.PI / 180);
    ctx90.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);

    const result = await codeReader.decodeFromCanvas(rotated90);
    if (result) return result;
  } catch (e) {
    // No barcode at 90°
  }

  // Try 270° rotation (-90°)
  try {
    const rotated270 = document.createElement('canvas');
    const ctx270 = rotated270.getContext('2d');
    rotated270.width = canvas.height;
    rotated270.height = canvas.width;
    ctx270.translate(rotated270.width / 2, rotated270.height / 2);
    ctx270.rotate(270 * Math.PI / 180);
    ctx270.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);

    const result = await codeReader.decodeFromCanvas(rotated270);
    if (result) return result;
  } catch (e) {
    // No barcode at 270°
  }

  // 180° is usually handled by ZXing automatically, but try it anyway
  try {
    const rotated180 = document.createElement('canvas');
    const ctx180 = rotated180.getContext('2d');
    rotated180.width = canvas.width;
    rotated180.height = canvas.height;
    ctx180.translate(rotated180.width / 2, rotated180.height / 2);
    ctx180.rotate(180 * Math.PI / 180);
    ctx180.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);

    const result = await codeReader.decodeFromCanvas(rotated180);
    if (result) return result;
  } catch (e) {
    // No barcode found at any orientation
  }

  return null;
}

// Start continuous scanning with rotation support
function startRotationScanning(video, onScanComplete) {
  scanningActive = true;

  const scanFrame = async () => {
    if (!scanningActive || !video.videoWidth) {
      return;
    }

    try {
      const result = await tryDecodeWithRotations(video);
      if (result) {
        const code = result.getText();
        el('scanStatus').textContent = `Scanned: ${code}`;
        scanningActive = false;
        stopScan();
        if (onScanComplete) await onScanComplete(code);
        return;
      }
    } catch (e) {
      // Continue scanning
    }

    // Schedule next scan attempt
    if (scanningActive) {
      rotationScanInterval = setTimeout(scanFrame, 100); // Try every 100ms
    }
  };

  // Start the scanning loop
  scanFrame();
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

async function checkCameraPermission() {
  try {
    // Check if permission is already granted
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    // If we get here, permission was granted
    const tracks = stream.getTracks();
    tracks.forEach(track => track.stop()); // Stop the track as we only check permission
    return true;
  } catch (e) {
    // Permission denied or not available
    return false;
  }
}

function showPermissionInfo() {
  // Show a one-time info message about camera permission
  const infoShown = localStorage.getItem('cameraPermissionInfoShown');
  if (!infoShown) {
    el('scanStatus').textContent = '📷 This app requires camera access to scan barcodes. Please allow camera access in your browser settings.';
    localStorage.setItem('cameraPermissionInfoShown', 'true');
  }
}

async function startCamera(onScanComplete) {
  const vid = el('video');
  let focusInterval = null;

  try {
    // Completely reset and cleanup before starting new session
    try {
      codeReader.reset();
    } catch (_) { }

    // Stop and clear existing video stream
    if (vid.srcObject) {
      const tracks = vid.srcObject.getTracks();
      tracks.forEach(track => track.stop());
      vid.srcObject = null;
    }

    // Pause the video and reset its state
    vid.pause();
    vid.currentTime = 0;

    // Check if permission is already granted
    const hasPermission = await checkCameraPermission();

    // Show info message if first time and no permission yet
    if (!hasPermission) {
      showPermissionInfo();
    }

    availableCameras = await getAvailableCameras();
    const deviceId = availableCameras[currentCameraIndex]?.deviceId;

    if (currentStream) {
      // Clear focus interval if it exists
      if (currentStream._focusInterval) {
        clearInterval(currentStream._focusInterval);
        currentStream._focusInterval = null;
      }
      currentStream.getTracks().forEach(t => t.stop());
      currentStream = null;
    }

    // Enhanced camera constraints for better autofocus
    const constraints = {
      video: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        facingMode: deviceId ? undefined : { ideal: 'environment' },
        // Request high resolution for better barcode detection
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        // Request autofocus capability
        focusMode: { ideal: 'continuous' },
        // Advanced settings for iOS
        advanced: [
          { focusMode: 'continuous' },
          { focusDistance: 0.5 }
        ]
      }
    };

    currentStream = await navigator.mediaDevices.getUserMedia(constraints);

    // Apply advanced camera settings for continuous autofocus
    const videoTrack = currentStream.getVideoTracks()[0];
    if (videoTrack) {
      focusInterval = await applyAdvancedCameraSettings(videoTrack);

      // Store the interval so we can clear it later
      currentStream._focusInterval = focusInterval;
    }

    // Set video source
    vid.srcObject = currentStream;

    // Wait for video metadata to be loaded before starting decoder
    await new Promise((resolve) => {
      const handleLoadedMetadata = () => {
        vid.removeEventListener('loadedmetadata', handleLoadedMetadata);
        resolve();
      };

      if (vid.readyState >= vid.HAVE_METADATA) {
        resolve();
      } else {
        vid.addEventListener('loadedmetadata', handleLoadedMetadata);
      }
    });

    // Make sure video is playing
    await vid.play();

    // Start rotation scanning with multi-orientation support
    startRotationScanning(vid, onScanComplete);
  } catch (e) {
    // Provide more helpful error messages
    let errorMsg = 'Camera error: ';

    if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
      errorMsg = '❌ Camera access denied. Please allow camera access in your browser settings.';
      // Clear the "first time" flag so we can show the message again
      localStorage.removeItem('cameraPermissionInfoShown');
    } else if (e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError') {
      errorMsg = '📷 No camera found on this device.';
    } else if (e.name === 'NotReadableError' || e.name === 'TrackStartError') {
      errorMsg = '⚠️ Camera is being used by another app. Please close other apps and try again.';
    } else {
      errorMsg += e.message;
    }

    el('scanStatus').textContent = errorMsg;
    setTimeout(stopScan, 4000);
  }
}

export async function startScan(onScanComplete) {
  el('scannerModal').classList.add('active');
  currentCameraIndex = 0;
  await startCamera(onScanComplete);
}

export function stopScan() {
  // Stop rotation scanning
  scanningActive = false;
  if (rotationScanInterval) {
    clearTimeout(rotationScanInterval);
    rotationScanInterval = null;
  }

  try {
    codeReader.reset();
  } catch (_) { }

  // Clean up video element
  const vid = el('video');
  if (vid && vid.srcObject) {
    const tracks = vid.srcObject.getTracks();
    tracks.forEach(track => track.stop());
    vid.srcObject = null;
  }

  if (currentStream) {
    // Clear focus interval if it exists
    if (currentStream._focusInterval) {
      clearInterval(currentStream._focusInterval);
      currentStream._focusInterval = null;
    }

    currentStream.getTracks().forEach(t => t.stop());
    currentStream = null;
  }

  el('scannerModal').classList.remove('active');
  el('scanStatus').textContent = '';
}

export async function startScanForInput(onScanComplete) {
  el('scannerModal').classList.add('active');
  currentCameraIndex = 0;
  await startCamera(onScanComplete);
}
