import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import L from 'leaflet';
import Papa from 'papaparse';
import { CircleMarker, GeoJSON, MapContainer, TileLayer, Tooltip, ZoomControl, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const BASEMAPS = {
  gris: {
    labelEs: 'Mapa gris',
    labelEn: 'Gray map',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
    className: 'grayscale-tiles',
  },
  calles: {
    labelEs: 'Calles',
    labelEn: 'Streets',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
  },
};

const FIELD_TYPES = [
  ['text', 'Texto', 'Text'],
  ['number', 'Número', 'Number'],
  ['date', 'Fecha', 'Date'],
  ['boolean', 'Sí / No', 'Yes / No'],
];

const EXPORT_FORMATS = [
  ['geojson', 'GeoJSON'],
  ['shp', 'Shapefile'],
  ['gpkg', 'GeoPackage'],
  ['kml', 'KML'],
  ['csv', 'CSV'],
];

const RESERVED_FIELDS = new Set([
  'id', 'latitud', 'longitud',
  'codigo_departamento', 'departamento',
  'codigo_municipio', 'municipio',
  'codigo_estado', 'estado',
  'codigo_provincia', 'provincia',
  'codigo_distrito', 'distrito',
  'codigo_territorial', 'territorio',
]);

const normalizeFieldName = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9_]+/g, '_')
  .replace(/^_+|_+$/g, '');

const pointInRing = ([x, y], ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = ((yi > y) !== (yj > y))
      && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
};

const pointInPolygonCoordinates = (point, coordinates) => {
  if (!coordinates?.length || !pointInRing(point, coordinates[0])) return false;
  for (let i = 1; i < coordinates.length; i += 1) {
    if (pointInRing(point, coordinates[i])) return false;
  }
  return true;
};

const pointInFeature = (point, feature) => {
  const geometry = feature?.geometry;
  if (!geometry) return false;
  if (geometry.type === 'Polygon') return pointInPolygonCoordinates(point, geometry.coordinates);
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.some((polygon) => pointInPolygonCoordinates(point, polygon));
  }
  return false;
};

const featureBoundsContainPoint = ([lng, lat], feature) => {
  try {
    return L.geoJSON(feature).getBounds().contains([lat, lng]);
  } catch {
    return false;
  }
};

const findContainingFeature = (point, features = []) => {
  const exact = features.find((feature) => pointInFeature(point, feature));
  if (exact) return exact;

  // Fallback only for small simplification gaps in administrative polygons.
  const candidates = features.filter((feature) => featureBoundsContainPoint(point, feature));
  if (candidates.length === 1) return candidates[0];
  return null;
};

const territorialFieldNames = (layer) => {
  const id = layer?.id || '';
  if (id === 'municipios') return { code: 'codigo_municipio', name: 'municipio' };
  if (id === 'departamentos') return { code: 'codigo_departamento', name: 'departamento' };
  if (id === 'estados') return { code: 'codigo_estado', name: 'estado' };
  if (id === 'provincias') return { code: 'codigo_provincia', name: 'provincia' };
  if (id === 'distritos') return { code: 'codigo_distrito', name: 'distrito' };
  return { code: 'codigo_territorial', name: 'territorio' };
};

