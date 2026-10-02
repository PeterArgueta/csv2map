import React from 'react';

export function NotFoundPage({ language = 'es' }) {
  const en = language === 'en';

  return (
    <main className="grid min-h-[calc(100vh-64px)] place-items-center px-4 py-10">
      <section className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-10">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-indigo-50 text-2xl font-black text-indigo-700">
          404
        </div>
        <p className="mt-6 text-xs font-black uppercase tracking-[0.18em] text-indigo-600">
          {en ? 'Page not found' : 'Página no encontrada'}
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
          {en ? 'This route does not exist' : 'Esta ruta no existe'}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-slate-600">
          {en
            ? 'The address may be incorrect or the page may have moved. You can return to the map or continue with the GIS tools.'
            : 'La dirección puede ser incorrecta o la página pudo cambiar de ubicación. Puedes volver al mapa o continuar con las herramientas GIS.'}
        </p>

        <div className="mt-7 flex flex-col justify-center gap-2 sm:flex-row">
          <a href="/geoportal" className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-indigo-700">
            {en ? 'Go to Geoportal' : 'Ir al Geoportal'}
          </a>
          <a href="/convertir-formatos" className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700">
            {en ? 'Open converter' : 'Abrir convertidor'}
          </a>
        </div>
      </section>
    </main>
  );
}
