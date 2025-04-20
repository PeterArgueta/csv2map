// MapaDepartamentos.jsx
import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, GeoJSON, ZoomControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

export function MapaDepartamentos({ geojsonData, codigosSeleccionados }) {
  const [hoveredDepartment, setHoveredDepartment] = useState(null);

  const styleFeature = (feature) => {
    const codigo = feature.properties?.cod_dep?.toString().padStart(2, '0');
    const estaSeleccionado = codigosSeleccionados.includes(codigo);
    const estaHovered = hoveredDepartment === codigo;
    
    return {
      fillColor: estaSeleccionado ? '#4f46e5' : '#ffffff00',
      color: estaHovered ? '#3b82f6' : '#64748b',
      weight: estaHovered ? 2.5 : 1.5,
      dashArray: estaHovered ? '' : '2',
      fillOpacity: estaSeleccionado ? 0.6 : 0,
    };
  };

  const onEachFeature = (feature, layer) => {
    const codigo = feature.properties?.cod_dep?.toString();
    const nombre = feature.properties?.departamen || 'Desconocido';
    
    layer.bindTooltip(`<div class="tooltip"><strong>${nombre}</strong><br>Código: ${codigo}</div>`, {
      permanent: false,
      direction: 'top',
      className: 'custom-tooltip'
    });
    
    layer.on({
      mouseover: () => setHoveredDepartment(codigo),
      mouseout: () => setHoveredDepartment(null)
    });
  };

  return (
    <div className="h-[500px] w-full rounded-lg overflow-hidden">
      <MapContainer 
        center={[15.5, -90.5]} 
        zoom={6.8} 
        minZoom={6.8}   // 👈 evita que se aleje más
        maxZoom={10}    // 👈 opcional, si quieres limitar el zoom in
        zoomControl={false}
        scrollWheelZoom={true}
        dragging={true}
        doubleClickZoom={true}
        touchZoom={true}
        keyboard={true}
        className="h-full w-full"
        style={{ background: '#f1f5f9' }}
      >


        <ZoomControl position="bottomright" />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />
        {geojsonData && (
          <GeoJSON 
            data={geojsonData} 
            style={styleFeature} 
            onEachFeature={onEachFeature}
          />
        )}
      </MapContainer>
      <div className="text-xs text-gray-500 mt-2 flex justify-between px-2">
        <span>Zoom y arrastre para explorar</span>
        <span>{codigosSeleccionados.length} departamento(s) seleccionado(s)</span>
      </div>
    </div>
  );
}