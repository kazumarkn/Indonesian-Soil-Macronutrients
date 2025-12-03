/* map.js – fixed version
   Ensures GeoTIFF global exists and loads properly.
*/

if (typeof GeoTIFF === "undefined") {
  console.error("GeoTIFF is not defined. Check geotiff.browser.min.js is loaded BEFORE geotiff.js and map.js.");
}

/* -------------------------------------------------------
   Base URL hosting your COGs on GitHub Pages
------------------------------------------------------- */
const repoBase = 'https://kazumarkn.github.io/Indonesian-Soil-Macronutrients/cogs/'; 


/* -------------------------------------------------------
   Leaflet Map Initialization
------------------------------------------------------- */
const map = L.map('map').setView([20, 0], 2);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);


/* -------------------------------------------------------
   UI Elements
------------------------------------------------------- */
const variableEl = document.getElementById('variable');
const depthEl = document.getElementById('depth');
const opacityEl = document.getElementById('opacity');
const loadBtn = document.getElementById('loadBtn');
const clearBtn = document.getElementById('clearBtn');
const sampleValueEl = document.getElementById('sampleValue');
const unitsTextEl = document.getElementById('unitsText');

let activeLayer = null;
let activeLayerMeta = null;


/* -------------------------------------------------------
   Variable metadata
------------------------------------------------------- */
const variableMeta = {
  TN: { multiplier: 0.01, unit: '% w/w', desc: 'TN: value × 0.01 → percent of weight' },
  TP: { multiplier: 0.001, unit: '% w/w', desc: 'TP: value × 0.001 → percent of weight' },
  TK: { multiplier: 0.01, unit: '% w/w', desc: 'TK: value × 0.01 → percent of weight' }
};


/* -------------------------------------------------------
   Filename generator
------------------------------------------------------- */
function filenameFor(variable, depth) {
  const ranges = {
    K1: "000-045cm",
    K2: "046-091cm",
    K3: "092-116cm",
    K4: "117-289cm",
  };
  return `${variable}_${depth}_${ranges[depth]}.tif`;
}

function cogUrlFor(variable, depth) {
  return repoBase + filenameFor(variable, depth);
}


/* -------------------------------------------------------
   Update Units UI
------------------------------------------------------- */
function updateUnitsText() {
  const meta = variableMeta[variableEl.value];
  unitsTextEl.textContent = `${meta.desc} — displayed unit: ${meta.unit}`;
}
updateUnitsText();
variableEl.addEventListener("change", updateUnitsText);


/* -------------------------------------------------------
   Load COG Layer
------------------------------------------------------- */
loadBtn.addEventListener('click', async () => {
  const variable = variableEl.value;
  const depth = depthEl.value;
  const url = cogUrlFor(variable, depth);
  const opacity = Math.max(0, Math.min(1, opacityEl.value / 100));

  if (!window.GeoTIFF) {
    alert("GeoTIFF is not defined — geotiff.browser.min.js is not loaded.");
    return;
  }

  // Clear previous layer
  if (activeLayer) {
    map.removeLayer(activeLayer);
    activeLayer = null;
  }

  try {
    const layer = await createGeoTiffGridLayer(url, { opacity });
    activeLayer = layer;
    activeLayerMeta = { url, variable };
    layer.addTo(map);
  } catch (err) {
    alert("Failed to load COG: " + err.message + "\nCheck COG URL & range requests.");
    console.error(err);
  }
});


/* -------------------------------------------------------
   Clear Button
------------------------------------------------------- */
clearBtn.addEventListener("click", () => {
  if (activeLayer) map.removeLayer(activeLayer);
  activeLayer = null;
  activeLayerMeta = null;
  sampleValueEl.textContent = "—";
});


/* -------------------------------------------------------
   Opacity control
------------------------------------------------------- */
opacityEl.addEventListener('input', () => {
  if (activeLayer) {
    activeLayer.setOpacity(Math.max(0, Math.min(1, opacityEl.value / 100)));
  }
});


/* -------------------------------------------------------
   Map click: raster sampling via geotiff.js
------------------------------------------------------- */
map.on("click", async (e) => {
  if (!activeLayerMeta) {
    sampleValueEl.textContent = "No layer loaded";
    return;
  }

  const lat = e.latlng.lat;
  const lon = e.latlng.lng;
  const { url, variable } = activeLayerMeta;

  try {
    const raw = await sampleGeoTIFFAtLatLng(url, lat, lon);

    if (raw === null || Number.isNaN(raw)) {
      sampleValueEl.textContent = "No data";
      return;
    }

    const meta = variableMeta[variable];
    const scaled = raw * meta.multiplier;

    sampleValueEl.textContent = `${scaled.toFixed(4)} ${meta.unit} (raw=${raw})`;

  } catch (err) {
    console.error(err);
    sampleValueEl.textContent = "Error";
  }
});
