// -------------------------------------------------------
// CONFIG
// -------------------------------------------------------

// Base URL where your TN/TP/TK GeoTIFFs are hosted
const COG_BASE_URL = "https://kazumarkn.github.io/Indonesian-Soil-Macronutrients/cogs/";

// Variables
const VARIABLES = ["TN", "TP", "TK"];

// Depths
const DEPTHS = ["K1", "K2", "K3", "K4"];

// Multipliers for displayed value
const MULTIPLIERS = {
  "TN": 0.01,   // % w/w
  "TP": 0.001,  // % w/w
  "TK": 0.01    // % w/w
};


// -------------------------------------------------------
// UI AND MAP
// -------------------------------------------------------

const map = L.map("map", { center: [-2.0, 118], zoom: 5 });

// ESRI satellite
L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  { maxZoom: 18, attribution: "ESRI World Imagery" }
).addTo(map);

let geoLayer = null;
let currentFilename = "";

// DOM references
const varSelect = document.getElementById("variableSelect");
const depthSelect = document.getElementById("depthSelect");
const loadBtn = document.getElementById("loadBtn");
const opacityRange = document.getElementById("opacityRange");


// -------------------------------------------------------
// Filename + URL builder
// -------------------------------------------------------
function buildFilename(variable, depth) {
  // Example: TN_K1.tif
  return `${variable}_${depth}.tif`;
}
function buildURL(filename) {
  return COG_BASE_URL + filename;
}


// -------------------------------------------------------
// Test whether file is accessible
// -------------------------------------------------------
async function testURL(url) {
  try {
    const head = await fetch(url, { method: "HEAD" });
    return { ok: head.ok };
  } catch {
    return { ok: false };
  }
}


// -------------------------------------------------------
// Load + Display GeoTIFF
// -------------------------------------------------------
async function loadAndDisplay(variable, depth) {
  const filename = buildFilename(variable, depth);
  const url = buildURL(filename);
  currentFilename = filename;

  loadBtn.innerText = "Loading...";
  loadBtn.disabled = true;

  const t = await testURL(url);
  if (!t.ok) {
    alert("COG not found:\n" + url);
    loadBtn.innerText = "Load / Refresh";
    loadBtn.disabled = false;
    return;
  }

  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error("Could not download.");

    const arrayBuffer = await resp.arrayBuffer();
    const georaster = await parseGeoraster(arrayBuffer);

    if (geoLayer) {
      map.removeLayer(geoLayer);
      geoLayer = null;
    }

    geoLayer = new GeoRasterLayer({
      georaster,
      opacity: parseFloat(opacityRange.value),
      resolution: 256,

      // Simple continuous color ramp
      pixelValuesToColorFn: values => {
        const v = values[0];
        if (v == null || isNaN(v)) return null;

        const min = georaster.mins ? georaster.mins[0] : 0;
        const max = georaster.maxs ? georaster.maxs[0] : 1;

        const t = (v - min) / (max - min);
        const c = Math.max(0, Math.min(1, t));

        const r = Math.floor(255 * c);
        const g = Math.floor(255 * (1 - Math.abs(c - 0.5) * 2));
        const b = Math.floor(255 * (1 - c));
        return `rgb(${r},${g},${b})`;
      }
    });

    geoLayer.addTo(map);

    try { map.fitBounds(geoLayer.getBounds()); } catch (e) {}

    map.off("click", onMapClick);
    map.on("click", onMapClick);

  } catch (err) {
    console.error(err);
    alert("Failed to load raster.");
  }

  loadBtn.innerText = "Load / Refresh";
  loadBtn.disabled = false;
}


// -------------------------------------------------------
// Click – show pixel values
// -------------------------------------------------------
async function onMapClick(evt) {
  if (!geoLayer || !geoLayer.getValueAtLatLng) return;

  try {
    const rawVal = await geoLayer.getValueAtLatLng(evt.latlng.lat, evt.latlng.lng);

    const variable = varSelect.value;
    const multiplier = MULTIPLIERS[variable] || 1;

    const processedVal = rawVal * multiplier;

    let unit = "% w/w";

    const content = `
      <b>${variable} at ${depthSelect.value}</b><br>
      Raw: ${rawVal}<br>
      Converted: ${processedVal.toFixed(4)} ${unit}<br>
      <small>${currentFilename}</small>
    `;

    L.popup()
      .setLatLng(evt.latlng)
      .setContent(content)
      .openOn(map);

  } catch (err) {
    console.warn("Cannot read pixel", err);
  }
}


// -------------------------------------------------------
// UI Bindings
// -------------------------------------------------------
loadBtn.addEventListener("click", () => {
  loadAndDisplay(varSelect.value, depthSelect.value);
});

opacityRange.addEventListener("input", () => {
  if (geoLayer && geoLayer.setOpacity) {
    geoLayer.setOpacity(parseFloat(opacityRange.value));
  }
});


// -------------------------------------------------------
// Initial load
// -------------------------------------------------------
(function init() {
  varSelect.value = "TN";
  depthSelect.value = "K1";
  loadBtn.click();
})();
