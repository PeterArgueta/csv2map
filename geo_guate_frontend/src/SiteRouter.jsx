import React, { useEffect } from 'react';
import App from './App';
import { CrearCapaPuntos } from './components/CrearCapaPuntos';

function NavEnhancer() {
  useEffect(() => {
    const nav = document.querySelector('header nav');
    if (!nav || nav.querySelector('[data-crear-capa-link]')) return;
    const link = document.createElement('a');
    link.href = '/crear-capa';
    link.textContent = 'Crear capa';
    link.dataset.crearCapaLink = 'true';
    link.className = 'rounded-lg px-2.5 py-2 transition sm:px-3 hover:bg-white hover:text-slate-900';
    nav.insertBefore(link, nav.children[1] || null);
  }, []);
  return null;
}

function CrearCapaLayout() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-[1000] border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <a href="/" className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-600 text-sm font-black text-white">CTM</div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">ConvertToMap</h1>
              <p className="text-xs font-medium text-slate-500">Conversor de datos</p>
            </div>
          </a>
          <nav className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 text-xs font-semibold text-slate-600 sm:text-sm">
            <a href="/" className="rounded-lg px-2.5 py-2 transition sm:px-3 hover:bg-white hover:text-slate-900">Convertir</a>
            <a href="/crear-capa" className="rounded-lg bg-white px-2.5 py-2 text-slate-900 shadow-sm transition sm:px-3">Crear capa</a>
            <a href="/capas" className="rounded-lg px-2.5 py-2 transition sm:px-3 hover:bg-white hover:text-slate-900">Capas</a>
            <a href="/proyectos" className="rounded-lg px-2.5 py-2 transition sm:px-3 hover:bg-white hover:text-slate-900">Proyectos</a>
          </nav>
        </div>
      </header>
      <CrearCapaPuntos />
      <footer className="border-t border-slate-200 bg-white py-5 text-center text-sm text-slate-500">© {new Date().getFullYear()} ConvertToMap</footer>
    </div>
  );
}

export default function SiteRouter() {
  const isCreateLayer = window.location.pathname === '/crear-capa' || window.location.pathname.startsWith('/crear-capa/');
  if (isCreateLayer) return <CrearCapaLayout />;
  return (
    <>
      <NavEnhancer />
      <App />
    </>
  );
}
