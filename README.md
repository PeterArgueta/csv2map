# CSV2MAP GT 2.0

CSV2MAP GT convierte archivos CSV con códigos administrativos de Guatemala en capas geográficas listas para QGIS, ArcGIS, Google Earth o aplicaciones web.

**Aplicación actual:** <https://csv2map.vercel.app>

## Funciones de la versión 2

- Procesa los 22 departamentos y los 340 municipios de Guatemala.
- Detecta CSV separados por coma, punto y coma o tabulación.
- Permite seleccionar manualmente la columna territorial.
- Conserva las demás columnas del archivo como atributos de la capa.
- Exporta Shapefile, KML, GeoJSON y GeoPackage.
- Genera un reporte JSON con códigos encontrados, no encontrados, vacíos y duplicados.
- Incluye vista previa de la tabla y selección resaltada en el mapa.
- Ofrece mapas base claro, vial y topográfico.
- Valida tipo y tamaño del archivo (máximo 10 MB).
- Elimina automáticamente los archivos temporales del servidor.

## Estructura

```text
csv2map/
├── geo_guate_frontend/       React, Vite, Tailwind y Leaflet
│   ├── public/               Límites GeoJSON para la vista previa
│   └── src/
├── Departamentos/            Capa base departamental
├── utils/                    Normalización y validación
├── main.py                   API FastAPI y exportación GIS
└── requirements.txt
```

## Desarrollo local

### Backend

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

La API queda disponible en `http://localhost:8000`. Para limitar CORS, define los orígenes separados por comas:

```env
ALLOWED_ORIGINS=http://localhost:5173,https://csv2map.vercel.app
```

### Frontend

```bash
cd geo_guate_frontend
npm install
npm run dev
```

Para producción, configura la dirección de la API:

```env
VITE_API_URL=https://csv2map.onrender.com
```

## API

`POST /procesar_csv/` recibe `multipart/form-data` con:

| Campo | Descripción |
|---|---|
| `file` | Archivo CSV de hasta 10 MB |
| `nivel` | `departamentos` o `municipios` |
| `columna_codigo` | Encabezado que contiene el código administrativo |
| `formatos` | Lista separada por comas: `shp,kml,geojson,gpkg` |

La descarga ZIP incluye los formatos seleccionados y `reporte_procesamiento.json`.

## Fuentes cartográficas

- Departamentos: capa incorporada originalmente al proyecto CSV2MAP GT.
- Municipios: servicio público **Límites municipales** de CONRED Guatemala, consultado en formato GeoJSON desde su FeatureServer. La copia incluida contiene 340 municipios.
- Mapas base: OpenStreetMap, CARTO y OpenTopoMap, con sus atribuciones visibles en la aplicación.

Antes de utilizar los datos en un producto comercial, verifica las condiciones y atribuciones vigentes de cada fuente.

## Despliegue actual

- Frontend: Vercel.
- Backend: Render.

Un dominio propio puede apuntar el sitio principal a Vercel y un subdominio como `api.tudominio.com` al backend de Render.

## Licencia

El código del proyecto está bajo licencia MIT. Las capas y mapas base conservan las condiciones de sus respectivas fuentes.

Creado por [Peter Argueta](https://www.linkedin.com/in/peterargueta/).
