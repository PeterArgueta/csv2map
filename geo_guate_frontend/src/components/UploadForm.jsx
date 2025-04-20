// ✅ UploadForm.jsx con estilo original restaurado y funcionalidad completa
import React, { useRef, useState } from 'react';
import axios from 'axios';

export function UploadForm({ onUpload }) {
  const fileInputRef = useRef();
  const [csvPreview, setCsvPreview] = useState([]);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [codigos, setCodigos] = useState([]);
  const [fileData, setFileData] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    processFile(file);
  };

  const processFile = (file) => {
    if (!file) return;
    setFileError('');
    setFileData(file);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const lines = text.split('\n').filter(Boolean);

      if (lines.length < 2) {
        setFileError('El archivo parece estar vacío o no tiene datos suficientes.');
        return;
      }

      const headers = lines[0].split(',');
      setCsvHeaders(headers);

      const codigoIndex = headers.findIndex(h =>
        h.toLowerCase().includes('codigo_departamento') ||
        h.toLowerCase().includes('codigo') ||
        h.toLowerCase().includes('cod_dep')
      );

      if (codigoIndex === -1) {
        setFileError('No se encontró una columna de códigos en el CSV. Asegúrate de que exista una columna "codigo_departamento", "codigo" o "cod_dep".');
        return;
      }

      const codigosExtraidos = lines.slice(1).map(line => {
        const cols = line.split(',');
        return cols[codigoIndex]?.trim().padStart(2, '0');
      }).filter(Boolean);

      setCodigos(codigosExtraidos);

      const preview = lines.slice(1, 10).map(line => line.split(','));
      setCsvPreview(preview);

      onUpload(codigosExtraidos, preview, headers, file.name);
    };

    reader.readAsText(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleProcesar = async () => {
  if (!fileData) return;
  setIsProcessing(true);

  const formData = new FormData();
  formData.append("file", fileData);

  try {
    const response = await axios.post("/procesar_csv/", formData, {
      responseType: 'blob',
    });

    const blob = new Blob([response.data], { type: 'application/zip' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "departamentos_resultado.zip";
    document.body.appendChild(a);
    a.click();
    a.remove();

  } catch (error) {
    console.error("❌ Error al procesar CSV:", error);
    alert("Hubo un error al procesar el archivo.");
  } finally {
    setIsProcessing(false);
  }
};

  return (
    <div className="p-6">
      <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6 rounded-md">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2h-1V9z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <p className="text-sm text-blue-800">
            Sube un archivo CSV que contenga una columna con los códigos de departamentos. El sistema detectará automáticamente columnas con nombres como "codigo_departamento", "codigo" 
            o "cod_dep", y generará un paquete ZIP con Shapefile (.shp) y KML (.kml).          </p>
          </div>
        </div>
      </div>

      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center ${
          isDragging ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 hover:border-indigo-400'
        } transition-colors duration-200 ease-in-out cursor-pointer`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current.click()}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-10 w-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>

        <div className="mt-3">
          <span className="font-medium text-indigo-600">Haz clic para seleccionar</span> o arrastra y suelta un archivo
        </div>
        <p className="mt-1 text-xs text-gray-500">CSV (hasta 10MB)</p>

        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept=".csv"
          onChange={handleFileChange}
        />

        {fileData && (
          <div className="mt-3 text-sm text-gray-600">
            Archivo cargado: <span className="font-medium">{fileData.name}</span>
          </div>
        )}
      </div>

      {fileError && (
        <div className="mt-3 text-sm text-red-600 bg-red-50 p-3 rounded-md border border-red-200">
          <strong>Error:</strong> {fileError}
        </div>
      )}

      {codigos.length > 0 && (
        <div className="mt-4 flex justify-center">
          <button
            onClick={handleProcesar}
            disabled={isProcessing}
            className={`bg-gradient-to-r from-indigo-600 to-blue-500 hover:from-indigo-700 hover:to-blue-600 text-white px-6 py-2 rounded-md font-medium shadow-md transition-all duration-200 ease-in-out transform flex items-center justify-center ${isProcessing ? 'opacity-60 cursor-wait' : 'hover:scale-105'}`}
          >
            {isProcessing ? (
              <svg className="animate-spin h-5 w-5 mr-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            )}
            {isProcessing ? 'Procesando...' : `Procesar ${codigos.length} departamentos`}
          </button>
        </div>
      )}

      {codigos.length > 0 && (
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="bg-indigo-50 p-3 rounded-lg text-center">
            <div className="text-indigo-600 text-xl font-bold">{codigos.length}</div>
            <div className="text-xs text-indigo-700">Departamentos</div>
          </div>
          <div className="bg-green-50 p-3 rounded-lg text-center">
            <div className="text-green-600 text-xl font-bold">{csvHeaders.length}</div>
            <div className="text-xs text-green-700">Columnas</div>
          </div>
        </div>
      )}
    </div>
  );
}
