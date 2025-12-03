// --------------------------------------
// CONFIG
// --------------------------------------
const COG_BASE_URL = "https://kazumarkn.github.io/Indonesian-Soil-Macronutrients/cogs/";

// All available COG files mapped by variable + depth
const COG_FILES = {
  TN: {
    K1: "TN_K1_000-045cm.tif",
    K2: "TN_K2_046-091cm.tif",
    K3: "TN_K3_092-116cm.tif",
    K4: "TN_K4_117-289cm.tif"
  },
  TP: {
    K1: "TP_K1_000-045cm.tif",
    K2: "TP_K2_046-091cm.tif",
    K3: "TP_K3_092-116cm.tif",
    K4: "TP_K4_117-289cm.tif"
  },
  TK: {
    K1: "TK_K1_000-045cm.tif",
    K2: "TK_K2_046-091cm.tif",
    K3: "TK_K3_092-116cm.tif",
    K4: "TK_K4_117-289cm.tif"
  }
};

// --------------------------------------
// MAP + UI SETUP
// --------------------------------------
const map = L.map("map", {center:[-2,118], zoom:5});

L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", 
  { maxZoom:18 }
).addTo(map);

let rasterLayer = null;

// UI elements
const varSelect = document.getElementById("variableSelect");
const depthSelect = document.getElementById("depthSelect");
const loadBtn = document.getElementById("loadBtn");
const opacityRange = document.getElementById("opacityRange");

// --------------------------------------
// Load Raster
// --------------------------------------
async function loadRaster(variable, depth) {
  const filename = COG_FILES[variable][depth];
  const url = COG_BASE_URL + filename;

  console.log("Loading:", url);

  try {
    loadBtn.innerText = "Loading...";
    loadBtn.disabled = true;

    const response = await fetch(url);
    if (!response.ok) throw new Error("File not found: " + url);

    const arrayBuffer = await response.arrayBuffer();
    const georaster = await parseGeoraster(arrayBuffer);

    if (rasterLayer) map.removeLayer(rasterLayer);

    rasterLayer = new GeoRasterLayer({
      georaster,
      opacity: parseFloat(opacityRange.value),
      resolution: 256,
      pixelValuesToColorFn: values => {
        const v = values[0];
        if (v == null || isNaN(v)) return null;
        const min = georaster.mins[0];
        const max = georaster.maxs[0];
        const t = (v - min) / (max - min);
        const r = Math.floor(255 * t);
        const g = Math.floor(255 * (1 - Math.abs(t - 0.5) * 2));
        const b = Math.floor(255 * (1 - t));
        return `rgb(${r},${g},${b})`;
      }
    });

    rasterLayer.addTo(map);
    map.fitBounds(rasterLayer.getBounds());

  } catch (err) {
    console.error(err);
    alert("Failed to load COG:\n" + url);
  } finally {
    loadBtn.innerText = "Load";
    loadBtn.disabled = false;
  }
}

// --------------------------------------
// UI Binding
// --------------------------------------
loadBtn.addEventListener("click", () => {
  loadRaster(varSelect.value, depthSelect.value);
});

opacityRange.addEventListener("input", () => {
  if (rasterLayer) rasterLayer.setOpacity(parseFloat(opacityRange.value));
});

// Load default
loadRaster("TN", "K1");
