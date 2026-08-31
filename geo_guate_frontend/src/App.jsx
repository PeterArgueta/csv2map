import React, { useEffect, useState } from 'react';
import { UploadForm } from './components/UploadForm';
import { MapaDepartamentos } from './components/MapaDepartamentos';
import './index.css';

const DOWNLOAD_FORMATS = {
  geojson: { label: 'GeoJSON', note: 'Web y GIS' },
  shp: { label: 'Shapefile', note: 'QGIS y ArcGIS' },
  gpkg: { label: 'GeoPackage', note: 'Formato GIS moderno' },
  kml: { label: 'KML', note: 'Google Earth' },
};

const CATALOG_URL = '/countries/catalog.json';

const PROJECTS = [
  {
    name: 'ConvertToMap',
    description: 'Convierte archivos CSV en capas GIS listas para usar.',
    href: '/',
    tag: 'GIS',
    internal: true,
  },
  {
    name: 'Generador QR',
    description: 'Crea códigos QR personalizados con colores, logo, tamaño y descarga en PNG.',
    href: 'https://qr.converttomap.com',
    tag: 'QR',
    external: true,
  },
];

const exampleFor = (pais, nivel) => {
  if (pais === 'SLV') return 'codigo_departamento,valor,nombre\n01,120,Ahuachapán\n06,85,San Salvador\n12,64,San Miguel\n';
  if (nivel === 'municipios') return 'codigo_municipio,valor,nombre\n0101,120,Guatemala\n0301,85,Antigua Guatemala\n0901,64,Quetzaltenango\n';
  return 'codigo_departamento,valor,nombre\n01,120,Guatemala\n03,85,Sacatepéquez\n09,64,Quetzaltenango\n17,98,Petén\n';
};

const pathToView = (pathname) => {
  if (pathname === '/capas' || pathname.startsWith('/capas/')) return 'capas';
  if (pathname === '/proyectos' || pathname.startsWith('/proyectos/')) return 'proyectos';
  return 'convertir';
};

