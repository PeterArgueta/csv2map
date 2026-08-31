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

const LAYERS = {
  departamentos: {
    label: 'Departamentos',
    url: '/Departamentos/departamentos.geojson',
    codeProperty: 'cod_dep',
    nameProperty: 'departamen',
    codeWidth: 2,
    count: 22,
    description: 'Límites departamentales de Guatemala listos para usar en SIG y aplicaciones web.',
    downloads: {
      geojson: '/downloads/departamentos_guatemala.geojson',
      shp: '/downloads/departamentos_guatemala_shapefile.zip',
      gpkg: '/downloads/departamentos_guatemala.gpkg',
      kml: '/downloads/departamentos_guatemala.kml',
    },
  },
  municipios: {
    label: 'Municipios',
    url: '/Municipios/municipios.geojson',
    codeProperty: 'cod_muni_1',
    nameProperty: 'nombre_1',
    codeWidth: 4,
    count: 340,
    description: 'Límites municipales de Guatemala para análisis, cartografía y aplicaciones geográficas.',
    downloads: {
      geojson: '/downloads/municipios_guatemala.geojson',
      shp: '/downloads/municipios_guatemala_shapefile.zip',
      gpkg: '/downloads/municipios_guatemala.gpkg',
      kml: '/downloads/municipios_guatemala.kml',
    },
  },
};

const PROJECTS = [
  {
    name: 'ConvertToMap',
    description: 'Convierte archivos CSV en capas GIS listas para usar.',
    href: '#convertir',
    tag: 'GIS',
  },
  {
    name: 'Generador QR',
    description: 'Crea códigos QR personalizados con colores, logo, tamaño y descarga en PNG.',
    href: 'https://qr.converttomap.com',
    tag: 'QR',
    external: true,
  },
];

const EXAMPLES = {
  departamentos: 'codigo_departamento,valor,nombre\n01,120,Guatemala\n03,85,Sacatepéquez\n09,64,Quetzaltenango\n17,98,Petén\n',
  municipios: 'codigo_municipio,valor,nombre\n0101,120,Guatemala\n0301,85,Antigua Guatemala\n0901,64,Quetzaltenango\n',
};

