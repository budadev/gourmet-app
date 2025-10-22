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

async function startCamera(onScanComplete) {
  const vid = el('preview');
  try {
    availableCameras = await getAvailableCameras();
    const deviceId = availableCameras[currentCameraIndex]?.deviceId;
    if (currentStream) {
      currentStream.getTracks().forEach(t => t.stop());
    }
    currentStream = await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        facingMode: deviceId ? undefined : { ideal: 'environment' }
      }
    });
    vid.srcObject = currentStream;
    await vid.play();
    codeReader.decodeFromVideoDevice(deviceId || undefined, vid, async (res, err) => {
      if (res) {
        const code = res.getText();
        el('scanHint').textContent = `Scanned: ${code}`;
        stopScan();
        if (onScanComplete) await onScanComplete(code);
      }
    });
  } catch (e) {
    el('scanHint').textContent = 'Camera error: ' + e.message;
    setTimeout(stopScan, 3000);
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
  if (currentStream) {
    currentStream.getTracks().forEach(t => t.stop());
    currentStream = null;
  }
  el('scannerModal').classList.remove('active');
  el('scanHint').textContent = '';
}

export async function startScanForInput(onScanComplete) {
  el('scannerModal').classList.add('active');
  currentCameraIndex = 0;
  await startCamera(onScanComplete);
}
