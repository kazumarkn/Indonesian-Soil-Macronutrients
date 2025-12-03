/* geotiff.js
   Helper functions for:
   1) Rendering GeoTIFF as a Leaflet GridLayer
   2) Sampling pixel values at lat/lng
*/

if (typeof GeoTIFF === "undefined") {
  console.error("GeoTIFF global object missing. Load geotiff.browser.min.js before geotiff.js.");
}


/* --------------------------------------------------------------
   INTERNAL: Load the TIFF & its first image
-------------------------------------------------------------- */
async function loadTiff(url) {
  const tiff = await GeoTIFF.fromUrl(url);     // Uses range requests automatically
  const image = await tiff.getImage();
  const rasters = await image.readRasters();

  return { tiff, image, rasters };
}


/* --------------------------------------------------------------
   INTERNAL: Convert lat/lng → raster pixel coordinates
-------------------------------------------------------------- */
function latLngToPixel(lat, lon, image) {
  const [originX, pixelWidth, , originY, , pixelHeight] = image.getGeoKeys().ModelPixelScale
    ? [
        image.getBoundingBox()[0], 
        image.getPixelScale()[0], 
        0,
        image.getBoundingBox()[3], 
        0,
        -image.getPixelScale()[1]
      ]
    : image.getTiePoints()[0];

  const invGeoTransform = image.getGeoTransform();

  if (invGeoTransform) {
    const xPix = Math.floor((lon - invGeoTransform[0]) / invGeoTransform[1]);
    const yPix = Math.floor((lat - invGeoTransform[3]) / invGeoTransform[5]);
    return { x: xPix, y: yPix };
  }

  // Fallback
  const xPix = Math.floor((lon - originX) / pixelWidth);
  const yPix = Math.floor((lat - originY) / pixelHeight);

  return { x: xPix, y: yPix };
}


/* --------------------------------------------------------------
   PUBLIC: Sample TIFF at a latitude, longitude
-------------------------------------------------------------- */
async function sampleGeoTIFFAtLatLng(url, lat, lon) {
  const { image, rasters } = await loadTiff(url);

  const { x, y } = latLngToPixel(lat, lon, image);

  if (
    x < 0 ||
    y < 0 ||
    x >= image.getWidth() ||
    y >= image.getHeight()
  ) {
    return null;
  }

  return rasters[0][y * image.getWidth() + x];
}


/* --------------------------------------------------------------
   PUBLIC: Convert GeoTIFF into Leaflet GridLayer
-------------------------------------------------------------- */
async function createGeoTiffGridLayer(url, options) {
  const { image } = await loadTiff(url);

  const width = image.getWidth();
  const height = image.getHeight();
  const bbox = image.getBoundingBox(); // minX, minY, maxX, maxY

  const layer = L.gridLayer({
    opacity: options.opacity ?? 1.0,
    tileSize: 256
  });

  layer.createTile = function(tilePoint, done) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = 256;
    canvas.height = 256;

    const tileBounds = this._tileCoordsToBounds(tilePoint);
    const north = tileBounds.getNorth();
    const south = tileBounds.getSouth();
    const west = tileBounds.getWest();
    const east = tileBounds.getEast();

    const xMin = ((west - bbox[0]) / (bbox[2] - bbox[0])) * width;
    const xMax = ((east - bbox[0]) / (bbox[2] - bbox[0])) * width;

    const yMin = ((bbox[3] - north) / (bbox[3] - bbox[1])) * height;
    const yMax = ((bbox[3] - south) / (bbox[3] - bbox[1])) * height;

    drawPartialRaster(url, ctx, xMin, yMin, xMax, yMax)
      .then(() => done(null, canvas))
      .catch(err => {
        console.error("Tile draw error:", err);
        done(null, canvas);
      });

    return canvas;
  };

  return layer;
}


/* --------------------------------------------------------------
   INTERNAL: Draw subset of raster into tile canvas
   Efficient COG tile reading
-------------------------------------------------------------- */
async function drawPartialRaster(url, ctx, xMin, yMin, xMax, yMax) {
  const tiff = await GeoTIFF.fromUrl(url);

  const window = [
    Math.floor(xMin),
    Math.floor(yMin),
    Math.ceil(xMax),
    Math.ceil(yMax)
  ];

  const image = await tiff.getImage();
  const rasters = await image.readRasters({ window });

  const width = window[2] - window[0];
  const height = window[3] - window[1];

  const imgData = ctx.createImageData(256, 256);

  for (let i = 0; i < imgData.data.length; i += 4) {
    const idx = Math.floor((i / 4) * (width * height) / 65536);
    const v = rasters[0][idx];

    const color = v ? scaleGrey(v) : 0;

    imgData.data[i] = color;
    imgData.data[i + 1] = color;
    imgData.data[i + 2] = color;
    imgData.data[i + 3] = 255;
  }

  ctx.putImageData(imgData, 0, 0);
}


/* --------------------------------------------------------------
   INTERNAL: Greyscale lookup
-------------------------------------------------------------- */
function scaleGrey(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return 0;
  return Math.max(0, Math.min(255, v));
}


/* --------------------------------------------------------------
   Export to global namespace
-------------------------------------------------------------- */
window.sampleGeoTIFFAtLatLng = sampleGeoTIFFAtLatLng;
window.createGeoTiffGridLayer = createGeoTiffGridLayer;
