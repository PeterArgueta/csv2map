import fs from 'node:fs';
import path from 'node:path';
import { SEO_ROUTES } from '../src/siteMeta.js';

const root = process.cwd();
const distDir = path.join(root, 'dist');
const sitemapPath = path.join(root, 'public', 'sitemap.xml');
const catalogPath = path.join(root, 'public', 'countries', 'catalog.json');
const checkAssets = process.argv.includes('--assets');

const fail = (message) => {
  console.error(`Site link QA failed: ${message}`);
  process.exitCode = 1;
};

const existsNonEmpty = (filePath) => {
  try {
    return fs.statSync(filePath).isFile() && fs.statSync(filePath).size > 0;
  } catch {
    return false;
  }
};

if (!existsNonEmpty(path.join(distDir, 'index.html'))) fail('dist/index.html is missing');
if (!existsNonEmpty(path.join(distDir, '404.html'))) fail('dist/404.html is missing');

const routePaths = new Set(SEO_ROUTES.map((route) => route.path));
routePaths.add('/');
routePaths.add('/geoportal');

const sitemap = fs.readFileSync(sitemapPath, 'utf8');
for (const route of SEO_ROUTES) {
  const url = `https://converttomap.com${route.path}`;
  if (!sitemap.includes(`<loc>${url}</loc>`)) {
    fail(`sitemap is missing ${url}`);
  }

  const htmlPath = path.join(distDir, route.path.replace(/^\//, ''), 'index.html');
  if (!existsNonEmpty(htmlPath)) {
    fail(`generated route page is missing: ${route.path}`);
    continue;
  }

  const html = fs.readFileSync(htmlPath, 'utf8');
  const meta = route.es;
  if (!html.includes(`<title>${meta.title}</title>`)) fail(`${route.path}: incorrect title`);
  if (!html.includes(`href="${url}"`)) fail(`${route.path}: incorrect canonical`);
  if (!html.includes(meta.description.replaceAll('&', '&amp;').replaceAll('"', '&quot;'))) {
    fail(`${route.path}: description not found in generated HTML`);
  }
}

// Check literal internal links in JSX source against the known route map.
const srcDir = path.join(root, 'src');
const sourceFiles = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(jsx|js)$/.test(entry.name)) sourceFiles.push(full);
  }
};
walk(srcDir);

for (const filePath of sourceFiles) {
  const source = fs.readFileSync(filePath, 'utf8');
  const hrefPattern = /href=["'](\/[^"'?#]*)["']/g;
  for (const match of source.matchAll(hrefPattern)) {
    const href = match[1].replace(/\/$/, '') || '/';
    const staticAsset = /^\/(countries|downloads|assets)\//.test(href) || /^\/(favicon\.svg|robots\.txt|sitemap\.xml)$/.test(href);
    if (!staticAsset && !routePaths.has(href)) {
      fail(`${path.relative(root, filePath)} contains unknown internal link ${match[1]}`);
    }
  }

  const externalPattern = /href=["'](https?:\/\/[^"']+)["']/g;
  for (const match of source.matchAll(externalPattern)) {
    try {
      const parsed = new URL(match[1]);
      if (parsed.protocol !== 'https:') fail(`${path.relative(root, filePath)} uses non-HTTPS external link ${match[1]}`);
    } catch {
      fail(`${path.relative(root, filePath)} contains invalid external URL ${match[1]}`);
    }
  }
}

// Verify static assets directly referenced from built HTML.
const indexHtml = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
for (const match of indexHtml.matchAll(/(?:src|href)="(\/[^"#?]+)"/g)) {
  const urlPath = match[1];
  if (urlPath === '/') continue;
  const local = path.join(distDir, urlPath.replace(/^\//, ''));
  if (!existsNonEmpty(local)) fail(`built HTML references missing asset ${urlPath}`);
}

if (checkAssets) {
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  for (const country of catalog.countries || []) {
    for (const layer of country.levels || []) {
      const candidates = [
        layer.map_url,
        layer.data_url,
        layer.metadata_url,
        ...Object.values(layer.downloads || {})
      ].filter((value) => typeof value === 'string' && value.startsWith('/'));

      for (const urlPath of candidates) {
        const local = path.join(distDir, urlPath.replace(/^\//, ''));
        if (!existsNonEmpty(local)) {
          fail(`${country.code}/${layer.id} references missing published asset ${urlPath}`);
        }
      }
    }
  }
}

if (!process.exitCode) {
  console.log(`Site link QA OK: ${SEO_ROUTES.length} routes, sitemap, 404 and internal links verified${checkAssets ? ', including GIS assets' : ''}.`);
}
