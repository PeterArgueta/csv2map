import fs from 'node:fs';
import path from 'node:path';
import { SEO_ROUTES } from '../src/siteMeta.js';

const distDir = path.resolve('dist');
const indexPath = path.join(distDir, 'index.html');
const baseHtml = fs.readFileSync(indexPath, 'utf8');

const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('"', '&quot;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;');

const replaceMeta = (html, selector, value) => {
  const escaped = escapeHtml(value);
  if (selector === 'title') {
    return html.replace(/<title>[^<]*<\/title>/, `<title>${escaped}</title>`);
  }
  if (selector === 'canonical') {
    return html.replace(/<link rel="canonical" href="[^"]*"\s*\/>/, `<link rel="canonical" href="${escaped}" />`);
  }
  const [kind, key] = selector.split(':');
  const attribute = kind === 'property' ? 'property' : 'name';
  const pattern = new RegExp(`<meta ${attribute}="${key}" content="[^"]*"\\s*\\/>`);
  return html.replace(pattern, `<meta ${attribute}="${key}" content="${escaped}" />`);
};

for (const route of SEO_ROUTES) {
  const meta = route.es;
  const canonical = `https://converttomap.com${route.path}`;
  let html = baseHtml;
  html = replaceMeta(html, 'title', meta.title);
  html = replaceMeta(html, 'name:description', meta.description);
  html = replaceMeta(html, 'canonical', canonical);
  html = replaceMeta(html, 'property:og:title', meta.title);
  html = replaceMeta(html, 'property:og:description', meta.description);
  html = replaceMeta(html, 'property:og:url', canonical);
  html = replaceMeta(html, 'name:twitter:title', meta.title);
  html = replaceMeta(html, 'name:twitter:description', meta.description);

  const routeDir = path.join(distDir, route.path.replace(/^\//, ''));
  fs.mkdirSync(routeDir, { recursive: true });
  fs.writeFileSync(path.join(routeDir, 'index.html'), html);
}

console.log(`Generated SEO HTML for ${SEO_ROUTES.length} routes.`);
