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

const TOOL_LINKS = [
  { href: '/', es: 'Georeferenciar', en: 'Georeference', descriptionEs: 'CSV → mapa GIS', descriptionEn: 'CSV → GIS map', icon: '◎' },
  { href: '/crear-capa', es: 'Crear capa', en: 'Create layer', descriptionEs: 'Crea puntos en el mapa', descriptionEn: 'Create points on the map', icon: '+' },
  { href: '/convertir-formatos', es: 'Convertidor de capas', en: 'Layer converter', descriptionEs: 'SHP · GeoJSON · KML · GPKG · CSV', descriptionEn: 'SHP · GeoJSON · KML · GPKG · CSV', icon: '⇄' },
  { href: '/capas', es: 'Catálogo de capas', en: 'Layer catalog', descriptionEs: 'Explorar y descargar', descriptionEn: 'Browse and download', icon: '▰' },
  { href: '/proyectos', es: 'Proyectos', en: 'Projects', descriptionEs: 'Otras herramientas', descriptionEn: 'Other tools', icon: '◫' },
];

function MapController({ activeDatasets, fitToken, focusedData, focusToken }) {
  const map = useMap();

  useEffect(() => {
    const datasets = Object.values(activeDatasets).filter(Boolean);
    if (!datasets.length) return;
    const group = L.featureGroup(datasets.map((data) => L.geoJSON(data)));
    const bounds = group.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [28, 28], maxZoom: 11 });
  }, [activeDatasets, fitToken, map]);

  useEffect(() => {
    if (!focusedData) return;
    const bounds = L.geoJSON(focusedData).getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
  }, [focusedData, focusToken, map]);

  return null;
}

const displayValue = (value) => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

