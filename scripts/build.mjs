// Pre-renders the design-tool pages in source/*.dc.html into plain static HTML
// at the repo root, so the live site needs no React, Babel or eval().
//
//   npm run build
//
// Edit the pages in source/, then rebuild and commit the generated files.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parseHTML } from 'linkedom';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'source');

const TITLES = {
  'Home': 'Kalki Materials — Architectural surfaces for Aruba, Bonaire & Curaçao',
  'About': 'About — Kalki Materials',
  'Contact': 'Contact — Kalki Materials',
  'FB Hout': 'FB Hout, engineered oak — Kalki Materials',
  'Mas Maya': 'Mas Maya, lime plaster — Kalki Materials',
  'Tarimatec': 'Tarimatec, exterior system — Kalki Materials',
  'Wow Design': 'Wow Design, porcelain — Kalki Materials',
};

// Google Analytics 4 measurement ID.
const GA_ID = 'G-SS20NMKHQG';

// Meta descriptions, used by search engines and AI assistants.
const DESCRIPTIONS = {
  'Home': 'Kalki Materials supplies architects, interior designers and contractors in Aruba, Bonaire and Curaçao with four European surface lines: engineered oak, limestone plaster, composite decking and cladding, and pool porcelain.',
  'About': 'Kalki Materials is a curated B2B material distributor for the ABC islands, bringing four European manufacturers into one relationship with specification support, import and delivery.',
  'Contact': 'Request the Kalki Materials catalogue or physical samples, or tell us about your project in Aruba, Bonaire or Curaçao.',
  'FB Hout': 'FB Hout engineered European oak for floors, walls and ceilings, built for humid coastal climates. Supplied in Aruba, Bonaire and Curaçao by Kalki Materials.',
  'Mas Maya': 'Mas Maya hand-applied limestone plaster: one seamless, breathable, water-resistant surface from floor to pool. Supplied in Aruba, Bonaire and Curaçao by Kalki Materials.',
  'Tarimatec': 'Tarimatec decking, ventilated façade cladding and screens in Ecofiber Stone Composite, maintenance-free for sun, rain and salt air. Supplied in Aruba, Bonaire and Curaçao by Kalki Materials.',
  'Wow Design': 'Wow Design small-format wellness porcelain for pools, terraces and bathrooms, plus Icon and Reef stoneware. Supplied in Aruba, Bonaire and Curaçao by Kalki Materials.',
};

// Structured data describing the business, on the Home page.
const ORGANIZATION = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Kalki Materials',
  url: 'https://www.kalkimaterials.com/',
  email: 'Kalkimaterials@gmail.com',
  description: 'Curated architectural material distributor for Aruba, Bonaire and Curaçao, supplying engineered oak, limestone plaster, composite exterior systems and pool porcelain from four European manufacturers.',
  parentOrganization: { '@type': 'Organization', name: 'IDEA II B.V.' },
  areaServed: ['Aruba', 'Bonaire', 'Curaçao'].map(name => ({ '@type': 'Place', name })),
};

// sc-if conditions that change after load. They are rendered into the page
// (shown or hidden) and toggled by site.js; every other condition is static.
const DYNAMIC = new Set(['sent', 'notSent', 'panelOpen', 'mobileMenuVisible', 'menuOpen', 'menuClosed', 'accOpen']);
// Conditions that depend only on viewport width are handled with CSS.
const RESPONSIVE = { isDesktop: 'only-desktop', isMobile: 'only-mobile' };

// Photos dropped into <image-slot>s in Claude Design live in this sidecar as
// data URLs. They are written out to assets/finishes/ and the slots become
// plain <img> tags, so the live site needs neither image-slot.js nor the
// 800 KB sidecar.
const SLOTS_FILE = join(SRC, '.image-slots.state.json');
const SLOTS = existsSync(SLOTS_FILE) ? JSON.parse(readFileSync(SLOTS_FILE, 'utf8')) : {};
const FINISHES = join(ROOT, 'assets', 'finishes');

function webpSize(buf) {
  const chunk = buf.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)];
  if (chunk === 'VP8L') {
    const b = buf.readUInt32LE(21);
    return [1 + (b & 0x3fff), 1 + ((b >> 14) & 0x3fff)];
  }
  if (chunk === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
  throw new Error('unknown WebP chunk ' + chunk);
}

