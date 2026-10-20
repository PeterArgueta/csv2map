# ConvertToMap 2.0

**ConvertToMap** transforma archivos tabulares con identificadores administrativos en capas geográficas utilizables en SIG y aplicaciones web.

**Aplicación:** https://converttomap.com · **API:** https://api.converttomap.com

## Problema y enfoque

Los datos estadísticos suelen distribuirse en tablas sin geometría. ConvertToMap permite asociar códigos territoriales con capas de referencia y exportar resultados geográficos sin construir manualmente la unión en un programa SIG.

El flujo separa una interfaz de revisión de datos (React, Vite y Leaflet) de una API de procesamiento (FastAPI, pandas y bibliotecas geoespaciales). El catálogo de países define capas y campos de unión compartidos.

## Funcionalidades

- Selección de país, nivel territorial y columna de códigos.
- Soporte para Guatemala (departamentos y municipios) y El Salvador (departamentos).
- Detección de separadores CSV comunes y previsualización tabular/cartográfica.
- Conservación de atributos adicionales y exportación a Shapefile, KML, GeoJSON y GeoPackage.
- Reporte JSON de coincidencias, códigos faltantes, vacíos y duplicados.
- Límite de archivos de 10 MB, validaciones de entrada y limpieza de archivos temporales.

## Arquitectura

```text
geo_guate_frontend/    Interfaz React, Vite y Leaflet
  public/countries/   Catálogos y límites territoriales
main.py               API FastAPI y procesamiento de exportaciones
utils/                Normalización y validación
Departamentos/        Datos cartográficos de referencia
tests/                Pruebas del proyecto
docs/                 Documentación complementaria
```

**Flujo de datos:** CSV → validación y normalización → unión con geometrías territoriales → vista previa / exportación → archivo ZIP y reporte de procesamiento.

## Desarrollo local

Se requiere Python y Node.js compatibles con las dependencias del repositorio. Para las operaciones SIG pueden ser necesarias bibliotecas nativas de GDAL y sus dependencias.

**Backend**
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

La API local estará en `http://localhost:8000`. Los orígenes permitidos se configuran con `ALLOWED_ORIGINS`.

```env
ALLOWED_ORIGINS=http://localhost:5173,https://converttomap.com,https://www.converttomap.com
```

**Frontend**
```bash
cd geo_guate_frontend
npm install
npm run dev
```

Para despliegues independientes del frontend, configura `VITE_API_URL` con la URL de la API correspondiente.

## API de conversión

`POST /procesar_csv/` acepta `multipart/form-data`:

| Campo | Uso |
| --- | --- |
| `file` | CSV, máximo 10 MB |
| `pais` | `GTM` o `SLV` |
| `nivel` | `departamentos` o `municipios`, según catálogo |
| `columna_codigo` | Encabezado con identificador territorial |
| `formatos` | Lista separada por comas: `shp,kml,geojson,gpkg` |

La descarga contiene los formatos seleccionados y `reporte_procesamiento.json`.

El archivo `geo_guate_frontend/public/countries/catalog.json` mantiene la configuración territorial utilizada por ambos componentes.

## Calidad y validaciones

- Las pruebas se encuentran en `tests/`; consulta `pytest.ini` y `requirements-dev.txt` para el entorno de pruebas.
- El frontend incluye `npm run build` y `npm run check:links`.
- Las uniones territoriales dependen de la calidad de los códigos originales. El reporte de procesamiento permite revisar códigos no reconocidos y duplicados antes de utilizar el resultado.

No se presenta aquí una cobertura de pruebas ni un estado de CI no verificado.

## Fuentes y licencias de datos

- Guatemala, departamentos y municipios: [IDEG–SEGEPLAN](https://ideg.segeplan.gob.gt/geoportal/).
- El Salvador, departamentos: [geoBoundaries](https://www.geoboundaries.org/) (gbOpen; fuente subyacente OpenStreetMap, atribución y condiciones según el conjunto utilizado).
- Mapas base: OpenStreetMap y OpenTopoMap, con atribuciones en la aplicación.

Verifica la vigencia, metadatos y condiciones de redistribución de cada conjunto antes de su uso comercial u oficial.

## Infraestructura y despliegue

El frontend se publica mediante GitHub Pages y el backend FastAPI se aloja en Render. Se utilizan los dominios `converttomap.com` y `api.converttomap.com`. Las dos partes pueden desplegarse por separado.

## Alcance y limitaciones

Los identificadores administrativos deben ser compatibles con el catálogo disponible. Las conversiones no sustituyen una validación cartográfica ni garantizan equivalencia semántica entre fuentes que utilicen códigos diferentes.

## Licencias

El código actual se distribuye bajo las condiciones del archivo [LICENSE](LICENSE). Las versiones anteriores publicadas con licencia MIT mantienen los permisos concedidos para dichas versiones. Las dependencias y los datos geográficos conservan sus licencias independientes.
