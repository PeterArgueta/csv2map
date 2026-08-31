import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import Papa from 'papaparse';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const FORMAT_OPTIONS = [
  { id: 'shp', label: 'Shapefile', note: '.shp + archivos auxiliares' },
  { id: 'kml', label: 'KML', note: 'Google Earth' },
  { id: 'geojson', label: 'GeoJSON', note: 'Web y aplicaciones' },
  { id: 'gpkg', label: 'GeoPackage', note: 'QGIS y ArcGIS' },
];

const DEPARTMENTS = [
  ['01', 'Guatemala'],
  ['02', 'El Progreso'],
  ['03', 'Sacatepéquez'],
  ['04', 'Chimaltenango'],
  ['05', 'Escuintla'],
  ['06', 'Santa Rosa'],
  ['07', 'Sololá'],
  ['08', 'Totonicapán'],
  ['09', 'Quetzaltenango'],
  ['10', 'Suchitepéquez'],
  ['11', 'Retalhuleu'],
  ['12', 'San Marcos'],
  ['13', 'Huehuetenango'],
  ['14', 'Quiché'],
  ['15', 'Baja Verapaz'],
  ['16', 'Alta Verapaz'],
  ['17', 'Petén'],
  ['18', 'Izabal'],
  ['19', 'Zacapa'],
  ['20', 'Chiquimula'],
  ['21', 'Jalapa'],
  ['22', 'Jutiapa'],
];

const COLUMN_HINTS = {
  departamentos: ['codigo_departamento', 'cod_departamento', 'cod_dep', 'departamento_codigo', 'codigo'],
  municipios: ['codigo_municipio', 'cod_municipio', 'cod_muni', 'codigo_ine', 'municipio_codigo', 'codigo'],
};

const normalizeHeader = (value) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_|_$/g, '');

const normalizeCode = (value, width) => {
  const text = String(value ?? '').trim().replace(/\.0+$/, '');
  const digits = text.replace(/\D/g, '');
  return digits ? digits.padStart(width, '0') : null;
};

const detectCodeColumn = (fields, nivel) => {
  const normalized = new Map(fields.map((field) => [normalizeHeader(field), field]));
  return COLUMN_HINTS[nivel].map(normalizeHeader).map((hint) => normalized.get(hint)).find(Boolean) || '';
};

