# ConvertToMap 2.0

**ConvertToMap** convierte archivos CSV con códigos administrativos de Guatemala en capas geográficas listas para QGIS, ArcGIS, Google Earth o aplicaciones web. CSV2MAP GT es el primer conversor territorial disponible dentro de la plataforma.

- **Sitio:** <https://converttomap.com>
- **API:** <https://api.converttomap.com>

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
ALLOWED_ORIGINS=http://localhost:5173,https://converttomap.com,https://www.converttomap.com
```

### Frontend

```bash
cd geo_guate_frontend
npm install
npm run dev
```

Para producción, configura la dirección de la API:

```env
VITE_API_URL=https://api.converttomap.com
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

- Departamentos: **IDEG – SEGEPLAN**, Geoportal de la Infraestructura de Datos Espaciales de Guatemala: <https://ideg.segeplan.gob.gt/geoportal/>. La copia utilizada por ConvertToMap contiene 22 departamentos y se trabaja a partir de GeoJSON.
- Municipios: **IDEG – SEGEPLAN**, Geoportal de la Infraestructura de Datos Espaciales de Guatemala: <https://ideg.segeplan.gob.gt/geoportal/>. La copia utilizada por ConvertToMap contiene 340 municipios y se trabaja a partir de GeoJSON.
- Mapas base: OpenStreetMap y OpenTopoMap, con sus atribuciones visibles en la aplicación.

Antes de utilizar los datos en un producto comercial u oficial, verifica las condiciones, metadata y atribuciones vigentes de cada fuente.

## Despliegue

- Frontend: GitHub Pages.
- Backend: servicio FastAPI en Render.
- Sitio: `converttomap.com` y redirección desde `www.converttomap.com`.
- API: `api.converttomap.com`.

El sitio y la API utilizan servicios separados para que el frontend pueda seguir disponible durante tareas de mantenimiento del conversor.

## Derechos y licencias

ConvertToMap 2.0 es software propietario. Consulta `LICENSE` para las condiciones del código. Las versiones publicadas anteriormente bajo licencia MIT conservan los permisos que ya hubieran sido concedidos sobre esas versiones.

Las dependencias, capas y mapas base conservan las licencias y condiciones de sus respectivas fuentes.
