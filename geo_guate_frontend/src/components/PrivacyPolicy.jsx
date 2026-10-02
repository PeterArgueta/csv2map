import React from 'react';

const sections = {
  es: {
    eyebrow: 'Privacidad y datos',
    title: 'Política de privacidad',
    intro: 'Esta política explica qué información procesa ConvertToMap, para qué se utiliza y cómo se maneja cuando utilizas el sitio y sus herramientas GIS.',
    updated: 'Última actualización: 1 de octubre de 2026',
    items: [
      {
        title: '1. Alcance',
        body: 'ConvertToMap es una herramienta web para visualizar, georreferenciar, convertir y descargar datos geográficos. Esta política aplica a converttomap.com y a las operaciones realizadas a través de api.converttomap.com.'
      },
      {
        title: '2. Archivos que subes',
        body: 'Cuando utilizas funciones de conversión o georreferenciación, el archivo que seleccionas se envía al backend para ejecutar la operación solicitada. El código del servicio procesa esos archivos en espacios de trabajo temporales. Al finalizar una respuesta de descarga, la eliminación del espacio temporal se programa como tarea de limpieza; en los errores controlados también se elimina el espacio temporal. ConvertToMap no utiliza esos archivos para construir perfiles publicitarios.'
      },
      {
        title: '3. Analítica de uso',
        body: 'El sitio utiliza Google Analytics para comprender el uso general del producto, por ejemplo páginas visitadas y acciones funcionales como descargas o conversiones completadas. Google puede procesar información técnica de acuerdo con sus propias condiciones y políticas. ConvertToMap utiliza esta información para mantenimiento, medición de uso y mejora del servicio.'
      },
      {
        title: '4. Preferencias locales',
        body: 'La preferencia de idioma (español o inglés) se guarda en el almacenamiento local del navegador para mantener tu selección entre visitas. Puedes eliminar esta información desde las opciones de almacenamiento o datos del sitio de tu navegador.'
      },
      {
        title: '5. Proveedores y enlaces externos',
        body: 'ConvertToMap utiliza infraestructura de terceros para alojamiento, analítica, mapas base y fuentes de datos. Algunos enlaces de fuentes llevan a sitios externos como OpenStreetMap, Geofabrik o geoBoundaries. Sus políticas de privacidad son independientes de ConvertToMap.'
      },
      {
        title: '6. Seguridad y limitaciones',
        body: 'Se aplican límites de tamaño y validaciones de formato a los archivos procesados. Aun así, ningún servicio conectado a Internet puede garantizar seguridad absoluta. Evita subir información confidencial, datos personales sensibles o archivos que no sean necesarios para la operación GIS que deseas realizar.'
      },
      {
        title: '7. Cambios a esta política',
        body: 'Esta política puede actualizarse cuando cambien las funciones del sitio, los proveedores técnicos o las prácticas de tratamiento de datos. La fecha de actualización se mostrará en esta página.'
      }
    ],
    contactTitle: 'Contacto',
    contactBody: 'Para consultas sobre el proyecto o esta política puedes utilizar el repositorio oficial de ConvertToMap en GitHub.',
    back: 'Volver al Geoportal',
    repository: 'Repositorio oficial'
  },
  en: {
    eyebrow: 'Privacy and data',
    title: 'Privacy policy',
    intro: 'This policy explains what information ConvertToMap processes, why it is used, and how it is handled when you use the website and its GIS tools.',
    updated: 'Last updated: October 1, 2026',
    items: [
      {
        title: '1. Scope',
        body: 'ConvertToMap is a web tool for viewing, georeferencing, converting and downloading geographic data. This policy applies to converttomap.com and operations performed through api.converttomap.com.'
      },
      {
        title: '2. Files you upload',
        body: 'When you use conversion or georeferencing features, the selected file is sent to the backend to perform the requested operation. The service code processes these files in temporary workspaces. After a download response is prepared, workspace removal is scheduled as a cleanup task; handled error paths also remove the temporary workspace. ConvertToMap does not use these files to build advertising profiles.'
      },
      {
        title: '3. Usage analytics',
        body: 'The site uses Google Analytics to understand general product usage, including pages visited and functional actions such as downloads or completed conversions. Google may process technical information under its own terms and policies. ConvertToMap uses this information for maintenance, usage measurement and service improvement.'
      },
      {
        title: '4. Local preferences',
        body: 'Your language preference (Spanish or English) is stored in browser local storage so the selection persists between visits. You can remove it using your browser site-data or storage controls.'
      },
      {
        title: '5. Providers and external links',
        body: 'ConvertToMap uses third-party infrastructure for hosting, analytics, base maps and data sources. Some source links lead to external sites such as OpenStreetMap, Geofabrik or geoBoundaries. Their privacy policies are independent from ConvertToMap.'
      },
      {
        title: '6. Security and limitations',
        body: 'File-size limits and format validation are applied to processed files. However, no Internet-connected service can guarantee absolute security. Avoid uploading confidential information, sensitive personal data or files that are not needed for the GIS operation you want to perform.'
      },
      {
        title: '7. Changes to this policy',
        body: 'This policy may be updated when website features, technical providers or data-processing practices change. The update date will be shown on this page.'
      }
    ],
    contactTitle: 'Contact',
    contactBody: 'For questions about the project or this policy, you can use the official ConvertToMap GitHub repository.',
    back: 'Back to Geoportal',
    repository: 'Official repository'
  }
};

export function PrivacyPolicy({ language = 'es' }) {
  const t = sections[language === 'en' ? 'en' : 'es'];

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
