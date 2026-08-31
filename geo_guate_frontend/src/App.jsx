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
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-600 text-sm font-black text-white">CTM</div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">ConvertToMap</h1>
              <p className="text-xs font-medium text-slate-500">CSV2MAP GT · Conversor geográfico de Guatemala</p>
            </div>
          </div>
          <div className="hidden rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 sm:block">
            22 departamentos · 340 municipios
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-7 sm:px-6">
        <div className="mb-6 max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-600">De tabla a mapa</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Convierte tus datos en una capa GIS lista para usar.</h2>
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

        <section className="mt-6 grid gap-4 sm:grid-cols-3">
          {[
            ['Lectura flexible', 'Coma, punto y coma, tabulación y textos entre comillas.'],
            ['Cuatro formatos', 'Shapefile, KML, GeoJSON y GeoPackage.'],
            ['Reporte incluido', 'Códigos encontrados, faltantes, vacíos y duplicados.'],
          ].map(([title, text]) => (
            <div key={title} className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="font-bold">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">{text}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="mt-8 border-t border-slate-200 bg-white py-6 text-center text-sm text-slate-500">
        © {new Date().getFullYear()} ConvertToMap · Convierte tus datos en mapas GIS
      </footer>
    </div>
  );
}

export default App;
