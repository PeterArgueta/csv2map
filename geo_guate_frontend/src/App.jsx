import React, { useEffect, useState } from 'react';
import { UploadForm } from './components/UploadForm';
import { MapaDepartamentos } from './components/MapaDepartamentos';
import { CrearCapaPuntos } from './components/CrearCapaPuntos';
import { ConvertirFormatos } from './components/ConvertirFormatos';
import { Geoportal } from './components/Geoportal';
import './index.css';

const DOWNLOAD_FORMATS = {
  geojson: { label: 'GeoJSON', note: 'Web y GIS' },
  shp: { label: 'Shapefile', note: 'QGIS y ArcGIS' },
  gpkg: { label: 'GeoPackage', note: 'Formato GIS moderno' },
  kml: { label: 'KML', note: 'Google Earth' },
};

const CATALOG_URL = '/countries/catalog.json';

const isGeoreferenceLayer = (layer) => Boolean(
  layer
  && !layer.download_only
  && ['admin1', 'admin2'].includes(layer.admin_level)
  && layer.code_property
  && Number.isInteger(layer.code_width)
  && layer.api?.code_field
);


const NAV_LABELS = {
  es: {
    subtitle: 'Conversor de datos',
    georeference: 'Georeferenciar',
    createLayer: 'Crear capa',
    layerConverter: 'Convertidor de capas',
    layers: 'Capas',
    projects: 'Proyectos',
    geoportal: 'Geoportal',
  },
  en: {
    subtitle: 'Data converter',
    georeference: 'Georeference',
    createLayer: 'Create layer',
    layerConverter: 'Layer converter',
    layers: 'Layers',
    projects: 'Projects',
    geoportal: 'Geoportal',
  },
};

const getInitialLanguage = () => {
  const saved = window.localStorage.getItem('ctm-language');
  if (saved === 'es' || saved === 'en') return saved;
  return (navigator.language || '').toLowerCase().startsWith('es') ? 'es' : 'en';
};

const PROJECTS = [
  {
    name: 'ConvertToMap',
    description: 'Convierte archivos CSV en capas GIS listas para usar.',
    description_en: 'Convert CSV files into ready-to-use GIS layers.',
    href: '/geoportal',
    tag: 'GIS',
    internal: true,
  },
  {
    name: 'Generador QR',
    description: 'Crea códigos QR personalizados con colores, logo, tamaño y descarga en PNG.',
    description_en: 'Create custom QR codes with colors, logo, size controls and PNG download.',
    href: 'https://qr.converttomap.com',
    tag: 'QR',
    external: true,
  },
];

const exampleFor = (pais, nivel) => {
  if (pais === 'MEX') return 'codigo_estado,valor,nombre\n01,120,Aguascalientes\n09,85,Ciudad de México\n14,64,Jalisco\n';
  if (pais === 'BLZ') return 'codigo_distrito,valor,nombre\n01,120,Belize\n02,85,Cayo\n06,64,Toledo\n';
  if (pais === 'SLV') return 'codigo_departamento,valor,nombre\n01,120,Ahuachapán\n06,85,San Salvador\n12,64,San Miguel\n';
  if (pais === 'HND') return 'codigo_departamento,valor,nombre\n01,120,Atlántida\n08,85,Francisco Morazán\n18,64,Yoro\n';
  if (pais === 'NIC') return 'codigo_territorial,valor,nombre\n05,120,Nueva Segovia\n50,85,Managua\n91,64,Costa Caribe Norte\n';
  if (pais === 'CRI') return 'codigo_provincia,valor,nombre\n01,120,San José\n05,85,Guanacaste\n07,64,Limón\n';
  if (pais === 'PAN') return 'codigo_territorial,valor,nombre\n01,120,Bocas del Toro\n08,85,Panamá\n13,64,Panamá Oeste\n';
  if (nivel === 'municipios') return 'codigo_municipio,valor,nombre\n0101,120,Guatemala\n0301,85,Antigua Guatemala\n0901,64,Quetzaltenango\n';
  return 'codigo_departamento,valor,nombre\n01,120,Guatemala\n03,85,Sacatepéquez\n09,64,Quetzaltenango\n17,98,Petén\n';
};