function App() {
  const [nivel, setNivel] = useState('departamentos');
  const [geojsonData, setGeojsonData] = useState(null);
  const [codigosCsv, setCodigosCsv] = useState([]);
  const [isLoadingMap, setIsLoadingMap] = useState(true);
  const [mapError, setMapError] = useState('');
  const [csvPreview, setCsvPreview] = useState([]);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [fileName, setFileName] = useState('');
  const [downloadFormats, setDownloadFormats] = useState({ departamentos: 'geojson', municipios: 'geojson' });

  useEffect(() => {
    const controller = new AbortController();
    const fetchGeojson = async () => {
      setIsLoadingMap(true);
      setMapError('');
      try {
        const response = await fetch(LAYERS[nivel].url, { signal: controller.signal });
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
  }, [nivel]);

  const handleLevelChange = (value) => {
    setNivel(value);
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
    const file = new File([EXAMPLES[nivel]], `ejemplo_${nivel}.csv`, { type: 'text/csv;charset=utf-8' });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    const input = document.querySelector('input[type="file"][accept*=".csv"]');
    if (!input) return;
    input.files = dataTransfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector('#convertir')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-[1000] border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <a href="#convertir" className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-600 text-sm font-black text-white">CTM</div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">ConvertToMap</h1>
              <p className="text-xs font-medium text-slate-500">Conversor de datos</p>
            </div>
          </a>
          <nav className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 text-xs font-semibold text-slate-600 sm:text-sm">
            <a href="#convertir" className="rounded-lg px-2.5 py-2 transition hover:bg-white hover:text-slate-900 sm:px-3">Convertir</a>
            <a href="#capas" className="rounded-lg px-2.5 py-2 transition hover:bg-white hover:text-slate-900 sm:px-3">Capas</a>
            <a href="#proyectos" className="rounded-lg px-2.5 py-2 transition hover:bg-white hover:text-slate-900 sm:px-3">Proyectos</a>
          </nav>
        </div>
      </header>

      <main id="convertir" className="mx-auto max-w-7xl scroll-mt-24 px-4 py-7 sm:px-6">
        <div className="mb-7 max-w-4xl">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">
            Gratis · sin registro
          </div>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Convierte tus datos en capas GIS</h2>
          <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
            Carga un CSV con códigos de departamentos o municipios, comprueba tus datos en el mapa y descarga el resultado listo para QGIS, ArcGIS o Google Earth.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" onClick={loadExample} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700">
              Probar con ejemplo
            </button>
            <a href="#capas" className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700">
              Descargar capas
            </a>
          </div>
        </div>

        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          {[
            ['1', 'Carga tus datos', 'Sube tu CSV o crea uno desde la página.'],
            ['2', 'Comprueba el mapa', 'Verifica rápidamente los territorios encontrados.'],
            ['3', 'Descarga', 'Obtén SHP, KML, GeoJSON o GeoPackage.'],
          ].map(([number, title, text]) => (
            <div key={number} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-indigo-50 text-sm font-black text-indigo-700">{number}</span>
              <div>
                <p className="text-sm font-bold text-slate-800">{title}</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">{text}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(380px,0.85fr)_minmax(0,1.15fr)]">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-6 py-4">
              <h3 className="font-bold">1. Configura la conversión</h3>
              <p className="mt-1 text-sm text-slate-500">El archivo se valida antes de generar la descarga.</p>
            </div>
            <UploadForm nivel={nivel} onLevelChange={handleLevelChange} onUpload={handleUpload} />
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h3 className="font-bold">2. Verifica en el mapa</h3>
                <p className="mt-1 text-sm text-slate-500">Se resaltan los códigos encontrados en el CSV.</p>
              </div>
              <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">
                {codigosCsv.length} seleccionados
              </span>
            </div>
            <div className="p-4">
              {isLoadingMap ? (
                <div className="grid h-[560px] place-items-center"><div className="loader" aria-label="Cargando mapa" /></div>
              ) : mapError ? (
                <div className="grid h-[560px] place-items-center text-sm text-red-600">{mapError}</div>
              ) : (
                <MapaDepartamentos
                  geojsonData={geojsonData}
                  codigosSeleccionados={codigosCsv}
                  layerConfig={LAYERS[nivel]}
                  nivel={nivel}
                />
              )}
            </div>
          </section>
        </div>

        {csvPreview.length > 0 && (
          <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
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

        <section id="capas" className="scroll-mt-24 py-14">
          <div className="mb-6">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-indigo-600">Datos geográficos</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Capas de Guatemala</h2>
            <p className="mt-2 max-w-2xl leading-7 text-slate-600">Descarga gratuitamente las capas base que utiliza ConvertToMap en el formato que mejor se adapte a tu trabajo.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {Object.entries(LAYERS).map(([key, layer]) => {
              const selectedFormat = downloadFormats[key];
              const format = DOWNLOAD_FORMATS[selectedFormat];
              return (
                <article key={key} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">4 formatos</span>
                      <h3 className="mt-4 text-xl font-bold">{layer.label}</h3>
                      <p className="mt-1 text-sm font-semibold text-slate-400">{layer.count} territorios</p>
                      <p className="mt-3 max-w-lg text-sm leading-6 text-slate-600">{layer.description}</p>
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
                      {Object.entries(DOWNLOAD_FORMATS).map(([formatKey, option]) => (
                        <option key={formatKey} value={formatKey}>{option.label} — {option.note}</option>
                      ))}
                    </select>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <a
                      href={layer.downloads[selectedFormat]}
                      download
                      className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-bold text-white transition hover:bg-indigo-700"
                    >
                      Descargar {format.label}
                    </a>
                    <button
                      type="button"
                      onClick={() => { handleLevelChange(key); document.querySelector('#convertir')?.scrollIntoView({ behavior: 'smooth' }); }}
                      className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-bold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700"
                    >
                      Usar en ConvertToMap
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-500">Disponibles en GeoJSON, Shapefile, GeoPackage y KML. Los formatos se generan automáticamente desde la misma capa base para mantener consistencia. Recomendamos revisar la metadata y la fuente antes de utilizar las capas en análisis oficiales.</p>
        </section>

        <section id="proyectos" className="scroll-mt-24 pb-14">
          <div className="mb-6">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-indigo-600">Herramientas</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Proyectos</h2>
            <p className="mt-2 max-w-2xl text-slate-600">Herramientas sencillas y gratuitas para trabajar con datos y contenido digital.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {PROJECTS.map((project) => (
              <a
                key={project.name}
                href={project.href}
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
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white py-6 text-center text-sm text-slate-500">
        © {new Date().getFullYear()} ConvertToMap
      </footer>
    </div>
  );
}

export default App;