const territorialAttributes = (feature, lat, lng, layer) => {
  const props = feature?.properties || {};
  const fields = territorialFieldNames(layer);

  const firstValue = (...keys) => {
    for (const key of keys) {
      if (!key) continue;
      const value = props[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') return value;
    }
    return '';
  };

  // Some Guatemala assets are regenerated from the original SEGEPLAN
  // shapefiles during deploy, so their source field names differ from the
  // normalized admin_code/name schema used by the catalog.
  const code = String(firstValue(
    layer?.code_property,
    'admin_code',
    'cod_dep',
    'COD_DEP',
    'cod_muni_1',
    'codigo_mun',
    'CODIGO_MUN',
    'codigo',
    'CODIGO',
  )).replace(/\.0$/, '');

  const name = firstValue(
    layer?.name_property,
    'name',
    'departamen',
    'departamento',
    'DEPTO',
    'nombre_1',
    'municipio',
    'MUNICIPIO',
    'nombre',
    'NOMBRE',
  );

  const parentName = firstValue(
    layer?.parent_name_property,
    'parent_name',
    'depto_1',
    'departamen',
    'departamento',
    'DEPTO',
  );

  const result = {
    latitud: Number(lat.toFixed(6)),
    longitud: Number(lng.toFixed(6)),
    [fields.code]: code,
    [fields.name]: name,
    __territoryName: name,
    __territoryCode: code,
    __territoryLayer: layer?.name || '',
  };

  if (layer?.id === 'municipios') {
    result.codigo_departamento = code ? code.slice(0, 2) : '';
    result.departamento = parentName;
  }

  return result;
};

const toFeatureCollection = (points) => ({
  type: 'FeatureCollection',
  features: points.map((point) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [point.longitud, point.latitud] },
    properties: Object.fromEntries(Object.entries(point).filter(([key]) =>
      !['latitud', 'longitud'].includes(key) && !key.startsWith('__'),
    )),
  })),
});

const stamp = () => {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
};

function ClickCapture({ enabled, onPoint }) {
  useMapEvents({
    click(event) {
      if (enabled) onPoint(event.latlng.lat, event.latlng.lng);
    },
  });
  return null;
}

function MapViewUpdater({ data }) {
  const map = useMap();

  useEffect(() => {
    if (!data?.features?.length) return;
    const bounds = L.geoJSON(data).getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 9 });
  }, [data, map]);

  return null;
}

