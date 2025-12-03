// -----------------------------------------------------
// CONFIG
// -----------------------------------------------------
const COG_BASE_URL = "https://kazumarkn.github.io/Indonesian-Soil-Macronutrients/cogs/";

const VARIABLES = ["TN", "TP", "TK"];
const DEPTHS = ["K1", "K2", "K3", "K4"];

const UNIT_MAP = {
  "TN": "× 0.01 (% weight)",
  "TP": "× 0.001 (% weight)",
  "TK": "× 0.01 (% weight)"
};

// -----------------------------------------------------
// UI Elements
// -----------------------------------------------------
const map = L.map("map", { center: [-2, 118], zoom: 5 });

L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
  maxZoom: 18, attribution: "ESRI World Imagery"
}).addTo(map);

let geoLayer = null;
let currentURL = "";
let currentVar = "";
let currentDepth = "";

// Get UI
const varSelect = document.getElementById("variableSelect");
const depthSelect = document.getElementById("depthSelect");
const opacityRange = document.getElementById("opacityRange");
const loadBtn = document.getElementById("loadBtn");
const legendDiv = document.getElementById("legend");

// -----------------------------------------------------
// Build Filename
// -----------------------------------------------------
function buildFilename(variable, depth) {
  // Example: TN_K1_000-045cm.tif
  const depthMap = {
    "K1": "000-045",
    "K2": "046-091",
    "K3": "092-116",
    "K4": "117-289"
  };
  return `${variable}_${depth}_${depthMap[depth]}cm.tif`;
}

function buildURL(filename) {
  return COG_BASE_URL + filename;
}

// -----------------------------------------------------
// Create Color Ramp (same as map)
// -----------------------------------------------------
function getColorForValue(t) {
  const r = Math.floor(255 * t);
  const g = Math.floor(255 * (1 - Math.abs(t - 0.5) * 2));
  const b = Math.floor(255 * (1 - t));
  return `rgb(${r},${g},${b})`;
}

// -----------------------------------------------------
// Draw Legend
// -----------------------------------------------------
function updateLegend(min, max) {
  legendDiv.innerHTML = "";

  const title = document.createElement("div");
  title.style.fontWeight = "bold";
  title.style.marginBottom = "4px";
  title.innerHTML = `${currentVar} (${UNIT_MAP[currentVar]})`;
  legendDiv.appendChild(title);

  // Gradient
  const gradient = document.createElement("div");
  gradient.style.width = "160px";
  gradient.style.height = "14px";
  gradient.style.background = `
      linear-gradient(to right,
        ${getColorForValue(0)},
        ${getColorForValue(0.5)},
        ${getColorForValue(1)}
      )
  `;
  gradient.style.border = "1px solid #999";
  gradient.style.marginBottom = "4px";

  legendDiv.appendChild(gradient);

  // Min/Max labels
  const scale = document.createElement("div");
  scale.style.display = "flex";
  scale.style.justifyContent = "space-between";

  scale.innerHTML = `
    <span>${min.toFixed(2)}</span>
    <span>${max.toFixed(2)}</span>
  `;

  legendDiv.appendChild(scale);
}

// -----------------------------------------------------
// Load Raster
// -----------------------------------------------------
async function loadRaster() {
  currentVar = varSelect.value;
  currentDepth = depthSelect.value;

  const filename = buildFilename(currentVar, currentDepth);
  const url = buildURL(filename);
  currentURL = url;

  console.log("Loading:", url);

  loadBtn.disabled = true;
  loadBtn.innerText = "Loading…";

  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error("Failed download");

    const arrayBuffer = await resp.arrayBuffer();
    const georaster = await parseGeoraster(arrayBuffer);

    if (geoLayer) map.removeLayer(geoLayer);

    const mins = georaster.mins[0];
    const maxs = georaster.maxs[0];

    // Create map layer
    geoLayer = new GeoRasterLayer({
      georaster,
      opacity: parseFloat(opacityRange.value),
      resolution: 256,

      pixelValuesToColorFn: values => {
        const v = values[0];
        if (v == null || isNaN(v)) return null;
        const t = (v - mins) / (maxs - mins);
        return getColorForValue(Math.min(1, Math.max(0, t)));
      }
    });

    geoLayer.addTo(map);
    map.fitBounds(geoLayer.getBounds());

    updateLegend(mins, maxs);

  } catch (err) {
    alert("Error loading TIFF: " + err);
    console.error(err);
  }

  loadBtn.disabled = false;
  loadBtn.innerText = "Load / Refresh";
}

// -----------------------------------------------------
// Events
// -----------------------------------------------------
loadBtn.addEventListener("click", loadRaster);

opacityRange.addEventListener("input", () => {
  if (geoLayer) geoLayer.setOpacity(parseFloat(opacityRange.value));
});

// Load default
loadRaster();