function App() {
  const [view, setView] = useState(() => pathToView(window.location.pathname));
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
          setNivel(initialCountry.levels[0]?.id || 'departamentos');
        }
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setMapError('No fue posible cargar el catálogo de países.');
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
          setMapError('No fue posible cargar la capa de límites.');
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
    setNivel(country?.levels[0]?.id || 'departamentos');
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
    navigate('/');
  };

  const navClass = (name) => `rounded-lg px-2.5 py-2 transition sm:px-3 ${view === name ? 'bg-white text-slate-900 shadow-sm' : 'hover:bg-white hover:text-slate-900'}`;

  const renderConvert = () => (
    <main className="mx-auto max-w-7xl px-4 pb-8 pt-5 sm:px-6 sm:pt-6">
      <div className="mb-4 max-w-4xl">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Convierte tus datos en capas GIS</h2>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
            Selecciona un país, carga un CSV con códigos territoriales, comprueba tus datos en el mapa y descarga el resultado para QGIS, ArcGIS o Google Earth.
          </p>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button type="button" onClick={loadExample} className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700">
              Probar con ejemplo
            </button>
            <button type="button" onClick={() => navigate('/capas')} className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-bold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700">
              Descargar capas
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(380px,0.85fr)_minmax(0,1.15fr)]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-4">
            <h3 className="font-bold">1. Configura la conversión</h3>
            <p className="mt-1 text-sm text-slate-500">Sube tu CSV, selecciona la columna territorial y los formatos de salida.</p>
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
            />
          ) : (
            <div className="grid min-h-72 place-items-center"><div className="loader" aria-label="Cargando países" /></div>
          )}
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <div>
              <h3 className="font-bold">2. Verifica en el mapa</h3>
              <p className="mt-1 text-sm text-slate-500">Se resaltan los códigos encontrados en el CSV.</p>
            </div>
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">{codigosCsv.length} seleccionados</span>
          </div>
          <div className="p-4">
            {isLoadingMap ? (
              <div className="grid h-[560px] place-items-center"><div className="loader" aria-label="Cargando mapa" /></div>
            ) : mapError ? (
              <div className="grid h-[560px] place-items-center text-sm text-red-600">{mapError}</div>
            ) : (
              <MapaDepartamentos geojsonData={geojsonData} codigosSeleccionados={codigosCsv} layerConfig={layerConfig} nivel={nivel} />
            )}
          </div>
        </section>
      </div>

      {csvPreview.length > 0 && (
        <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-bold">Vista previa de datos</h3>
              <p className="text-sm text-slate-500">{fileName}</p>
            </div>
            <span className="text-xs font-semibold text-slate-500">Primeras {csvPreview.length} filas</span>
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
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-indigo-600">Datos geográficos</p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight">Capas por país</h2>
        <p className="mt-2 max-w-2xl leading-7 text-slate-600">Descarga las capas base disponibles y consulta la fuente utilizada para cada país.</p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {catalog?.countries.flatMap((country) => country.levels.map((layer) => {
          const key = `${country.code}-${layer.id}`;
          const availableFormats = Object.keys(layer.downloads || {});
          const selectedFormat = downloadFormats[key] || availableFormats[0] || 'geojson';
          const format = DOWNLOAD_FORMATS[selectedFormat] || DOWNLOAD_FORMATS.geojson;
          return (
            <article key={key} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">{country.name}</span>
                  <h3 className="mt-4 text-xl font-bold">{layer.name}</h3>
                  <p className="mt-1 text-sm font-semibold text-slate-400">{layer.count} territorios</p>
                  <p className="mt-3 max-w-lg text-sm leading-6 text-slate-600">Límites de {layer.name.toLowerCase()} preparados para mapas, análisis y conversiones GIS.</p>
                  <p className="mt-3 text-xs text-slate-500">Fuente: <a href={country.source_url} target="_blank" rel="noreferrer" className="font-semibold text-indigo-600 hover:underline">{country.source_label}</a></p>
                </div>
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-slate-100 text-2xl" aria-hidden="true">⌖</div>
              </div>

              <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <label htmlFor={`format-${key}`} className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Formato de descarga</label>
                <select
                  id={`format-${key}`}
                  value={selectedFormat}
                  onChange={(event) => setDownloadFormats((current) => ({ ...current, [key]: event.target.value }))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none focus:border-indigo-400"
                >
                  {availableFormats.map((formatKey) => {
                    const option = DOWNLOAD_FORMATS[formatKey];
                    return (
                    <option key={formatKey} value={formatKey}>{option.label} — {option.note}</option>
                    );
                  })}
                </select>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <a href={layer.downloads?.[selectedFormat]} download className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-bold text-white transition hover:bg-indigo-700">
                  Descargar {format.label}
                </a>
                <button type="button" onClick={() => useLayer(country.code, layer.id)} className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-bold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700">
                  Usar en ConvertToMap
                </button>
              </div>
            </article>
          );
        }))}
      </div>
      <p className="mt-5 text-xs leading-5 text-slate-500">Los formatos disponibles dependen de cada capa. Desde el conversor puedes generar GeoJSON, Shapefile, GeoPackage y KML. Recomendamos revisar la metadata y la fuente antes de utilizarlas en análisis oficiales.</p>
    </main>
  );

  const renderProjects = () => (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-7">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-indigo-600">Herramientas</p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight">Proyectos</h2>
        <p className="mt-2 max-w-2xl leading-7 text-slate-600">Herramientas para trabajar con datos y contenido digital.</p>
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
                <p className="mt-2 leading-6 text-slate-600">{project.description}</p>
              </div>
              <span className="text-xl text-slate-400 transition group-hover:translate-x-1 group-hover:text-indigo-600">→</span>
            </div>
          </a>
        ))}
      </div>
    </main>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-[1000] border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <a href="/" onClick={(event) => handleNav(event, '/')} className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-600 text-sm font-black text-white">CTM</div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">ConvertToMap</h1>
              <p className="text-xs font-medium text-slate-500">Conversor de datos</p>
            </div>
          </a>
          <nav className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 text-xs font-semibold text-slate-600 sm:text-sm">
            <a href="/" onClick={(event) => handleNav(event, '/')} className={navClass('convertir')}>Convertir</a>
            <a href="/capas" onClick={(event) => handleNav(event, '/capas')} className={navClass('capas')}>Capas</a>
            <a href="/proyectos" onClick={(event) => handleNav(event, '/proyectos')} className={navClass('proyectos')}>Proyectos</a>
          </nav>
        </div>
      </header>

      {view === 'convertir' && renderConvert()}
      {view === 'capas' && renderLayers()}
      {view === 'proyectos' && renderProjects()}

      <footer className="border-t border-slate-200 bg-white py-5 text-center text-sm text-slate-500">© {new Date().getFullYear()} ConvertToMap</footer>
    </div>
  );
}

export default App;
