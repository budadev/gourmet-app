/* =============================
   Barcode Scanner (ZXing Integration)
   ============================= */

import { BrowserMultiFormatReader } from 'https://cdn.jsdelivr.net/npm/@zxing/library@0.20.0/+esm';
import { el } from '../utils.js';

const codeReader = new BrowserMultiFormatReader();
let currentStream = null;
let availableCameras = [];
let currentCameraIndex = 0;

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

    // Use decodeFromVideoDevice which will handle video playback internally
    codeReader.decodeFromVideoDevice(deviceId || undefined, vid, async (res, err) => {
      if (res) {
        const code = res.getText();
        el('scanStatus').textContent = `Scanned: ${code}`;
        stopScan();
        if (onScanComplete) await onScanComplete(code);
      }
    });
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
