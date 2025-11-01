// Lightweight reusable map component wrapper using Leaflet and MapTiler tiles
// Exports createMap(containerElement, options) -> { map, setMarker, getMarkerCoords, remove, onClick }

import { MAPTILER_API_KEY } from '../config.js';

export async function createMap(container, opts = {}) {
  if (!container) throw new Error('Map container required');

  // Ensure Leaflet is available
  if (typeof L === 'undefined') {
    throw new Error('Leaflet (L) is not available');
  }

  const center = opts.center || [51.505, -0.09];
  const zoom = typeof opts.zoom === 'number' ? opts.zoom : 12;
  const apiKey = opts.apiKey || MAPTILER_API_KEY || '';
  const useOsmFallback = !apiKey || apiKey.length <= 8;

  // Clean up previous map instance attached to the element if any
  if (container._leaflet_map_instance && container._leaflet_map_instance.remove) {
    try { container._leaflet_map_instance.remove(); } catch (e) {}
    container._leaflet_map_instance = null;
  }

  const map = L.map(container, { center, zoom, zoomControl: true });
  container._leaflet_map_instance = map;

  let tileUrl, attribution;
  if (useOsmFallback) {
    tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    attribution = '&copy; OpenStreetMap contributors';
  } else {
    tileUrl = `https://api.maptiler.com/maps/bright/{z}/{x}/{y}.png?key=${apiKey}`;
    attribution = '&copy; <a href="https://www.maptiler.com/">MapTiler</a> &copy; OpenStreetMap contributors';
  }

  const errorTile = 'data:image/svg+xml;utf8,' + encodeURIComponent("<?xml version='1.0' encoding='UTF-8'?><svg xmlns='http://www.w3.org/2000/svg' width='256' height='256'><rect width='100%' height='100%' fill='%23f3f4f6'/><text x='50%' y='50%' font-size='13' fill='%239ca3af' text-anchor='middle' dominant-baseline='central'>Tile unavailable</text></svg>");

  const tileLayer = L.tileLayer(tileUrl, {
    attribution,
    maxZoom: 19,
    tileSize: 256,
    detectRetina: false,
    errorTileUrl: errorTile,
    updateWhenIdle: true,
    updateWhenZooming: false,
    reuseTiles: true,
    keepBuffer: 1,
    crossOrigin: true
  });

  // Prepare tilesLoaded promise & timeout BEFORE attaching handlers to avoid race conditions
  let tilesLoadedResolve;
  const tilesLoaded = new Promise((resolve) => { tilesLoadedResolve = resolve; });
  const tilesLoadTimeout = setTimeout(() => {
    if (console && console.debug) console.debug('[Map] tiles load timeout reached');
    // If no tiles loaded yet, try switching to OSM as a fallback
    try {
      if (tileLoadCount === 0) {
        if (console && console.debug) console.debug('[Map] No tiles loaded from MapTiler, switching to OSM fallback');
        const osmUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
        try {
          const osmLayer = L.tileLayer(osmUrl, { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' });
          osmLayer.addTo(map);
          try { map.invalidateSize(); } catch (e) {}
        } catch (e) { if (console && console.warn) console.warn('[Map] Failed to add OSM fallback', e); }
      }
    } catch (e) {
      if (console && console.warn) console.warn('[Map] tiles load timeout handler error', e);
    }
    try { tilesLoadedResolve(); } catch (e) {}
  }, 6000);

  // Tile events for diagnostics
  let tileLoadCount = 0;
  tileLayer.on('tileload', (e) => {
    tileLoadCount += 1;
    if (console && console.debug) console.debug('[Map] tileload', tileLoadCount, e.tile && e.tile.src);
  });
  tileLayer.on('tileerror', (err) => {
    if (console && console.warn) console.warn('[Map] tileerror', err);
  });
  tileLayer.on('load', () => {
    if (console && console.debug) console.debug('[Map] tilelayer load - tilesLoaded, total:', tileLoadCount);
    try { map.invalidateSize(); } catch (e) {}
    try { clearTimeout(tilesLoadTimeout); } catch (e) {}
    try { tilesLoadedResolve(); } catch (e) { if (console && console.debug) console.debug('[Map] tilesLoadedResolve error', e); }
  });

  tileLayer.addTo(map);

  // Wait for first tile load or timeout (so callers can hide loading UI once tiles are visible)
  // If the 'load' event had already fired above, ensure we clear timeout (in case listeners order differs)
  // (no-op if already cleared)
  tileLayer.on('load', () => {
    clearTimeout(tilesLoadTimeout);
  });

  // Provide an SVG icon similar to other maps
  const svg = `<?xml version=\"1.0\" encoding=\"UTF-8\"?>
  <svg xmlns='http://www.w3.org/2000/svg' width='32' height='44' viewBox='0 0 32 44'>
    <defs>
      <linearGradient id='pinGradient' x1='0' x2='1' y1='0' y2='1'>
        <stop offset='0%' stop-color='#ff3b30'/>
        <stop offset='100%' stop-color='#c80000'/>
      </linearGradient>
      <mask id='dotMask'>
        <rect width='32' height='44' fill='white'/>
        <circle cx='16' cy='14' r='6' fill='black'/>
      </mask>
    </defs>
    <path d='M16 2C9 2 4 7 4 14c0 9 12 28 12 28s12-19 12-28c0-7-5-12-12-12z' fill='url(%23pinGradient)' stroke='#222' stroke-width='2' mask='url(%23dotMask)'/>
    <circle cx='16' cy='14' r='6' fill='none' stroke='#222' stroke-width='2'/>
  </svg>`;

  const icon = L.icon({
    iconUrl: 'data:image/svg+xml;utf8,' + encodeURIComponent(svg),
    iconSize: [32, 44],
    iconAnchor: [16, 44]
  });

  let marker = null;
  let markerDragHandler = null;
  let circle = null;
  let circleChangeHandler = null;

  function attachMarkerDrag(markerInstance) {
    try {
      if (!markerInstance || !markerInstance.on) return;
      markerInstance.off('dragend');
      markerInstance.on('dragend', (ev) => {
        try {
          const latlng = ev.target.getLatLng();
          if (typeof markerDragHandler === 'function') markerDragHandler(latlng);
        } catch (e) {}
      });
    } catch (e) {}
  }

  function setMarker(latlng, opts = {}) {
    if (!latlng) return;
    const lat = latlng.lat || (Array.isArray(latlng) ? latlng[0] : null);
    const lng = latlng.lng || (Array.isArray(latlng) ? latlng[1] : null);
    if (lat == null || lng == null) return;
    const markerIcon = opts.icon || icon; // use custom icon if provided, else default
    if (!marker) {
      marker = L.marker([lat, lng], { icon: markerIcon, draggable: opts.draggable || false }).addTo(map);
      attachMarkerDrag(marker);
    } else {
      marker.setLatLng([lat, lng]);
      // update draggable state if requested
      try { if (typeof marker.dragging === 'object') {
        if (opts.draggable) marker.dragging.enable(); else marker.dragging.disable();
      } } catch (e) {}
      attachMarkerDrag(marker);
    }
    return marker;
  }

  function getMarkerCoords() {
    if (!marker) return null;
    const pos = marker.getLatLng();
    return { lat: pos.lat, lng: pos.lng };
  }

  function removeMarker() {
    if (marker && marker.remove) {
      marker.remove();
      marker = null;
    }
  }

  function onMarkerDrag(cb) {
    markerDragHandler = typeof cb === 'function' ? cb : null;
  }

  function setCircle(center, radius = 1000, opts = {}) {
    if (!center) return;
    const lat = center.lat || (Array.isArray(center) ? center[0] : null);
    const lng = center.lng || (Array.isArray(center) ? center[1] : null);
    if (lat == null || lng == null) return;
    if (!circle) {
      circle = L.circle([lat, lng], {
        radius,
        color: opts.color || '#007aff',
        fillColor: opts.fillColor || '#007aff',
        fillOpacity: opts.fillOpacity || 0.15,
        weight: opts.weight || 2,
        interactive: !!opts.interactive
      }).addTo(map);
      if (opts.interactive) {
        circle.on('mousedown', function (e) {
          map.dragging.disable();
          map.on('mousemove', resizeCircle);
          map.once('mouseup', function () {
            map.dragging.enable();
            map.off('mousemove', resizeCircle);
          });
        });
      }
    } else {
      circle.setLatLng([lat, lng]);
      circle.setRadius(radius);
    }
    if (typeof circleChangeHandler === 'function') circleChangeHandler({ center: { lat, lng }, radius });
    return circle;
  }

  function getCircle() {
    if (!circle) return null;
    const center = circle.getLatLng();
    const radius = circle.getRadius();
    return { center: { lat: center.lat, lng: center.lng }, radius };
  }

  function removeCircle() {
    if (circle) { map.removeLayer(circle); circle = null; }
  }

  function onCircleChange(handler) {
    circleChangeHandler = handler;
  }

  function resizeCircle(e) {
    if (!circle) return;
    const center = circle.getLatLng();
    const dist = map.distance(center, e.latlng);
    circle.setRadius(dist);
    if (typeof circleChangeHandler === 'function') circleChangeHandler({ center, radius: dist });
  }

  function onClick(handler) {
    if (!map) return;
    map.off('click');
    if (typeof handler === 'function') {
      map.on('click', function (e) {
        handler(e.latlng);
      });
    }
  }

  function remove() {
    try { removeMarker(); } catch (e) {}
    try { map.remove(); } catch (e) {}
    if (container && container._leaflet_map_instance) container._leaflet_map_instance = null;
    removeCircle();
  }

  // Return a small API
  return {
    map,
    setMarker,
    getMarkerCoords,
    removeMarker,
    onMarkerDrag,
    setCircle,
    getCircle,
    removeCircle,
    onCircleChange,
    remove,
    onClick
  };
}
