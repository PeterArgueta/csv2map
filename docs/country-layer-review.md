# Arquitectura de ConvertToMap para varios países

## Implementación

El frontend y el backend leen `geo_guate_frontend/public/countries/catalog.json`. El catálogo define:

- países y niveles disponibles;
- rutas de las capas para mapa y exportación;
- campos de código, nombre y jerarquía;
- ancho de los códigos territoriales;
- descargas, fuentes y metadata.

## Países habilitados

- Guatemala: departamentos y municipios.
- El Salvador: departamentos.

Las vistas web usan capas optimizadas. La API conserva capas completas para generar los formatos GIS solicitados. Las pruebas verifican conteos y conversiones para ambos países.
