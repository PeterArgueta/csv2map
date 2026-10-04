# CTM-04 — Recepción de archivos y control de abuso

Se protegen las cuatro rutas POST de procesamiento antes de consumir el body.
GET `/health`, otras lecturas y OPTIONS/CORS quedan fuera de los contadores.

| Control | Límite |
| --- | --- |
| Body total, incluido multipart | 11 MiB |
| Datos reales del archivo, durante parseo | 10 MiB |
| Archivos / campos de texto | 1 / 10 |
| Campo de texto / encabezados de cada parte | 16 KiB / 8 KiB |
| Content-Type / boundary | 512 / 70 bytes |
| Recepción total / espera sin datos | 30 / 5 segundos |
| Descarga tras iniciar respuesta | 60 segundos |
| Duración máxima de solicitud completa | 180 segundos |
| Recepción/conversión/descarga activa | 1 por proceso API, sin cola |
| Cliente | Token bucket: 20 solicitudes/minuto, ráfaga de 10 |
| Proceso API | Token bucket: 60 solicitudes/minuto, ráfaga de 20 |
| Identidades registradas | 2048; vencimiento inactivo de 300 segundos |

Content-Length excesivo o inválido se rechaza antes de leer. Independientemente
del encabezado, se suman los bytes reales del stream; un chunk que exceda la cuota
no se entrega al parser. Así se cubren transferencias sin longitud/chunked y
longitudes falsas. Los límites de archivo, partes, campos y headers se comprueban
durante parseo. Cuerpos truncados, errores de stream, timeout, desconexión y
cancelación cierran todos los spools. El formulario válido se cierra después de
ejecutar el endpoint. Se mantienen las cuotas de conversión y limpieza CTM-03.

La admisión se mantiene hasta terminar la respuesta: clientes lentos no acumulan
workspaces ilimitados. Los deadlines cancelan el trabajo; el supervisor mata su
grupo de procesos y el FileResponse limpia su workspace. Si la respuesta ya
comenzó, un timeout interrumpe la transferencia; no se envía otra respuesta JSON.

429 + Retry-After indica tasa excedida; 503 + Retry-After indica ocupado;
413 indica cuotas de bytes; 408 indica deadline de recepción/solicitud;
400 indica multipart inválido/exceso de partes; 415 indica Content-Type incorrecto.
Errores tempranos de HTTP/1.x cierran la conexión, evitando drenar bodies rechazados.
Los rechazos conservan CORS y Retry-After se expone al frontend.
`/health` añade `intake_security: ctm-04`.

La identidad utiliza únicamente `scope.client`, entregado por el servidor ASGI;
la aplicación no confía directamente en X-Forwarded-For ni X-Real-IP. IPv6 usa
prefijo /64 y direcciones IPv4 mapeadas se normalizan. Se retiene un HMAC con sal
aleatoria por proceso, no la IP; no se registran ni se devuelven identidades.
Se deben mantener correctamente configurados los proxies confiables de Uvicorn.
Si el servidor entrega la IP del proxy, varios usuarios comparten ese bucket.

Los límites son por proceso; se reinician al reiniciar el servicio. Render usa
actualmente un proceso Uvicorn. Si se escala a varios procesos/instancias, la
admisión y rate limiting deben migrar a un contador/cola compartidos o al edge.
Estos controles limitan lo recibido por la aplicación, no buffers del proxy
externo ni ataques volumétricos de red. No se cambió la configuración del edge.
Conexiones lentas y cargas que excedan estos límites deben reducir el archivo
o reintentar. Las pruebas de abuso usan fixtures pequeños/cuotas reducidas en
tests; producción solo recibe cargas normales y pequeñas.
