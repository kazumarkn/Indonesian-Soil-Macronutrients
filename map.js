let map = L.map('map').setView([20, 0], 2);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 6,
}).addTo(map);

let currentLayer = null;

async function loadCOG() {
  if (currentLayer) map.removeLayer(currentLayer);

  const variable = document.getElementById('variable').value;
  const depth = document.getElementById('depth').value;
  const opacity = parseFloat(document.getElementById('opacity').value);

  const url = `cogs/${variable}_${depth}.tif`;

  currentLayer = L.tileLayer(`${url}/{z}/{x}/{y}.png`, {
    opacity: opacity,
    tms: false,
  }).addTo(map);
}

document.getElementById('loadBtn').addEventListener('click', loadCOG);
