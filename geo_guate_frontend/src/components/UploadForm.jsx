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

const COLUMN_HINTS = {
  departamentos: ['codigo_departamento', 'cod_departamento', 'cod_dep', 'departamento_codigo', 'codigo'],
  municipios: ['codigo_municipio', 'cod_municipio', 'cod_muni', 'codigo_ine', 'municipio_codigo', 'codigo'],
};

const normalizeHeader = (value) => String(value ?? '')
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
  const hints = COLUMN_HINTS[nivel] || ['codigo', 'codigo_territorial', 'admin_code'];
  return hints.map(normalizeHeader).map((hint) => normalized.get(hint)).find(Boolean) || '';
};

const buildSafeColumnHeaders = (columns) => {
  const used = new Map();
  return columns.map((column, index) => {
    let base = normalizeHeader(column.name) || `dato_${index + 1}`;
    if (base === 'codigo_departamento' || base === 'departamento') base = `${base}_dato`;
    const count = used.get(base) || 0;
    used.set(base, count + 1);
    return { ...column, header: count ? `${base}_${count + 1}` : base };
  });
};

export function UploadForm({ pais, countries, selectedCountry, nivel, layerConfig, geojsonData, onCountryChange, onLevelChange, onUpload }) {
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
  const [customColumns, setCustomColumns] = useState([{ id: 'valor', name: 'valor' }]);
  const [departmentValues, setDepartmentValues] = useState({});

  const territories = (geojsonData?.features || [])
    .map((feature) => [
      String(feature.properties?.[layerConfig.code_property] ?? '').padStart(layerConfig.code_width, '0'),
      feature.properties?.[layerConfig.name_property] || 'Sin nombre',
    ])
    .sort((left, right) => left[0].localeCompare(right[0]));

  const emitPreview = (dataRows, fields, selectedColumn, currentFile = fileData) => {
    const width = layerConfig.code_width;
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
    setSelectedDepartments([]);
    setDepartmentValues({});
  }, [pais, nivel]);

  useEffect(() => {
    setFileData(null);
    setRows([]);
    setHeaders([]);
    setCodeColumn('');
    setFileError('');
    setSuccessMessage('');
  }, [pais]);

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
    formData.append('pais', pais);
    formData.append('nivel', nivel);
    formData.append('columna_codigo', codeColumn);
    formData.append('formatos', formats.join(','));

    try {
      const response = await axios.post(`${apiUrl}/procesar_csv/`, formData, { responseType: 'blob' });
      const url = window.URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      const now = new Date();
      const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
      anchor.download = `converttomap_${pais.toLowerCase()}_${nivel}_${stamp}.zip`;
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
      : `codigo_departamento,valor,nombre\n${territories.slice(0, 2).map(([code, name], index) => `${code},${index ? 85 : 120},${name}`).join('\n')}\n`;
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `ejemplo_${pais.toLowerCase()}_${nivel}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const toggleDepartment = (code) => {
    setSelectedDepartments((current) => current.includes(code)
      ? current.filter((item) => item !== code)
      : [...current, code]);
  };

  const addCustomColumn = () => {
    if (customColumns.length >= 8) return;
    setCustomColumns((current) => [
      ...current,
      { id: `dato_${Date.now()}`, name: `dato_${current.length + 1}` },
    ]);
  };

  const renameCustomColumn = (id, name) => {
    setCustomColumns((current) => current.map((column) => (column.id === id ? { ...column, name } : column)));
  };

  const removeCustomColumn = (id) => {
    setCustomColumns((current) => current.filter((column) => column.id !== id));
    setDepartmentValues((current) => {
      const next = {};
      Object.entries(current).forEach(([code, values]) => {
        const { [id]: removed, ...remaining } = values;
        void removed;
        next[code] = remaining;
      });
      return next;
    });
  };

  const setDepartmentValue = (code, columnId, value) => {
    setDepartmentValues((current) => ({
      ...current,
      [code]: {
        ...(current[code] || {}),
        [columnId]: value,
      },
    }));
  };

  const buildDepartmentCsv = () => {
    const outputColumns = buildSafeColumnHeaders(customColumns);
    const rowsToExport = territories
      .filter(([code]) => selectedDepartments.includes(code))
      .map(([code, name]) => {
        const row = {
          codigo_departamento: code,
          departamento: name,
        };
        outputColumns.forEach((column) => {
          row[column.header] = departmentValues[code]?.[column.id] ?? '';
        });
        return row;
      });
    return Papa.unparse(rowsToExport);
  };

  const useCreatedCsv = () => {
    if (!selectedDepartments.length) return;
    const csv = buildDepartmentCsv();
    const file = new File([csv], `${pais.toLowerCase()}_departamentos_personalizado.csv`, { type: 'text/csv;charset=utf-8' });
    parseFile(file);
    setShowCsvBuilder(false);
  };

  const downloadCreatedCsv = () => {
    if (!selectedDepartments.length) return;
    const csv = buildDepartmentCsv();
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${pais.toLowerCase()}_departamentos_personalizado.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const safeHeaders = buildSafeColumnHeaders(customColumns);

  return (
    <div className="space-y-6 p-6">
      <div>
        <label htmlFor="pais" className="field-label">País</label>
        <select id="pais" value={pais} onChange={(event) => onCountryChange(event.target.value)} className="field-control">
          {countries.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}
        </select>
      </div>

      <div>
        <label htmlFor="nivel" className="field-label">Nivel geográfico</label>
        <select id="nivel" value={nivel} onChange={(event) => onLevelChange(event.target.value)} className="field-control">
          {selectedCountry.levels.map((level) => <option key={level.id} value={level.id}>{level.name} ({level.count})</option>)}
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
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-bold text-slate-800">Crear CSV de departamentos</p>
                <p className="text-xs text-slate-500">Selecciona territorios y agrega las variables que necesites.</p>
              </div>
              <div className="flex gap-2 text-xs font-bold">
                <button type="button" onClick={() => setSelectedDepartments(territories.map(([code]) => code))} className="text-indigo-600 hover:text-indigo-800">Todos</button>
                <button type="button" onClick={() => setSelectedDepartments([])} className="text-slate-500 hover:text-slate-700">Limpiar</button>
              </div>
            </div>

            <div className="mb-4 rounded-lg border border-slate-200 bg-white p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-slate-700">Columnas de datos</p>
                  <p className="text-[11px] text-slate-500">Ej.: población, presupuesto, ventas o pobreza.</p>
                </div>
                <button
                  type="button"
                  onClick={addCustomColumn}
                  disabled={customColumns.length >= 8}
                  className="rounded-lg border border-indigo-200 px-2.5 py-1.5 text-xs font-bold text-indigo-600 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:text-slate-300"
                >
                  + Agregar columna
                </button>
              </div>

              {customColumns.length === 0 ? (
                <p className="rounded-lg bg-slate-50 p-2 text-xs text-slate-500">El CSV contendrá únicamente código y departamento.</p>
              ) : (
                <div className="space-y-2">
                  {customColumns.map((column, index) => (
                    <div key={column.id} className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <input
                          type="text"
                          value={column.name}
                          onChange={(event) => renameCustomColumn(column.id, event.target.value)}
                          placeholder={`Nombre de columna ${index + 1}`}
                          className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-xs outline-none focus:border-indigo-400"
                        />
                        <p className="mt-1 truncate text-[10px] text-slate-400">CSV: {safeHeaders[index]?.header}</p>
                      </div>
                      <button type="button" onClick={() => removeCustomColumn(column.id)} className="mt-1 rounded-md px-2 py-1 text-sm font-bold text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Eliminar ${column.name || 'columna'}`}>×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid max-h-72 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
              {territories.map(([code, name]) => {
                const checked = selectedDepartments.includes(code);
                return (
                  <div key={code} className={`rounded-lg border p-2 ${checked ? 'border-indigo-300 bg-white' : 'border-slate-200 bg-white/70'}`}>
                    <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700">
                      <input type="checkbox" checked={checked} onChange={() => toggleDepartment(code)} className="h-4 w-4 accent-indigo-600" />
                      <span className="w-6 text-xs text-slate-400">{code}</span>
                      <span>{name}</span>
                    </label>
                    {checked && customColumns.length > 0 && (
                      <div className="mt-2 space-y-1.5">
                        {customColumns.map((column, index) => (
                          <input
                            key={column.id}
                            type="text"
                            value={departmentValues[code]?.[column.id] ?? ''}
                            onChange={(event) => setDepartmentValue(code, column.id, event.target.value)}
                            placeholder={column.name.trim() || `Dato ${index + 1}`}
                            className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:border-indigo-400"
                          />
                        ))}
                      </div>
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