export function UploadForm({ nivel, onLevelChange, onUpload }) {
  const fileInputRef = useRef();
  const [fileData, setFileData] = useState(null);
  const [rows, setRows] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [codeColumn, setCodeColumn] = useState('');
  const [formats, setFormats] = useState(['shp', 'kml']);
  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [showCsvBuilder, setShowCsvBuilder] = useState(false);
  const [selectedDepartments, setSelectedDepartments] = useState([]);
  const [departmentValues, setDepartmentValues] = useState({});

  const emitPreview = (dataRows, fields, selectedColumn, currentFile = fileData) => {
    const width = nivel === 'municipios' ? 4 : 2;
    const codes = selectedColumn
      ? [...new Set(dataRows.map((row) => normalizeCode(row[selectedColumn], width)).filter(Boolean))]
      : [];
    onUpload(codes, dataRows.slice(0, 10), fields, currentFile?.name || '');
  };

  const parseFile = (file) => {
    if (!file) return;
    setFileError('');
    setSuccessMessage('');
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setFileError('Selecciona un archivo con extensión .csv.');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setFileError('El archivo supera el límite de 10 MB.');
      return;
    }

    setFileData(file);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (header) => header.trim(),
      complete: ({ data, errors, meta }) => {
        if (!data.length || !meta.fields?.length) {
          setFileError('El archivo no contiene encabezados y filas de datos.');
          return;
        }
        const seriousError = errors.find((error) => error.type !== 'FieldMismatch');
        if (seriousError) {
          setFileError(`No se pudo interpretar el CSV: ${seriousError.message}`);
          return;
        }
        const selected = detectCodeColumn(meta.fields, nivel);
        setRows(data);
        setHeaders(meta.fields);
        setCodeColumn(selected);
        if (!selected) setFileError('Selecciona la columna que contiene el código territorial.');
        emitPreview(data, meta.fields, selected, file);
      },
      error: () => setFileError('No fue posible leer el archivo seleccionado.'),
    });
  };

  useEffect(() => {
    if (fileData && rows.length) {
      const selected = detectCodeColumn(headers, nivel);
      setCodeColumn(selected);
      setFileError(selected ? '' : 'Selecciona la columna que contiene el código territorial.');
      emitPreview(rows, headers, selected, fileData);
    }
    if (nivel !== 'departamentos') setShowCsvBuilder(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nivel]);

  const handleColumnChange = (value) => {
    setCodeColumn(value);
    setFileError('');
    emitPreview(rows, headers, value);
  };

  const toggleFormat = (format) => {
    setFormats((current) => current.includes(format)
      ? current.filter((value) => value !== format)
      : [...current, format]);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDragging(false);
    parseFile(event.dataTransfer.files?.[0]);
  };

  const readApiError = async (error) => {
    const payload = error.response?.data;
    if (payload instanceof Blob) {
      try {
        const parsed = JSON.parse(await payload.text());
        return parsed.detail || 'No fue posible procesar el archivo.';
      } catch {
        return 'No fue posible procesar el archivo.';
      }
    }
    return payload?.detail || 'No fue posible conectar con el servicio de conversión.';
  };

  const handleProcesar = async () => {
    if (!fileData || !codeColumn || formats.length === 0) return;
    setIsProcessing(true);
    setFileError('');
    setSuccessMessage('');
    const apiUrl = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
    const formData = new FormData();
    formData.append('file', fileData);
    formData.append('nivel', nivel);
    formData.append('columna_codigo', codeColumn);
    formData.append('formatos', formats.join(','));

    try {
      const response = await axios.post(`${apiUrl}/procesar_csv/`, formData, { responseType: 'blob' });
      const url = window.URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${nivel}_resultado.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      const matched = response.headers['x-matched-count'];
      const unmatched = response.headers['x-unmatched-count'];
      setSuccessMessage(`ZIP generado: ${matched || 'varios'} códigos encontrados${unmatched && unmatched !== '0' ? ` y ${unmatched} no encontrados` : ''}.`);
    } catch (error) {
      setFileError(await readApiError(error));
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadSample = () => {
    const content = nivel === 'municipios'
      ? 'codigo_municipio,valor,nombre\n0101,120,Guatemala\n0301,85,Antigua Guatemala\n'
      : 'codigo_departamento,valor,nombre\n01,120,Guatemala\n03,85,Sacatepéquez\n';
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `ejemplo_${nivel}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const toggleDepartment = (code) => {
    setSelectedDepartments((current) => current.includes(code)
      ? current.filter((item) => item !== code)
      : [...current, code]);
  };

  const buildDepartmentCsv = () => {
    const rowsToExport = DEPARTMENTS
      .filter(([code]) => selectedDepartments.includes(code))
      .map(([code, name]) => ({
        codigo_departamento: code,
        departamento: name,
        valor: departmentValues[code] ?? '',
      }));
    return Papa.unparse(rowsToExport);
  };

  const useCreatedCsv = () => {
    if (!selectedDepartments.length) return;
    const csv = buildDepartmentCsv();
    const file = new File([csv], 'departamentos_personalizado.csv', { type: 'text/csv;charset=utf-8' });
    parseFile(file);
    setShowCsvBuilder(false);
  };

  const downloadCreatedCsv = () => {
    if (!selectedDepartments.length) return;
    const csv = buildDepartmentCsv();
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'departamentos_personalizado.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <label htmlFor="nivel" className="field-label">Nivel geográfico</label>
        <select id="nivel" value={nivel} onChange={(event) => onLevelChange(event.target.value)} className="field-control">
          <option value="departamentos">Departamentos (22)</option>
          <option value="municipios">Municipios (340)</option>
        </select>
      </div>

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <label className="field-label mb-0">Archivo CSV</label>
          <div className="flex items-center gap-3">
            {nivel === 'departamentos' && (
              <button type="button" onClick={() => setShowCsvBuilder((value) => !value)} className="text-xs font-bold text-indigo-600 hover:text-indigo-800">
                {showCsvBuilder ? 'Cerrar creador' : 'Crear CSV'}
              </button>
            )}
            <button type="button" onClick={downloadSample} className="text-xs font-bold text-indigo-600 hover:text-indigo-800">Descargar ejemplo</button>
          </div>
        </div>

        {showCsvBuilder && nivel === 'departamentos' && (
          <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-bold text-slate-800">Crear CSV de departamentos</p>
                <p className="text-xs text-slate-500">Selecciona uno, varios o todos.</p>
              </div>
              <div className="flex gap-2 text-xs font-bold">
                <button type="button" onClick={() => setSelectedDepartments(DEPARTMENTS.map(([code]) => code))} className="text-indigo-600 hover:text-indigo-800">Todos</button>
                <button type="button" onClick={() => setSelectedDepartments([])} className="text-slate-500 hover:text-slate-700">Limpiar</button>
              </div>
            </div>

            <div className="grid max-h-56 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
              {DEPARTMENTS.map(([code, name]) => {
                const checked = selectedDepartments.includes(code);
                return (
                  <div key={code} className={`rounded-lg border p-2 ${checked ? 'border-indigo-300 bg-white' : 'border-slate-200 bg-white/70'}`}>
                    <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700">
                      <input type="checkbox" checked={checked} onChange={() => toggleDepartment(code)} className="h-4 w-4 accent-indigo-600" />
                      <span className="w-6 text-xs text-slate-400">{code}</span>
                      <span>{name}</span>
                    </label>
                    {checked && (
                      <input
                        type="text"
                        value={departmentValues[code] ?? ''}
                        onChange={(event) => setDepartmentValues((current) => ({ ...current, [code]: event.target.value }))}
                        placeholder="Valor (opcional)"
                        className="mt-2 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:border-indigo-400"
                      />
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button type="button" disabled={!selectedDepartments.length} onClick={useCreatedCsv} className="flex-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:bg-slate-300">
                Usar este CSV
              </button>
              <button type="button" disabled={!selectedDepartments.length} onClick={downloadCreatedCsv} className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:text-slate-300">
                Descargar CSV
              </button>
            </div>
          </div>
        )}

        <div
          className={`group cursor-pointer rounded-xl border-2 border-dashed px-5 py-7 text-center transition ${isDragging ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50'}`}
          onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') fileInputRef.current?.click(); }}
        >
          <div className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-indigo-50 text-xl text-indigo-600">↑</div>
          <p className="mt-3 text-sm font-semibold text-slate-700">{fileData ? fileData.name : 'Selecciona o arrastra tu archivo'}</p>
          <p className="mt-1 text-xs text-slate-500">CSV de hasta 10 MB</p>
          <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => parseFile(event.target.files?.[0])} />
        </div>
      </div>

      {headers.length > 0 && (
        <div>
          <label htmlFor="code-column" className="field-label">Columna que contiene el código</label>
          <select id="code-column" value={codeColumn} onChange={(event) => handleColumnChange(event.target.value)} className="field-control">
            <option value="">Seleccionar columna…</option>
            {headers.map((header) => <option key={header} value={header}>{header}</option>)}
          </select>
        </div>
      )}

      <fieldset>
        <legend className="field-label">Formatos de salida</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {FORMAT_OPTIONS.map((option) => {
            const checked = formats.includes(option.id);
            return (
              <label key={option.id} className={`cursor-pointer rounded-xl border p-3 transition ${checked ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'}`}>
                <div className="flex items-start gap-3">
                  <input type="checkbox" checked={checked} onChange={() => toggleFormat(option.id)} className="mt-1 h-4 w-4 accent-indigo-600" />
                  <span><span className="block text-sm font-bold text-slate-700">{option.label}</span><span className="block text-xs text-slate-500">{option.note}</span></span>
                </div>
              </label>
            );
          })}
        </div>
      </fieldset>

      {fileError && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"><strong>Revisa el archivo:</strong> {fileError}</div>}
      {successMessage && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{successMessage}</div>}

      <button
        type="button"
        onClick={handleProcesar}
        disabled={!fileData || !codeColumn || formats.length === 0 || isProcessing}
        className="flex w-full items-center justify-center rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {isProcessing ? 'Generando archivos…' : `Generar paquete de ${nivel}`}
      </button>

      {isProcessing && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3" aria-live="polite">
          <div className="mb-2 flex items-center justify-between text-xs font-semibold text-indigo-700">
            <span>Generando mapa y archivos</span>
            <span>Procesando…</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-indigo-100">
            <div className="processing-bar h-full rounded-full bg-indigo-600" />
          </div>
          <p className="mt-2 text-xs text-slate-500">La descarga comenzará automáticamente cuando termine.</p>
        </div>
      )}

      <p className="text-center text-xs leading-5 text-slate-500">Los archivos temporales se eliminan automáticamente después de la descarga.</p>
    </div>
  );
}
