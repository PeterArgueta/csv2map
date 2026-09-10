(() => {
  const STORAGE_KEY = 'converttomap_language';
  const supported = ['es', 'en'];
  const browserLanguage = (navigator.languages?.[0] || navigator.language || 'en').toLowerCase();
  let language = localStorage.getItem(STORAGE_KEY);
  if (!supported.includes(language)) language = browserLanguage.startsWith('es') ? 'es' : 'en';

  const exact = {
    'Conversor de datos': 'Data converter',
    'Convertir': 'Convert',
    'Crear capa': 'Create layer',
    'Capas': 'Layers',
    'Proyectos': 'Projects',
    'Convierte tus datos en capas GIS': 'Convert your data into GIS layers',
    'Selecciona un país, carga un CSV con códigos territoriales, comprueba tus datos en el mapa y descarga el resultado para QGIS, ArcGIS o Google Earth.': 'Select a country, upload a CSV with territorial codes, check your data on the map, and download the result for QGIS, ArcGIS, or Google Earth.',
    'Probar con ejemplo': 'Try an example',
    'Descargar capas': 'Download layers',
    '1. Configura la conversión': '1. Configure the conversion',
    'Sube tu CSV, selecciona la columna territorial y los formatos de salida.': 'Upload your CSV, select the territorial-code column, and choose the output formats.',
    '2. Verifica en el mapa': '2. Check on the map',
    'Se resaltan los códigos encontrados en el CSV.': 'Codes found in the CSV are highlighted.',
    'Vista previa de datos': 'Data preview',
    'Datos geográficos': 'Geographic data',
    'Capas por país': 'Layers by country',
    'Descarga las capas base disponibles y consulta la fuente utilizada para cada país.': 'Download the available base layers and check the source used for each country.',
    'Formato de descarga': 'Download format',
    'Usar en ConvertToMap': 'Use in ConvertToMap',
    'Los formatos disponibles dependen de cada capa. Desde el conversor puedes generar GeoJSON, Shapefile, GeoPackage y KML. Recomendamos revisar la metadata y la fuente antes de utilizarlas en análisis oficiales.': 'Available formats depend on each layer. From the converter you can generate GeoJSON, Shapefile, GeoPackage, and KML. We recommend checking the metadata and source before using them in official analyses.',
    'Herramientas': 'Tools',
    'Herramientas para trabajar con datos y contenido digital.': 'Tools for working with data and digital content.',
    'Convierte archivos CSV en capas GIS listas para usar.': 'Convert CSV files into ready-to-use GIS layers.',
    'Generador QR': 'QR Generator',
    'Crea códigos QR personalizados con colores, logo, tamaño y descarga en PNG.': 'Create custom QR codes with colors, logo, size, and PNG download.',
    'Captura GIS': 'GIS capture',
    'Crear capa geográfica': 'Create geographic layer',
    'Haz clic en el mapa para crear puntos. ConvertToMap asigna automáticamente municipio, departamento, códigos y coordenadas; tú agregas los campos que necesites.': 'Click the map to create points. ConvertToMap automatically assigns municipality, department, codes, and coordinates; you add the fields you need.',
    'Puntos · V1': 'Points · V1',
    '1. Define los campos': '1. Define the fields',
    'Los datos territoriales se agregan automáticamente.': 'Territorial data is added automatically.',
    '+ Agregar campo': '+ Add field',
    'Puedes empezar sin campos adicionales y agregarlos después.': 'You can start without additional fields and add them later.',
    'Quitar': 'Remove',
    '2. Crea puntos': '2. Create points',
    'Activa el modo de captura y haz clic sobre el mapa.': 'Enable capture mode and click on the map.',
    '● Agregar punto: activo': '● Add point: active',
    'Activar agregar punto': 'Enable add point',
    'Puntos creados': 'Points created',
    'Limpiar todos los puntos': 'Clear all points',
    '3. Descargar capa': '3. Download layer',
    'Generando…': 'Generating…',
    'GeoJSON y CSV se generan en tu navegador. SHP, GPKG y KML se convierten mediante la API de ConvertToMap.': 'GeoJSON and CSV are generated in your browser. SHP, GPKG, and KML are converted through the ConvertToMap API.',
    'Mapa de captura': 'Capture map',
    'Fuente territorial: IDEG · SEGEPLAN': 'Territorial source: IDEG · SEGEPLAN',
    'Punto seleccionado': 'Selected point',
    'Fuera de límites municipales': 'Outside municipal boundaries',
    'Sin departamento asignado': 'No department assigned',
    'Eliminar punto': 'Delete point',
    'Tabla de atributos': 'Attribute table',
    'Selecciona una fila para editar sus datos.': 'Select a row to edit its data.',
    'Municipio': 'Municipality',
    'Departamento': 'Department',
    'Latitud': 'Latitude',
    'Longitud': 'Longitude',
    'Punto': 'Point',
    'Fuera de límite': 'Outside boundary',
    'Mapa gris': 'Gray map',
    'Calles': 'Streets',
    'Topográfico': 'Topographic',
    'Texto': 'Text',
    'Número': 'Number',
    'Fecha': 'Date',
    'Sí / No': 'Yes / No',
    'Sí': 'Yes',
    'No': 'No',
    'País': 'Country',
    'Nivel geográfico': 'Geographic level',
    'Archivo CSV': 'CSV file',
    'Descargar ejemplo': 'Download example',
    'Crear CSV': 'Create CSV',
    'Cerrar creador': 'Close builder',
    'Columna territorial': 'Territorial column',
    'Formatos de salida': 'Output formats',
    'Procesar y descargar': 'Process and download',
    'Procesando…': 'Processing…',
    'Arrastra tu CSV aquí': 'Drag your CSV here',
    'o haz clic para seleccionarlo': 'or click to select it',
    'Fuente:': 'Source:',
    'Web y GIS': 'Web and GIS',
    'Formato GIS moderno': 'Modern GIS format',
    'Google Earth': 'Google Earth',
    'QGIS y ArcGIS': 'QGIS and ArcGIS'
  };

  const patterns = [
    [/^(\d+) seleccionados$/, '$1 selected'],
    [/^Primeras (\d+) filas$/, 'First $1 rows'],
    [/^(\d+) territorios$/, '$1 territories'],
    [/^Descargar (.+)$/, 'Download $1'],
    [/^Límites de (.+) preparados para mapas, análisis y conversiones GIS\.$/, '$1 boundaries prepared for maps, analysis, and GIS conversions.'],
    [/^Punto agregado en (.+)\.$/, 'Point added in $1.'],
    [/^Punto agregado fuera de los límites municipales disponibles\.$/, 'Point added outside the available municipal boundaries.'],
    [/^Campo “(.+)” agregado\.$/, 'Field “$1” added.'],
    [/^Escribe un nombre válido para el campo\.$/, 'Enter a valid field name.'],
    [/^Ese nombre de campo ya existe o está reservado\.$/, 'That field name already exists or is reserved.'],
    [/^No fue posible cargar la capa de municipios\.$/, 'The municipality layer could not be loaded.'],
    [/^No fue posible cargar el catálogo de países\.$/, 'The country catalog could not be loaded.'],
    [/^No fue posible cargar la capa de límites\.$/, 'The boundary layer could not be loaded.'],
    [/^No fue posible exportar la capa\.$/, 'The layer could not be exported.']
  ];

  const originalText = new WeakMap();
  const originalAttrs = new WeakMap();
  let applying = false;

  function translateString(value) {
    const trimmed = value.trim();
    if (!trimmed) return value;
    let translated = exact[trimmed];
    if (!translated) {
      for (const [regex, replacement] of patterns) {
        if (regex.test(trimmed)) {
          translated = trimmed.replace(regex, replacement);
          break;
        }
      }
    }
    if (!translated) return value;
    const leading = value.match(/^\s*/)?.[0] || '';
    const trailing = value.match(/\s*$/)?.[0] || '';
    return `${leading}${translated}${trailing}`;
  }

  function processTextNode(node) {
    if (!originalText.has(node)) originalText.set(node, node.nodeValue);
    const source = originalText.get(node);
    const next = language === 'en' ? translateString(source) : source;
    if (node.nodeValue !== next) node.nodeValue = next;
  }

  function processElement(element) {
    if (!(element instanceof Element)) return;
    const attrs = ['placeholder', 'aria-label', 'title'];
    if (!originalAttrs.has(element)) {
      const saved = {};
      attrs.forEach((name) => { if (element.hasAttribute(name)) saved[name] = element.getAttribute(name); });
      originalAttrs.set(element, saved);
    }
    const saved = originalAttrs.get(element);
    Object.entries(saved).forEach(([name, source]) => {
      const next = language === 'en' ? translateString(source) : source;
      if (element.getAttribute(name) !== next) element.setAttribute(name, next);
    });
  }

  function applyTranslations(root = document.body) {
    if (!root || applying) return;
    applying = true;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (parent && !['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(parent.tagName) && !parent.closest('#ctm-language-switcher')) processTextNode(node);
    }
    if (root instanceof Element) processElement(root);
    root.querySelectorAll?.('*').forEach((el) => {
      if (!el.closest('#ctm-language-switcher')) processElement(el);
    });
    document.documentElement.lang = language;
    document.title = language === 'en'
      ? 'ConvertToMap · Convert your data into GIS maps'
      : 'ConvertToMap · Convierte tus datos en mapas GIS';
    applying = false;
  }

  function updateMeta() {
    const values = language === 'en' ? {
      description: 'Convert CSV files into GIS layers and download Shapefile, GeoJSON, GeoPackage, or KML.',
      title: 'ConvertToMap · Convert CSV into GIS layers',
      socialDescription: 'Convert territorial data into GIS layers and download Shapefile, GeoJSON, GeoPackage, or KML.',
      alt: 'ConvertToMap, CSV to GIS layer converter'
    } : {
      description: 'Convierte archivos CSV en capas GIS y descarga Shapefile, GeoJSON, GeoPackage o KML.',
      title: 'ConvertToMap · Convierte CSV en capas GIS',
      socialDescription: 'Convierte datos territoriales en capas GIS y descarga Shapefile, GeoJSON, GeoPackage o KML.',
      alt: 'ConvertToMap, conversor de CSV a capas GIS'
    };
    document.querySelector('meta[name="description"]')?.setAttribute('content', values.description);
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', values.title);
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', values.socialDescription);
    document.querySelector('meta[property="og:image:alt"]')?.setAttribute('content', values.alt);
    document.querySelector('meta[name="twitter:title"]')?.setAttribute('content', values.title);
    document.querySelector('meta[name="twitter:description"]')?.setAttribute('content', values.socialDescription);
  }

  function injectSwitcher() {
    if (document.getElementById('ctm-language-switcher')) return;
    const headerRow = document.querySelector('header > div');
    if (!headerRow) return;
    const nav = headerRow.querySelector('nav');
    const wrapper = document.createElement('div');
    wrapper.id = 'ctm-language-switcher';
    wrapper.style.cssText = 'display:flex;align-items:center;gap:4px;margin-left:auto;border:1px solid #e2e8f0;border-radius:10px;padding:3px;background:#fff;flex-shrink:0';
    wrapper.setAttribute('aria-label', language === 'en' ? 'Language' : 'Idioma');

    ['es', 'en'].forEach((code) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = code.toUpperCase();
      button.dataset.lang = code;
      button.style.cssText = 'border:0;border-radius:7px;padding:6px 8px;font-size:12px;font-weight:700;cursor:pointer;line-height:1;background:transparent;color:#64748b';
      button.addEventListener('click', () => setLanguage(code));
      wrapper.appendChild(button);
    });

    if (nav) headerRow.insertBefore(wrapper, nav);
    else headerRow.appendChild(wrapper);
    paintSwitcher();
  }

  function paintSwitcher() {
    document.querySelectorAll('#ctm-language-switcher button').forEach((button) => {
      const active = button.dataset.lang === language;
      button.style.background = active ? '#4f46e5' : 'transparent';
      button.style.color = active ? '#fff' : '#64748b';
      button.setAttribute('aria-pressed', String(active));
    });
    const wrapper = document.getElementById('ctm-language-switcher');
    if (wrapper) wrapper.setAttribute('aria-label', language === 'en' ? 'Language' : 'Idioma');
  }

  function setLanguage(next) {
    if (!supported.includes(next)) return;
    language = next;
    localStorage.setItem(STORAGE_KEY, language);
    applyTranslations();
    updateMeta();
    paintSwitcher();
    window.dispatchEvent(new CustomEvent('ctm-language-change', { detail: { language } }));
    if (typeof window.gtag === 'function') window.gtag('event', 'language_change', { language });
  }

  const observer = new MutationObserver(() => {
    if (applying) return;
    injectSwitcher();
    applyTranslations();
  });

  const start = () => {
    injectSwitcher();
    applyTranslations();
    updateMeta();
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'aria-label', 'title'] });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();

  window.ConvertToMapLanguage = { get: () => language, set: setLanguage };
})();
