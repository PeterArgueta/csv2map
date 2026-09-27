import React, { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { GeoJSON, MapContainer, TileLayer, ZoomControl, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const BASEMAPS = {
  gray: {
    es: 'Mapa gris',
    en: 'Gray map',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
    className: 'grayscale-tiles',
  },
  streets: {
    es: 'Calles',
    en: 'Streets',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
  },
  topo: {
    es: 'Topográfico',
    en: 'Topographic',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap &copy; OpenTopoMap',
  },
};

const COLORS = ['#4f46e5', '#059669', '#dc2626', '#d97706', '#7c3aed', '#0891b2'];

function FitToActiveLayers({ datasets, fitToken }) {
  const map = useMap();
  useEffect(() => {
    const layers = Object.values(datasets).filter(Boolean);
    if (!layers.length) return;
    const group = L.featureGroup(layers.map((data) => L.geoJSON(data)));
    const bounds = group.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 12 });
  }, [datasets, fitToken, map]);
  return null;
}

const displayValue = (value) => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

export function Geoportal({ language = 'es' }) {
  const en = language === 'en';
  const [catalog, setCatalog] = useState(null);
  const [active, setActive] = useState({});
  const [datasets, setDatasets] = useState({});
  const [loading, setLoading] = useState({});
  const [errors, setErrors] = useState({});
  const [opacity, setOpacity] = useState({});
  const [format, setFormat] = useState({});
  const [basemap, setBasemap] = useState('gray');
  const [query, setQuery] = useState('');
  const [fitToken, setFitToken] = useState(0);

  useEffect(() => {
    fetch('/countries/catalog.json')
      .then((response) => {
        if (!response.ok) throw new Error('catalog');
        return response.json();
      })
      .then((data) => {
        setCatalog(data);
        const initial = {};
        const initialOpacity = {};
        const initialFormat = {};
        data.countries.forEach((country) => {
          country.levels.forEach((layer) => {
            const key = `${country.code}-${layer.id}`;
            initial[key] = key === 'GTM-departamentos';
            initialOpacity[key] = 0.45;
            initialFormat[key] = Object.keys(layer.downloads || {})[0] || 'geojson';
          });
        });
        setActive(initial);
        setOpacity(initialOpacity);
        setFormat(initialFormat);
      })
      .catch(() => setErrors((current) => ({ ...current, catalog: en ? 'Could not load the layer catalog.' : 'No fue posible cargar el catálogo de capas.' })));
  }, [en]);

  const layers = useMemo(() => {
    if (!catalog) return [];
    return catalog.countries.flatMap((country) =>
      country.levels.map((layer, index) => ({
        ...layer,
        countryCode: country.code,
        countryName: country.name,
        countrySourceLabel: country.source_label,
        countrySourceUrl: country.source_url,
        key: `${country.code}-${layer.id}`,
        color: COLORS[index % COLORS.length],
      })),
    );
  }, [catalog]);

  const visibleLayers = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return layers;
    return layers.filter((layer) =>
      [layer.name, layer.name_en, layer.countryName, layer.singular, layer.source_label, layer.countrySourceLabel]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [layers, query]);

  const groupedVisibleLayers = useMemo(() => {
    if (!catalog) return [];
    return catalog.countries
      .map((country) => ({
        country,
        layers: visibleLayers.filter((layer) => layer.countryCode === country.code),
      }))
      .filter((group) => group.layers.length > 0);
  }, [catalog, visibleLayers]);

  const ensureLayer = async (layer) => {
    if (datasets[layer.key] || loading[layer.key]) return;
    setLoading((current) => ({ ...current, [layer.key]: true }));
    setErrors((current) => ({ ...current, [layer.key]: '' }));
    try {
      const response = await fetch(layer.map_url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setDatasets((current) => ({ ...current, [layer.key]: data }));
      setFitToken((value) => value + 1);
    } catch {
      setErrors((current) => ({
        ...current,
        [layer.key]: en ? 'Could not load this layer.' : 'No fue posible cargar esta capa.',
      }));
    } finally {
      setLoading((current) => ({ ...current, [layer.key]: false }));
    }
  };

  useEffect(() => {
    if (!layers.length) return;
    layers.filter((layer) => active[layer.key]).forEach(ensureLayer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers, active]);

  const toggleLayer = (layer) => {
    setActive((current) => ({ ...current, [layer.key]: !current[layer.key] }));
  };

  const layerLabel = (layer) => (en && layer.name_en ? layer.name_en : layer.name);
  const sourceLabel = (layer) => layer.source_label || layer.countrySourceLabel;
  const sourceUrl = (layer) =>
    Object.prototype.hasOwnProperty.call(layer, 'source_url') ? layer.source_url : layer.countrySourceUrl;

  const bindPopup = (feature, leafletLayer, layer) => {
    const props = feature.properties || {};
    const preferred = [layer.name_property, layer.code_property, layer.parent_name_property, 'area_km2']
      .filter(Boolean)
      .filter((key, index, array) => array.indexOf(key) === index && Object.prototype.hasOwnProperty.call(props, key));
    const remaining = Object.keys(props).filter((key) => !preferred.includes(key)).slice(0, Math.max(0, 8 - preferred.length));
    const keys = [...preferred, ...remaining];
    const rows = keys.map((key) => `<div style="display:grid;grid-template-columns:110px 1fr;gap:8px;padding:3px 0"><strong style="font-size:11px;color:#64748b">${key}</strong><span style="font-size:12px;color:#0f172a;word-break:break-word">${displayValue(props[key])}</span></div>`).join('');
    leafletLayer.bindPopup(`<div style="min-width:230px"><div style="font-weight:700;font-size:14px;margin-bottom:8px">${props[layer.name_property] || layer.name}</div>${rows || '<span>Sin atributos</span>'}</div>`);
  };

  const activeDatasets = useMemo(() => {
    const result = {};
    layers.forEach((layer) => {
      if (active[layer.key] && datasets[layer.key]) result[layer.key] = datasets[layer.key];
    });
    return result;
  }, [layers, active, datasets]);

  return (
    <main className="mx-auto max-w-[1600px] px-3 py-4 sm:px-5 sm:py-6">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-indigo-600">ConvertToMap Geoportal</p>
          <h2 className="mt-1 text-3xl font-bold tracking-tight">{en ? 'Explore geographic layers' : 'Explora capas geográficas'}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            {en
              ? 'View available layers, inspect their attributes, adjust transparency and download them for your GIS workflow.'
              : 'Visualiza las capas disponibles, consulta sus atributos, ajusta la transparencia y descárgalas para tu flujo GIS.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={basemap} onChange={(event) => setBasemap(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
            {Object.entries(BASEMAPS).map(([id, item]) => <option key={id} value={id}>{item[language] || item.es}</option>)}
          </select>
          <button type="button" onClick={() => setFitToken((value) => value + 1)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:border-indigo-300 hover:text-indigo-700">
            {en ? 'Zoom to layers' : 'Zoom a capas'}
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-4">
            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">{en ? 'Layer catalog' : 'Catálogo de capas'}</label>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={en ? 'Search layers…' : 'Buscar capas…'}
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400"
            />
          </div>
          <div className="max-h-[720px] space-y-3 overflow-y-auto p-3">
            {errors.catalog && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{errors.catalog}</div>}
            {groupedVisibleLayers.map(({ country, layers: countryLayers }) => (
              <section key={country.code} className="space-y-2">
                <div className="sticky top-0 z-10 flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                      {en ? country.region : country.region_es}
                    </p>
                    <h3 className="text-sm font-bold text-slate-800">{country.name}</h3>
                  </div>
                  <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold text-slate-500">{countryLayers.length}</span>
                </div>

                {countryLayers.map((layer) => {
                  const enabled = Boolean(active[layer.key]);
                  const formats = Object.keys(layer.downloads || {});
                  const selectedFormat = format[layer.key] || formats[0];
                  return (
                    <section key={layer.key} className={`rounded-xl border p-3 transition ${enabled ? 'border-indigo-300 bg-indigo-50/40' : 'border-slate-200 bg-white'}`}>
                      <div className="flex items-start gap-3">
                        <input type="checkbox" checked={enabled} onChange={() => toggleLayer(layer)} className="mt-1 h-4 w-4 accent-indigo-600" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="h-3 w-3 rounded-full" style={{ background: layer.color }} />
                            <h4 className="truncate text-sm font-bold text-slate-800">{layerLabel(layer)}</h4>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            {(en ? layer.category_en : layer.category_es) || (en ? 'Geographic layer' : 'Capa geográfica')} · {layer.count} {en ? 'features' : 'entidades'}
                          </p>
                          {loading[layer.key] && <p className="mt-1 text-xs font-semibold text-indigo-600">{en ? 'Loading…' : 'Cargando…'}</p>}
                          {errors[layer.key] && <p className="mt-1 text-xs text-red-600">{errors[layer.key]}</p>}
                        </div>
                      </div>

                      {enabled && (
                        <div className="mt-3 space-y-3 border-t border-slate-200/70 pt-3">
                          <label className="block">
                            <span className="mb-1 flex justify-between text-[11px] font-bold uppercase tracking-wide text-slate-500">
                              <span>{en ? 'Opacity' : 'Transparencia'}</span>
                              <span>{Math.round((opacity[layer.key] ?? 0.45) * 100)}%</span>
                            </span>
                            <input type="range" min="0.05" max="0.9" step="0.05" value={opacity[layer.key] ?? 0.45} onChange={(event) => setOpacity((current) => ({ ...current, [layer.key]: Number(event.target.value) }))} className="w-full accent-indigo-600" />
                          </label>

                          <div className="text-[11px] leading-5 text-slate-500">
                            <span className="font-bold">{en ? 'Source:' : 'Fuente:'}</span>{' '}
                            {sourceUrl(layer) ? (
                              <a href={sourceUrl(layer)} target="_blank" rel="noreferrer" className="font-semibold text-indigo-600 hover:underline">{sourceLabel(layer)}</a>
                            ) : (
                              <span>{sourceLabel(layer)}</span>
                            )}
                          </div>

                          {formats.length > 0 && (
                            <div className="flex gap-2">
                              <select value={selectedFormat} onChange={(event) => setFormat((current) => ({ ...current, [layer.key]: event.target.value }))} className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs font-semibold text-slate-700">
                                {formats.map((item) => <option key={item} value={item}>{item.toUpperCase()}</option>)}
                              </select>
                              <a href={layer.downloads[selectedFormat]} download className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700">
                                {en ? 'Download' : 'Descargar'}
                              </a>
                            </div>
                          )}
                        </div>
                      )}
                    </section>
                  );
                })}
              </section>
            ))}
          </div>
        </aside>

        <section className="relative h-[72vh] min-h-[560px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <MapContainer center={[15.4, -90.4]} zoom={7} minZoom={4} maxZoom={18} zoomControl={false} className="h-full w-full" style={{ background: '#f8fafc' }}>
            <ZoomControl position="bottomright" />
            <TileLayer
              key={basemap}
              attribution={BASEMAPS[basemap].attribution}
              url={BASEMAPS[basemap].url}
              className={BASEMAPS[basemap].className || ''}
            />
            <FitToActiveLayers datasets={activeDatasets} fitToken={fitToken} />
            {layers.map((layer) => {
              if (!active[layer.key] || !datasets[layer.key]) return null;
              const alpha = opacity[layer.key] ?? 0.45;
              return (
                <GeoJSON
                  key={`${layer.key}-${alpha}`}
                  data={datasets[layer.key]}
                  style={{
                    color: layer.color,
                    weight: 1.2,
                    fillColor: layer.color,
                    fillOpacity: alpha,
                    opacity: Math.min(1, alpha + 0.35),
                  }}
                  onEachFeature={(feature, leafletLayer) => bindPopup(feature, leafletLayer, layer)}
                />
              );
            })}
          </MapContainer>
          <div className="pointer-events-none absolute left-3 top-3 z-[500] rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs text-slate-600 shadow-sm backdrop-blur">
            {en ? 'Click a feature to inspect its attributes.' : 'Haz clic en una entidad para consultar sus atributos.'}
          </div>
        </section>
      </div>
    </main>
  );
}
