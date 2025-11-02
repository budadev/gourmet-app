/* =============================
   Barcode Scanner (Quagga2 Integration - Supports Rotated Barcodes)
   ============================= */

import { el } from '../utils.js';

// Quagga2 will be loaded via script tag in HTML and available as window.Quagga
let Quagga = null;

let currentStream = null;
let opening = false; // prevent overlapping opens
let preferredBackCameraId = null; // remembered back camera id after first successful environment capture
let isScanning = false;
const BACK_CAM_KEY = 'gourmetapp_preferred_back_camera';
try { preferredBackCameraId = localStorage.getItem(BACK_CAM_KEY) || null; } catch(_) {}

// Initialize Quagga reference from window object
function initQuagga() {
  if (!Quagga && window.Quagga) {
    Quagga = window.Quagga;
  }
  return Quagga;
}


async function startCamera(onScanComplete) {
  if (opening) return; // guard
  opening = true;
  isScanning = true;
  el('scanStatus').textContent = '📷 Initializing camera…';

  // Initialize Quagga reference
  if (!initQuagga()) {
    el('scanStatus').textContent = '❌ Barcode scanner library not loaded. Please refresh.';
    setTimeout(stopScan, 3000);
    opening = false;
    return;
  }

  // Get available cameras and select back camera
  let selectedDeviceId = preferredBackCameraId;

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(d => d.kind === 'videoinput');

    // Validate stored preferred back camera still exists
    if (preferredBackCameraId && !videoDevices.some(d => d.deviceId === preferredBackCameraId)) {
      preferredBackCameraId = null;
      selectedDeviceId = null;
      try { localStorage.removeItem(BACK_CAM_KEY); } catch(_) {}
    }

    // If no preferred camera, try to find back camera
    if (!selectedDeviceId && videoDevices.length > 0) {
      const backCamera = videoDevices.find(d => /back|rear|environment/i.test(d.label));
      if (backCamera) {
        selectedDeviceId = backCamera.deviceId;
      } else if (videoDevices.length > 1) {
        // If multiple cameras and no back camera found, use the second one (usually back)
        selectedDeviceId = videoDevices[1].deviceId;
      } else {
        selectedDeviceId = videoDevices[0].deviceId;
      }
    }
  } catch(e) {
    console.log('Error enumerating devices:', e);
  }

  // Configure Quagga2 with enhanced accuracy settings
  const config = {
    inputStream: {
      name: 'Live',
      type: 'LiveStream',
      target: document.querySelector('#interactive'), // Use the interactive container
      constraints: {
        width: { min: 640, ideal: 1280, max: 1920 },
        height: { min: 480, ideal: 720, max: 1080 },
        facingMode: selectedDeviceId ? undefined : 'environment',
        deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
        aspectRatio: { ideal: 16/9 },
        focusMode: { ideal: 'continuous' },
        advanced: [
          { focusMode: 'continuous' },
          { focusDistance: { ideal: 0.5 } }
        ]
      },
      area: { // scanning area
        top: '0%',
        right: '0%',
        left: '0%',
        bottom: '0%'
      },
      singleChannel: false // use color processing
    },
    locator: {
      patchSize: 'large', // Changed from 'medium' to 'large' for better accuracy
      halfSample: false, // Changed from true - use full resolution for accuracy
    },
    numOfWorkers: 4, // Increased from 2 for better processing
    frequency: 5, // Reduced from 10 - slower but more accurate scans
    decoder: {
      readers: [
        'ean_reader',      // EAN-13, EAN-8 (most wine bottles)
        'ean_8_reader',
        'upc_reader',      // UPC-A, UPC-E
        'upc_e_reader',
        'code_128_reader', // Code 128
        'code_39_reader',  // Code 39
        'code_93_reader'
      ],
      multiple: false, // Stop after first barcode found
      debug: {
        drawBoundingBox: true,
        showFrequency: false,
        drawScanline: true,
        showPattern: false
      }
    },
    locate: true
  };

  try {
    await new Promise((resolve, reject) => {
      Quagga.init(config, (err) => {
        if (err) {
          console.error('Quagga init error:', err);
          reject(err);
          return;
        }
        resolve();
      });
    });

    // Remember the camera we successfully opened
    if (selectedDeviceId && !preferredBackCameraId) {
      preferredBackCameraId = selectedDeviceId;
      try { localStorage.setItem(BACK_CAM_KEY, preferredBackCameraId); } catch(_) {}
    }

    // Store the stream reference from the video element
    const videoElement = document.querySelector('#interactive video');
    if (videoElement && videoElement.srcObject) {
      currentStream = videoElement.srcObject;

      // Apply advanced camera settings for better autofocus
      const track = currentStream.getVideoTracks()[0];
      if (track) {
        try {
          const capabilities = track.getCapabilities ? track.getCapabilities() : {};
          const settings = {};

          // Enable continuous autofocus if supported
          if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
            settings.focusMode = 'continuous';
          }

          // Set zoom if supported (slightly zoomed helps with focus)
          if (capabilities.zoom) {
            const minZoom = capabilities.zoom.min || 1;
            const maxZoom = capabilities.zoom.max || 1;
            if (maxZoom > minZoom) {
              settings.zoom = Math.min(minZoom + (maxZoom - minZoom) * 0.1, maxZoom);
            }
          }

          // Apply settings if we have any
          if (Object.keys(settings).length > 0) {
            track.applyConstraints({ advanced: [settings] }).catch(e => {
              console.log('Could not apply advanced focus settings:', e);
            });
          }

          // Periodic focus trigger for better close-up performance
          const focusInterval = setInterval(() => {
            if (!isScanning || !currentStream) {
              clearInterval(focusInterval);
              return;
            }

            const currentTrack = currentStream.getVideoTracks()[0];
            if (currentTrack && currentTrack.getCapabilities) {
              const caps = currentTrack.getCapabilities();
              // Trigger focus by toggling focus mode (helps some cameras refocus)
              if (caps.focusMode && caps.focusMode.includes('continuous')) {
                currentTrack.applyConstraints({
                  advanced: [{ focusMode: 'continuous' }]
                }).catch(() => {});
              }
            }
          }, 2000); // Trigger every 2 seconds

          // Store interval for cleanup
          currentStream._focusInterval = focusInterval;

        } catch (e) {
          console.log('Error applying camera settings:', e);
        }
      }
    }

    // Set up barcode detection handler with quality validation and consensus
    let detectionHistory = []; // Track recent detections for consensus
    const REQUIRED_DETECTIONS = 2; // Must see same code 2 times
    const QUALITY_THRESHOLD = 85; // Minimum quality score (0-100)
    const CONSENSUS_WINDOW_MS = 1000; // Time window for consensus

    // Helper function to calculate EAN/UPC checksum
    function validateBarcodeChecksum(code, format) {
      if (!code || code.length < 8) return false;

      // EAN-13, EAN-8, UPC-A, UPC-E validation
      if (format.includes('ean') || format.includes('upc')) {
        const digits = code.split('').map(Number);
        if (digits.some(isNaN)) return false;

        const checkDigit = digits[digits.length - 1];
        const codeDigits = digits.slice(0, -1);

        // Calculate checksum (alternating 1x and 3x multiplier)
        let sum = 0;
        for (let i = 0; i < codeDigits.length; i++) {
          const multiplier = (codeDigits.length - i) % 2 === 0 ? 1 : 3;
          sum += codeDigits[i] * multiplier;
        }

        const calculatedCheck = (10 - (sum % 10)) % 10;
        return calculatedCheck === checkDigit;
      }

      return true; // For other formats, assume valid
    }

    Quagga.onDetected((result) => {
      if (!isScanning) return;

      const code = result.codeResult.code;
      const format = result.codeResult.format;
      const now = Date.now();

      // Calculate quality score from error rate
      // Quagga provides error rate for each decoded character
      let qualityScore = 0;
      if (result.codeResult.decodedCodes) {
        const decodedCodes = result.codeResult.decodedCodes.filter(c => c.error !== undefined);
        if (decodedCodes.length > 0) {
          const avgError = decodedCodes.reduce((sum, c) => sum + (c.error || 0), 0) / decodedCodes.length;
          qualityScore = Math.max(0, 100 - (avgError * 100));
        }
      }

      // Reject low quality scans immediately
      if (qualityScore < QUALITY_THRESHOLD) {
        console.log(`Rejected low quality scan: ${code} (quality: ${qualityScore.toFixed(1)})`);
        return;
      }

      // Validate checksum for EAN/UPC codes
      if (!validateBarcodeChecksum(code, format)) {
        console.log(`Rejected invalid checksum: ${code} (${format})`);
        return;
      }

      // Add to detection history
      detectionHistory.push({
        code: code,
        format: format,
        quality: qualityScore,
        timestamp: now
      });

      // Clean old detections outside consensus window
      detectionHistory = detectionHistory.filter(d => now - d.timestamp < CONSENSUS_WINDOW_MS);

      // Count detections of this code
      const matchingDetections = detectionHistory.filter(d => d.code === code);
      const avgQuality = matchingDetections.reduce((sum, d) => sum + d.quality, 0) / matchingDetections.length;

      // Update status to show progress
      el('scanStatus').textContent = '🔍 Reading barcode...';

      // Check if we have consensus
      if (matchingDetections.length >= REQUIRED_DETECTIONS) {
        console.log(`Barcode confirmed: ${code} (${matchingDetections.length} detections, avg quality: ${avgQuality.toFixed(1)})`);
        el('scanStatus').textContent = `✅ ${code}`;
        stopScan();
        if (onScanComplete) onScanComplete(code);
      }
    });

    Quagga.start();
    el('scanStatus').textContent = 'Point camera at barcode to scan';

    // Helpful message after delay
    setTimeout(() => {
      if (el('scannerModal').classList.contains('active') && isScanning) {
        const txt = el('scanStatus').textContent || '';
        if (!txt.startsWith('✅') && !txt.startsWith('❌')) {
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
        msg = 'Camera error: ' + (e.message || e);
        console.error('Camera error:', e);
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
  // fire without awaiting so modal paints instantly
  startCamera(onScanComplete);
}

export function stopScan() {
  isScanning = false;

  // Clear focus interval if it exists
  if (currentStream && currentStream._focusInterval) {
    clearInterval(currentStream._focusInterval);
    currentStream._focusInterval = null;
  }

  // Stop Quagga
  if (Quagga) {
    try {
      Quagga.offDetected();
      Quagga.offProcessed();
      Quagga.stop();
    } catch(e) {
      console.log('Error stopping Quagga:', e);
    }
  }

  // Clean up video stream from both possible locations
  const vid = document.querySelector('#interactive video') || el('video');
  if (vid && vid.srcObject) {
    try {
      vid.srcObject.getTracks().forEach(t => t.stop());
    } catch(_) {}
    vid.srcObject = null;
  }

  if (currentStream) {
    try {
      currentStream.getTracks().forEach(t => t.stop());
    } catch(_) {}
    currentStream = null;
  }

  // Clean up any Quagga-generated canvases
  const interactive = document.querySelector('#interactive');
  if (interactive) {
    const canvases = interactive.querySelectorAll('canvas');
    canvases.forEach(canvas => {
      if (!canvas.classList.contains('drawingBuffer')) {
        canvas.remove();
      }
    });
  }

  el('scannerModal').classList.remove('active');
  el('scanStatus').textContent = '';
  opening = false;
}

export async function startScanForInput(onScanComplete) {
  await startScan(onScanComplete);
}