export function Geoportal({ language = 'es', onLanguageChange, embedded = false }) {
  const en = language === 'en';
  const [panel, setPanel] = useState('layers');
  const [catalog, setCatalog] = useState(null);
  const [active, setActive] = useState({});
  const [datasets, setDatasets] = useState({});
  const [loading, setLoading] = useState({});
  const [errors, setErrors] = useState({});
  const [opacity, setOpacity] = useState({});
  const [format, setFormat] = useState({});
  const [expandedCountries, setExpandedCountries] = useState({ GTM: true });
  const [expandedLayer, setExpandedLayer] = useState(null);
  const [basemap, setBasemap] = useState('gray');
  const [showBasemaps, setShowBasemaps] = useState(false);
  const [query, setQuery] = useState('');
  const [fitToken, setFitToken] = useState(0);
  const [focusedData, setFocusedData] = useState(null);
  const [focusToken, setFocusToken] = useState(0);

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
      .catch(() => setErrors((current) => ({
        ...current,
        catalog: en ? 'Could not load the layer catalog.' : 'No fue posible cargar el catálogo de capas.',
      })));
  }, [en]);

  const layers = useMemo(() => {
    if (!catalog) return [];
    let colorIndex = 0;
    return catalog.countries.flatMap((country) =>
      country.levels.map((layer) => ({
        ...layer,
        countryCode: country.code,
        countryName: country.name,
        countryRegion: en ? country.region : country.region_es,
        countrySourceLabel: country.source_label,
        countrySourceUrl: country.source_url,
        key: `${country.code}-${layer.id}`,
        color: COLORS[(colorIndex++) % COLORS.length],
      })),
    );
  }, [catalog, en]);

  const layerLabel = (layer) => (en && layer.name_en ? layer.name_en : layer.name);
  const categoryLabel = (layer) =>
    (en ? layer.category_en : layer.category_es) || (en ? 'Geographic layers' : 'Capas geográficas');
  const sourceLabel = (layer) => layer.source_label || layer.countrySourceLabel;
  const sourceUrl = (layer) =>
    Object.prototype.hasOwnProperty.call(layer, 'source_url') ? layer.source_url : layer.countrySourceUrl;

  const visibleLayers = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return layers;
    return layers.filter((layer) =>
      [layer.name, layer.name_en, layer.countryName, layer.singular, layer.source_label, layer.countrySourceLabel]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [layers, query]);

  const groupedCountries = useMemo(() => {
    if (!catalog) return [];
    return catalog.countries
      .map((country) => {
        const countryLayers = visibleLayers.filter((layer) => layer.countryCode === country.code);
        const categories = countryLayers.reduce((acc, layer) => {
          const label = categoryLabel(layer);
          if (!acc[label]) acc[label] = [];
          acc[label].push(layer);
          return acc;
        }, {});
        return { country, categories, count: countryLayers.length };
      })
      .filter((group) => group.count > 0);
  }, [catalog, visibleLayers, en]);

  const selectedLayers = useMemo(
    () => layers.filter((layer) => active[layer.key]),
    [layers, active],
  );

  const ensureLayer = async (layer) => {
    if (datasets[layer.key]) return datasets[layer.key];
    if (loading[layer.key]) return null;

    setLoading((current) => ({ ...current, [layer.key]: true }));
    setErrors((current) => ({ ...current, [layer.key]: '' }));

    try {
      const response = await fetch(layer.map_url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setDatasets((current) => ({ ...current, [layer.key]: data }));
      return data;
    } catch {
      setErrors((current) => ({
        ...current,
        [layer.key]: en ? 'Could not load this layer.' : 'No fue posible cargar esta capa.',
      }));
      return null;
    } finally {
      setLoading((current) => ({ ...current, [layer.key]: false }));
    }
  };

  useEffect(() => {
    if (!layers.length) return;
    layers.filter((layer) => active[layer.key] && !datasets[layer.key]).forEach((layer) => {
      ensureLayer(layer);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers, active]);

  const toggleLayer = async (layer) => {
    const next = !active[layer.key];
    setActive((current) => ({ ...current, [layer.key]: next }));
    if (next) {
      const data = await ensureLayer(layer);
      if (data) {
        setFocusedData(data);
        setFocusToken((value) => value + 1);
      }
    }
  };

  const zoomLayer = async (layer) => {
    const data = await ensureLayer(layer);
    if (!data) return;
    setFocusedData(data);
    setFocusToken((value) => value + 1);
  };

  const bindPopup = (feature, leafletLayer, layer) => {
    const props = feature.properties || {};
    const title = props[layer.name_property] || layerLabel(layer);
    const preferred = [layer.name_property, layer.code_property, layer.parent_name_property, 'area_km2']
      .filter(Boolean)
      .filter((key, index, array) => array.indexOf(key) === index && Object.prototype.hasOwnProperty.call(props, key));
    const remaining = Object.keys(props)
      .filter((key) => !preferred.includes(key))
      .slice(0, Math.max(0, 7 - preferred.length));
    const keys = [...preferred, ...remaining];
    const rows = keys.map((key) =>
      `<div style="display:grid;grid-template-columns:100px 1fr;gap:8px;padding:4px 0;border-top:1px solid #f1f5f9">
        <strong style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.04em">${key}</strong>
        <span style="font-size:12px;color:#0f172a;word-break:break-word">${displayValue(props[key])}</span>
      </div>`,
    ).join('');
    leafletLayer.bindPopup(
      `<div style="min-width:220px">
        <div style="font-weight:800;font-size:14px;color:#0f172a;margin-bottom:8px">${title}</div>
        ${rows || `<span style="font-size:12px;color:#64748b">${en ? 'No attributes' : 'Sin atributos'}</span>`}
      </div>`,
    );
  };

  const activeDatasets = useMemo(() => {
    const result = {};
    layers.forEach((layer) => {
      if (active[layer.key] && datasets[layer.key]) result[layer.key] = datasets[layer.key];
    });
    return result;
  }, [layers, active, datasets]);

  const toggleCountry = (code) => {
    setExpandedCountries((current) => ({ ...current, [code]: !current[code] }));
  };

  const renderDownload = (layer, compact = false) => {
    const formats = Object.keys(layer.downloads || {});
    if (!formats.length) return null;
    const selectedFormat = format[layer.key] || formats[0];

    return (
      <div className={compact ? 'flex gap-2' : 'space-y-2'}>
        <select
          value={selectedFormat}
          onChange={(event) => setFormat((current) => ({ ...current, [layer.key]: event.target.value }))}
          className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-indigo-400"
        >
          {formats.map((item) => <option key={item} value={item}>{item.toUpperCase()}</option>)}
        </select>
        <a
          href={layer.downloads[selectedFormat]}
          download
          className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-indigo-700"
        >
          {en ? 'Download' : 'Descargar'}
        </a>
      </div>
    );
  };

  const renderLayersPanel = () => (
    <>
      <div className="border-b border-slate-200 px-4 py-4">
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-indigo-600">
          {en ? 'Geographic layers' : 'Capas geográficas'}
        </p>
        <h2 className="mt-1 text-lg font-bold text-slate-900">
          {en ? 'Explore the catalog' : 'Explora el catálogo'}
        </h2>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={en ? 'Search layer…' : 'Buscar capa…'}
          className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        />
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {errors.catalog && <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{errors.catalog}</div>}

        <div className="space-y-2">
          {groupedCountries.map(({ country, categories, count }) => {
            const open = Boolean(expandedCountries[country.code]) || Boolean(query.trim());
            return (
              <section key={country.code} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <button
                  type="button"
                  onClick={() => toggleCountry(country.code)}
                  className="flex w-full items-center gap-3 px-3 py-3 text-left transition hover:bg-slate-50"
                >
                  <span className={`text-xs text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-slate-800">{country.name}</div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      {en ? country.region : country.region_es}
                    </div>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">{count}</span>
                </button>

                {open && (
                  <div className="border-t border-slate-100 px-3 pb-3">
                    {Object.entries(categories).map(([category, categoryLayers]) => (
                      <div key={category} className="pt-3">
                        <p className="mb-1.5 text-[10px] font-black uppercase tracking-[0.13em] text-slate-400">{category}</p>
                        <div className="space-y-1">
                          {categoryLayers.map((layer) => {
                            const enabled = Boolean(active[layer.key]);
                            const detailsOpen = expandedLayer === layer.key;
                            return (
                              <div key={layer.key} className={`rounded-lg border transition ${enabled ? 'border-indigo-200 bg-indigo-50/50' : 'border-transparent hover:bg-slate-50'}`}>
                                <div className="flex items-center gap-2 px-2 py-2">
                                  <input
                                    type="checkbox"
                                    checked={enabled}
                                    onChange={() => toggleLayer(layer)}
                                    className="h-4 w-4 shrink-0 accent-indigo-600"
                                    aria-label={`${en ? 'Show' : 'Mostrar'} ${layerLabel(layer)}`}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => toggleLayer(layer)}
                                    className="min-w-0 flex-1 text-left"
                                  >
                                    <span className="flex items-center gap-2">
                                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: layer.color }} />
                                      <span className="truncate text-sm font-semibold text-slate-700">{layerLabel(layer)}</span>
                                    </span>
                                    <span className="ml-[18px] block text-[10px] text-slate-400">
                                      {layer.count} {en ? 'features' : 'entidades'}
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setExpandedLayer(detailsOpen ? null : layer.key)}
                                    className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-lg font-bold text-slate-400 hover:bg-white hover:text-indigo-600"
                                    aria-label={en ? 'Layer options' : 'Opciones de capa'}
                                  >
                                    ⋮
                                  </button>
                                </div>

                                {loading[layer.key] && <p className="px-3 pb-2 text-[10px] font-semibold text-indigo-600">{en ? 'Loading…' : 'Cargando…'}</p>}
                                {errors[layer.key] && <p className="px-3 pb-2 text-[10px] text-red-600">{errors[layer.key]}</p>}

                                {detailsOpen && (
                                  <div className="space-y-3 border-t border-slate-200/70 bg-white px-3 py-3">
                                    <div className="grid grid-cols-2 gap-2">
                                      <button
                                        type="button"
                                        onClick={() => toggleLayer(layer)}
                                        className="rounded-lg border border-slate-300 px-2 py-2 text-xs font-bold text-slate-700 hover:border-indigo-300 hover:text-indigo-700"
                                      >
                                        {enabled ? (en ? 'Hide' : 'Ocultar') : (en ? 'View on map' : 'Ver en mapa')}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => zoomLayer(layer)}
                                        className="rounded-lg border border-slate-300 px-2 py-2 text-xs font-bold text-slate-700 hover:border-indigo-300 hover:text-indigo-700"
                                      >
                                        {en ? 'Zoom to layer' : 'Zoom a capa'}
                                      </button>
                                    </div>

                                    <div>
                                      <p className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-400">{en ? 'Download' : 'Descargar'}</p>
                                      {renderDownload(layer, true)}
                                    </div>

                                    <div className="text-[10px] leading-4 text-slate-500">
                                      <span className="font-bold">{en ? 'Source:' : 'Fuente:'}</span>{' '}
                                      {sourceUrl(layer) ? (
                                        <a href={sourceUrl(layer)} target="_blank" rel="noreferrer" className="font-semibold text-indigo-600 hover:underline">
                                          {sourceLabel(layer)}
                                        </a>
                                      ) : (
                                        <span>{sourceLabel(layer)}</span>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </>
  );

  const renderSelectedPanel = () => (
    <>
      <div className="border-b border-slate-200 px-4 py-4">
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-indigo-600">
          {en ? 'Selected layers' : 'Capas seleccionadas'}
        </p>
        <h2 className="mt-1 text-lg font-bold text-slate-900">
          {selectedLayers.length
            ? `${selectedLayers.length} ${en ? (selectedLayers.length === 1 ? 'active layer' : 'active layers') : (selectedLayers.length === 1 ? 'capa activa' : 'capas activas')}`
            : (en ? 'No active layers' : 'Sin capas activas')}
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {!selectedLayers.length ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm leading-6 text-slate-500">
            {en ? 'Activate layers from the geographic catalog to manage them here.' : 'Activa capas desde el catálogo geográfico para administrarlas aquí.'}
          </div>
        ) : (
          <div className="space-y-3">
            {selectedLayers.map((layer) => (
              <section key={layer.key} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex items-start gap-2">
                  <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: layer.color }} />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold text-slate-800">{layerLabel(layer)}</h3>
                    <p className="text-[10px] text-slate-400">{layer.countryName}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleLayer(layer)}
                    className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600"
                    aria-label={en ? 'Remove layer' : 'Quitar capa'}
                  >
                    ×
                  </button>
                </div>

                <label className="mt-4 block">
                  <span className="mb-1.5 flex justify-between text-[10px] font-black uppercase tracking-wide text-slate-400">
                    <span>{en ? 'Opacity' : 'Transparencia'}</span>
                    <span>{Math.round((opacity[layer.key] ?? 0.45) * 100)}%</span>
                  </span>
                  <input
                    type="range"
                    min="0.05"
                    max="0.9"
                    step="0.05"
                    value={opacity[layer.key] ?? 0.45}
                    onChange={(event) => setOpacity((current) => ({ ...current, [layer.key]: Number(event.target.value) }))}
                    className="w-full accent-indigo-600"
                  />
                </label>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => zoomLayer(layer)}
                    className="rounded-lg border border-slate-300 px-2 py-2 text-xs font-bold text-slate-700 hover:border-indigo-300 hover:text-indigo-700"
                  >
                    {en ? 'Zoom' : 'Zoom'}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleLayer(layer)}
                    className="rounded-lg border border-slate-300 px-2 py-2 text-xs font-bold text-slate-700 hover:border-indigo-300 hover:text-indigo-700"
                  >
                    {en ? 'Hide' : 'Ocultar'}
                  </button>
                </div>

                <div className="mt-3 border-t border-slate-100 pt-3">
                  {renderDownload(layer, true)}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </>
  );

  const renderToolsPanel = () => (
    <>
      <div className="border-b border-slate-200 px-4 py-4">
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-indigo-600">
          {en ? 'Tools' : 'Herramientas'}
        </p>
        <h2 className="mt-1 text-lg font-bold text-slate-900">ConvertToMap</h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          {en ? 'Open another tool without losing the Geoportal structure.' : 'Accede a las demás funciones de ConvertToMap.'}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <div className="space-y-2">
          {TOOL_LINKS.map((tool) => (
            <a
              key={tool.href}
              href={tool.href}
              className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 transition hover:border-indigo-200 hover:bg-indigo-50/40"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-100 text-lg font-black text-slate-600 transition group-hover:bg-indigo-600 group-hover:text-white">
                {tool.icon}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-slate-800">{en ? tool.en : tool.es}</span>
                <span className="mt-0.5 block truncate text-[11px] text-slate-500">{en ? tool.descriptionEn : tool.descriptionEs}</span>
              </span>
              <span className="ml-auto text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-indigo-500">→</span>
            </a>
          ))}
        </div>
      </div>
    </>
  );

  return (
    <div className={embedded ? "flex min-h-[calc(100dvh-122px)] flex-col bg-slate-100 text-slate-900 lg:min-h-[calc(100vh-64px)]" : "flex min-h-screen flex-col bg-slate-100 text-slate-900"}>
      {!embedded && <header className="z-[1100] flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-5">
        <a href="/" className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-indigo-600 text-xs font-black text-white">CTM</div>
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold tracking-tight text-slate-900">ConvertToMap</span>
            <span className="text-sm font-black uppercase tracking-[0.16em] text-indigo-600">Geoportal</span>
          </div>
        </a>

        <div className="flex items-center gap-2">
          <div className="hidden text-xs font-medium text-slate-400 sm:block">
            {en ? 'Geographic data viewer' : 'Visor de datos geográficos'}
          </div>
          <div className="ml-2 flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs font-bold">
            <button
              type="button"
              onClick={() => onLanguageChange?.('es')}
              className={`rounded-md px-2.5 py-1.5 ${language === 'es' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900'}`}
            >
              ES
            </button>
            <button
              type="button"
              onClick={() => onLanguageChange?.('en')}
              className={`rounded-md px-2.5 py-1.5 ${language === 'en' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900'}`}
            >
              EN
            </button>
          </div>
        </div>
      </header>}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <nav className="z-[1050] flex shrink-0 border-b border-slate-200 bg-white lg:w-[72px] lg:flex-col lg:border-b-0 lg:border-r">
          {(embedded ? [
            { id: 'layers', icon: '▱', es: 'Capas', en: 'Layers' },
            { id: 'selected', icon: '★', es: 'Selecc.', en: 'Selected' },
          ] : [
            { id: 'layers', icon: '▱', es: 'Capas', en: 'Layers' },
            { id: 'selected', icon: '★', es: 'Selecc.', en: 'Selected' },
            { id: 'tools', icon: '⚙', es: 'Herram.', en: 'Tools' },
          ]).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setPanel(item.id)}
              className={`flex min-h-[64px] flex-1 flex-col items-center justify-center gap-1 border-indigo-600 px-2 py-2 text-center transition lg:flex-none lg:min-h-[92px] ${panel === item.id ? 'border-b-2 bg-indigo-50 text-indigo-700 lg:border-b-0 lg:border-l-4' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}
            >
              <span className="text-xl leading-none">{item.icon}</span>
              <span className="text-[10px] font-bold leading-tight">{en ? item.en : item.es}</span>
              {item.id === 'selected' && selectedLayers.length > 0 && (
                <span className="absolute mt-[-38px] ml-[28px] grid h-4 min-w-4 place-items-center rounded-full bg-indigo-600 px-1 text-[9px] font-black text-white">
                  {selectedLayers.length}
                </span>
              )}
            </button>
          ))}
        </nav>

        <aside className="flex max-h-[36dvh] shrink-0 flex-col border-b border-slate-200 bg-slate-50 sm:max-h-[40dvh] lg:max-h-none lg:w-[320px] lg:border-b-0 lg:border-r">
          {panel === 'layers' && renderLayersPanel()}
          {panel === 'selected' && renderSelectedPanel()}
          {!embedded && panel === 'tools' && renderToolsPanel()}
        </aside>

        <main className="relative min-h-[48dvh] flex-1 bg-slate-200 sm:min-h-[52dvh] lg:min-h-0">
          <MapContainer
            center={[15.4, -90.4]}
            zoom={7}
            minZoom={3}
            maxZoom={18}
            zoomControl={false}
            className="h-full min-h-[48dvh] w-full sm:min-h-[52dvh] lg:min-h-0"
            style={{ background: '#f8fafc' }}
          >
            <ZoomControl position="bottomright" />
            <TileLayer
              key={basemap}
              attribution={BASEMAPS[basemap].attribution}
              url={BASEMAPS[basemap].url}
              className={BASEMAPS[basemap].className || ''}
            />
            <MapController
              activeDatasets={activeDatasets}
              fitToken={fitToken}
              focusedData={focusedData}
              focusToken={focusToken}
            />
            {layers.map((layer) => {
              if (!active[layer.key] || !datasets[layer.key]) return null;
              const alpha = opacity[layer.key] ?? 0.45;
              return (
                <GeoJSON
                  key={`${layer.key}-${alpha}`}
                  data={datasets[layer.key]}
                  style={{
                    color: layer.color,
                    weight: 1.4,
                    fillColor: layer.color,
                    fillOpacity: alpha,
                    opacity: Math.min(1, alpha + 0.35),
                  }}
                  onEachFeature={(feature, leafletLayer) => bindPopup(feature, leafletLayer, layer)}
                />
              );
            })}
          </MapContainer>

          <div className="absolute left-3 top-3 z-[500] flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setFitToken((value) => value + 1)}
              className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-base font-bold text-slate-600 shadow-sm transition hover:text-indigo-600"
              title={en ? 'Zoom to active layers' : 'Zoom a capas activas'}
            >
              ⌂
            </button>
          </div>

          <div className="absolute right-3 top-3 z-[500]">
            <button
              type="button"
              onClick={() => setShowBasemaps((value) => !value)}
              className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 shadow-sm transition hover:text-indigo-600"
            >
              ▱ {en ? 'Base map' : 'Mapa base'}
            </button>

            {showBasemaps && (
              <div className="mt-2 w-44 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                {Object.entries(BASEMAPS).map(([id, item]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setBasemap(id);
                      setShowBasemaps(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-semibold ${basemap === id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}
                  >
                    {item[language] || item.es}
                    {basemap === id && <span>✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="pointer-events-none absolute bottom-3 left-3 z-[500] hidden rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-[11px] font-medium text-slate-500 shadow-sm backdrop-blur sm:block">
            {en ? 'Click a feature to inspect its attributes.' : 'Haz clic en una entidad para consultar sus atributos.'}
          </div>
        </main>
      </div>
    </div>
  );
}