export function CrearCapaPuntos({ language = 'es' }) {
  const en = language === 'en';
  const [catalog, setCatalog] = useState(null);
  const [countryCode, setCountryCode] = useState('GTM');
  const [layerId, setLayerId] = useState('municipios');
  const [territories, setTerritories] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [basemap, setBasemap] = useState('gris');
  const [drawing, setDrawing] = useState(true);
  const [points, setPoints] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [fields, setFields] = useState([]);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState('text');
  const [format, setFormat] = useState('geojson');
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/countries/catalog.json', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((data) => {
        setCatalog(data);
        const guatemala = data.countries.find((country) => country.code === 'GTM');
        const preferred = guatemala?.levels.find((layer) => layer.id === 'municipios')
          || guatemala?.levels.find((layer) => !layer.download_only)
          || guatemala?.levels[0];
        if (preferred) setLayerId(preferred.id);
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setLoadError(en ? 'Could not load the territorial catalog.' : 'No fue posible cargar el catálogo territorial.');
      });
    return () => controller.abort();
  }, []);

  const selectedCountry = useMemo(
    () => catalog?.countries.find((country) => country.code === countryCode) || null,
    [catalog, countryCode],
  );

  const availableLayers = useMemo(
    () => (selectedCountry?.levels || []).filter((layer) =>
      !layer.download_only
      && layer.map_url
      && ['admin1', 'admin2', 'local_zone'].includes(layer.admin_level),
    ),
    [selectedCountry],
  );

  const selectedLayer = useMemo(
    () => availableLayers.find((layer) => layer.id === layerId) || availableLayers[0] || null,
    [availableLayers, layerId],
  );

  useEffect(() => {
    if (!selectedCountry || !availableLayers.length) return;
    if (!availableLayers.some((layer) => layer.id === layerId)) {
      setLayerId(availableLayers[0].id);
    }
  }, [selectedCountry, availableLayers, layerId]);

  useEffect(() => {
    if (!selectedLayer?.map_url) return undefined;
    const controller = new AbortController();
    setTerritories(null);
    setLoadError('');
    fetch(selectedLayer.map_url, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then(setTerritories)
      .catch((error) => {
        if (error.name !== 'AbortError') setLoadError(en ? 'Could not load the selected territorial layer.' : 'No fue posible cargar la capa territorial seleccionada.');
      });
    return () => controller.abort();
  }, [selectedLayer?.map_url]);

  const changeCountry = (nextCode) => {
    const country = catalog?.countries.find((item) => item.code === nextCode);
    const nextLayer = country?.levels.find((layer) => !layer.download_only && layer.map_url);
    setCountryCode(nextCode);
    if (nextLayer) setLayerId(nextLayer.id);
    setPoints([]);
    setSelectedId(null);
    setMessage('');
  };

  const changeLayer = (nextLayerId) => {
    setLayerId(nextLayerId);
    setPoints([]);
    setSelectedId(null);
    setMessage('');
  };

  const selectedPoint = useMemo(
    () => points.find((point) => point.id === selectedId) || null,
    [points, selectedId],
  );

  const addPoint = (lat, lng) => {
    if (!territories || !selectedLayer) return;
    const territory = findContainingFeature([lng, lat], territories.features);
    const attributes = territorialAttributes(territory, lat, lng, selectedLayer);
    const custom = Object.fromEntries(fields.map((field) => [field.name, field.type === 'boolean' ? false : '']));
    const id = `P${String(points.length + 1).padStart(3, '0')}_${Date.now()}`;
    const point = { id, ...attributes, ...custom };
    setPoints((current) => [...current, point]);
    setSelectedId(id);
    setMessage(territory
      ? `Punto agregado en ${attributes.__territoryName || selectedCountry?.name}.`
      : `Punto agregado fuera de los límites disponibles para ${selectedCountry?.name || 'el país seleccionado'}.`);
  };

  const addField = () => {
    const name = normalizeFieldName(newFieldName);
    if (!name) {
      setMessage(en ? 'Enter a valid field name.' : 'Escribe un nombre válido para el campo.');
      return;
    }
    if (RESERVED_FIELDS.has(name) || fields.some((field) => field.name === name)) {
      setMessage(en ? 'That field name already exists or is reserved.' : 'Ese nombre de campo ya existe o está reservado.');
      return;
    }
    const field = { name, label: newFieldName.trim(), type: newFieldType };
    setFields((current) => [...current, field]);
    setPoints((current) => current.map((point) => ({ ...point, [name]: newFieldType === 'boolean' ? false : '' })));
    setNewFieldName('');
    setMessage(en ? `Field “${field.label}” added.` : `Campo “${field.label}” agregado.`);
  };

  const removeField = (name) => {
    setFields((current) => current.filter((field) => field.name !== name));
    setPoints((current) => current.map((point) => {
      const next = { ...point };
      delete next[name];
      return next;
    }));
  };

  const updatePoint = (id, key, value) => {
    setPoints((current) => current.map((point) => (point.id === id ? { ...point, [key]: value } : point)));
  };

  const removePoint = (id) => {
    setPoints((current) => current.filter((point) => point.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const exportCsv = () => {
    const csv = Papa.unparse(points);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `converttomap_puntos_${stamp()}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const exportGeojsonDirect = () => {
    const data = JSON.stringify(toFeatureCollection(points), null, 2);
    const url = URL.createObjectURL(new Blob([data], { type: 'application/geo+json;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `converttomap_puntos_${stamp()}.geojson`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const exportLayer = async () => {
    if (!points.length || exporting) return;
    setMessage('');
    if (format === 'csv') {
      exportCsv();
      return;
    }
    if (format === 'geojson') {
      exportGeojsonDirect();
      return;
    }

    setExporting(true);
    try {
      const apiUrl = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
      const formData = new FormData();
      const geojson = new Blob([JSON.stringify(toFeatureCollection(points))], { type: 'application/geo+json' });
      formData.append('file', geojson, 'puntos.geojson');
      formData.append('formatos', format);
      formData.append('pais', countryCode);
      formData.append('nivel', selectedLayer?.id || '');
      const response = await axios.post(`${apiUrl}/exportar_geojson/`, formData, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `converttomap_puntos_${stamp()}.zip`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      let detail = en ? 'Could not export the layer.' : 'No fue posible exportar la capa.';
      if (error.response?.data instanceof Blob) {
        try {
          const payload = JSON.parse(await error.response.data.text());
          detail = payload.detail || detail;
        } catch { /* ignore */ }
      }
      setMessage(detail);
    } finally {
      setExporting(false);
    }
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-7 sm:px-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-indigo-600">{en ? 'GIS capture' : 'Captura GIS'}</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">{en ? 'Create geographic layer' : 'Crear capa geográfica'}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
            {en ? 'Click the map to create points. Choose a country and territorial level; ConvertToMap automatically assigns codes, territory and coordinates from the selected layer.' : 'Haz clic en el mapa para crear puntos. Elige país y nivel territorial; ConvertToMap asigna automáticamente códigos, territorio y coordenadas según la capa seleccionada.'}
          </p>
        </div>
        <span className="w-fit rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700">{en ? 'Points · V1' : 'Puntos · V1'}</span>
      </div>

      <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-bold">{en ? '1. Select territory' : '1. Selecciona territorio'}</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">{en ? 'Choose the country and administrative layer used to assign attributes to each point.' : 'Elige el país y la capa administrativa que se usará para asignar atributos a cada punto.'}</p>
            <label className="mt-4 block">
              <span className="field-label">{en ? 'Country' : 'País'}</span>
              <select value={countryCode} onChange={(event) => changeCountry(event.target.value)} className="field-control">
                {(catalog?.countries || []).map((country) => (
                  <option key={country.code} value={country.code}>{country.name}</option>
                ))}
              </select>
            </label>
            <label className="mt-3 block">
              <span className="field-label">{en ? 'Territorial level' : 'Nivel territorial'}</span>
              <select value={selectedLayer?.id || ''} onChange={(event) => changeLayer(event.target.value)} className="field-control" disabled={!availableLayers.length}>
                {availableLayers.map((layer) => (
                  <option key={layer.id} value={layer.id}>{layer.name}</option>
                ))}
              </select>
            </label>
            <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
              {selectedLayer ? `${selectedLayer.name} · ${selectedLayer.count} ${en ? 'features' : 'entidades'}` : (en ? 'No layers available' : 'Sin capas disponibles')}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-bold">{en ? '2. Define fields' : '2. Define los campos'}</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">{en ? 'Territorial data is added automatically.' : 'Los datos territoriales se agregan automáticamente.'}</p>
              </div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_110px] lg:grid-cols-1">
              <input
                value={newFieldName}
                onChange={(event) => setNewFieldName(event.target.value)}
                placeholder={en ? 'E.g. name, amount, status' : 'Ej. nombre, monto, estado'}
                className="field-control"
              />
              <select value={newFieldType} onChange={(event) => setNewFieldType(event.target.value)} className="field-control">
                {FIELD_TYPES.map(([value, labelEs, labelEn]) => <option key={value} value={value}>{en ? labelEn : labelEs}</option>)}
              </select>
            </div>
            <button type="button" onClick={addField} className="mt-2 w-full rounded-lg border border-indigo-200 px-3 py-2 text-sm font-bold text-indigo-700 hover:bg-indigo-50">{en ? '+ Add field' : '+ Agregar campo'}</button>

            <div className="mt-4 space-y-2">
              {fields.length === 0 ? (
                <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">{en ? 'You can start without extra fields and add them later.' : 'Puedes empezar sin campos adicionales y agregarlos después.'}</p>
              ) : fields.map((field) => (
                <div key={field.name} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-700">{field.label}</p>
                    <p className="text-[11px] text-slate-400">{field.type}</p>
                  </div>
                  <button type="button" onClick={() => removeField(field.name)} className="text-xs font-bold text-red-500 hover:text-red-700">{en ? 'Remove' : 'Quitar'}</button>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-bold">{en ? '3. Create points' : '3. Crea puntos'}</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">{en ? 'Enable capture mode and click on the map.' : 'Activa el modo de captura y haz clic sobre el mapa.'}</p>
            <button
              type="button"
              onClick={() => setDrawing((value) => !value)}
              className={`mt-4 w-full rounded-lg px-3 py-2.5 text-sm font-bold ${drawing ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'border border-slate-300 bg-white text-slate-700 hover:border-indigo-300'}`}
            >
              {drawing ? (en ? '● Add point: active' : '● Agregar punto: activo') : (en ? 'Enable add point' : 'Activar agregar punto')}
            </button>
            <div className="mt-3 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <span className="text-slate-500">{en ? 'Points created' : 'Puntos creados'}</span>
              <strong>{points.length}</strong>
            </div>
            {points.length > 0 && (
              <button type="button" onClick={() => { setPoints([]); setSelectedId(null); }} className="mt-2 w-full text-xs font-bold text-red-500 hover:text-red-700">{en ? 'Clear all points' : 'Limpiar todos los puntos'}</button>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-bold">{en ? '4. Download layer' : '4. Descargar capa'}</h3>
            <select value={format} onChange={(event) => setFormat(event.target.value)} className="field-control mt-3">
              {EXPORT_FORMATS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <button
              type="button"
              onClick={exportLayer}
              disabled={!points.length || exporting}
              aria-busy={exporting}
              className="mt-2 flex w-full items-center justify-center rounded-lg bg-indigo-600 px-3 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {exporting ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
                  <span>{en ? 'Converting…' : 'Convirtiendo…'}</span>
                </span>
              ) : `${en ? 'Download' : 'Descargar'} ${EXPORT_FORMATS.find(([value]) => value === format)?.[1]}`}
            </button>
            {exporting && (
              <div className="mt-3" aria-live="polite">
                <div className="mb-1 flex items-center justify-between gap-3 text-[11px] font-semibold text-indigo-700">
                  <span>{en ? 'Converting layer…' : 'Convirtiendo capa…'}</span>
                  <span>{EXPORT_FORMATS.find(([value]) => value === format)?.[1]}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-indigo-100">
                  <div className="processing-bar h-full rounded-full bg-indigo-600" />
                </div>
              </div>
            )}
            <p className="mt-2 text-[11px] leading-4 text-slate-400">{en ? 'GeoJSON and CSV are generated in your browser. SHP, GPKG and KML are converted through the ConvertToMap API.' : 'GeoJSON y CSV se generan en tu navegador. SHP, GPKG y KML se convierten mediante la API de ConvertToMap.'}</p>
          </section>
        </aside>

        <div className="min-w-0 space-y-5">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="font-bold">{en ? 'Capture map' : 'Mapa de captura'}</h3>
                <p className="mt-1 text-xs text-slate-500">{en ? 'Territorial source' : 'Fuente territorial'}: {selectedCountry?.source_label || 'ConvertToMap'} · {selectedLayer?.name || ''}</p>
              </div>
              <select value={basemap} onChange={(event) => setBasemap(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
                {Object.entries(BASEMAPS).map(([id, item]) => <option key={id} value={id}>{en ? item.labelEn : item.labelEs}</option>)}
              </select>
            </div>
            <div className={`h-[590px] ${drawing ? 'cursor-crosshair' : ''}`}>
              {loadError ? (
                <div className="grid h-full place-items-center text-sm text-red-600">{loadError}</div>
              ) : (
                <MapContainer center={[15.5, -90.5]} zoom={7} minZoom={3} maxZoom={18} zoomControl={false} className="h-full w-full" style={{ background: '#f8fafc' }}>
                  <ZoomControl position="bottomright" />
                  <MapViewUpdater data={territories} />
                  <TileLayer key={basemap} attribution={BASEMAPS[basemap].attribution} url={BASEMAPS[basemap].url} className={BASEMAPS[basemap].className || ''} />
                  <ClickCapture enabled={drawing} onPoint={addPoint} />
                  {territories && (
                    <GeoJSON
                      key={`${countryCode}-${selectedLayer?.id || 'territory'}`}
                      data={territories}
                      style={{ color: '#64748b', weight: 0.7, fillColor: '#ffffff', fillOpacity: 0.03 }}
                    />
                  )}
                  {points.map((point) => (
                    <CircleMarker
                      key={point.id}
                      center={[point.latitud, point.longitud]}
                      radius={selectedId === point.id ? 9 : 7}
                      pathOptions={{ color: selectedId === point.id ? '#312e81' : '#4f46e5', fillColor: '#4f46e5', fillOpacity: 0.9, weight: 2 }}
                      eventHandlers={{ click: (event) => { event.originalEvent?.stopPropagation?.(); setSelectedId(point.id); } }}
                    >
                      <Tooltip direction="top">
                        <strong>{point.__territoryName || (en ? 'Outside boundary' : 'Fuera de límite')}</strong>
                        <br />{point.__territoryLayer || selectedLayer?.name || (en ? 'Territory' : 'Territorio')}
                      </Tooltip>
                    </CircleMarker>
                  ))}
                </MapContainer>
              )}
            </div>
          </section>

          {message && <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">{message}</div>}

          {selectedPoint && (
            <section className="rounded-2xl border border-indigo-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-indigo-600">{en ? 'Selected point' : 'Punto seleccionado'}</p>
                  <h3 className="mt-1 text-lg font-bold">{selectedPoint.__territoryName || (en ? 'Outside territorial boundaries' : 'Fuera de límites territoriales')}</h3>
                  <p className="text-sm text-slate-500">{selectedPoint.__territoryLayer || selectedLayer?.name || (en ? 'Territory' : 'Territorio')} · {selectedPoint.latitud}, {selectedPoint.longitud}</p>
                </div>
                <button type="button" onClick={() => removePoint(selectedPoint.id)} className="text-xs font-bold text-red-500 hover:text-red-700">{en ? 'Delete point' : 'Eliminar punto'}</button>
              </div>

              {fields.length > 0 && (
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  {fields.map((field) => (
                    <label key={field.name} className="block">
                      <span className="field-label">{field.label}</span>
                      {field.type === 'boolean' ? (
                        <select value={String(selectedPoint[field.name])} onChange={(event) => updatePoint(selectedPoint.id, field.name, event.target.value === 'true')} className="field-control">
                          <option value="false">No</option>
                          <option value="true">{en ? 'Yes' : 'Sí'}</option>
                        </select>
                      ) : (
                        <input
                          type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                          value={selectedPoint[field.name] ?? ''}
                          onChange={(event) => updatePoint(selectedPoint.id, field.name, event.target.value)}
                          className="field-control"
                        />
                      )}
                    </label>
                  ))}
                </div>
              )}
            </section>
          )}

          {points.length > 0 && (
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-5 py-4">
                <h3 className="font-bold">{en ? 'Attribute table' : 'Tabla de atributos'}</h3>
                <p className="mt-1 text-xs text-slate-500">{en ? 'Select a row to edit its data.' : 'Selecciona una fila para editar sus datos.'}</p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      {['ID', selectedLayer?.name || (en ? 'Territory' : 'Territorio'), ...(selectedLayer?.id === 'municipios' ? [en ? 'Department' : 'Departamento'] : []), en ? 'Latitude' : 'Latitud', en ? 'Longitude' : 'Longitud', ...fields.map((field) => field.label)].map((header) => (
                        <th key={header} className="whitespace-nowrap px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {points.map((point) => (
                      <tr key={point.id} onClick={() => setSelectedId(point.id)} className={`cursor-pointer ${selectedId === point.id ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}>
                        <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-700">{point.id.split('_')[0]}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">{point.__territoryName || '—'}</td>
                        {selectedLayer?.id === 'municipios' && (
                          <td className="whitespace-nowrap px-4 py-3 text-slate-600">{point.departamento || '—'}</td>
                        )}
                        <td className="whitespace-nowrap px-4 py-3 text-slate-500">{point.latitud}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-500">{point.longitud}</td>
                        {fields.map((field) => <td key={field.name} className="max-w-[180px] truncate px-4 py-3 text-slate-600">{String(point[field.name] ?? '')}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
