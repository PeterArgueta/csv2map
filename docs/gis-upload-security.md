# CTM-01 — Lectura segura de archivos GIS subidos

Solo los archivos aportados por usuarios pasan por el lector separado. Las capas
administrativas del catálogo y las exportaciones siguen su flujo existente.

- Validación real de GeoJSON, XML KML (sin DTD, entidades ni NetworkLink), firma
  GPKG y cabecera SHP antes de GDAL. SHP debe ir dentro del ZIP como antes.
- Fiona recibe una allowlist de **un driver** por formato; VRT no está permitido.
- Worker Python `-I`, sin variables heredadas ni shell, descriptores cerrados.
- Landlock: lectura solo de su carpeta de entrada y runtimes Python/GIS y /dev/urandom (entropía del parser).
  Escritura solo mediante el descriptor de resultado abierto antes de restringir.
- Seccomp: sin sockets, procesos nuevos, ptrace, acceso a memoria de otros procesos,
  pidfd_getfd, open_by_handle_at ni io_uring. Requiere Linux x86_64/aarch64.
- 45 segundos de tiempo real; 30 segundos CPU; 1 GiB de espacio virtual;
  64 MiB de resultado; 100000 entidades. No sustituye CTM-02/03/04.
- Resultado JSON y reconstrucción con from_features; no pickle ni GDAL reabriendo
  un archivo enviado por el usuario dentro del proceso API.

## Condición obligatoria antes del despliegue

**No fusionar ni desplegar hasta probar el sandbox en el runtime de Render.**
El health mantiene `status: healthy` para el API y añade `gis_security: ctm-01`
y `gis_isolation: true/false`. GIS devuelve 503 si el aislamiento está ausente;
no existe un flag de bypass. CSV/XLSX de coordenadas no necesitan este lector.

En un servicio de prueba con el mismo runtime, ejecutar:

```bash
python -c "from utils.safe_gis import isolation_available; assert isolation_available()"
pytest -q
```

Confirmar lectura de un GeoJSON/KML/GPKG/ZIP SHP sintético, rechazo de VRT y
`gis_isolation: true`. El probe comprueba bloqueo real de un archivo sintético
fuera de la carpeta, escritura nueva y socket(), sin leer secretos ni conectar a terceros.
CI exige ese probe antes de ejecutar la suite.

## Validación de la preparación

El contenedor de desarrollo devuelve ENOSYS para Landlock y no permite namespaces.
Por ello, el test de kernel real se omite en este entorno. La suite de seguridad
cubre validación, allowlist de Fiona, errores 422/503, no-fallback, timeout y cuatro
formatos legítimos; estos últimos se prueban en un worker de test sin restricciones
solo para comprobar compatibilidad de drivers, **no para afirmar aislamiento**.
La versión candidata queda en rama/PR; producción permanece sin cambios.

Regresión de la aplicación: 82 pruebas pasaron con un harness temporal que
sustituye exclusivamente el bloqueo del kernel en los workers de test. Se
excluyeron el test de kernel real y el smoke de capas remotas de todos los países.
Esto comprueba compatibilidad funcional; no valida el aislamiento en Render.
