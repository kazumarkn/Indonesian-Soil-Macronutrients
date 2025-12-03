// COG pixel value sampling
// Requires geotiff.browser.min.js (already included in index.html)

let lastTiff = null;
let lastImage = null;
let lastGeoTransform = null;

async function loadGeoTIFF(url) {
  const tiff = await GeoTIFF.fromUrl(url);
  const image = await tiff.getImage();
  lastTiff = tiff;
  lastImage = image;
  lastGeoTransform = image.getGeoKeys();
  return image;
}

async function readPixelValue(lat, lon) {
  if (!lastImage) return null;

  const bbox = lastImage.getBoundingBox();
  const width = lastImage.getWidth();
  const height = lastImage.getHeight();

  const x = Math.floor(((lon - bbox[0]) / (bbox[2] - bbox[0])) * width);
  const y = Math.floor(((bbox[3] - lat) / (bbox[3] - bbox[1])) * height);

  const data = await lastImage.readRasters({ window: [x, y, x + 1, y + 1] });
  return data[0][0];
}

map.on('click', async function (e) {
  const variable = document.getElementById('variable').value;
  const depth = document.getElementById('depth').value;
  const url = `cogs/${variable}_${depth}.tif`;

  if (!lastImage) await loadGeoTIFF(url);

  const v = await readPixelValue(e.latlng.lat, e.latlng.lng);

  let unit = '';
  if (variable === 'TN') unit = 'x 0.01 % weight';
  if (variable === 'TP') unit = 'x 0.001 % weight';
  if (variable === 'TK') unit = 'x 0.01 % weight';

  L.popup()
    .setLatLng(e.latlng)
    .setContent(`Value: ${v} (${unit})`)
    .openOn(map);
});
