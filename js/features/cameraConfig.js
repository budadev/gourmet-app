/* =============================
   Camera Configuration
   ============================= */

import { el } from '../utils.js';
import { openModal, closeModal } from '../components/modal.js';

const CAMERA_CONFIG_KEY = 'gourmetapp_camera_config';

// Default configuration values
const DEFAULT_CONFIG = {
  // Detection validation
  requiredDetections: 2,
  qualityThreshold: 75,
  consensusWindowMs: 1000,

  // Quagga settings
  patchSize: 'large', // 'x-small', 'small', 'medium', 'large', 'x-large'
  halfSample: false,
  numOfWorkers: 4,
  frequency: 5,

  // Resolution
  resolutionWidth: 1280,
  resolutionHeight: 720,

  // Debug options
  drawBoundingBox: true,
  drawScanline: true
};

let currentConfig = { ...DEFAULT_CONFIG };

// Load config from localStorage
export function loadCameraConfig() {
  try {
    const saved = localStorage.getItem(CAMERA_CONFIG_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      currentConfig = { ...DEFAULT_CONFIG, ...parsed };
    }
  } catch (e) {
    console.log('Error loading camera config:', e);
    currentConfig = { ...DEFAULT_CONFIG };
  }
  return currentConfig;
}

// Save config to localStorage
function saveCameraConfig(config) {
  try {
    localStorage.setItem(CAMERA_CONFIG_KEY, JSON.stringify(config));
    currentConfig = { ...config };
  } catch (e) {
    console.log('Error saving camera config:', e);
  }
}

// Get current config
export function getCameraConfig() {
  return { ...currentConfig };
}

// Reset to defaults
function resetToDefaults() {
  currentConfig = { ...DEFAULT_CONFIG };
  try {
    localStorage.removeItem(CAMERA_CONFIG_KEY);
  } catch (e) {
    console.log('Error removing camera config:', e);
  }
  populateConfigForm();
}

// Populate the form with current values
function populateConfigForm() {
  // Detection validation
  el('configRequiredDetections').value = currentConfig.requiredDetections;
  el('configQualityThreshold').value = currentConfig.qualityThreshold;
  el('configConsensusWindow').value = currentConfig.consensusWindowMs;

  // Quagga settings
  el('configPatchSize').value = currentConfig.patchSize;
  el('configHalfSample').checked = currentConfig.halfSample;
  el('configNumWorkers').value = currentConfig.numOfWorkers;
  el('configFrequency').value = currentConfig.frequency;

  // Resolution
  el('configResWidth').value = currentConfig.resolutionWidth;
  el('configResHeight').value = currentConfig.resolutionHeight;

  // Debug options
  el('configDrawBoundingBox').checked = currentConfig.drawBoundingBox;
  el('configDrawScanline').checked = currentConfig.drawScanline;

  // Update display values
  updateDisplayValues();
}

// Update display values for range inputs
function updateDisplayValues() {
  el('requiredDetectionsValue').textContent = currentConfig.requiredDetections;
  el('qualityThresholdValue').textContent = currentConfig.qualityThreshold;
  el('consensusWindowValue').textContent = currentConfig.consensusWindowMs;
  el('numWorkersValue').textContent = currentConfig.numOfWorkers;
  el('frequencyValue').textContent = currentConfig.frequency;
}

// Open camera config modal
export function openCameraConfig() {
  populateConfigForm();
  openModal('cameraConfigModal');
}