const pathToView = (pathname) => {
  if (pathname === '/' || pathname === '/geoportal' || pathname.startsWith('/geoportal/')) return 'geoportal';
  if (pathname === '/georeferenciar' || pathname.startsWith('/georeferenciar/')) return 'convertir';
  if (pathname === '/crear-mapa' || pathname.startsWith('/crear-mapa/')) return 'geoportal';
  if (pathname === '/crear-capa' || pathname.startsWith('/crear-capa/')) return 'crear-capa';
  if (pathname === '/convertir-formatos' || pathname.startsWith('/convertir-formatos/')) return 'formatos';
  if (pathname === '/capas' || pathname.startsWith('/capas/')) return 'capas';
  if (pathname === '/proyectos' || pathname.startsWith('/proyectos/')) return 'proyectos';
  return 'geoportal';
};

const APP_NAV_ITEMS = [
  { view: 'geoportal', path: '/geoportal', icon: '▱', es: 'Geoportal', en: 'Geoportal' },
  { view: 'convertir', path: '/georeferenciar', icon: '◎', es: 'Georeferenciar', en: 'Georeference' },
  { view: 'crear-capa', path: '/crear-capa', icon: '+', es: 'Crear capa', en: 'Create layer' },
  { view: 'formatos', path: '/convertir-formatos', icon: '⇄', es: 'Convertidor', en: 'Converter' },
  { view: 'capas', path: '/capas', icon: '▰', es: 'Capas', en: 'Layers' },
  { view: 'proyectos', path: '/proyectos', icon: '◫', es: 'Proyectos', en: 'Projects' },
];