// Turns one image slot into an <img>, reproducing the pan the user set in
// Claude Design (stored as the image centre's offset in frame-%) with
// object-position. frameAspect is the slot's width/height.
function slotImage(document, node, frameAspect) {
  const id = node.getAttribute('id');
  let v = SLOTS[id];
  if (typeof v === 'string') v = { u: v };
  if (!v || !v.u) return null;
  const m = /^data:image\/(\w+);base64,(.*)$/.exec(v.u);
  if (!m) throw new Error('slot ' + id + ': unsupported data URL');
  const buf = Buffer.from(m[2], 'base64');
  mkdirSync(FINISHES, { recursive: true });
  const name = `${id}.${m[1]}`;
  writeFileSync(join(FINISHES, name), buf);

  const pos = (offset, overflowRatio) => {
    const max = Math.max(0, (overflowRatio - 1) * 50);
    return max > 0 ? Math.min(100, Math.max(0, 50 - (offset || 0) * 50 / max)) : 50;
  };
  let px = 50, py = 50;
  if (m[1] === 'webp' && frameAspect) {
    const [iw, ih] = webpSize(buf);
    const ia = iw / ih;
    px = pos(v.x, Math.max(1, ia / frameAspect));
    py = pos(v.y, Math.max(1, frameAspect / ia));
  }
  if (v.s && v.s !== 1) console.warn(`slot ${id}: zoom ${v.s} is not reproduced`);

  const img = document.createElement('img');
  img.setAttribute('src', 'assets/finishes/' + name);
  img.setAttribute('alt', (node.getAttribute('placeholder') || '').replace(/^Photo needed — /, ''));
  img.setAttribute('loading', 'lazy');
  img.setAttribute('style', `display:block;width:100%;height:100%;aspect-ratio:3/2;object-fit:cover;object-position:${+px.toFixed(2)}% ${+py.toFixed(2)}%`);
  return img;
}

function aspectOf(el) {
  const m = /aspect-ratio:\s*([\d.]+)\s*(?:\/\s*([\d.]+))?/.exec((el && el.getAttribute && el.getAttribute('style')) || '');
  return m ? parseFloat(m[1]) / (m[2] ? parseFloat(m[2]) : 1) : null;
}

function parseDc(file) {
  const text = readFileSync(join(SRC, file), 'utf8');
  const { document } = parseHTML(text);
  const dc = document.querySelector('x-dc');
  const script = document.querySelector('script[data-dc-script]');
  const props = {};
  if (script) {
    const spec = JSON.parse(script.getAttribute('data-props') || '{}');
    for (const [k, v] of Object.entries(spec)) if (!k.startsWith('$') && 'default' in v) props[k] = v.default;
  }
  return { template: dc.innerHTML, code: script ? script.textContent : '', props };
}

// Runs the component's renderVals() once with its default props to get the
// initial values the template binds to.
function computeVals(code, props) {
  if (!code.trim()) return {};
  class DCLogic { constructor(p) { this.props = p; } setState() {} }
  const window = { matchMedia: () => ({ matches: false, addEventListener() {} }), __resources: {} };
  const React = { createRef: () => ({ current: null }) };
  const Component = new Function('DCLogic', 'window', 'React', 'document', code + '\nreturn Component;')(DCLogic, window, React, {});
  return new Component(props).renderVals();
}

const EXPR = /\{\{\s*([^}]+?)\s*\}\}/g;
function lookup(expr, scope) {
  if (expr === 'true') return true;
  if (expr === 'false') return false;
  return expr.split('.').reduce((o, k) => (o == null ? undefined : o[k]), scope);
}
function interpolate(str, scope) {
  return str.replace(EXPR, (_, e) => { const v = lookup(e, scope); return v == null ? '' : String(v); });
}
function singleExpr(str) {
  const m = /^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/.exec(str);
  return m ? m[1] : null;
}

