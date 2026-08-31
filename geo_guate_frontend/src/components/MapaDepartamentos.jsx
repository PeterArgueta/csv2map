import React, { useState } from 'react';
import L from 'leaflet';
import { GeoJSON, MapContainer, TileLayer, ZoomControl, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const BASEMAPS = {
  claro: {
    label: 'Mapa claro',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap &copy; CARTO',
  },
  calles: {
    label: 'Calles',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
  },
  topografico: {
    label: 'Topográfico',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap &copy; OpenTopoMap',
  },
};

function FitLayer({ data }) {
  const map = useMap();
  React.useEffect(() => {
    if (!data) return;
    const bounds = L.geoJSON(data).getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [12, 12] });
  }, [data, map]);
  return null;
}

export function MapaDepartamentos({ geojsonData, codigosSeleccionados, layerConfig, nivel }) {
  const [hoveredCode, setHoveredCode] = useState(null);
  const [basemap, setBasemap] = useState('claro');

  const getCode = (feature) => String(feature.properties?.[layerConfig.codeProperty] ?? '').padStart(layerConfig.codeWidth, '0');
  const selectedSet = new Set(codigosSeleccionados);

  const styleFeature = (feature) => {
    const code = getCode(feature);
    const selected = selectedSet.has(code);
    const hovered = hoveredCode === code;
    return {
      fillColor: selected ? '#4f46e5' : '#ffffff',
      color: hovered ? '#0f172a' : selected ? '#3730a3' : '#64748b',
      weight: hovered ? 2.5 : selected ? 1.5 : 0.8,
      fillOpacity: selected ? 0.72 : 0.06,
    };
  };

  const onEachFeature = (feature, layer) => {
    const code = getCode(feature);
    const name = feature.properties?.[layerConfig.nameProperty] || 'Sin nombre';
    const department = nivel === 'municipios' ? feature.properties?.depto_1 : null;
    layer.bindTooltip(`<strong>${name}</strong>${department ? `<br>${department}` : ''}<br>Código: ${code}`, {
      direction: 'top',
      className: 'custom-tooltip',
    });
    layer.on({ mouseover: () => setHoveredCode(code), mouseout: () => setHoveredCode(null) });
  };

  return (
    <div>
      <div className="relative h-[560px] w-full overflow-hidden rounded-xl border border-slate-200">
        <div className="absolute right-3 top-3 z-[500]">
          <select value={basemap} onChange={(event) => setBasemap(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm">
            {Object.entries(BASEMAPS).map(([id, item]) => <option key={id} value={id}>{item.label}</option>)}
          </select>
        </div>
        <MapContainer center={[15.5, -90.5]} zoom={7} minZoom={5} maxZoom={15} zoomControl={false} className="h-full w-full" style={{ background: '#f8fafc' }}>
          <ZoomControl position="bottomright" />
          <TileLayer key={basemap} attribution={BASEMAPS[basemap].attribution} url={BASEMAPS[basemap].url} />
          <FitLayer data={geojsonData} />
          {geojsonData && (
            <GeoJSON
              key={`${nivel}-${codigosSeleccionados.join('-')}`}
              data={geojsonData}
              style={styleFeature}
              onEachFeature={onEachFeature}
            />
          )}
        </MapContainer>
        <div className="pointer-events-none absolute bottom-3 left-3 z-[500] rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-sm backdrop-blur">
          <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-indigo-600" /> Incluido en el CSV</div>
          <div className="mt-1 flex items-center gap-2"><span className="h-3 w-3 rounded-sm border border-slate-400 bg-white" /> Sin seleccionar</div>
        </div>
      </div>
    </div>
  );
}
