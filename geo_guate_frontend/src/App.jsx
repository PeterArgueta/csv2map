import React, { useEffect, useState } from 'react';
import { UploadForm } from './components/UploadForm';
import { MapaDepartamentos } from './components/MapaDepartamentos';
import './index.css';

const LAYERS = {
  departamentos: {
    label: 'Departamentos',
    url: '/Departamentos/departamentos.geojson',
    codeProperty: 'cod_dep',
    nameProperty: 'departamen',
    codeWidth: 2,
  },
  municipios: {
    label: 'Municipios',
    url: '/Municipios/municipios.geojson',
    codeProperty: 'cod_muni_1',
    nameProperty: 'nombre_1',
    codeWidth: 4,
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

function App() {
  const [nivel, setNivel] = useState('departamentos');
  const [geojsonData, setGeojsonData] = useState(null);
  const [codigosCsv, setCodigosCsv] = useState([]);
  const [isLoadingMap, setIsLoadingMap] = useState(true);
  const [mapError, setMapError] = useState('');
  const [csvPreview, setCsvPreview] = useState([]);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [fileName, setFileName] = useState('');

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
          <nav className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 text-sm font-semibold text-slate-600">
            <a href="#convertir" className="rounded-lg px-3 py-2 transition hover:bg-white hover:text-slate-900">Convertir</a>
            <a href="#proyectos" className="rounded-lg px-3 py-2 transition hover:bg-white hover:text-slate-900">Proyectos</a>
          </nav>
        </div>
      </header>

      <main id="convertir" className="mx-auto max-w-7xl scroll-mt-24 px-4 py-7 sm:px-6">
        <div className="mb-6 max-w-3xl">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Convierte tus datos en capas GIS</h2>
          <p className="mt-3 text-base leading-7 text-slate-600">
            Carga un CSV, identifica la columna territorial y descarga el resultado en los formatos que necesites.
          </p>
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

        <section id="proyectos" className="scroll-mt-24 py-14">
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
