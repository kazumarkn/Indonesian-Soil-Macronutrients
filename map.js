/* map.js
   Browser viewer for Cloud-Optimized GeoTIFFs (COGs)
   - Renders selected variable/depth as a Leaflet GridLayer
   - Samples a pixel value on click and displays scaled unit
   NOTE: Requires GeoTIFF global (geotiff.browser.min.js) loaded before this file.
*/

// --- Configuration: base URL where your COGs are hosted (GitHub Pages recommended)
const repoBase = 'https://kazumarkn.github.io/Indonesian-Soil-Macronutrients/cogs/';

// --- UI elements
const variableEl = document.getElementById('variable');
const depthEl = document.getElementById('depth');
const opacityEl = document.getElementById('opacity');
const loadBtn = document.getElementById('loadBtn');
const clearBtn = document.getElementById('clearBtn');
const sampleValueEl = document.getElementById('sampleValue');
const unitsTextEl = document.getElementById('unitsText');

// --- variable metadata (multiplier and unit)
const variableMeta = {
  TN: { multiplier: 0.01, unit: '% w/w', desc: 'TN: value × 0.01 → percent of weight' },
  TP: { multiplier: 0.001, unit: '% w/w', desc: 'TP: value × 0.001 → percent of weight' },
  TK: { multiplier: 0.01, unit: '% w/w', desc: 'TK: value × 0.01 → percent of weight' }
};

// --- map init
const map = L.map('map').setView([0, 115], 4);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// --- helper: filename generator
function filenameFor(variable, depth) {
  const ranges = {
    K1: '000-045cm',
    K2: '046-091cm',
    K3: '092-116cm',
    K4: '117-289cm'
  };
  const r = ranges[depth] || ranges.K1;
  return `${variable}_${depth}_${r}.tif`;
}
function cogUrlFor(variable, depth) {
  return repoBase + filenameFor(variable, depth);
}

// --- show units
function updateUnitsText() {
  const v = variableEl.value;
  unitsTextEl.textContent = `${variableMeta[v].desc} — displayed unit: ${variableMeta[v].unit}`;
}
updateUnitsText();
variableEl.addEventListener('change', updateUnitsText);

// --- GeoTIFF cache (avoid reopening same file)
const tiffCache = new Map(); // url -> {tiff, image, width, height, bbox}

/** openGeoTIFF(url) -> returns {tiff, image, width, height, bbox} and caches */
async function openGeoTIFF(url) {
  if (tiffCache.has(url)) return tiffCache.get(url);

  if (typeof GeoTIFF === 'undefined') throw new Error('GeoTIFF is not defined — ensure geotiff.browser.min.js is loaded');

  // Use GeoTIFF.fromUrl which supports range requests for COGs
  const tiff = await GeoTIFF.fromUrl(url);
  const image = await tiff.getImage(); // first image
  const width = image.getWidth();
  const height = image.getHeight();
  // bounding box [minX, minY, maxX, maxY]
  let bbox;
  try {
    bbox = image.getBoundingBox();
  } catch (e) {
    // fallback: attempt to read tie points / geoTransform
    throw new Error('Unable to read bounding box from GeoTIFF. Make sure GeoTIFF includes georeference.');
  }

  const info = { tiff, image, width, height, bbox };
  tiffCache.set(url, info);
  return info;
}

/** Converts lat/lon to pixel coordinates (px, py) in raster coordinates */
function latLonToPixel(lon, lat, bbox, width, height) {
  const [minX, minY, maxX, maxY] = bbox;
  const x = (lon - minX) / (maxX - minX) * width;
  const y = (maxY - lat) / (maxY - minY) * height; // y origin top
  return { px: Math.floor(x), py: Math.floor(y) };
}

/** sampleGeoTIFFAtLatLng(url, lat, lon) -> returns raw value (band 1) or null */
async function sampleGeoTIFFAtLatLng(url, lat, lon) {
  const info = await openGeoTIFF(url);
  const { image, width, height, bbox } = info;
  const { px, py } = latLonToPixel(lon, lat, bbox, width, height);

  if (px < 0 || py < 0 || px >= width || py >= height) return null;

  // read one pixel window
  const rasters = await image.readRasters({ window: [px, py, px + 1, py + 1] });
  const band0 = rasters[0];
  if (!band0 || band0.length === 0) return null;
  return band0[0];
}

