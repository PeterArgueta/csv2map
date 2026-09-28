import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { GeoJSON, MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const PRESETS = {
  light: {
    labelEs: 'Claro',
    labelEn: 'Light',
    tileClass: 'map-style-light',
    fill: '#dbeafe',
    stroke: '#475569',
    fillOpacity: 0.45,
    strokeWidth: 1.2,
    labels: true,
  },
  gray: {
    labelEs: 'Gris',
    labelEn: 'Gray',
    tileClass: 'map-style-gray',
    fill: '#cbd5e1',
    stroke: '#475569',
    fillOpacity: 0.42,
    strokeWidth: 1.1,
    labels: true,
  },
  dark: {
    labelEs: 'Oscuro',
    labelEn: 'Dark',
    tileClass: 'map-style-dark',
    fill: '#475569',
    stroke: '#cbd5e1',
    fillOpacity: 0.48,
    strokeWidth: 1.1,
    labels: true,
  },
  minimal: {
    labelEs: 'Minimalista',
    labelEn: 'Minimal',
    tileClass: 'map-style-minimal',
    fill: '#f8fafc',
    stroke: '#64748b',
    fillOpacity: 0.2,
    strokeWidth: 0.8,
    labels: false,
  },
};

function FitLayer({ data }) {
  const map = useMap();
  useEffect(() => {
    if (!data) return;
    const bounds = L.geoJSON(data).getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [28, 28], maxZoom: 11 });
  }, [data, map]);
  return null;
}

function LayerLabels({ data, nameProperty, visible }) {
  if (!visible || !data?.features?.length) return null;
  return data.features.slice(0, 500).map((feature, index) => {
    const name = feature.properties?.[nameProperty] || feature.properties?.name;
    if (!name) return null;
    let center;
    try {
      center = L.geoJSON(feature).getBounds().getCenter();
    } catch {
      return null;
    }
    const icon = L.divIcon({
      className: 'map-designer-label-wrapper',
      html: `<span class="map-designer-label">${String(name).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]))}</span>`,
      iconSize: null,
    });
    return <Marker key={`${name}-${index}`} position={center} icon={icon} interactive={false} />;
  });
}

