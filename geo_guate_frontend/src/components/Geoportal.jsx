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
};

const COLORS = ['#4f46e5', '#059669', '#dc2626', '#d97706', '#7c3aed', '#0891b2'];

const BELIZE_DISPUTE_NOTE = 'Diferendo Territorial Insular y Marítimo pendiente de resolver';

const ADJACENCY_LINE = {"type":"FeatureCollection","features":[{"type":"Feature","properties":{"name":"Línea de Adyacencia","note":"Diferendo Territorial Insular y Marítimo pendiente de resolver"},"geometry":{"type":"LineString","coordinates":[[-89.15688626855435,17.815612157632316],[-89.1568705951382,17.791406839527664],[-89.15653016884981,17.77918925651892],[-89.15677071341372,17.768364535138954],[-89.1563738123118,17.76743990637591],[-89.156658966638,17.74532648454261],[-89.1562217778594,17.700167474937476],[-89.15591663208616,17.686325513263526],[-89.15623807595061,17.675952266696],[-89.15595873003289,17.67183062319578],[-89.15595579500467,17.664365054856905],[-89.15563527634832,17.61745908389311],[-89.15517792083496,17.599091952446372],[-89.1554025225937,17.560089429140195],[-89.15475418484588,17.524599649745827],[-89.15445365921968,17.425050133825554],[-89.15444926345987,17.422066064587234],[-89.15435758456103,17.420162934062557],[-89.15442082009027,17.398136110128217],[-89.15405049062124,17.396664035274725],[-89.15427473869138,17.35765882188847],[-89.15327138264637,17.327970974598223],[-89.15330390300194,17.2884984540444],[-89.15310639149958,17.279537016091588],[-89.15295759616546,17.248499827626613],[-89.15249388943334,17.246694448815322],[-89.15266116513952,17.234925143905],[-89.1526882904303,17.23344719058902],[-89.15260883682474,17.23071314742641],[-89.15227157090355,17.22382745584005],[-89.15256852358847,17.22147502587409],[-89.15207352995519,17.192558079135356],[-89.15246460551882,17.190413812064087],[-89.15199679874314,17.18897827775051],[-89.15194080687122,17.143631637007708],[-89.1515559810411,17.142667969714758],[-89.15182137586375,17.120286090063246],[-89.15143943932851,17.11946796577863],[-89.15151793903861,17.096306606201107],[-89.15223541336411,17.049801580072707],[-89.1529290604544,17.039152938899388],[-89.15321618383155,17.023210782210814],[-89.15365749252305,17.01140700462336],[-89.15436792458004,17.001164608146365],[-89.15445918931499,17.000025041968314],[-89.15499662920165,16.993222404607707],[-89.15504741821282,16.99073439708141],[-89.15553560731784,16.986339712202803],[-89.15559807295033,16.983277891876696],[-89.1558420902266,16.978410567788135],[-89.15631933174615,16.97716325017518],[-89.15632313276295,16.97306728797777],[-89.1569532915692,16.961004210578988],[-89.15825624056131,16.937799039629418],[-89.15904106421587,16.93135283194041],[-89.16021031197842,16.904654562290144],[-89.1632229530732,16.86241728110802],[-89.16338626890655,16.85926143519946],[-89.16370032588675,16.85884778367401],[-89.16545839398141,16.830484304242354],[-89.16624254074361,16.817862151422307],[-89.1666579032587,16.810402850417784],[-89.16797758580599,16.79458997447261],[-89.16748381810088,16.79404845450806],[-89.16903193227434,16.781267894917036],[-89.16896587103281,16.77612958796219],[-89.17001984322886,16.766716370624717],[-89.17167339673438,16.734294877157115],[-89.1734057594231,16.71170568494512],[-89.17335218785526,16.70521196026155],[-89.17483501933793,16.68903745717461],[-89.1747611096656,16.685257956878395],[-89.17572859779062,16.67774890480972],[-89.17614293752851,16.67398068340752],[-89.17599657541635,16.672831676444275],[-89.17580137058343,16.671299223570117],[-89.17648538845417,16.666795013059264],[-89.1771151488364,16.65512710312249],[-89.17745946493493,16.651989136625197],[-89.17821252140915,16.639840767054714],[-89.17892185638792,16.636402755802955],[-89.17963386960139,16.622617133573577],[-89.18019534752491,16.619696293485692],[-89.18006772282875,16.61645374590098],[-89.18101950450104,16.607581851817987],[-89.18129953887649,16.594607007590557],[-89.18174935218815,16.59164461423154],[-89.18252025146033,16.577309588281757],[-89.18295449807228,16.575870573651063],[-89.18271121849187,16.57317513739728],[-89.18363000708536,16.566766825927964],[-89.18328639881685,16.56494699317081],[-89.18504368840806,16.54472921967498],[-89.18497266122833,16.540407238413895],[-89.18667442125891,16.520466907600166],[-89.18715998123007,16.50845430456234],[-89.18734858891821,16.50512954004349],[-89.18751612526012,16.50290740094132],[-89.18798870038212,16.488319702370177],[-89.18921245048018,16.474306200683802],[-89.18941492869645,16.464348900748185],[-89.19009226483965,16.46007773758632],[-89.19060972490475,16.452410276828658],[-89.19183518362048,16.43424824360328],[-89.19235977121774,16.430332913224834],[-89.19297533704032,16.414193482263972],[-89.19533807181863,16.384257231409105],[-89.19534121799364,16.373991678169418],[-89.19640095818482,16.363936961840093],[-89.19688079197782,16.351062273716128],[-89.19683978766751,16.349139684518278],[-89.1973200099419,16.34684417223769],[-89.1982095572742,16.338522067909796],[-89.19903902791219,16.321702775354403],[-89.20092960673375,16.29472142313651],[-89.20276928810294,16.266522046761192],[-89.20294218252589,16.25814404771388],[-89.204056073786,16.242653932789963],[-89.20414857828503,16.241367372679434],[-89.20446299370445,16.240954572246682],[-89.20519857226668,16.227421022530226],[-89.20582596222027,16.226271686632032],[-89.20561585105234,16.22222228385362],[-89.20736358434159,16.198939477377618],[-89.20763062241303,16.19413503070242],[-89.20935575565738,16.171267859290186],[-89.20984494241834,16.157531231167983],[-89.21165749850681,16.133546591502455],[-89.21152851253805,16.130575736105136],[-89.21232933922352,16.12365918190231],[-89.21244709834399,16.118203488230666],[-89.21283677603603,16.114093662387486],[-89.21327267058689,16.11086552607248],[-89.21299226650832,16.110363153501762],[-89.21647371870357,16.063139629091836],[-89.21960869104211,16.001215352732395],[-89.21962049798917,15.99956658474176],[-89.21977423629939,15.991462014483279],[-89.22129404176299,15.973395108815733],[-89.22126467749504,15.968534498217215],[-89.22226302174822,15.9589559119496],[-89.22202612160066,15.956265104920865],[-89.22468764378327,15.918743753641287],[-89.22457931745052,15.91468818282403],[-89.22575987765362,15.89564278781172],[-89.22529752411027,15.895185796164782],[-89.22457299633797,15.894412920626946],[-89.22426259171075,15.893714960663509],[-89.22417537662967,15.891558748267224]]}}]};


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


