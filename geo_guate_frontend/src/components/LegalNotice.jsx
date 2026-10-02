import React from 'react';

const content = {
  es: {
    eyebrow: 'Información legal',
    title: 'Aviso legal',
    intro: 'Este aviso establece las condiciones generales de uso de ConvertToMap y las limitaciones aplicables a la información, herramientas y datos geográficos disponibles en el sitio.',
    updated: 'Última actualización: 1 de octubre de 2026',
    items: [
      {
        title: '1. Naturaleza del servicio',
        body: 'ConvertToMap es un proyecto independiente que ofrece herramientas de visualización, conversión, georreferenciación y descarga de datos GIS. El servicio se proporciona como herramienta técnica y no sustituye la validación profesional u oficial que pueda requerir un análisis específico.'
      },
      {
        title: '2. Fuentes de datos',
        body: 'Las capas publicadas pueden provenir de organismos públicos, proyectos abiertos y proveedores externos. ConvertToMap identifica la fuente de cada conjunto de datos cuando está disponible. La inclusión de una capa no implica que ConvertToMap sea autor o propietario de los datos originales.'
      },
      {
        title: '3. Licencias y atribución',
        body: 'Cada conjunto de datos conserva las condiciones de licencia, atribución y reutilización establecidas por su fuente original. El usuario debe revisar la metadata y la fuente indicada antes de redistribuir o utilizar un conjunto de datos en productos oficiales, comerciales o derivados.'
      },
      {
        title: '4. Exactitud cartográfica',
        body: 'Los límites, carreteras, nombres, ubicaciones y demás elementos geográficos pueden contener generalizaciones, diferencias de escala, desactualizaciones o errores provenientes de la fuente. La representación de límites o territorios se ofrece con fines cartográficos y técnicos y no constituye una posición sobre soberanía, jurisdicción o disputas territoriales.'
      },
      {
        title: '5. Responsabilidad del usuario',
        body: 'El usuario es responsable de verificar que los archivos que carga y los resultados que descarga sean adecuados para su finalidad. Antes de tomar decisiones administrativas, legales, financieras, de ingeniería o de otra naturaleza relevante, deben contrastarse los datos con la fuente competente.'
      },
      {
        title: '6. Disponibilidad y cambios',
        body: 'ConvertToMap puede actualizar, sustituir o retirar funciones y conjuntos de datos para corregir errores, mejorar el servicio o responder a cambios en las fuentes. No se garantiza disponibilidad ininterrumpida ni compatibilidad permanente con servicios externos.'
      },
      {
        title: '7. Enlaces externos',
        body: 'Los enlaces a sitios de terceros se incluyen para identificar fuentes, documentación o servicios relacionados. ConvertToMap no controla el contenido ni la disponibilidad de esos sitios y no asume responsabilidad por cambios realizados por terceros.'
      }
    ],
    contactTitle: 'Proyecto y contacto',
    contactBody: 'El código y el historial técnico del proyecto están disponibles en el repositorio oficial de ConvertToMap.',
    repository: 'Abrir repositorio',
    back: 'Volver al Geoportal'
  },
  en: {
    eyebrow: 'Legal information',
    title: 'Legal notice',
    intro: 'This notice sets out the general conditions for using ConvertToMap and the limitations applicable to the geographic information, tools and datasets available on the site.',
    updated: 'Last updated: October 1, 2026',
    items: [
      {
        title: '1. Nature of the service',
        body: 'ConvertToMap is an independent project providing GIS visualization, conversion, georeferencing and download tools. The service is provided as a technical tool and does not replace professional or official validation that may be required for a specific analysis.'
      },
      {
        title: '2. Data sources',
        body: 'Published layers may originate from public agencies, open projects and external providers. ConvertToMap identifies the source of each dataset when available. Inclusion of a layer does not mean that ConvertToMap authored or owns the original data.'
      },
      {
        title: '3. Licenses and attribution',
        body: 'Each dataset retains the licensing, attribution and reuse conditions established by its original source. Users should review the metadata and stated source before redistributing or using a dataset in official, commercial or derivative products.'
      },
      {
        title: '4. Cartographic accuracy',
        body: 'Boundaries, roads, names, locations and other geographic elements may contain generalization, scale differences, outdated information or source errors. Territorial and boundary representations are provided for cartographic and technical purposes and do not constitute a position on sovereignty, jurisdiction or territorial disputes.'
      },
      {
        title: '5. User responsibility',
        body: 'Users are responsible for confirming that uploaded files and downloaded results are appropriate for their intended purpose. Before making administrative, legal, financial, engineering or other consequential decisions, data should be checked against the competent source.'
      },
      {
        title: '6. Availability and changes',
        body: 'ConvertToMap may update, replace or remove features and datasets to correct errors, improve the service or respond to changes in source data. Continuous availability or permanent compatibility with external services is not guaranteed.'
      },
      {
        title: '7. External links',
        body: 'Links to third-party websites are included to identify sources, documentation or related services. ConvertToMap does not control the content or availability of those sites and is not responsible for changes made by third parties.'
      }
    ],
    contactTitle: 'Project and contact',
    contactBody: 'The project code and technical history are available in the official ConvertToMap repository.',
    repository: 'Open repository',
    back: 'Back to Geoportal'
  }
};

export function LegalNotice({ language = 'es' }) {
  const t = content[language === 'en' ? 'en' : 'es'];

  return (
    <main className="min-h-full w-full px-3 py-5 sm:px-5 sm:py-8 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8 lg:p-10">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-indigo-600">{t.eyebrow}</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{t.title}</h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-600 sm:text-base">{t.intro}</p>
          <p className="mt-3 text-xs font-semibold text-slate-500">{t.updated}</p>

          <div className="mt-8 space-y-7">
            {t.items.map((item) => (
              <section key={item.title}>
                <h2 className="text-lg font-bold text-slate-900">{item.title}</h2>
                <p className="mt-2 text-sm leading-7 text-slate-600">{item.body}</p>
              </section>
            ))}

            <section className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 sm:p-5">
              <h2 className="text-lg font-bold text-slate-900">{t.contactTitle}</h2>
              <p className="mt-2 text-sm leading-7 text-slate-600">{t.contactBody}</p>
              <a
                href="https://github.com/PeterArgueta/csv2map"
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex text-sm font-bold text-indigo-700 hover:text-indigo-900 hover:underline"
              >
                {t.repository} ↗
              </a>
            </section>
          </div>

          <a href="/geoportal" className="mt-8 inline-flex rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-indigo-700">
            ← {t.back}
          </a>
        </div>
      </div>
    </main>
  );
}