function App() {
  if (window.location.pathname === '/') {
    window.history.replaceState({}, '', '/geoportal');
  }

  const [view, setView] = useState(() => pathToView(window.location.pathname));
  const [language, setLanguage] = useState(getInitialLanguage);
  const [catalog, setCatalog] = useState(null);
  const [pais, setPais] = useState('GTM');
  const [nivel, setNivel] = useState('departamentos');
  const [geojsonData, setGeojsonData] = useState(null);
  const [codigosCsv, setCodigosCsv] = useState([]);
  const [isLoadingMap, setIsLoadingMap] = useState(true);
  const [mapError, setMapError] = useState('');
  const [csvPreview, setCsvPreview] = useState([]);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [fileName, setFileName] = useState('');
  const [downloadFormats, setDownloadFormats] = useState({});

  const ui = NAV_LABELS[language];

  useEffect(() => {
    window.localStorage.setItem('ctm-language', language);
    document.documentElement.lang = language;
    window.dispatchEvent(new CustomEvent('ctm-language-change', { detail: { language } }));
  }, [language]);

  useEffect(() => {
    const syncLanguage = (event) => {
      const next = event.detail?.language;
      if ((next === 'es' || next === 'en') && next !== language) setLanguage(next);
    };
    window.addEventListener('ctm-language-change', syncLanguage);
    return () => window.removeEventListener('ctm-language-change', syncLanguage);
  }, [language]);

  const selectedCountry = catalog?.countries.find((country) => country.code === pais) || null;
  const layerConfig = selectedCountry?.levels.find((level) => level.id === nivel) || null;

  useEffect(() => {
    const controller = new AbortController();
    fetch(CATALOG_URL, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((data) => {
        setCatalog(data);
        const initialCountry = data.countries.find((country) => country.code === data.default_country) || data.countries[0];
        if (initialCountry) {
          setPais(initialCountry.code);
          setNivel(initialCountry.levels.find(isGeoreferenceLayer)?.id || 'departamentos');
        }
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setMapError(language === 'en' ? 'Could not load the country catalog.' : 'No fue posible cargar el catálogo de países.');
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const handlePopState = () => setView(pathToView(window.location.pathname));
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (!layerConfig) return undefined;
    const controller = new AbortController();
    const fetchGeojson = async () => {
      setIsLoadingMap(true);
      setGeojsonData(null);
      setMapError('');
      try {
        const response = await fetch(layerConfig.map_url, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        setGeojsonData(await response.json());
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error('Error cargando GeoJSON:', error);
          setMapError(language === 'en' ? 'Could not load the boundary layer.' : 'No fue posible cargar la capa de límites.');
        }
      } finally {
        setIsLoadingMap(false);
      }
    };
    fetchGeojson();
    return () => controller.abort();
  }, [pais, nivel, layerConfig?.map_url]);

  const navigate = (path) => {
    if (window.location.pathname !== path) window.history.pushState({}, '', path);
    setView(pathToView(path));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNav = (event, path) => {
    event.preventDefault();
    navigate(path);
  };

  const handleLevelChange = (value) => {
    setNivel(value);
    setCodigosCsv([]);
    setCsvPreview([]);
    setCsvHeaders([]);
    setFileName('');
  };

  const handleCountryChange = (value) => {
    const country = catalog?.countries.find((item) => item.code === value);
    setPais(value);
    setNivel(country?.levels.find(isGeoreferenceLayer)?.id || 'departamentos');
    setCodigosCsv([]);
    setCsvPreview([]);
    setCsvHeaders([]);
    setFileName('');
  };

  const handleUpload = (codigos, preview, headers, name) => {
    setCodigosCsv(codigos);
    setCsvPreview(preview);
    setCsvHeaders(headers);
    setFileName(name);
  };

  const loadExample = () => {
    const file = new File([exampleFor(pais, nivel)], `ejemplo_${pais.toLowerCase()}_${nivel}.csv`, { type: 'text/csv;charset=utf-8' });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    const input = document.querySelector('input[type="file"][accept*=".csv"]');
    if (!input) return;
    input.files = dataTransfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const useLayer = (countryCode, levelId) => {
    setPais(countryCode);
    handleLevelChange(levelId);
    navigate('/georeferenciar');
  };

  const navClass = (name) => `rounded-lg px-2.5 py-2 transition sm:px-3 ${view === name ? 'bg-white text-slate-900 shadow-sm' : 'hover:bg-white hover:text-slate-900'}`;

  const renderConvert = () => (
    <main className="mx-auto max-w-7xl px-4 pb-8 pt-5 sm:px-6 sm:pt-6">
      <div className="mb-4 max-w-4xl">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{language === 'en' ? 'Convert your data into GIS layers' : 'Convierte tus datos en capas GIS'}</h2>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
            {language === 'en' ? 'Select a country, upload a CSV with territorial codes, verify your data on the map and download the result for QGIS, ArcGIS or Google Earth.' : 'Selecciona un país, carga un CSV con códigos territoriales, comprueba tus datos en el mapa y descarga el resultado para QGIS, ArcGIS o Google Earth.'}
          </p>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button type="button" onClick={loadExample} className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700">
              {language === 'en' ? 'Try an example' : 'Probar con ejemplo'}
            </button>
            <button type="button" onClick={() => navigate('/capas')} className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-bold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700">
              {language === 'en' ? 'Download layers' : 'Descargar capas'}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(380px,0.85fr)_minmax(0,1.15fr)]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-4">
            <h3 className="font-bold">{language === 'en' ? '1. Configure conversion' : '1. Configura la conversión'}</h3>
            <p className="mt-1 text-sm text-slate-500">{language === 'en' ? 'Upload your CSV, select the territorial column and output formats.' : 'Sube tu CSV, selecciona la columna territorial y los formatos de salida.'}</p>
          </div>
          {catalog && selectedCountry && layerConfig ? (
            <UploadForm
              pais={pais}
              countries={catalog.countries}
              selectedCountry={selectedCountry}
              nivel={nivel}
              layerConfig={layerConfig}
              geojsonData={geojsonData}
              onCountryChange={handleCountryChange}
              onLevelChange={handleLevelChange}
              onUpload={handleUpload}
              language={language}
            />
          ) : (
            <div className="grid min-h-72 place-items-center"><div className="loader" aria-label={language === 'en' ? 'Loading countries' : 'Cargando países'} /></div>
          )}
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <div>
              <h3 className="font-bold">{language === 'en' ? '2. Verify on the map' : '2. Verifica en el mapa'}</h3>
              <p className="mt-1 text-sm text-slate-500">{language === 'en' ? 'Territorial codes found in the CSV are highlighted.' : 'Se resaltan los códigos encontrados en el CSV.'}</p>
            </div>
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">{codigosCsv.length} {language === 'en' ? 'selected' : 'seleccionados'}</span>
          </div>
          <div className="p-4">
            {isLoadingMap ? (
              <div className="grid h-[560px] place-items-center"><div className="loader" aria-label={language === 'en' ? 'Loading map' : 'Cargando mapa'} /></div>
            ) : mapError ? (
              <div className="grid h-[560px] place-items-center text-sm text-red-600">{mapError}</div>
            ) : (
              <MapaDepartamentos geojsonData={geojsonData} codigosSeleccionados={codigosCsv} layerConfig={layerConfig} nivel={nivel} language={language} />
            )}
          </div>
        </section>
      </div>

      {csvPreview.length > 0 && (
        <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-bold">{language === 'en' ? 'Data preview' : 'Vista previa de datos'}</h3>
              <p className="text-sm text-slate-500">{fileName}</p>
            </div>
            <span className="text-xs font-semibold text-slate-500">{language === 'en' ? 'First' : 'Primeras'} {csvPreview.length} {language === 'en' ? 'rows' : 'filas'}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>{csvHeaders.map((header) => <th key={header} className="whitespace-nowrap px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">{header}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {csvPreview.map((row, rowIndex) => (
                  <tr key={rowIndex} className="hover:bg-slate-50">
                    {csvHeaders.map((header) => <td key={header} className="max-w-xs truncate px-4 py-3 text-slate-600">{row[header] ?? ''}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );

  const renderLayers = () => (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-7">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-indigo-600">{language === 'en' ? 'Geographic data' : 'Datos geográficos'}</p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight">{language === 'en' ? 'Layers by country' : 'Capas por país'}</h2>
        <p className="mt-2 max-w-2xl leading-7 text-slate-600">
          {language === 'en'
            ? 'Browse the catalog by country, download available formats and review each source.'
            : 'Explora el catálogo por país, descarga los formatos disponibles y consulta la fuente de cada capa.'}
        </p>
      </div>

      <div className="space-y-8">
        {catalog?.countries.map((country) => (
          <section key={country.code}>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2 border-b border-slate-200 pb-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                  {language === 'en' ? country.region : country.region_es}
                </p>
                <h3 className="mt-1 text-2xl font-bold text-slate-900">{country.name}</h3>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                {country.levels.length} {language === 'en' ? (country.levels.length === 1 ? 'layer' : 'layers') : (country.levels.length === 1 ? 'capa' : 'capas')}
              </span>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              {country.levels.map((layer) => {
                const key = `${country.code}-${layer.id}`;
                const availableFormats = Object.keys(layer.downloads || {});
                const selectedFormat = downloadFormats[key] || availableFormats[0] || 'geojson';
                const formatInfo = DOWNLOAD_FORMATS[selectedFormat] || DOWNLOAD_FORMATS.geojson;
                const layerName = language === 'en' && layer.name_en ? layer.name_en : layer.name;
                return (
                  <article key={key} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                          {language === 'en' ? (layer.category_en || 'Geographic layer') : (layer.category_es || 'Capa geográfica')}
                        </span>
                        <h4 className="mt-4 text-xl font-bold">{layerName}</h4>
                        {Number.isInteger(layer.count) && layer.count > 0 && (
                          <p className="mt-1 text-sm font-semibold text-slate-400">
                            {layer.count} {language === 'en' ? 'features' : 'entidades'}
                          </p>
                        )}
                        <p className="mt-3 max-w-lg text-sm leading-6 text-slate-600">
                          {language === 'en' && layer.description_en
                            ? layer.description_en
                            : !language || language === 'es'
                              ? (layer.description_es || (
                                layer.category === 'transport'
                                  ? `${layer.name} preparada para visualización, análisis y descargas GIS.`
                                  : layer.category === 'reference'
                                    ? 'Capa de referencia preparada para visualización cartográfica y descarga.'
                                    : `Límites de ${layer.name.toLowerCase()} preparados para mapas, análisis y conversiones GIS.`
                              ))
                              : (layer.category === 'transport'
                                ? `${layerName} prepared for visualization, analysis and GIS downloads.`
                                : layer.category === 'reference'
                                  ? 'Reference layer prepared for cartographic visualization and download.'
                                  : `Boundaries of ${layerName.toLowerCase()} prepared for maps, analysis and GIS conversions.`)}
                        </p>
                        <p className="mt-3 text-xs text-slate-500">
                          {language === 'en' ? 'Source:' : 'Fuente:'}{' '}
                          {Object.prototype.hasOwnProperty.call(layer, 'source_url') && !layer.source_url ? (
                            <span className="font-semibold text-slate-600">{layer.source_label || country.source_label}</span>
                          ) : (
                            <a
                              href={Object.prototype.hasOwnProperty.call(layer, 'source_url') ? layer.source_url : country.source_url}
                              target="_blank"
                              rel="noreferrer"
                              className="font-semibold text-indigo-600 hover:underline"
                            >
                              {layer.source_label || country.source_label}
                            </a>
                          )}
                        </p>
                      </div>
                      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-slate-100 text-2xl" aria-hidden="true">⌖</div>
                    </div>

                    <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <label htmlFor={`format-${key}`} className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
                        {language === 'en' ? 'Download format' : 'Formato de descarga'}
                      </label>
                      <select
                        id={`format-${key}`}
                        value={selectedFormat}
                        onChange={(event) => setDownloadFormats((current) => ({ ...current, [key]: event.target.value }))}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none focus:border-indigo-400"
                      >
                        {availableFormats.map((formatKey) => {
                          const option = DOWNLOAD_FORMATS[formatKey];
                          return <option key={formatKey} value={formatKey}>{option.label} — {option.note}</option>;
                        })}
                      </select>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <a href={layer.downloads?.[selectedFormat]} download className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-bold text-white transition hover:bg-indigo-700">
                        {language === 'en' ? 'Download' : 'Descargar'} {formatInfo.label}
                      </a>
                      {isGeoreferenceLayer(layer) && (
                        <button type="button" onClick={() => useLayer(country.code, layer.id)} className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-bold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700">
                          {language === 'en' ? 'Use in Georeference' : 'Usar en Georeferenciar'}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <p className="mt-7 text-xs leading-5 text-slate-500">
        {language === 'en'
          ? 'Available formats depend on each layer. Review metadata and source information before using a layer for official analysis.'
          : 'Los formatos disponibles dependen de cada capa. Recomendamos revisar la metadata y la fuente antes de utilizarlas en análisis oficiales.'}
      </p>
    </main>
  );

  const renderProjects = () => (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-7">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-indigo-600">{language === 'en' ? 'Tools' : 'Herramientas'}</p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight">{language === 'en' ? 'Projects' : 'Proyectos'}</h2>
        <p className="mt-2 max-w-2xl leading-7 text-slate-600">{language === 'en' ? 'Tools for working with data and digital content.' : 'Herramientas para trabajar con datos y contenido digital.'}</p>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        {PROJECTS.map((project) => (
          <a
            key={project.name}
            href={project.href}
            onClick={project.internal ? (event) => handleNav(event, project.href) : undefined}
            target={project.external ? '_blank' : undefined}
            rel={project.external ? 'noreferrer' : undefined}
            className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="inline-flex rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700">{project.tag}</span>
                <h3 className="mt-4 text-xl font-bold text-slate-900">{project.name}</h3>
                <p className="mt-2 leading-6 text-slate-600">{language === 'en' ? project.description_en : project.description}</p>
              </div>
              <span className="text-xl text-slate-400 transition group-hover:translate-x-1 group-hover:text-indigo-600">→</span>
            </div>
          </a>
        ))}
      </div>
    </main>
  );

  const currentNavItem = APP_NAV_ITEMS.find((item) => item.view === view) || APP_NAV_ITEMS[0];

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-[1200] flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-3 sm:h-16 sm:px-5">
        <a href="/geoportal" onClick={(event) => handleNav(event, '/geoportal')} className="flex items-center gap-3">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-indigo-600 text-[10px] font-black text-white sm:h-9 sm:w-9 sm:text-xs">CTM</div>
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="truncate text-base font-bold tracking-tight text-slate-900 sm:text-lg">ConvertToMap</span>
            <span className="hidden text-xs font-black uppercase tracking-[0.15em] text-indigo-600 sm:inline">
              {language === 'en' ? currentNavItem.en : currentNavItem.es}
            </span>
          </div>
        </a>

        <div className="flex items-center gap-2">
          <div className="hidden text-xs font-medium text-slate-400 md:block">
            {language === 'en' ? 'GIS tools and geographic data' : 'Herramientas GIS y datos geográficos'}
          </div>
          <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs font-bold">
            <button
              type="button"
              onClick={() => setLanguage('es')}
              className={`rounded-md px-2.5 py-1.5 ${language === 'es' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900'}`}
              aria-label="Español"
            >
              ES
            </button>
            <button
              type="button"
              onClick={() => setLanguage('en')}
              className={`rounded-md px-2.5 py-1.5 ${language === 'en' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900'}`}
              aria-label="English"
            >
              EN
            </button>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <nav data-ctm-react-i18n="true" className="fixed inset-x-0 bottom-0 z-[1300] flex h-[72px] shrink-0 border-t border-slate-200 bg-white/95 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur lg:sticky lg:top-16 lg:h-[calc(100vh-64px)] lg:w-[88px] lg:flex-col lg:border-r lg:border-t-0 lg:shadow-none">
          {APP_NAV_ITEMS.map((item) => {
            const activeItem = view === item.view;
            return (
              <a
                key={item.view}
                href={item.path}
                onClick={(event) => handleNav(event, item.path)}
                className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 border-indigo-600 px-1 py-1.5 text-center transition lg:min-h-[88px] lg:flex-none lg:px-2 lg:py-2 ${activeItem ? 'border-t-2 bg-indigo-50 text-indigo-700 lg:border-l-4 lg:border-t-0' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}
              >
                <span className="text-lg leading-none sm:text-xl">{item.icon}</span>
                <span className="max-w-[72px] whitespace-normal break-words text-center text-[10px] font-bold leading-[1.1] sm:max-w-[78px] sm:text-[11px]">{language === 'en' ? item.en : item.es}</span>
              </a>
            );
          })}
        </nav>

        <div className="min-w-0 flex-1 pb-[72px] lg:pb-0">
          {view === 'convertir' && renderConvert()}
          {view === 'crear-capa' && <CrearCapaPuntos language={language} />}
          {view === 'formatos' && <ConvertirFormatos language={language} />}
          {view === 'capas' && renderLayers()}
          {view === 'geoportal' && <Geoportal language={language} onLanguageChange={setLanguage} embedded />}
          {view === 'proyectos' && renderProjects()}

          {view !== 'geoportal' && (
            <footer className="border-t border-slate-200 bg-white py-5 text-center text-sm text-slate-500">
              © {new Date().getFullYear()} ConvertToMap
            </footer>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