function makeRenderer(document, hoverCss) {
  const classFor = new Map();
  function stateClass(pseudo, css) {
    const key = pseudo + '|' + css;
    if (!classFor.has(key)) {
      const name = (pseudo === 'hover' ? 'h' : 'f') + classFor.size;
      classFor.set(key, name);
      const decls = css.split(';').map(s => s.trim()).filter(Boolean).map(d => d + ' !important').join(';');
      hoverCss.push(`.${name}:${pseudo}{${decls}}`);
    }
    return classFor.get(key);
  }

  function renderChildren(src, dest, scope, header) {
    for (const child of [...src.childNodes]) renderNode(child, dest, scope, header);
  }

  function renderNode(node, dest, scope, header) {
    if (node.nodeType === 3) { dest.appendChild(document.createTextNode(interpolate(node.textContent, scope))); return; }
    if (node.nodeType === 8) return;
    if (node.nodeType !== 1) return;
    const tag = node.localName;

    if (tag === 'sc-if') {
      const key = singleExpr(node.getAttribute('value'));
      if (RESPONSIVE[key]) {
        const w = document.createElement('dc-if');
        w.setAttribute('class', RESPONSIVE[key]);
        renderChildren(node, w, scope, header);
        dest.appendChild(w);
      } else if (DYNAMIC.has(key)) {
        const w = document.createElement('dc-if');
        w.setAttribute('data-if', key);
        if (!lookup(key, scope)) w.setAttribute('hidden', '');
        renderChildren(node, w, scope, header);
        dest.appendChild(w);
      } else if (lookup(key, scope)) {
        renderChildren(node, dest, scope, header);
      }
      return;
    }
    if (tag === 'sc-for') {
      const list = lookup(singleExpr(node.getAttribute('list')), scope) || [];
      const as = node.getAttribute('as');
      for (const item of list) renderChildren(node, dest, { ...scope, [as]: item }, header);
      return;
    }
    if (tag === 'image-slot') {
      const img = slotImage(document, node, aspectOf(node.parentNode));
      if (img) dest.appendChild(img);
      else console.warn(`slot ${node.getAttribute('id')}: no photo in source/.image-slots.state.json, left empty`);
      return;
    }
    if (tag === 'dc-import') {
      const wrap = document.createElement('div');
      wrap.setAttribute('style', node.getAttribute('style') || '');
      renderComponent(node.getAttribute('name'), { current: node.getAttribute('current') }, wrap);
      dest.appendChild(wrap);
      return;
    }

    const el = document.createElement(tag);
    const classes = [];
    for (const { name, value } of [...node.attributes]) {
      const lower = name.toLowerCase();
      if (lower.startsWith('hint-')) continue;
      if (lower === 'ref') { el.setAttribute('data-ref', singleExpr(value) || value); continue; }
      if (lower === 'onsubmit') { el.setAttribute('data-form', singleExpr(value) || ''); continue; }
      if (lower.startsWith('on')) continue; // wired up by site.js instead
      if (lower === 'style-hover' || lower === 'style-focus') {
        classes.push(stateClass(lower.slice(6), interpolate(value, scope)));
        continue;
      }
      const only = singleExpr(value);
      if (only != null) {
        const v = lookup(only, scope);
        if (v == null || v === false) continue;
        el.setAttribute(name, String(v));
      } else {
        el.setAttribute(name, interpolate(value, scope));
      }
    }
    if (classes.length) el.setAttribute('class', [el.getAttribute('class'), ...classes].filter(Boolean).join(' '));
    renderChildren(node, el, scope, header);
    dest.appendChild(el);
  }

  function renderComponent(name, overrides, dest) {
    const { template, code, props } = parseDc(name + '.dc.html');
    const vals = computeVals(code, { ...props, ...overrides });
    const { document: tdoc } = parseHTML(`<!DOCTYPE html><html><body>${template}</body></html>`);
    const body = tdoc.body;
    body.querySelectorAll('helmet').forEach(h => h.remove());
    renderChildren(body, dest, vals);
  }

  return { renderChildren, renderComponent };
}

const SHARED_CSS = [
  'dc-if{display:contents}',
  'dc-if[hidden]{display:none}',
  '@media (max-width:700px){.only-desktop{display:none !important}}',
  '@media (min-width:701px){.only-mobile{display:none !important}}',
  // Open states of the header's Materials buttons.
  'button[aria-controls="kalki-materials-panel"][aria-expanded="true"]{color:#FBF6EC !important}',
  'button[aria-controls="kalki-materials-panel"][aria-expanded="true"] svg,button[aria-controls="kalki-mobile-materials"][aria-expanded="true"] svg{transform:rotate(180deg) !important}',
];

