import React, { useRef, useState } from 'react';
import axios from 'axios';

const FORMAT_OPTIONS = [
  { id: 'geojson', label: 'GeoJSON', ext: '.geojson', note: 'Web, APIs y GIS' },
  { id: 'shp', label: 'Shapefile', ext: '.zip', note: 'QGIS y ArcGIS' },
  { id: 'kml', label: 'KML', ext: '.kml', note: 'Google Earth' },
  { id: 'gpkg', label: 'GeoPackage', ext: '.gpkg', note: 'Formato GIS moderno' },
  { id: 'csv', label: 'CSV', ext: '.csv', note: 'Tabla con geometría WKT' },
];

const INPUT_LABELS = {
  geojson: 'GeoJSON',
  shp: 'Shapefile ZIP',
  kml: 'KML',
  gpkg: 'GeoPackage',
  csv: 'CSV',
  xlsx: 'Excel (.xlsx)',
};

const detectInputFormat = (name = '') => {
  const lower = name.toLowerCase();
  if (lower.endsWith('.geojson') || lower.endsWith('.json')) return 'geojson';
  if (lower.endsWith('.zip')) return 'shp';
  if (lower.endsWith('.kml')) return 'kml';
  if (lower.endsWith('.gpkg')) return 'gpkg';
  if (lower.endsWith('.csv')) return 'csv';
  if (lower.endsWith('.xlsx')) return 'xlsx';
  return '';
};

const stamp = () => {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
};

