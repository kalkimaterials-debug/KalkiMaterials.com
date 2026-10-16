// Pre-renders the design-tool pages in source/*.dc.html into plain static HTML
// at the repo root, so the live site needs no React, Babel or eval().
//
//   npm run build
//
// Edit the pages in source/, then rebuild and commit the generated files.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
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

// sc-if conditions that change after load. They are rendered into the page
// (shown or hidden) and toggled by site.js; every other condition is static.
const DYNAMIC = new Set(['sent', 'notSent', 'panelOpen', 'mobileMenuVisible', 'menuOpen', 'menuClosed', 'accOpen']);
// Conditions that depend only on viewport width are handled with CSS.
const RESPONSIVE = { isDesktop: 'only-desktop', isMobile: 'only-mobile' };

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
  const title = document.createElement('title');
  title.textContent = TITLES[base] || 'Kalki Materials';
  head.appendChild(title);

  const helmet = tdoc.querySelector('helmet');
  if (helmet) {
    for (const child of [...helmet.childNodes]) {
      if (child.nodeType === 1) head.appendChild(document.importNode ? document.importNode(child, true) : child.cloneNode(true));
    }
    helmet.remove();
  }

  r.renderChildren(tdoc.body, document.body, vals);

  const style = document.createElement('style');
  style.textContent = [...SHARED_CSS, ...hoverCss].join('\n');
  head.appendChild(style);
  const js = document.createElement('script');
  js.setAttribute('src', 'site.js');
  js.setAttribute('defer', '');
  head.appendChild(js);

  const html = '<!DOCTYPE html>\n' + document.documentElement.outerHTML + '\n';
  writeFileSync(join(ROOT, file), `<!-- Generated from source/${file} by scripts/build.mjs. Do not edit by hand. -->\n` + html);
  console.log('built', file);
}

for (const file of readdirSync(SRC).filter(f => f.endsWith('.dc.html') && f !== 'SiteHeader.dc.html').sort()) {
  buildPage(file);
}