function buildPage(file) {
  const base = file.replace(/\.dc\.html$/, '');
  const { template, code, props } = parseDc(file);
  const vals = computeVals(code, props);

  const { document } = parseHTML('<!DOCTYPE html><html lang="en"><head></head><body></body></html>');
  const { document: tdoc } = parseHTML(`<!DOCTYPE html><html><body>${template}</body></html>`);
  const hoverCss = [];
  const r = makeRenderer(document, hoverCss);

  const head = document.head;
  head.innerHTML = '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">';
  const gaLoader = document.createElement('script');
  gaLoader.setAttribute('async', '');
  gaLoader.setAttribute('src', 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID);
  head.appendChild(gaLoader);
  const gaInit = document.createElement('script');
  gaInit.textContent = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_ID}');`;
  head.appendChild(gaInit);
  const title = document.createElement('title');
  title.textContent = TITLES[base] || 'Kalki Materials';
  head.appendChild(title);
  const url = 'https://www.kalkimaterials.com/' + encodeURIComponent(file);
  const metas = [['name', 'description', DESCRIPTIONS[base]], ['property', 'og:title', title.textContent],
    ['property', 'og:description', DESCRIPTIONS[base]], ['property', 'og:url', url], ['property', 'og:type', 'website']];
  for (const [attr, key, content] of metas) {
    if (!content) continue;
    const m = document.createElement('meta');
    m.setAttribute(attr, key);
    m.setAttribute('content', content);
    head.appendChild(m);
  }
  const canonical = document.createElement('link');
  canonical.setAttribute('rel', 'canonical');
  canonical.setAttribute('href', url);
  head.appendChild(canonical);
  if (base === 'Home') {
    const ld = document.createElement('script');
    ld.setAttribute('type', 'application/ld+json');
    ld.textContent = JSON.stringify(ORGANIZATION);
    head.appendChild(ld);
  }

  const helmet = tdoc.querySelector('helmet');
  if (helmet) {
    for (const child of [...helmet.childNodes]) {
      if (child.nodeType === 1 && child.localName === 'script' && /image-slot\.js$/.test(child.getAttribute('src') || '')) continue;
      if (child.nodeType === 1) head.appendChild(document.importNode ? document.importNode(child, true) : child.cloneNode(true));
    }
    helmet.remove();
  }

  r.renderChildren(tdoc.body, document.body, vals);

  const style = document.createElement('style');
  style.textContent = [...SHARED_CSS, ...hoverCss].join('\n');
  head.appendChild(style);
  const js = document.createElement('script');
  // Versioned URL so Cloudflare and browsers fetch the new file after each change.
  const ver = createHash('sha1').update(readFileSync(join(ROOT, 'site.js'))).digest('hex').slice(0, 8);
  js.setAttribute('src', 'site.js?v=' + ver);
  js.setAttribute('defer', '');
  head.appendChild(js);

  const html = '<!DOCTYPE html>\n' + document.documentElement.outerHTML + '\n';
  writeFileSync(join(ROOT, file), `<!-- Generated from source/${file} by scripts/build.mjs. Do not edit by hand. -->\n` + html);
  console.log('built', file);
}

const SITE_URL = 'https://www.kalkimaterials.com';
const pages = readdirSync(SRC).filter(f => f.endsWith('.dc.html') && f !== 'SiteHeader.dc.html').sort();
for (const file of pages) buildPage(file);

// sitemap.xml for search engines; Home first, then the material pages.
const order = f => (f === 'Home.dc.html' ? 0 : ['About.dc.html', 'Contact.dc.html'].includes(f) ? 2 : 1);
const urls = [...pages].sort((a, b) => order(a) - order(b) || a.localeCompare(b)).map(f =>
  `  <url>\n    <loc>${SITE_URL}/${encodeURIComponent(f)}</loc>\n    <priority>${['1.0', '0.8', '0.5'][order(f)]}</priority>\n  </url>`);
writeFileSync(join(ROOT, 'sitemap.xml'),
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls.join('\n') + '\n</urlset>\n');
console.log('built sitemap.xml');