// Apply preset configurations
function applyPreset(preset) {
  let presetConfig;

  switch(preset) {
    case 'fast':
      presetConfig = {
        requiredDetections: 1,
        qualityThreshold: 60,
        consensusWindowMs: 500,
        patchSize: 'medium',
        halfSample: true,
        numOfWorkers: 6,
        frequency: 10,
        resolutionWidth: 1280,
        resolutionHeight: 720,
        drawBoundingBox: true,
        drawScanline: true
      };
      break;

    case 'accurate':
      presetConfig = {
        requiredDetections: 3,
        qualityThreshold: 85,
        consensusWindowMs: 1500,
        patchSize: 'x-large',
        halfSample: false,
        numOfWorkers: 4,
        frequency: 3,
        resolutionWidth: 1920,
        resolutionHeight: 1080,
        drawBoundingBox: true,
        drawScanline: true
      };
      break;

    case 'rotated':
      presetConfig = {
        requiredDetections: 2,
        qualityThreshold: 65,
        consensusWindowMs: 1200,
        patchSize: 'x-large',
        halfSample: false,
        numOfWorkers: 4,
        frequency: 4,
        resolutionWidth: 1920,
        resolutionHeight: 1080,
        drawBoundingBox: true,
        drawScanline: true
      };
      break;

    default:
      return;
  }

  currentConfig = { ...presetConfig };
  populateConfigForm();
}

// Initialize camera config
export function initCameraConfig() {
  // Load saved config
  loadCameraConfig();

  // Preset buttons
  const presetFastBtn = el('presetFastBtn');
  if (presetFastBtn) {
    presetFastBtn.addEventListener('click', () => {
      applyPreset('fast');
    });
  }

  const presetAccurateBtn = el('presetAccurateBtn');
  if (presetAccurateBtn) {
    presetAccurateBtn.addEventListener('click', () => {
      applyPreset('accurate');
    });
  }

  const presetRotatedBtn = el('presetRotatedBtn');
  if (presetRotatedBtn) {
    presetRotatedBtn.addEventListener('click', () => {
      applyPreset('rotated');
    });
  }

  // Save button
  const saveBtn = el('saveCameraConfigBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const newConfig = {
        // Detection validation
        requiredDetections: parseInt(el('configRequiredDetections').value),
        qualityThreshold: parseInt(el('configQualityThreshold').value),
        consensusWindowMs: parseInt(el('configConsensusWindow').value),

        // Quagga settings
        patchSize: el('configPatchSize').value,
        halfSample: el('configHalfSample').checked,
        numOfWorkers: parseInt(el('configNumWorkers').value),
        frequency: parseInt(el('configFrequency').value),

        // Resolution
        resolutionWidth: parseInt(el('configResWidth').value),
        resolutionHeight: parseInt(el('configResHeight').value),

        // Debug options
        drawBoundingBox: el('configDrawBoundingBox').checked,
        drawScanline: el('configDrawScanline').checked
      };

      saveCameraConfig(newConfig);
      closeModal('cameraConfigModal');

      // Show confirmation
      const status = document.createElement('div');
      status.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);background:var(--success-color);color:white;padding:12px 24px;border-radius:8px;z-index:10000;box-shadow:0 4px 12px rgba(0,0,0,0.3);';
      status.textContent = '✓ Camera settings saved';
      document.body.appendChild(status);
      setTimeout(() => status.remove(), 2000);
    });
  }

  // Reset button
  const resetBtn = el('resetCameraConfigBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (confirm('Reset all camera settings to defaults?')) {
        resetToDefaults();
      }
    });
  }

  // Cancel button
  const cancelBtn = el('cancelCameraConfigBtn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      closeModal('cameraConfigModal');
    });
  }

  // Update display values on input change
  const rangeInputs = [
    'configRequiredDetections',
    'configQualityThreshold',
    'configConsensusWindow',
    'configNumWorkers',
    'configFrequency'
  ];

  rangeInputs.forEach(id => {
    const input = el(id);
    if (input) {
      input.addEventListener('input', (e) => {
        const valueId = id.replace('config', '').charAt(0).toLowerCase() +
                       id.replace('config', '').slice(1) + 'Value';
        const displayEl = el(valueId);
        if (displayEl) {
          displayEl.textContent = e.target.value;
        }
      });
    }
  });
}