/** createGeoTiffGridLayer(url, options) -> returns a Leaflet GridLayer */
async function createGeoTiffGridLayer(url, options = {}) {
  const info = await openGeoTIFF(url);
  const { image, width, height, bbox } = info;
  const tileSize = options.tileSize || 256;
  const opacity = options.opacity ?? 1;

  // small helper to compute window for a tile
  function tileWindow(tileBounds) {
    const nw = tileBounds.getNorthWest();
    const se = tileBounds.getSouthEast();

    // tile lon/lat bounds
    const lonMin = Math.max(nw.lng, bbox[0]);
    const lonMax = Math.min(se.lng, bbox[2]);
    const latMax = Math.min(nw.lat, bbox[3]);
    const latMin = Math.max(se.lat, bbox[1]);

    if (lonMax <= lonMin || latMax <= latMin) return null;

    const x0 = (lonMin - bbox[0]) / (bbox[2] - bbox[0]) * width;
    const x1 = (lonMax - bbox[0]) / (bbox[2] - bbox[0]) * width;
    const y0 = (bbox[3] - latMax) / (bbox[3] - bbox[1]) * height;
    const y1 = (bbox[3] - latMin) / (bbox[3] - bbox[1]) * height;

    // integer window in raster coords
    const wx0 = Math.max(0, Math.floor(x0));
    const wy0 = Math.max(0, Math.floor(y0));
    const wx1 = Math.min(width, Math.ceil(x1));
    const wy1 = Math.min(height, Math.ceil(y1));

    return { wx0, wy0, wx1, wy1, x0, x1, y0, y1 };
  }

  const grid = L.gridLayer({
    tileSize,
    maxZoom: 12,
    createTile: function(coords, done) {
      const canvas = document.createElement('canvas');
      canvas.width = tileSize; canvas.height = tileSize;
      const ctx = canvas.getContext('2d');

      // compute tile bounds in lat/lng
      const nwPoint = coords.multiplyBy(tileSize);
      const sePoint = nwPoint.add([tileSize, tileSize]);
      const nw = map.unproject(nwPoint, coords.z);
      const se = map.unproject(sePoint, coords.z);
      const tileBounds = L.latLngBounds(se, nw); // careful: LatLngBounds(southWest, northEast)

      const win = tileWindow(tileBounds);
      if (!win) {
        done(null, canvas); // tile outside raster
        return canvas;
      }

      const { wx0, wy0, wx1, wy1 } = win;
      const winW = Math.max(1, wx1 - wx0);
      const winH = Math.max(1, wy1 - wy0);

      // read and resample to tileSize to draw quickly
      image.readRasters({
        window: [wx0, wy0, wx1, wy1],
        width: tileSize,
        height: tileSize,
        resampleMethod: 'bilinear'
      }).then(rasters => {
        const band = rasters[0];
        // compute min/max for this tile for simple stretch
        let minv = Infinity, maxv = -Infinity;
        for (let i = 0; i < band.length; i++) {
          const v = band[i];
          if (v == null || Number.isNaN(v)) continue;
          if (v < minv) minv = v;
          if (v > maxv) maxv = v;
        }
        if (!isFinite(minv) || !isFinite(maxv) || minv === maxv) {
          // nothing to draw (no-data or constant)
          done(null, canvas);
          return;
        }

        const img = ctx.createImageData(tileSize, tileSize);
        for (let i = 0; i < band.length; i++) {
          const v = band[i];
          const idx = i * 4;
          if (v == null || Number.isNaN(v)) {
            img.data[idx + 0] = 0;
            img.data[idx + 1] = 0;
            img.data[idx + 2] = 0;
            img.data[idx + 3] = 0; // transparent
          } else {
            const norm = (v - minv) / (maxv - minv);
            const c = Math.round(255 * norm);
            img.data[idx + 0] = c;
            img.data[idx + 1] = c;
            img.data[idx + 2] = c;
            img.data[idx + 3] = Math.round(255 * opacity);
          }
        }
        ctx.putImageData(img, 0, 0);
        done(null, canvas);
      }).catch(err => {
        console.error('readRasters error', err);
        done(err, canvas);
      });

      return canvas;
    }
  });

  // expose a convenience method to change opacity easily
  grid.setOpacity = function(op) {
    this.options.opacity = op;
    // Leaflet will redraw tiles automatically if you call redraw
    this.redraw();
  };

  return grid;
}

// --- active layer bookkeeping
let activeLayer = null;
let activeLayerMeta = null;

// load button
loadBtn.addEventListener('click', async () => {
  const variable = variableEl.value;
  const depth = depthEl.value;
  const url = cogUrlFor(variable, depth);
  const opacity = Math.max(0, Math.min(1, opacityEl.value / 100));

  // remove previous
  if (activeLayer) {
    map.removeLayer(activeLayer);
    activeLayer = null;
    activeLayerMeta = null;
  }

  // Try to create and add the COG layer
  try {
    const layer = await createGeoTiffGridLayer(url, { opacity });
    layer.addTo(map);
    activeLayer = layer;
    activeLayerMeta = { url, variable };
    // zoom to study area if bbox available
    const info = await openGeoTIFF(url);
    const [minX, minY, maxX, maxY] = info.bbox;
    const southWest = L.latLng(minY, minX);
    const northEast = L.latLng(maxY, maxX);
    map.fitBounds(L.latLngBounds(southWest, northEast), { maxZoom: 10 });
  } catch (err) {
    alert('Failed to load COG: ' + (err.message || err) + '\nCheck that the URL is reachable and that COG supports range requests (host on GitHub Pages or S3).');
    console.error(err);
  }
});

// clear button
clearBtn.addEventListener('click', () => {
  if (activeLayer) {
    map.removeLayer(activeLayer);
    activeLayer = null;
    activeLayerMeta = null;
  }
  sampleValueEl.textContent = '—';
});

// opacity slider live
opacityEl.addEventListener('input', () => {
  const op = Math.max(0, Math.min(1, opacityEl.value / 100));
  if (activeLayer) activeLayer.setOpacity(op);
});

// map click -> sample value
map.on('click', async (e) => {
  if (!activeLayerMeta) {
    sampleValueEl.textContent = 'No layer loaded';
    return;
  }
  const { url, variable } = activeLayerMeta;
  try {
    const raw = await sampleGeoTIFFAtLatLng(url, e.latlng.lat, e.latlng.lng);
    if (raw === null || Number.isNaN(raw)) {
      sampleValueEl.textContent = 'No data';
      return;
    }
    const meta = variableMeta[variable];
    const scaled = raw * meta.multiplier;
    sampleValueEl.textContent = `${scaled.toFixed(4)} ${meta.unit} (raw=${raw})`;
  } catch (err) {
    console.error(err);
    sampleValueEl.textContent = 'Err';
  }
});