export function ConvertirFormatos({ language = 'es' }) {
  const en = language === 'en';
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [inputFormat, setInputFormat] = useState('');
  const [outputFormat, setOutputFormat] = useState('geojson');
  const [geometryType, setGeometryType] = useState('puntos');
  const [orderColumn, setOrderColumn] = useState('');
  const [latColumn, setLatColumn] = useState('');
  const [lonColumn, setLonColumn] = useState('');
  const [sheetNames, setSheetNames] = useState([]);
  const [sheetName, setSheetName] = useState('');
  const [inspecting, setInspecting] = useState(false);
  const inspectionId = useRef(0);
  const isTable = ['csv', 'xlsx'].includes(inputFormat);
  const isPolygon = isTable && geometryType !== 'puntos';
  const includeVertices = isTable && geometryType === 'puntos_poligono';
  const [isDragging, setIsDragging] = useState(false);
  const [converting, setConverting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const outputInfo = FORMAT_OPTIONS.find((option) => option.id === outputFormat) || FORMAT_OPTIONS[0];

  const chooseOutputFormat = (formatId) => {
    setOutputFormat(formatId);
    setError('');
    setMessage('');
  };

  const chooseFile = (selected) => {
    setMessage('');
    setError('');
    const requestId = ++inspectionId.current;
    setSheetNames([]);
    setSheetName('');
    setLatColumn('');
    setLonColumn('');
    setOrderColumn('');
    setInspecting(false);
    if (!selected) return;
    const detected = detectInputFormat(selected.name);
    if (!detected) {
      setFile(null);
      setInputFormat('');
      setError(`${en ? 'Unsupported format. Use GeoJSON, Shapefile ZIP, KML, GeoPackage or CSV/Excel (.xlsx).' : 'Formato no compatible. Usa GeoJSON, ZIP de Shapefile, KML, GeoPackage o CSV/Excel (.xlsx).'}`);
      return;
    }
    if (selected.size > 10 * 1024 * 1024) {
      setFile(null);
      setInputFormat('');
      setError(`${en ? 'The file exceeds the 10 MB limit.' : 'El archivo supera el límite de 10 MB.'}`);
      return;
    }
    setFile(selected);
    setInputFormat(detected);
    if (['csv', 'xlsx'].includes(detected)) {
      setInspecting(true);
      const form = new FormData();
      form.append('file', selected);
      const apiUrl = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
      axios.post(`${apiUrl}/inspeccionar_tabla/`, form).then(({ data }) => {
        if (requestId !== inspectionId.current) return;
        setSheetNames(data.sheet_names || []);
        setSheetName(data.sheet_name || '');
        setGeometryType(data.suggested_geometry || 'puntos');
      }).catch(() => {
        if (requestId === inspectionId.current) setError(en ? 'Could not inspect the file. Please upload it again.' : 'No fue posible leer el archivo. Vuelve a cargarlo.');
      }).finally(() => {
        if (requestId === inspectionId.current) setInspecting(false);
      });
    }
    if (detected === outputFormat) {
      setOutputFormat(FORMAT_OPTIONS.find((option) => option.id !== detected)?.id || 'geojson');
    }
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDragging(false);
    chooseFile(event.dataTransfer.files?.[0]);
  };

  const convert = async () => {
    if (!file || !outputFormat || converting) return;
    setConverting(true);
    setError('');
    setMessage('');
    try {
      const apiUrl = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
      const form = new FormData();
      form.append('file', file);
      form.append('formato_salida', outputFormat);
      if (isTable) {
        form.append('tipo_geometria', geometryType);
        if (isPolygon) form.append('columna_orden', orderColumn.trim());
        form.append('columna_latitud', latColumn.trim());
        form.append('columna_longitud', lonColumn.trim());
        if (sheetName) form.append('hoja', sheetName);
      }

      const response = await axios.post(`${apiUrl}/convertir_formato/`, form, {
        responseType: 'blob',
      });

      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `converttomap_${stamp()}${includeVertices ? '.zip' : outputInfo?.ext || ''}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setMessage(includeVertices
        ? (en ? `Conversion completed: vertices and polygon in ${outputInfo?.label}, together in a ZIP.` : `Conversión completada: vértices y polígono en ${outputInfo?.label}, juntos en un ZIP.`)
        : `${en ? 'Conversion completed' : 'Conversión completada'}: ${INPUT_LABELS[inputFormat]} → ${outputInfo?.label}.`);
    } catch (requestError) {
      let detail = `${en ? 'The file could not be converted.' : 'No fue posible convertir el archivo.'}`;
      if (requestError.response?.data instanceof Blob) {
        try {
          const payload = JSON.parse(await requestError.response.data.text());
          detail = payload.detail || detail;
        } catch {
          // Mantener mensaje genérico.
        }
      }
      setError(detail);
    } finally {
      setConverting(false);
    }
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-7">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-indigo-600">{en ? 'GIS converter' : 'Conversor GIS'}</p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight">{en ? 'Convert geospatial formats' : 'Convierte formatos geográficos'}</h2>
        <p className="mt-2 max-w-3xl leading-7 text-slate-600">
          {en ? 'Convert GIS layers or create points and polygons from CSV/Excel coordinates.' : 'Convierte capas GIS o crea puntos y polígonos desde coordenadas de CSV/Excel.'}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-bold">{en ? '1. Upload your file' : '1. Carga tu archivo'}</h3>
              <p className="mt-1 text-sm text-slate-500">{en ? 'The input format is detected automatically.' : 'El formato de entrada se detecta automáticamente.'}</p>
            </div>
            {inputFormat && (
              <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">
                {INPUT_LABELS[inputFormat]}
              </span>
            )}
          </div>

          <div
            className={`mt-5 cursor-pointer rounded-xl border-2 border-dashed px-5 py-10 text-center transition ${isDragging ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50'}`}
            onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click(); }}
          >
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-indigo-50 text-xl font-bold text-indigo-600">↑</div>
            <p className="mt-3 font-semibold text-slate-700">{file ? file.name : (en ? 'Select or drop a file' : 'Selecciona o arrastra un archivo')}</p>
            <p className="mt-1 text-xs text-slate-500">{en ? 'GeoJSON · SHP (.zip) · KML · GPKG · CSV · Excel (.xlsx) · max 10 MB' : 'GeoJSON · SHP (.zip) · KML · GPKG · CSV · Excel (.xlsx) · máximo 10 MB'}</p>
            <input
              ref={inputRef}
              type="file"
              accept=".geojson,.json,.zip,.kml,.gpkg,.csv,.xlsx,application/geo+json,application/json,text/csv"
              className="hidden"
              onChange={(event) => chooseFile(event.target.files?.[0])}
            />
          </div>

          {isTable && (
            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
              <label className="mb-4 block">
                <span className="field-label">{en ? 'Create geometry' : 'Crear geometría'}</span>
                <select value={geometryType} onChange={(event) => { setGeometryType(event.target.value); setError(''); setMessage(''); }} className="field-control">
                  <option value="puntos">{en ? 'Points with municipal attributes' : 'Puntos con atributos municipales'}</option>
                  <option value="puntos_poligono">{en ? 'Vertices and polygon' : 'Vértices y polígono'}</option>
                  <option value="poligono">{en ? 'Polygon from vertices' : 'Polígono desde vértices'}</option>
                </select>
              </label>
              <p className="text-sm font-bold text-slate-800">{en ? 'File coordinates' : 'Coordenadas del archivo'}</p>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                {en ? 'Use WGS84 decimal degrees or degrees, minutes and seconds. Automatic columns: lat, latitude, latitud, y, Norte; lon, lng, longitude, longitud, x, Oeste. Oeste means west (negative longitude). With other headers, include N/S/E/W in DMS values or use signed decimals.' : 'Usa coordenadas WGS84 en grados decimales o grados, minutos y segundos. Detecta lat, latitude, latitud, y, Norte; lon, lng, longitude, longitud, x, Oeste. Oeste indica longitud negativa. Con otros encabezados, agrega N/S/E/O a las coordenadas GMS o usa decimales con signo.'}
              </p>
              {sheetNames.length > 1 && (
                <label className="mt-3 block">
                  <span className="field-label">{en ? 'Excel sheet' : 'Hoja de Excel'}</span>
                  <select value={sheetName} onChange={(event) => setSheetName(event.target.value)} className="field-control">
                    {sheetNames.map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                </label>
              )}
              <p className="mt-2 text-xs leading-5 text-slate-600">{isPolygon
                ? (includeVertices
                  ? (en ? 'Downloads two layers together in a ZIP: original vertices and the closed polygon they form. No municipal attributes are added.' : 'Descarga dos capas juntas en un ZIP: los vértices originales y el polígono cerrado que forman. No agrega atributos municipales.')
                  : (en ? 'Creates one polygon without municipal or per-vertex attributes. It connects vertices in order and closes the ring automatically.' : 'Crea un polígono sin atributos municipales ni columnas de cada vértice. Une los vértices en orden y cierra la figura automáticamente.'))
                : (en ? 'Original columns are preserved. Municipal attributes apply to Guatemala. Points outside the layer or on shared boundaries are flagged in estado_territorial.' : 'Se conservan las columnas originales. Los atributos municipales corresponden a Guatemala. Los puntos fuera de la capa o en límites compartidos se señalan en estado_territorial.')}</p>
              {isPolygon && (
                <label className="mt-3 block">
                  <span className="field-label">{en ? 'Vertex order column (optional)' : 'Columna de orden de vértices (opcional)'}</span>
                  <input value={orderColumn} onChange={(event) => setOrderColumn(event.target.value)} className="field-control" placeholder={en ? 'Vertex, ID, order or row order' : 'Vértice, ID, orden o el orden de las filas'} />
                  <span className="mt-1 block text-xs leading-5 text-slate-500">{en ? 'Detects Vértice, vertex, ID, orden, order, punto or point. Values must be unique numbers; without a column, uses row order. At least 3 distinct vertices. Correct the order if segments cross.' : 'Detecta Vértice, vertex, ID, orden, order, punto o point. Deben ser números únicos; si no hay columna, usa el orden de las filas. Mínimo 3 vértices distintos. Revisa el orden si los segmentos se cruzan.'}</span>
                </label>
              )}
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label>
                  <span className="field-label">{en ? 'Latitude column' : 'Columna de latitud'}</span>
                  <input value={latColumn} onChange={(event) => setLatColumn(event.target.value)} className="field-control" placeholder={en ? 'Automatic detection' : 'Detección automática'} />
                </label>
                <label>
                  <span className="field-label">{en ? 'Longitude column' : 'Columna de longitud'}</span>
                  <input value={lonColumn} onChange={(event) => setLonColumn(event.target.value)} className="field-control" placeholder={en ? 'Automatic detection' : 'Detección automática'} />
                </label>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="font-bold">{en ? '2. Choose the output format' : '2. Elige el formato de salida'}</h3>
          <p className="mt-1 text-sm text-slate-500">{en ? 'Geometry and attributes are preserved during conversion.' : 'La geometría y los atributos se conservan durante la conversión.'}</p>

          <div className="mt-5 space-y-2">
            {FORMAT_OPTIONS.map((option) => {
              const selected = outputFormat === option.id;
              const same = inputFormat === option.id && !isPolygon;
              return (
                <label key={option.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${selected ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'} ${same ? 'opacity-50' : ''}`}>
                  <input
                    type="radio"
                    name="output-format"
                    value={option.id}
                    checked={selected}
                    disabled={same}
                    onChange={() => chooseOutputFormat(option.id)}
                    className="mt-1 h-4 w-4 accent-indigo-600"
                  />
                  <span>
                    <span className="block text-sm font-bold text-slate-700">{option.label}</span>
                    <span className="block text-xs text-slate-500">{same ? (en ? 'This is the input format' : 'Es el formato de entrada') : option.note}</span>
                  </span>
                </label>
              );
            })}
          </div>

          <button
            type="button"
            onClick={convert}
            disabled={!file || !outputFormat || converting || (inputFormat === outputFormat && !isPolygon) || inspecting || (inputFormat === 'xlsx' && !sheetName)}
            className="mt-5 flex w-full items-center justify-center rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {converting ? (en ? 'Converting…' : 'Convirtiendo…') : `${en ? 'Convert to' : 'Convertir a'} ${outputInfo?.label || ''}`}
          </button>

          <div className="mt-4 rounded-xl bg-slate-50 p-4 text-xs leading-5 text-slate-500">
            <strong className="text-slate-700">{en ? 'Note:' : 'Nota:'}</strong> {en ? 'Shapefile is downloaded as ZIP because it requires several files. CSV exports include a geometry_wkt column; point layers also include latitude and longitude.' : <>Shapefile se descarga como ZIP porque necesita varios archivos. Al exportar a CSV se agrega una columna <code>geometry_wkt</code>; para puntos también se incluyen latitud y longitud.</>}
          </div>
        </section>
      </div>

      {error && <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {message && <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>}
    </main>
  );
}
