# CTM-02 — ZIP Shapefile con extracción acotada

El límite de entrada permanece en 10 MiB. `/convertir_formato/` valida el ZIP
completo antes de crear el directorio de extracción y antes de ejecutar GDAL.

| Control | Límite |
| --- | --- |
| Miembros, incluidos directorios | 64 |
| Bytes descomprimidos acumulados | 64 MiB |
| Bytes por pieza | 64 MiB |
| Relación descomprimido/comprimido por pieza y total | 200:1 |
| Bloque de lectura | Hasta 64 KiB, reducido al presupuesto restante + 1 |

Se exige un único conjunto `.shp`, `.shx`, `.dbf` de la misma carpeta y nombre.
Opcionales: `.prj`, `.cpg`, `.sbn`, `.sbx`, `.qix`. Se permiten carpetas y
extensiones en mayúsculas; la salida interna usa el nombre fijo `layer`.
Se rechazan piezas adicionales de otro conjunto, duplicados (también diferencias
de mayúsculas), rutas relativas inseguras/absolutas/Windows, caracteres de control,
enlaces y archivos especiales, archivos anidados, README y otros formatos,
cifrado y compresión distinta de stored/deflate.

Las cuotas se verifican tanto en el directorio central como contando los bytes
reales al descomprimir. Cada lectura está acotada; los bytes excedidos se
rechazan antes de escribirlos. ZIP truncado, CRC inválido y fallos de lectura
eliminan la extracción parcial. El endpoint elimina todo el workspace al fallar
y mantiene su limpieza posterior al responder correctamente. Rechazos de ZIP
devuelven 422. El lector GIS aislado de CTM-01 se mantiene.

`/health` añade `zip_security: ctm-02` para verificar la versión desplegada.
Las pruebas usan fixtures pequeños y cuotas reducidas: no ZIP bombs ni pruebas
de saturación. CI prueba una conversión ZIP Shapefile real bajo el sandbox.

Estos límites pueden rechazar ZIP legítimos con múltiples capas, documentación
o una compresión muy alta. El usuario debe subir únicamente las piezas del
Shapefile que desea convertir. La extracción aún ocurre en el proceso API;
concurrencia, deadline global y recepción multipart se abordan en CTM-03/04.
