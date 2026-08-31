# Preparación de ConvertToMap para varios países

## Estado actual

El frontend y el backend tienen rutas, campos y textos de Guatemala definidos directamente en el código:

- `geo_guate_frontend/src/App.jsx` contiene la configuración `LAYERS` y los ejemplos CSV.
- `geo_guate_frontend/src/components/UploadForm.jsx` contiene las opciones territoriales.
- `main.py` contiene las rutas y campos de unión utilizados por la API.
- `CrearCapaPuntos.jsx` carga directamente la capa municipal de Guatemala.

## Próxima implementación

1. Migrar las capas de Guatemala al esquema común de `public/countries/`.
2. Hacer que frontend y backend lean un catálogo único de países y niveles.
3. Agregar el selector de país antes del selector de nivel territorial.
4. Usar `code_property`, `name_property` y `code_width` desde el catálogo.
5. Generar ejemplos CSV y nombres de descarga según el país seleccionado.
6. Mantener la capa optimizada para el mapa y la capa normalizada para exportaciones.
7. Agregar pruebas de conteo, códigos únicos, geometrías y uniones CSV para cada capa.

No se habilita El Salvador en la interfaz hasta que el backend pueda convertir y exportar usando esta configuración.
