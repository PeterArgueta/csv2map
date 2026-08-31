(() => {
  const SOURCE_URL = 'https://ideg.segeplan.gob.gt/geoportal/';

  const addSources = () => {
    const heading = Array.from(document.querySelectorAll('h2')).find((node) => node.textContent.trim() === 'Capas de Guatemala');
    if (!heading) return;

    const main = heading.closest('main');
    if (!main) return;

    const cards = Array.from(main.querySelectorAll('article'));
    cards.forEach((card) => {
      const title = card.querySelector('h3')?.textContent.trim();
      if (!['Departamentos', 'Municipios'].includes(title)) return;
      if (card.querySelector('[data-layer-source]')) return;

      const source = document.createElement('p');
      source.dataset.layerSource = 'ideg-segeplan';
      source.className = 'mt-3 text-xs leading-5 text-slate-500';
      source.append('Fuente: ');

      const link = document.createElement('a');
      link.href = SOURCE_URL;
      link.target = '_blank';
      link.rel = 'noreferrer';
      link.className = 'font-semibold text-indigo-600 hover:text-indigo-800 hover:underline';
      link.textContent = 'IDEG · SEGEPLAN';

      source.appendChild(link);
      const description = Array.from(card.querySelectorAll('p')).find((node) => node.textContent.includes('Guatemala'));
      (description || card.firstElementChild)?.insertAdjacentElement('afterend', source);
    });
  };

  const observer = new MutationObserver(addSources);
  window.addEventListener('DOMContentLoaded', () => {
    addSources();
    observer.observe(document.body, { childList: true, subtree: true });
  });
})();