const pointInRing = ([lng, lat], ring = []) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = ((yi > lat) !== (yj > lat))
      && (lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || Number.EPSILON) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
};

const pointInPolygon = (point, polygon = []) => {
  if (!polygon.length || !pointInRing(point, polygon[0])) return false;
  return !polygon.slice(1).some((hole) => pointInRing(point, hole));
};

const geometryContainsPoint = (geometry, point) => {
  if (!geometry) return false;
  if (geometry.type === 'Polygon') return pointInPolygon(point, geometry.coordinates);
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.some((polygon) => pointInPolygon(point, polygon));
  }
  return false;
};

const geojsonContainsPoint = (data, point) =>
  (data?.features || []).some((feature) => geometryContainsPoint(feature.geometry, point));

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

        const applyCountryDefault = async (countryCode, cachedData = null) => {
          const country = data.countries.find((item) => item.code === countryCode)
            || data.countries.find((item) => item.code === 'GTM');
          const layer = country?.levels?.[0];
          if (!country || !layer) return;

          const key = `${country.code}-${layer.id}`;
          setExpandedCountries({ [country.code]: true });
          setActive((current) => Object.fromEntries(
            Object.keys(current).map((itemKey) => [itemKey, itemKey === key]),
          ));

          if (cachedData) {
            setDatasets((current) => ({ ...current, [key]: cachedData }));
            setFocusedData(cachedData);
            setFocusToken((value) => value + 1);
          }
        };

        const fallbackToGuatemala = () => applyCountryDefault('GTM');

        if (!navigator.geolocation) {
          fallbackToGuatemala();
          return;
        }

        navigator.geolocation.getCurrentPosition(
          async ({ coords }) => {
            const point = [coords.longitude, coords.latitude];
            const candidates = data.countries
              .map((country) => ({ country, layer: country.levels?.[0] }))
              .filter(({ layer }) => layer?.map_url);

            const results = await Promise.all(candidates.map(async ({ country, layer }) => {
              try {
                const response = await fetch(layer.map_url);
                if (!response.ok) return null;
                const geojson = await response.json();
                return geojsonContainsPoint(geojson, point) ? { country, layer, geojson } : null;
              } catch {
                return null;
              }
            }));

            const detected = results.find(Boolean);
            if (detected) {
              await applyCountryDefault(detected.country.code, detected.geojson);
            } else {
              fallbackToGuatemala();
            }
          },
          fallbackToGuatemala,
          { enableHighAccuracy: false, timeout: 7000, maximumAge: 900000 },
        );
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

  const groupedRegions = useMemo(() => {
    if (!catalog) return [];
    const regions = new Map();

    catalog.countries.forEach((country) => {
      const countryLayers = visibleLayers.filter((layer) => layer.countryCode === country.code);
      if (!countryLayers.length) return;

      const regionLabel = en ? country.region : country.region_es;
      if (!regions.has(regionLabel)) {
        regions.set(regionLabel, { region: regionLabel, countries: [], count: 0 });
      }

      const group = regions.get(regionLabel);
      group.countries.push({ country, layers: countryLayers, count: countryLayers.length });
      group.count += countryLayers.length;
    });

    return Array.from(regions.values());
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
    const props = { ...(feature.properties || {}) };
    if (layer.countryCode === 'BLZ' && !props.note) props.note = BELIZE_DISPUTE_NOTE;
    const title = props[layer.name_property] || layerLabel(layer);
    const preferred = [layer.name_property, layer.code_property, layer.parent_name_property, 'note', 'area_km2']
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

  const showAdjacencyReference = useMemo(
    () => layers.some((layer) => active[layer.key] && ['GTM', 'BLZ'].includes(layer.countryCode)),
    [layers, active],
  );

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

        <div className="space-y-5">
          {groupedRegions.map(({ region, countries, count: regionCount }) => (
            <section key={region}>
              <div className="mb-1.5 flex items-center gap-2 px-1">
                <p className="min-w-0 flex-1 truncate text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                  {region}
                </p>
                <span className="text-[10px] font-bold text-slate-400">
                  {regionCount} {en ? (regionCount === 1 ? 'layer' : 'layers') : (regionCount === 1 ? 'capa' : 'capas')}
                </span>
              </div>
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                {countries.map(({ country, layers: countryLayers, count }, countryIndex) => {
                  const open = Boolean(expandedCountries[country.code]) || Boolean(query.trim());
                  return (
                    <div key={country.code} className={countryIndex ? 'border-t border-slate-100' : ''}>
                      <button
                        type="button"
                        onClick={() => toggleCountry(country.code)}
                        className="flex min-h-[46px] w-full items-center gap-2.5 px-3 py-2 text-left transition hover:bg-slate-50"
                      >
                        <span className={`text-[10px] text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
                        <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-800">{country.name}</span>
                        <span className="grid h-6 min-w-6 place-items-center rounded-full bg-slate-100 px-1.5 text-[10px] font-bold text-slate-500">{count}</span>
                      </button>

                      {open && (
                        <div className="border-t border-slate-100 bg-slate-50/60 px-2 py-1.5">
                          <div className="space-y-1">
                            {countryLayers.map((layer) => {
                              const enabled = Boolean(active[layer.key]);
                              const detailsOpen = expandedLayer === layer.key;
                              return (
                                <div key={layer.key} className={`rounded-lg border transition ${enabled ? 'border-indigo-200 bg-indigo-50/70' : 'border-transparent hover:bg-white'}`}>
                                  <div className="flex min-h-[42px] items-center gap-2 px-2 py-1.5">
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
                                        <span className="truncate text-[13px] font-semibold text-slate-700">{layerLabel(layer)}</span>
                                      </span>
                                      <span className="ml-[18px] block text-[9px] text-slate-400">
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
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
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

            {showAdjacencyReference && (
              <>
                <GeoJSON
                  key="adjacency-mask"
                  data={ADJACENCY_LINE}
                  interactive={false}
                  style={{ color: '#ffffff', weight: 5, opacity: 0.95, fillOpacity: 0 }}
                />
                <GeoJSON
                  key="adjacency-dashed"
                  data={ADJACENCY_LINE}
                  style={{ color: '#475569', weight: 2.2, opacity: 1, dashArray: '7 7', fillOpacity: 0 }}
                  onEachFeature={(feature, leafletLayer) => {
                    leafletLayer.bindPopup(
                      `<div style="min-width:220px"><div style="font-weight:800;font-size:14px;color:#0f172a;margin-bottom:8px">${feature.properties?.name || 'Línea de Adyacencia'}</div><div style="font-size:12px;line-height:1.5;color:#475569">${feature.properties?.note || BELIZE_DISPUTE_NOTE}</div></div>`,
                    );
                  }}
                />
              </>
            )}
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
