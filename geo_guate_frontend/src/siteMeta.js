export const SEO_BY_VIEW = {
  geoportal: {
    path: '/geoportal',
    es: {
      title: 'Geoportal GIS de Centroamérica | ConvertToMap',
      description: 'Explora, combina y descarga capas GIS de Guatemala, Panamá, El Salvador y otros países de Centroamérica en un geoportal interactivo.'
    },
    en: {
      title: 'Central America GIS Geoportal | ConvertToMap',
      description: 'Explore, combine and download GIS layers for Guatemala, Panama, El Salvador and other Central American countries in an interactive geoportal.'
    }
  },
  convertir: {
    path: '/georeferenciar',
    es: {
      title: 'Georreferenciar CSV y Excel en mapas GIS | ConvertToMap',
      description: 'Convierte datos territoriales de CSV o Excel en capas GIS y comprueba los resultados directamente sobre el mapa.'
    },
    en: {
      title: 'Georeference CSV and Excel on GIS maps | ConvertToMap',
      description: 'Convert territorial CSV or Excel data into GIS layers and verify the results directly on the map.'
    }
  },
  'crear-capa': {
    path: '/crear-capa',
    es: {
      title: 'Crear capas GIS desde puntos | ConvertToMap',
      description: 'Crea capas geográficas dibujando puntos en el mapa, agrega atributos y descarga el resultado en formatos GIS.'
    },
    en: {
      title: 'Create GIS layers from points | ConvertToMap',
      description: 'Create geographic layers by drawing points on the map, add attributes and download the result in GIS formats.'
    }
  },
  formatos: {
    path: '/convertir-formatos',
    es: {
      title: 'Convertir SHP, GeoJSON, KML y GeoPackage | ConvertToMap',
      description: 'Convierte archivos entre Shapefile, GeoJSON, GeoPackage, KML y CSV, o crea puntos y polígonos desde coordenadas.'
    },
    en: {
      title: 'Convert SHP, GeoJSON, KML and GeoPackage | ConvertToMap',
      description: 'Convert files between Shapefile, GeoJSON, GeoPackage, KML and CSV, or create points and polygons from coordinates.'
    }
  },
  capas: {
    path: '/capas',
    es: {
      title: 'Descargar Shapefiles y capas GIS | ConvertToMap',
      description: 'Descarga capas geográficas por país en GeoJSON, Shapefile, GeoPackage y KML con fuente y metadata identificadas.'
    },
    en: {
      title: 'Download Shapefiles and GIS layers | ConvertToMap',
      description: 'Download geographic layers by country in GeoJSON, Shapefile, GeoPackage and KML with identified source and metadata.'
    }
  },
  proyectos: {
    path: '/proyectos',
    es: {
      title: 'Herramientas y proyectos | ConvertToMap',
      description: 'Explora herramientas complementarias y proyectos relacionados con datos, mapas y contenido digital de ConvertToMap.'
    },
    en: {
      title: 'Tools and projects | ConvertToMap',
      description: 'Explore complementary tools and projects related to data, maps and digital content from ConvertToMap.'
    }
  },
  privacidad: {
    path: '/privacidad',
    es: {
      title: 'Política de privacidad | ConvertToMap',
      description: 'Consulta cómo ConvertToMap procesa archivos temporales, preferencias del navegador y datos de analítica de uso.'
    },
    en: {
      title: 'Privacy policy | ConvertToMap',
      description: 'Learn how ConvertToMap processes temporary files, browser preferences and usage analytics data.'
    }
  },
  legal: {
    path: '/aviso-legal',
    es: {
      title: 'Aviso legal | ConvertToMap',
      description: 'Condiciones de uso, fuentes, atribución, licencias y limitaciones aplicables a las herramientas y datos GIS de ConvertToMap.'
    },
    en: {
      title: 'Legal notice | ConvertToMap',
      description: 'Terms of use, sources, attribution, licenses and limitations applicable to ConvertToMap GIS tools and data.'
    }
  }
};

export const SEO_ROUTES = Object.values(SEO_BY_VIEW);
