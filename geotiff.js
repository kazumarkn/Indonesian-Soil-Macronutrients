/* geotiff.js
   Helper functions using geotiff.js (browser build)
   - createGeoTiffGridLayer(url, options): returns an L.GridLayer that renders the COG tiles on the leaflet map
   - sampleGeoTIFFAtLatLng(url, lat, lon): sample one pixel & return raw value (no multiplier)
*/

const geoTiffCache = new Map(); // url -> {tiff, image, width, height, bbox}

async function openGeoTIFF(url) {
  if (geoTiffCache.has(url)) return geoTiffCache.get(url);

  // NOTE: geotiff.fromUrl (or GeoTIFF.fromUrl) will attempt range requests if supported
  const tiff = await GeoTIFF.fromUrl(url, { allowFullFile: false }); // lean attempt to use range requests
  const image = await tiff.getImage();

  // get basics
  const width = image.getWidth();
  const height = image.getHeight();

  // get bounding box: [minX, minY, maxX, maxY]
  // image.getBoundingBox() exists
  const bbox = image.getBoundingBox();

  const info = { tiff, image, width, height, bbox };
  geoTiffCache.set(url, info);
  return info;
}

// Convert lon,lat to pixel indices in image coordinate
function latLonToPixel(lon, lat, bbox, width, height) {
  const [minX, minY, maxX, maxY] = bbox;
  const x = (lon - minX) / (maxX - minX) * width;
  const y = (maxY - lat) / (maxY - minY) * height; // note Y origin top
  const px = Math.floor(x);
  const py = Math.floor(y);
  return { px, py };
}

// Sample one pixel at lat/lon and return raw value (band 1)
async function sampleGeoTIFFAtLatLng(url, lat, lon) {
  const info = await openGeoTIFF(url);
  const { image, width, height, bbox } = info;

  const { px, py } = latLonToPixel(lon, lat, bbox, width, height);

  // guard
  if (px < 0 || py < 0 || px >= width || py >= height) return null;

  // use readRasters with window to read a single pixel
  // window expects [originX, originY, widthX, heightY] as numbers of pixels
  // geotiff.js image.readRasters({ window: [px, py, px + 1, py + 1] })
  const rasters = await image.readRasters({ window: [px, py, px + 1, py + 1] });
  // rasters is an array or typed array depending on samples
  // assume band 0 holds data
  const band0 = rasters[0];
  if (!band0 || band0.length === 0) return null;
  return band0[0];
}

/* Create a Leaflet GridLayer that will render the GeoTIFF as tiles.
   NOTE: This is a best-effort tiling approach: each tile triggers a readRasters window.
   For big COGs and many tiles this can be heavy. For production hosting,
   ensure the host supports range requests and consider server-side tiles.
*/
async function createGeoTiffGridLayer(url, options = {}) {
  const info = await openGeoTIFF(url);
  const { image, width, height, bbox } = info;
  const tileSize = 256;
  const opacity = options.opacity || 1;

  // project bbox to latlon extents used by leaflet (lat: minY..maxY, lon: minX..maxX)
  const [minX, minY, maxX, maxY] = bbox;

  // create grid layer
  const layer = L.gridLayer({
    tileSize,
    maxZoom: 12, // limit to avoid too many tiny tiles; adjust as needed
    async createTile(coords, done) {
      const tile = document.createElement('canvas');
      tile.width = tileSize;
      tile.height = tileSize;
      const ctx = tile.getContext('2d');

      // compute tile bounds in lat/lon
      const nwPoint = coords.multiplyBy(tileSize);
      const sePoint = nwPoint.add([tileSize, tileSize]);
      const nw = map.unproject(nwPoint, coords.z);
      const se = map.unproject(sePoint, coords.z);

      const tileLonMin = nw.lng;
      const tileLatMax = nw.lat;
      const tileLonMax = se.lng;
      const tileLatMin = se.lat;

      // clamp tile bounds to raster bbox (otherwise window may be outside)
      const lonMin = Math.max(tileLonMin, minX);
      const lonMax = Math.min(tileLonMax, maxX);
      const latMin = Math.max(tileLatMin, minY);
      const latMax = Math.min(tileLatMax, maxY);

      if (lonMax <= lonMin || latMax <= latMin) {
        // tile outside raster
        done(null, tile);
        return tile;
      }

      // convert lon/lat extents to pixel windows
      const x0 = (lonMin - minX) / (maxX - minX) * width;
      const x1 = (lonMax - minX) / (maxX - minX) * width;
      const y0 = (maxY - latMax) / (maxY - minY) * height;
      const y1 = (maxY - latMin) / (maxY - minY) * height;

      // clamp integer window
      const wx0 = Math.max(0, Math.floor(x0));
      const wy0 = Math.max(0, Math.floor(y0));
      const wx1 = Math.min(width, Math.ceil(x1));
      const wy1 = Math.min(height, Math.ceil(y1));

      const winW = Math.max(1, wx1 - wx0);
      const winH = Math.max(1, wy1 - wy0);

      // read raster window
      try {
        // request read with resample to tile size
        const rasters = await image.readRasters({
          window: [wx0, wy0, wx1, wy1],
          width: tileSize,
          height: tileSize,
          resampleMethod: 'bilinear'
        });

        // rasters[0] length == tileSize*tileSize
        const band = rasters[0];

        // create imageData and paint
        const imgData = ctx.createImageData(tileSize, tileSize);
        const data = imgData.data;

        // Map raw values to color for a simple grayscale ramp:
        // For better visualization, a color ramp or normalization needed.
        // We'll compute min/max from tile for scaling
        let minv = Infinity, maxv = -Infinity;
        for (let i=0;i<band.length;i++){
          const v = band[i];
          if (v != null && !Number.isNaN(v)) {
            if (v < minv) minv = v;
            if (v > maxv) maxv = v;
          }
        }
        if (!isFinite(minv) || !isFinite(maxv) || minv === maxv) {
          // no-data or constant - set transparent
          done(null, tile);
          return tile;
        }

        // fill pixel data as grayscale with alpha
        for (let i=0;i<band.length;i++){
          const v = band[i];
          const idx = i * 4;
          if (v == null || Number.isNaN(v)) {
            data[idx+0] = data[idx+1] = data[idx+2] = 0;
            data[idx+3] = 0; // transparent
          } else {
            const norm = (v - minv) / (maxv - minv);
            const val = Math.round(255 * norm);
            data[idx+0] = val;
            data[idx+1] = val;
            data[idx+2] = val;
            data[idx+3] = 230; // some alpha, final opacity controlled from layer
          }
        }

        ctx.putImageData(imgData, 0, 0);
        done(null, tile);
      } catch (err) {
        console.error('tile read error', err);
        done(err, tile);
      }
      return tile;
    }
  });

  layer.setOpacity(opacity);

  // Helper: set opacity
  layer.setOpacity = function(op) {
    const clamped = Math.max(0, Math.min(1, op));
    // set for layer style; each tile uses image alpha; here we'll set canvas global alpha by CSS
    const el = this.getContainer();
    if (el) el.style.opacity = clamped;
    this.options.opacity = clamped;
  };

  return layer;
}
