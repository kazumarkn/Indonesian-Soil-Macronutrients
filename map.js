/* map.js
   Leaflet app combining UI and the geoTIFF grid layer sampling code from geotiff.js
*/

const repoBase = 'https://kazumarkn.github.io/Indonesian-Soil-Macronutrients/cogs/'; 

// Map init
const map = L.map('map').setView([20, 0], 2);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// UI elements
const variableEl = document.getElementById('variable');
const depthEl = document.getElementById('depth');
const opacityEl = document.getElementById('opacity');
const loadBtn = document.getElementById('loadBtn');
const clearBtn = document.getElementById('clearBtn');
const sampleValueEl = document.getElementById('sampleValue');
const unitsTextEl = document.getElementById('unitsText');

let activeLayer = null;
let activeLayerMeta = null;

// variable metadata (multiplier and units)
const variableMeta = {
  TN: { multiplier: 0.01, unit: '% w/w', desc: 'TN: value × 0.01 → percent of weight' },
  TP: { multiplier: 0.001, unit: '% w/w', desc: 'TP: value × 0.001 → percent of weight' },
  TK: { multiplier: 0.01, unit: '% w/w', desc: 'TK: value × 0.01 → percent of weight' }
};

function filenameFor(variable, depth) {
  // FILENAME pattern in your message: TK_K1_000-045cm.tif etc.
  // We'll assume files named like: TN_K1_000-045cm.tif, TP_K1_000-045cm.tif
  const depthTag = depth; // K1, K2, K3, K4
  const ranges = {
    K1: '000-045cm',
    K2: '046-091cm',
    K3: '092-116cm',
    K4: '117-289cm'
  };
  const range = ranges[depth] || '000-045cm';
  return `${variable}_${depthTag}_${range}.tif`;
}

function updateUnitsText() {
  const meta = variableMeta[variableEl.value];
  unitsTextEl.textContent = `${meta.desc} — displayed unit: ${meta.unit}`;
}
updateUnitsText();
variableEl.addEventListener('change', updateUnitsText);

// Build URL to the COG file
function cogUrlFor(variable, depth) {
  return repoBase + filenameFor(variable, depth);
}

// Load button
loadBtn.addEventListener('click', async () => {
  const variable = variableEl.value;
  const depth = depthEl.value;
  const url = cogUrlFor(variable, depth);
  const opacity = Math.max(0, Math.min(1, opacityEl.value / 100));

  if (activeLayer) {
    map.removeLayer(activeLayer);
    activeLayer = null;
  }

  // create grid layer using geotiff helper (implemented in geotiff.js)
  try {
    const layer = await createGeoTiffGridLayer(url, {
      opacity
    });
    activeLayer = layer;
    activeLayerMeta = { url, variable };
    layer.addTo(map);
  } catch (err) {
    alert('Failed to load COG: ' + err.message + '\nCheck that the file URL is reachable and supports range requests.');
    console.error(err);
  }
});

// Clear button
clearBtn.addEventListener('click', () => {
  if (activeLayer) map.removeLayer(activeLayer);
  activeLayer = null;
  activeLayerMeta = null;
  sampleValueEl.textContent = '—';
});

// Opacity slider
opacityEl.addEventListener('input', () => {
  if (activeLayer) {
    activeLayer.setOpacity(Math.max(0, Math.min(1, opacityEl.value / 100)));
  }
});

// Sampling on map click
map.on('click', async function(e) {
  if (!activeLayerMeta) {
    sampleValueEl.textContent = 'No layer loaded';
    return;
  }
  const latlng = e.latlng;
  const { url, variable } = activeLayerMeta;

  try {
    const raw = await sampleGeoTIFFAtLatLng(url, latlng.lat, latlng.lng);
    if (raw === null || Number.isNaN(raw)) {
      sampleValueEl.textContent = 'No data';
      return;
    }
    const meta = variableMeta[variable];
    const scaled = raw * meta.multiplier;
    sampleValueEl.textContent = `${scaled.toFixed(4)} ${meta.unit} (raw=${raw})`;
  } catch (err) {
    console.error(err);
    sampleValueEl.textContent = 'Error';
  }
});
