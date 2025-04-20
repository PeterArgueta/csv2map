// ✅ App.jsx - sincronizado con backend solo-CSV
import React, { useState, useEffect } from 'react';
import { UploadForm } from './components/UploadForm';
import { MapaDepartamentos } from './components/MapaDepartamentos';
import './index.css';

function App() {
  const [geojsonData, setGeojsonData] = useState(null);
  const [codigosCsv, setCodigosCsv] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [csvPreview, setCsvPreview] = useState([]);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [fileName, setFileName] = useState("");

  useEffect(() => {
    const fetchGeojson = async () => {
      try {
        const response = await fetch('/Departamentos/departamentos.geojson');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        setGeojsonData(data);
        setIsLoading(false);
      } catch (error) {
        console.error('Error cargando GeoJSON:', error);
        setIsLoading(false);
      }
    };
    fetchGeojson();
  }, []);

  const handleUpload = (codigos, preview, headers, name) => {
    setCodigosCsv(codigos);
    setCsvPreview(preview);
    setCsvHeaders(headers);
    setFileName(name);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      <header className="bg-white shadow-md py-5 px-4 mb-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-2xl font-bold text-indigo-600">CSV2MAP GT</h1>
          <div className="text-sm text-gray-600">CSV → SHP/KML</div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 pb-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="bg-white rounded-xl shadow-lg overflow-hidden">
            <div className="bg-indigo-600 py-3 px-6 text-white font-semibold">Carga de archivos</div>
            <UploadForm onUpload={handleUpload} />
          </section>

          <section className="bg-white rounded-xl shadow-lg overflow-hidden">
            <div className="bg-indigo-600 py-3 px-6 text-white font-semibold">Visualización geográfica</div>
            <div className="p-4">
              {isLoading ? (
                <div className="flex justify-center items-center h-[500px]">
                  <div className="loader"></div>
                </div>
              ) : (
                <MapaDepartamentos geojsonData={geojsonData} codigosSeleccionados={codigosCsv} />
              )}
            </div>
          </section>
        </div>

        {csvPreview.length > 0 && (
          <section className="bg-white rounded-xl shadow-lg overflow-hidden mt-6">
            <div className="bg-indigo-600 py-3 px-6 text-white font-semibold flex justify-between">
              <span>Datos del archivo: {fileName}</span>
              <span className="bg-indigo-700 px-3 py-1 rounded-full">{codigosCsv.length} departamentos</span>
            </div>
            <div className="p-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {csvHeaders.map((header, idx) => (
                      <th key={idx} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {csvPreview.map((row, rowIndex) => (
                    <tr key={rowIndex} className="hover:bg-gray-50">
                      {row.map((cell, colIndex) => (
                        <td key={colIndex} className="px-4 py-2 text-sm text-gray-600">{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>

      <footer className="bg-white shadow-inner py-4 mt-auto text-center text-sm text-gray-600">
        © {new Date().getFullYear()} CSV2MAP GT - Todos los derechos reservados.
      </footer>
    </div>
  );
}

export default App;