export function CrearMapa({ language = 'es' }) {
  const en = language === 'en';
  const mapRef = useRef(null);
  const [catalog, setCatalog] = useState(null);
  const [countryCode, setCountryCode] = useState('GTM');
  const [layerId, setLayerId] = useState('departamentos');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [preset, setPreset] = useState('gray');
  const [showBasemap, setShowBasemap] = useState(true);
  const [fillColor, setFillColor] = useState(PRESETS.gray.fill);
  const [strokeColor, setStrokeColor] = useState(PRESETS.gray.stroke);
  const [fillOpacity, setFillOpacity] = useState(PRESETS.gray.fillOpacity);
  const [strokeWidth, setStrokeWidth] = useState(PRESETS.gray.strokeWidth);
  const [showLabels, setShowLabels] = useState(PRESETS.gray.labels);

  useEffect(() => {
    fetch('/countries/catalog.json')
      .then((response) => {
        if (!response.ok) throw new Error('catalog');
        return response.json();
      })
      .then((nextCatalog) => {
        setCatalog(nextCatalog);
        const country = nextCatalog.countries.find((item) => item.code === 'GTM') || nextCatalog.countries[0];
        const administrative = country?.levels.find((layer) => layer.category === 'administrative' && layer.map_url)
          || country?.levels.find((layer) => layer.map_url);
        if (country) setCountryCode(country.code);
        if (administrative) setLayerId(administrative.id);
      })
      .catch(() => setMessage(en ? 'Could not load the layer catalog.' : 'No fue posible cargar el catálogo de capas.'));
  }, [en]);

  const selectedCountry = useMemo(
    () => catalog?.countries.find((country) => country.code === countryCode) || null,
    [catalog, countryCode],
  );

  const availableLayers = useMemo(
    () => (selectedCountry?.levels || []).filter((layer) => layer.map_url && layer.category !== 'transport'),
    [selectedCountry],
  );

  const selectedLayer = useMemo(
    () => availableLayers.find((layer) => layer.id === layerId) || availableLayers[0] || null,
    [availableLayers, layerId],
  );

  useEffect(() => {
    if (!selectedLayer?.map_url) return undefined;
    const controller = new AbortController();
    setLoading(true);
    setMessage('');
    fetch(selectedLayer.map_url, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then(setData)
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setData(null);
          setMessage(en ? 'Could not load the selected layer.' : 'No fue posible cargar la capa seleccionada.');
        }
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [selectedLayer?.map_url, en]);

  const applyPreset = (key) => {
    const next = PRESETS[key];
    setPreset(key);
    setFillColor(next.fill);
    setStrokeColor(next.stroke);
    setFillOpacity(next.fillOpacity);
    setStrokeWidth(next.strokeWidth);
    setShowLabels(next.labels);
    setShowBasemap(true);
  };

  const changeCountry = (value) => {
    const country = catalog?.countries.find((item) => item.code === value);
    const administrative = country?.levels.find((layer) => layer.category === 'administrative' && layer.map_url)
      || country?.levels.find((layer) => layer.map_url);
    setCountryCode(value);
    setLayerId(administrative?.id || '');
  };

  const style = useMemo(() => ({
    color: strokeColor,
    weight: Number(strokeWidth),
    fillColor,
    fillOpacity: Number(fillOpacity),
  }), [strokeColor, strokeWidth, fillColor, fillOpacity]);

  const featureCount = data?.features?.length || 0;
  const nameProperty = selectedLayer?.name_property || 'name';
  const selectedPreset = PRESETS[preset];

  return (
    <main className="mx-auto max-w-7xl px-4 py-7 sm:px-6">
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-indigo-600">{en ? 'Map design' : 'Diseño cartográfico'}</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">{en ? 'Create map' : 'Crear mapa'}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
            {en
              ? 'Choose a base style, add an administrative layer and adjust its visual appearance in real time.'
              : 'Elige un estilo base, agrega una capa administrativa y ajusta su apariencia visual en tiempo real.'}
          </p>
        </div>
        <span className="w-fit rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700">V1 · Leaflet</span>
      </div>

      <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-bold">{en ? '1. Base style' : '1. Estilo base'}</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              {en ? 'Start with a preset, then fine-tune the layer.' : 'Parte de un preset y luego ajusta la capa.'}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {Object.entries(PRESETS).map(([key, item]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => applyPreset(key)}
                  className={`rounded-xl border px-3 py-3 text-left text-sm font-bold transition ${preset === key ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'}`}
                >
                  <span className={`mb-2 block h-8 rounded-lg border border-slate-200 ${item.tileClass}`} />
                  {en ? item.labelEn : item.labelEs}
                </button>
              ))}
            </div>
            <label className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700">
              <span>{en ? 'Show base map' : 'Mostrar mapa base'}</span>
              <input
                type="checkbox"
                checked={showBasemap}
                onChange={(event) => setShowBasemap(event.target.checked)}
                className="h-4 w-4 accent-indigo-600"
              />
            </label>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-bold">{en ? '2. Geographic layer' : '2. Capa geográfica'}</h3>
            <label className="mt-4 block">
              <span className="field-label">{en ? 'Country' : 'País'}</span>
              <select value={countryCode} onChange={(event) => changeCountry(event.target.value)} className="field-control">
                {(catalog?.countries || []).map((country) => (
                  <option key={country.code} value={country.code}>{country.name}</option>
                ))}
              </select>
            </label>
            <label className="mt-3 block">
              <span className="field-label">{en ? 'Layer' : 'Capa'}</span>
              <select value={selectedLayer?.id || ''} onChange={(event) => setLayerId(event.target.value)} className="field-control">
                {availableLayers.map((layer) => (
                  <option key={layer.id} value={layer.id}>{en && layer.name_en ? layer.name_en : layer.name}</option>
                ))}
              </select>
            </label>
            <p className="mt-3 text-xs text-slate-500">
              {featureCount ? `${featureCount} ${en ? 'features loaded' : 'entidades cargadas'}` : ''}
            </p>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-bold">{en ? '3. Layer appearance' : '3. Apariencia de la capa'}</h3>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <label>
                <span className="field-label">{en ? 'Fill' : 'Relleno'}</span>
                <input type="color" value={fillColor} onChange={(event) => setFillColor(event.target.value)} className="h-11 w-full cursor-pointer rounded-xl border border-slate-300 bg-white p-1" />
              </label>
              <label>
                <span className="field-label">{en ? 'Border' : 'Borde'}</span>
                <input type="color" value={strokeColor} onChange={(event) => setStrokeColor(event.target.value)} className="h-11 w-full cursor-pointer rounded-xl border border-slate-300 bg-white p-1" />
              </label>
            </div>
            <label className="mt-4 block">
              <span className="field-label">{en ? 'Fill opacity' : 'Opacidad del relleno'} · {Math.round(fillOpacity * 100)}%</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={fillOpacity}
                onChange={(event) => setFillOpacity(Number(event.target.value))}
                className="w-full accent-indigo-600"
              />
            </label>
            <label className="mt-4 block">
              <span className="field-label">{en ? 'Border width' : 'Grosor del borde'} · {Number(strokeWidth).toFixed(1)} px</span>
              <input
                type="range"
                min="0"
                max="4"
                step="0.2"
                value={strokeWidth}
                onChange={(event) => setStrokeWidth(Number(event.target.value))}
                className="w-full accent-indigo-600"
              />
            </label>
            <label className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700">
              <span>{en ? 'Show labels' : 'Mostrar etiquetas'}</span>
              <input
                type="checkbox"
                checked={showLabels}
                onChange={(event) => setShowLabels(event.target.checked)}
                className="h-4 w-4 accent-indigo-600"
              />
            </label>
            <button
              type="button"
              onClick={() => applyPreset('gray')}
              className="mt-4 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700"
            >
              {en ? 'Reset design' : 'Restablecer diseño'}
            </button>
          </section>
        </aside>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
            <div>
              <h3 className="font-bold">{en ? 'Map preview' : 'Vista previa del mapa'}</h3>
              <p className="mt-1 text-xs text-slate-500">
                {selectedCountry?.name || ''}{selectedLayer ? ` · ${en && selectedLayer.name_en ? selectedLayer.name_en : selectedLayer.name}` : ''}
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
              {en ? selectedPreset.labelEn : selectedPreset.labelEs}
            </span>
          </div>

          <div className="relative h-[620px] min-h-[420px] bg-slate-100">
            {loading && (
              <div className="absolute inset-0 z-[500] grid place-items-center bg-white/70">
                <div className="loader" aria-label={en ? 'Loading map' : 'Cargando mapa'} />
              </div>
            )}
            {message && (
              <div className="absolute left-4 right-4 top-4 z-[600] rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                {message}
              </div>
            )}
            <MapContainer
              ref={mapRef}
              center={[15.7, -90.3]}
              zoom={6}
              zoomControl
              className="h-full w-full"
              preferCanvas
            >
              {showBasemap && (
                <TileLayer
                  key={`${preset}-${showBasemap}`}
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution="&copy; OpenStreetMap contributors"
                  className={selectedPreset.tileClass}
                />
              )}
              {data && (
                <>
                  <GeoJSON key={`${selectedLayer?.id}-${fillColor}-${strokeColor}-${fillOpacity}-${strokeWidth}`} data={data} style={() => style} />
                  <LayerLabels data={data} nameProperty={nameProperty} visible={showLabels} />
                  <FitLayer data={data} />
                </>
              )}
            </MapContainer>
          </div>

          <div className="border-t border-slate-200 bg-slate-50 px-5 py-3 text-xs leading-5 text-slate-500">
            {en
              ? 'V1 styles the base map as a whole and lets you fully style the selected overlay. Fine-grained road/water editing requires vector tiles and will come in a later version.'
              : 'La V1 estiliza el mapa base de forma global y permite personalizar completamente la capa seleccionada. La edición independiente de carreteras y agua requiere teselas vectoriales y corresponde a una versión posterior.'}
          </div>
        </section>
      </div>
    </main>
  );
}
