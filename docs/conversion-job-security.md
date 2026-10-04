# CTM-03 — Conversiones en procesos limitados

Las cuatro rutas POST (`procesar_csv`, `inspeccionar_tabla`, `convertir_formato`,
`exportar_geojson`) mantienen sus parámetros y respuestas. Sus cuerpos se
ejecutan en procesos descartables; pandas, GeoPandas, GDAL, joins, ZIP y
exportaciones ya no bloquean el event loop de Uvicorn.

| Control | Límite |
| --- | --- |
| Trabajo activo | 1 por proceso API; sin cola ilimitada |
| Tiempo real del proceso, incluida importación | 90 segundos |
| CPU | 45 segundos por worker; lector GIS mantiene 30 segundos |
| Espacio virtual de memoria | 384 MiB por worker, heredado por lector GIS |
| Tamaño por archivo generado, impuesto por kernel | 64 MiB |
| Workspace total | 128 MiB, monitorizado cada 100 ms y antes de responder |
| Resultado JSON de control/preview | 1 MiB |
| Filas/entidades y columnas | 100000 y 256 |
| Coordenadas antes de exportar | 1000000 |

Se recibe como máximo la cuota previa de 10 MiB de entrada. El worker usa
Python `-I`, no shell, entorno limpio sin secretos heredados, un solo hilo
OpenBLAS/OMP y solo un dispatcher fijo. La comunicación usa JSON y archivos
privados por trabajo; no pickle. Las descargas deben estar dentro del workspace.
La política de drivers/sandbox CTM-01 y la extracción ZIP CTM-02 se mantienen.
El lector GIS respeta el hard limit de memoria heredado, sin intentar ampliarlo.

La API espera el proceso de forma asíncrona. Timeout o cancelación terminan
todo el grupo de procesos, incluido el lector GIS. Se espera al proceso principal
y se elimina el workspace. En descargas correctas, la limpieza ocurre al terminar
la respuesta; inspección y errores se limpian antes de devolverla.

Ocupado devuelve 503 + Retry-After: 5; deadline devuelve 504; recursos, filas,
geometrías, tamaños o procesos terminados por el kernel devuelven 422. Fallos
del supervisor devuelven 503. `/health` añade `conversion_security: ctm-03`.

La cuota de workspace es un monitor: puede superarse transitoriamente entre
comprobaciones, pero no se entrega un resultado que la exceda. RLIMIT_AS limita
memoria virtual por proceso, no es una cuota cgroup de RAM agregada. Uvicorn
actualmente usa un proceso; si se escala, cada proceso tiene un slot y debe
dimensionarse la RAM o incorporar una cola externa con cuota global.
Los trabajos descartables no conservan la caché de capas entre solicitudes;
las fuentes remotas del catálogo pueden sumar latencia y quedan dentro del
deadline. GDAL HTTP tiene timeout de 15 segundos y no reintenta.

CTM-04 (recepción multipart/rate limiting) se mantiene pendiente. Estas cuotas
pueden rechazar capas grandes antes aceptadas. No se ejecutan pruebas de carga
en producción. CI cubre heartbeat, admisión, deadline, terminación de hijos,
cancelación, cuotas, limpieza y compatibilidad real de los cuatro endpoints.
