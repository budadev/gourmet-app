/* =============================
   Open Food Facts API Integration
   ============================= */

import { getConfig } from '../config.js';

export async function lookupByBarcode(code) {
  try {
    const r = await fetch(`https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(code)}.json`);
    const j = await r.json();
    if (j && j.status === 1) {
      const p = j.product || {};
      const config = getConfig();
      return {
        name: p.product_name || p.generic_name || 'Unknown product',
        type: Object.keys(config)[0] || 'wine',
        barcode: code,
        rating: 0,
        notes: p.brands ? `Brand: ${p.brands}` : ''
      };
    }
  } catch (e) {
    console.error('Open Food Facts lookup error:', e);
  }
  return null;
}

