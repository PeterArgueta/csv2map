# Capas por país

Las capas se organizan con el código ISO 3166-1 alfa-3 del país:

```text
countries/
└── SLV/
    ├── source.geojson.gz
    ├── admin1.geojson
    ├── admin1.optimized.geojson
    └── metadata.json
```

`catalog.json` registra las capas disponibles y los campos que deberán consumir el frontend y el backend.

## Esquema común para `admin1`

| Campo | Descripción |
| --- | --- |
| `country_code` | Código ISO alfa-3 del país |
| `country_name` | Nombre del país |
| `admin_level` | Nivel administrativo numérico |
| `admin_type` | Nombre local del nivel |
| `admin_code` | Código territorial dentro del país |
| `name` | Nombre de la unidad territorial |
| `source_id` | Identificador de la fuente original |

La aplicación debe leer la configuración de cada país en lugar de fijar nombres de campos y rutas dentro del frontend o el backend.
