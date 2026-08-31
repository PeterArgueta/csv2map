import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import Papa from 'papaparse';
import { CircleMarker, GeoJSON, MapContainer, TileLayer, Tooltip, ZoomControl, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const BASEMAPS = {
  gris: {
    label: 'Mapa gris',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
    className: 'grayscale-tiles',
  },
  calles: {
    label: 'Calles',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
  },
  topografico: {
    label: 'Topográfico',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap &copy; OpenTopoMap',
  },
};

const FIELD_TYPES = [
  ['text', 'Texto'],
  ['number', 'Número'],
  ['date', 'Fecha'],
  ['boolean', 'Sí / No'],
];

const EXPORT_FORMATS = [
  ['geojson', 'GeoJSON'],
  ['shp', 'Shapefile'],
  ['gpkg', 'GeoPackage'],
  ['kml', 'KML'],
  ['csv', 'CSV'],
];

const RESERVED_FIELDS = new Set([
  'id', 'latitud', 'longitud', 'codigo_departamento', 'departamento', 'codigo_municipio', 'municipio',
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

const territorialAttributes = (feature, lat, lng) => {
  const props = feature?.properties || {};
  const municipioCode = String(props.cod_muni_1 ?? '').replace(/\.0$/, '').padStart(4, '0');
  return {
    latitud: Number(lat.toFixed(6)),
    longitud: Number(lng.toFixed(6)),
    codigo_departamento: municipioCode ? municipioCode.slice(0, 2) : '',
    departamento: props.depto_1 || props.departamen || '',
    codigo_municipio: municipioCode,
    municipio: props.nombre_1 || props.municipio || '',
  };
};

const toFeatureCollection = (points) => ({
  type: 'FeatureCollection',
  features: points.map((point) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [point.longitud, point.latitud] },
    properties: Object.fromEntries(Object.entries(point).filter(([key]) => !['latitud', 'longitud'].includes(key))),
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

export function CrearCapaPuntos() {
  const [municipios, setMunicipios] = useState(null);
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
    fetch('/Municipios/municipios.geojson', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then(setMunicipios)
      .catch((error) => {
        if (error.name !== 'AbortError') setLoadError('No fue posible cargar la capa de municipios.');
      });
    return () => controller.abort();
  }, []);

  const selectedPoint = useMemo(
    () => points.find((point) => point.id === selectedId) || null,
    [points, selectedId],
  );

  const addPoint = (lat, lng) => {
    if (!municipios) return;
    const municipality = municipios.features.find((feature) => pointInFeature([lng, lat], feature));
    const attributes = territorialAttributes(municipality, lat, lng);
    const custom = Object.fromEntries(fields.map((field) => [field.name, field.type === 'boolean' ? false : '']));
    const id = `P${String(points.length + 1).padStart(3, '0')}_${Date.now()}`;
    const point = { id, ...attributes, ...custom };
    setPoints((current) => [...current, point]);
    setSelectedId(id);
    setMessage(municipality
      ? `Punto agregado en ${attributes.municipio}, ${attributes.departamento}.`
      : 'Punto agregado fuera de los límites municipales disponibles.');
  };

  const addField = () => {
    const name = normalizeFieldName(newFieldName);
    if (!name) {
      setMessage('Escribe un nombre válido para el campo.');
      return;
    }
    if (RESERVED_FIELDS.has(name) || fields.some((field) => field.name === name)) {
      setMessage('Ese nombre de campo ya existe o está reservado.');
      return;
    }
    const field = { name, label: newFieldName.trim(), type: newFieldType };
    setFields((current) => [...current, field]);
    setPoints((current) => current.map((point) => ({ ...point, [name]: newFieldType === 'boolean' ? false : '' })));
    setNewFieldName('');
    setMessage(`Campo “${field.label}” agregado.`);
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
      const response = await axios.post(`${apiUrl}/exportar_geojson/`, formData, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `converttomap_puntos_${stamp()}.zip`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      let detail = 'No fue posible exportar la capa.';
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
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-indigo-600">Captura GIS</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">Crear capa geográfica</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
            Haz clic en el mapa para crear puntos. ConvertToMap asigna automáticamente municipio, departamento, códigos y coordenadas; tú agregas los campos que necesites.
          </p>
        </div>
        <span className="w-fit rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700">Puntos · V1</span>
      </div>

      <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-bold">1. Define los campos</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">Los datos territoriales se agregan automáticamente.</p>
              </div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_110px] lg:grid-cols-1">
              <input
                value={newFieldName}
                onChange={(event) => setNewFieldName(event.target.value)}
                placeholder="Ej. nombre, monto, estado"
                className="field-control"
              />
              <select value={newFieldType} onChange={(event) => setNewFieldType(event.target.value)} className="field-control">
                {FIELD_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <button type="button" onClick={addField} className="mt-2 w-full rounded-lg border border-indigo-200 px-3 py-2 text-sm font-bold text-indigo-700 hover:bg-indigo-50">+ Agregar campo</button>

            <div className="mt-4 space-y-2">
              {fields.length === 0 ? (
                <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">Puedes empezar sin campos adicionales y agregarlos después.</p>
              ) : fields.map((field) => (
                <div key={field.name} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-700">{field.label}</p>
                    <p className="text-[11px] text-slate-400">{field.type}</p>
                  </div>
                  <button type="button" onClick={() => removeField(field.name)} className="text-xs font-bold text-red-500 hover:text-red-700">Quitar</button>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-bold">2. Crea puntos</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">Activa el modo de captura y haz clic sobre el mapa.</p>
            <button
              type="button"
              onClick={() => setDrawing((value) => !value)}
              className={`mt-4 w-full rounded-lg px-3 py-2.5 text-sm font-bold ${drawing ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'border border-slate-300 bg-white text-slate-700 hover:border-indigo-300'}`}
            >
              {drawing ? '● Agregar punto: activo' : 'Activar agregar punto'}
            </button>
            <div className="mt-3 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <span className="text-slate-500">Puntos creados</span>
              <strong>{points.length}</strong>
            </div>
            {points.length > 0 && (
              <button type="button" onClick={() => { setPoints([]); setSelectedId(null); }} className="mt-2 w-full text-xs font-bold text-red-500 hover:text-red-700">Limpiar todos los puntos</button>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-bold">3. Descargar capa</h3>
            <select value={format} onChange={(event) => setFormat(event.target.value)} className="field-control mt-3">
              {EXPORT_FORMATS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <button
              type="button"
              onClick={exportLayer}
              disabled={!points.length || exporting}
              className="mt-2 w-full rounded-lg bg-indigo-600 px-3 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {exporting ? 'Generando…' : `Descargar ${EXPORT_FORMATS.find(([value]) => value === format)?.[1]}`}
            </button>
            <p className="mt-2 text-[11px] leading-4 text-slate-400">GeoJSON y CSV se generan en tu navegador. SHP, GPKG y KML se convierten mediante la API de ConvertToMap.</p>
          </section>
        </aside>

        <div className="min-w-0 space-y-5">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="font-bold">Mapa de captura</h3>
                <p className="mt-1 text-xs text-slate-500">Fuente territorial: IDEG · SEGEPLAN</p>
              </div>
              <select value={basemap} onChange={(event) => setBasemap(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
                {Object.entries(BASEMAPS).map(([id, item]) => <option key={id} value={id}>{item.label}</option>)}
              </select>
            </div>
            <div className={`h-[590px] ${drawing ? 'cursor-crosshair' : ''}`}>
              {loadError ? (
                <div className="grid h-full place-items-center text-sm text-red-600">{loadError}</div>
              ) : (
                <MapContainer center={[15.5, -90.5]} zoom={7} minZoom={5} maxZoom={18} zoomControl={false} className="h-full w-full" style={{ background: '#f8fafc' }}>
                  <ZoomControl position="bottomright" />
                  <TileLayer key={basemap} attribution={BASEMAPS[basemap].attribution} url={BASEMAPS[basemap].url} className={BASEMAPS[basemap].className || ''} />
                  <ClickCapture enabled={drawing} onPoint={addPoint} />
                  {municipios && (
                    <GeoJSON
                      data={municipios}
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
                      <Tooltip direction="top"><strong>{point.municipio || 'Punto'}</strong><br />{point.departamento || 'Fuera de límite'}</Tooltip>
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
                  <p className="text-xs font-bold uppercase tracking-wide text-indigo-600">Punto seleccionado</p>
                  <h3 className="mt-1 text-lg font-bold">{selectedPoint.municipio || 'Fuera de límites municipales'}</h3>
                  <p className="text-sm text-slate-500">{selectedPoint.departamento || 'Sin departamento asignado'} · {selectedPoint.latitud}, {selectedPoint.longitud}</p>
                </div>
                <button type="button" onClick={() => removePoint(selectedPoint.id)} className="text-xs font-bold text-red-500 hover:text-red-700">Eliminar punto</button>
              </div>

              {fields.length > 0 && (
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  {fields.map((field) => (
                    <label key={field.name} className="block">
                      <span className="field-label">{field.label}</span>
                      {field.type === 'boolean' ? (
                        <select value={String(selectedPoint[field.name])} onChange={(event) => updatePoint(selectedPoint.id, field.name, event.target.value === 'true')} className="field-control">
                          <option value="false">No</option>
                          <option value="true">Sí</option>
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
                <h3 className="font-bold">Tabla de atributos</h3>
                <p className="mt-1 text-xs text-slate-500">Selecciona una fila para editar sus datos.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      {['ID', 'Municipio', 'Departamento', 'Latitud', 'Longitud', ...fields.map((field) => field.label)].map((header) => (
                        <th key={header} className="whitespace-nowrap px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {points.map((point) => (
                      <tr key={point.id} onClick={() => setSelectedId(point.id)} className={`cursor-pointer ${selectedId === point.id ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}>
                        <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-700">{point.id.split('_')[0]}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">{point.municipio || '—'}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">{point.departamento || '—'}</td>
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
