// Lifts the live chimcare.com homepage, saved as one self-contained HTML file, into the app.
//
//   node scripts/extract-home.mjs [path/to/home.html]      (default: ../home.html)
//
// Writes:
//   app/_home/content.ts   the page body (the Elementor document inside <main>), body classes, head meta, Yoast graph
//   public/home/home.css   every stylesheet the saved page carried, scoped under .wp-home (linked, not bundled)
//   public/home/*          images and fonts that were embedded as base64, plus the few CSS backgrounds the
//                          saved file still pointed at on www.chimcare.com (downloaded once)
//
// The markup is kept verbatim — same elements, classes and copy as production — so the page looks exactly like
// the saved one. What is removed is only what cannot run here: every <script> (WordPress, jQuery, Elementor,
// Gravity Forms, trackers), <noscript>, the Gravity Forms postback iframe, and Elementor's `elementor-invisible`
// (a JS entrance-animation gate that would otherwise leave sections hidden). The behaviour those scripts gave —
// menu toggle, sticky header, accordion, counters, map tooltip, form submit — is re-implemented in
// components/islands/HomeBehaviour.tsx.
//
// Scoping: WordPress CSS targets html/body and bare elements. Every selector is prefixed with .wp-home, and
// html/body/:root selectors map onto the wrapper, which carries the saved <body> classes. A selector whose first
// compound is a body class (e.g. `.elementor-kit-86311 h2`) is emitted for both the wrapper itself and its
// descendants. @keyframes are renamed `wph-*` so they can never replace an app animation of the same name.
// Hand-written fixes belong in app/_home/overrides.css, not here.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.resolve(process.argv[2] ?? path.join(root, '..', 'home.html'));
const outDir = path.join(root, 'app', '_home');
const assetDir = path.join(root, 'public', 'home');
const SCOPE = '.wp-home';
const ORIGIN = 'https://www.chimcare.com';

fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(assetDir, { recursive: true });

const html = fs.readFileSync(src, 'utf8');
const bodyAt = html.indexOf('<body');
if (bodyAt < 0) throw new Error(`${src}: no <body>`);
// Scripts go first: tag-manager code carries "<style" inside JS strings, which would otherwise read as CSS.
const head = html.slice(0, bodyAt).replace(/<script\b(?![^>]*application\/ld\+json)[\s\S]*?<\/script>/g, '');

// ---- assets -----------------------------------------------------------------------------------

const EXT = { 'svg+xml': 'svg', jpeg: 'jpg', 'x-icon': 'ico', 'font-woff': 'woff', 'x-font-woff': 'woff', 'font-woff2': 'woff2',
  'x-font-ttf': 'ttf', 'font-ttf': 'ttf', 'octet-stream': 'bin', 'vnd.ms-fontobject': 'eot' };
let written = 0;
function save(buf, ext) {
  const file = `${crypto.createHash('sha1').update(buf).digest('hex').slice(0, 12)}.${ext}`;
  const dest = path.join(assetDir, file);
  if (!fs.existsSync(dest)) {
    fs.writeFileSync(dest, buf);
    written++;
  }
  return `/home/${file}`;
}
const DATA_URI = /data:(image|font|application)\/([a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)/g;
const externaliseDataUris = (text) =>
  text.replace(DATA_URI, (_, _kind, type, b64) => save(Buffer.from(b64, 'base64'), EXT[type] ?? type));

const remote = new Map();
async function download(url) {
  if (remote.has(url)) return;
  try {
    const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 chimcare-web extract-home' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ext = (new URL(url).pathname.match(/\.([a-z0-9]+)$/i)?.[1] ?? 'bin').toLowerCase();
    remote.set(url, save(Buffer.from(await res.arrayBuffer()), ext));
  } catch (e) {
    console.warn(`  ! kept remote ${url} (${e.message})`);
    remote.set(url, url);
  }
}

// ---- CSS --------------------------------------------------------------------------------------

const styleBlocks = (text) => [...text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);

const bodyClasses = new Set((html.slice(bodyAt).match(/^<body[^>]*\sclass="([^"]*)"/)?.[1] ?? '').split(/\s+/).filter(Boolean));

/** Split a selector into its first compound and the remainder (which starts with its combinator). */
function firstCompound(sel) {
  let depth = 0, quote = '';
  for (let i = 0; i < sel.length; i++) {
    const ch = sel[i];
    if (quote) { if (ch === quote) quote = ''; continue; }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (depth === 0 && /[\s>+~]/.test(ch)) return [sel.slice(0, i), sel.slice(i).trim()];
  }
  return [sel, ''];
}
const join = (a, rest) => (rest ? `${a} ${rest}` : a);

function scopeSelector(raw) {
  let sel = raw.trim();
  let [first, rest] = firstCompound(sel);
  if (first === 'html' || first === ':root') {
    if (!rest) return [SCOPE];
    sel = rest.replace(/^>\s*/, '');
    [first, rest] = firstCompound(sel);
  } else if (/^(html|:root)[.:[#]/.test(first)) {
    // html.no-js, html[dir="rtl"] … — state the scoped page never has.
    return [];
  }
  if (/^body(?![\w-])/.test(first)) return [join(SCOPE + first.slice(4), rest)];
  if (first.startsWith('.') && [...first.matchAll(/\.([\w-]+)/g)].some((m) => bodyClasses.has(m[1]))) {
    return [join(SCOPE + first, rest), `${SCOPE} ${sel}`];
  }
  return [`${SCOPE} ${sel}`];
}

/** Split CSS into top-level statements by brace depth (strings and comments respected); stray `}` are dropped. */
function topLevelStatements(css) {
  const out = [];
  let depth = 0, start = 0, quote = '';
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote || ch === '\n') quote = ''; // an unclosed CSS string ends at the line break
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      i = end < 0 ? css.length : end + 1;
    } else if (ch === '{') depth++;
    else if (ch === '}') {
      if (depth === 0) {
        out.push(css.slice(start, i));
        start = i + 1;
      } else if (--depth === 0) {
        out.push(css.slice(start, i + 1));
        start = i + 1;
      }
    } else if (ch === ';' && depth === 0) {
      out.push(css.slice(start, i + 1));
      start = i + 1;
    }
  }
  out.push(css.slice(start));
  return out.filter((s) => s.trim());
}

/**
 * WordPress ships stylesheets with stray braces and unfilled template placeholders that browsers silently skip
 * but postcss rejects. A block that fails to parse is split into top-level statements and each one that still
 * fails is dropped — the same "ignore the invalid rule" recovery a browser applies.
 */
function parseLenient(css) {
  try {
    return postcss.parse(css);
  } catch (e) {
    if (e.name !== 'CssSyntaxError') throw e;
  }
  const root = postcss.root();
  for (const stmt of topLevelStatements(css)) {
    try {
      root.append(postcss.parse(stmt).nodes);
    } catch {
      console.warn(`  ! css: dropped invalid rule ${JSON.stringify(stmt.trim().slice(0, 90))}`);
    }
  }
  return root;
}
const BLOCK_BREAK = '\n/*__wph-block__*/\n';

async function buildCss(chunks) {
  let css = chunks.filter((c) => !c.includes('mouseflow')).join(BLOCK_BREAK);
  // Elementor leaves unfilled control placeholders (`text-align:{{VALUE}};`). A browser drops just that
  // declaration and keeps the rest of the rule, so do the same before parsing.
  css = css.replace(/[\w-]+\s*:[^;{}]*\{\{[A-Z_]+\}\}[^;{}]*;?/g, '');
  css = externaliseDataUris(css);
  const urls = new Set([...css.matchAll(/url\((["']?)(https?:)?\/\/www\.chimcare\.com(\/[^"')]+)\1\)/g)].map((m) => ORIGIN + m[3]));
  await Promise.all([...urls].map(download));
  css = css.replace(/url\((["']?)(?:https?:)?\/\/www\.chimcare\.com(\/[^"')]+)\1\)/g, (_, q, p) => `url(${q}${remote.get(ORIGIN + p)}${q})`);

  // Plugin and theme stylesheets reference their fonts and sprites relative to their own folder
  // (`../../../plugins/gravityforms/fonts/…`); all of them sit under /wp-content/. Download those too, keeping any
  // `#fragment` an SVG font or IE hack needs. The bundler would otherwise try to resolve them as modules.
  const RELATIVE = /url\((["']?)(?:\.\.\/)+((?:plugins|themes)\/[^"')?#]+)([?#][^"')]*)?\1\)/g;
  const relative = new Set([...css.matchAll(RELATIVE)].map((m) => `${ORIGIN}/wp-content/${m[2]}`));
  await Promise.all([...relative].map(download));
  css = css.replace(RELATIVE, (_, q, p, suffix = '') => {
    const hash = suffix.includes('#') ? suffix.slice(suffix.indexOf('#')) : '';
    return `url(${q}${remote.get(`${ORIGIN}/wp-content/${p}`)}${hash}${q})`;
  });
  // Anything else still relative has no meaning outside WordPress; point it at production rather than the bundler.
  css = css.replace(/url\((["']?)(?![a-z]+:|\/|#|["'])([^"')]+)\1\)/gi, (_, q, p) => `url(${q}${ORIGIN}/${p.replace(/^(\.\.\/)+/, '')}${q})`);

  const ast = postcss.root();
  for (const block of css.split(BLOCK_BREAK)) ast.append(parseLenient(block).nodes);
  const frames = new Set();
  ast.walkAtRules(/keyframes$/i, (r) => {
    frames.add(r.params.trim());
    r.params = `wph-${r.params.trim()}`;
  });
  const renameFrames = (v) => v.replace(/[\w-]+/g, (w) => (frames.has(w) ? `wph-${w}` : w));
  ast.walkDecls(/^(-webkit-)?animation(-name)?$/i, (d) => { d.value = renameFrames(d.value); });
  ast.walkRules((rule) => {
    if (rule.parent?.type === 'atrule' && /keyframes$/i.test(rule.parent.name)) return;
    const scoped = rule.selectors.flatMap(scopeSelector);
    if (!scoped.length) rule.remove();
    else rule.selectors = [...new Set(scoped)];
  });
  return ast.toString();
}

// ---- body -------------------------------------------------------------------------------------

const mainOpen = html.indexOf('<div data-elementor-type="wp-page"');
const mainClose = html.indexOf('</main>', mainOpen);
if (mainOpen < 0 || mainClose < 0) throw new Error('could not find the Elementor page document inside <main>');
let body = html.slice(mainOpen, mainClose);

const bodyCss = styleBlocks(body);
body = body
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, '')
  .replace(/<script\b[\s\S]*?<\/script>/g, '')
  .replace(/<noscript\b[\s\S]*?<\/noscript>/g, '')
  .replace(/<iframe\b[^>]*gform_ajax_frame[\s\S]*?<\/iframe>/g, '')
  .replace(/\s(onclick|onchange|onkeypress|onsubmit)="[^"]*"/g, '')
  .replace(/(class="[^"]*?)\s*\belementor-invisible\b/g, '$1');
body = externaliseDataUris(body);

// The hero's Gravity Forms "Request Service" strip is removed: it posts to WordPress, and the homepage has no inline
// form. The phone-only "Request service" button stays and opens the app booking sheet (data-book).
function replaceSection(html, elementId, replacement) {
  const start = html.indexOf(`<section class="elementor-section elementor-inner-section elementor-element elementor-element-${elementId} `);
  if (start < 0) throw new Error(`section ${elementId} not found`);
  const tag = /<(\/?)section\b[^>]*>/g;
  tag.lastIndex = start;
  let depth = 0, m;
  while ((m = tag.exec(html))) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return html.slice(0, start) + replacement + html.slice(tag.lastIndex);
  }
  throw new Error(`section ${elementId} is not closed`);
}
body = replaceSection(body, 'a2114d2', '');

// Links: this app answers `/` and `/locations/…`; everything else stays on production.
body = body
  .replace(/href="https:\/\/www\.chimcare\.com\/#elementor-action[^"]*"/g, 'href="#request-service" data-book')
  .replace(/href="https:\/\/www\.chimcare\.com\/(#[^"]*)?"/g, (_, hash) => `href="${hash ?? '/'}"`)
  .replace(/href="https:\/\/www\.chimcare\.com(\/locations\/[^"]*)"/g, 'href="$1"')
  .replace(/(<form\b[^>]*id="gform_24"[^>]*?)\saction="[^"]*"/, '$1 action="#"')
  .replace(/(<form class="e-search-form"[^>]*?)\saction="[^"]*"/, '$1 action="/locations/"');
body = body.replace(/\n[\t ]*\n(?:[\t ]*\n)+/g, '\n');

// ---- head -------------------------------------------------------------------------------------

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#039;/g, "'").replace(/&quot;/g, '"');
const metaContent = (attr, name) => {
  const m = head.match(new RegExp(`<meta ${attr}="${name}" content="([^"]*)"`));
  return m ? decode(m[1]) : null;
};
const meta = {
  title: decode(head.match(/<title>([^<]*)<\/title>/)?.[1] ?? 'Chimcare'),
  robots: metaContent('name', 'robots'),
  ogType: metaContent('property', 'og:type'),
  ogTitle: metaContent('property', 'og:title'),
  ogDescription: metaContent('property', 'og:description'),
  ogSiteName: metaContent('property', 'og:site_name'),
  ogLocale: metaContent('property', 'og:locale'),
  twitterCard: metaContent('name', 'twitter:card'),
};
// Only Yoast's graph is carried. The page's other JSON-LD block is an AggregateRating, which this site never emits.
const yoast = head.match(/<script type="application\/ld\+json" class="yoast-schema-graph">([\s\S]*?)<\/script>/);
const schema = yoast ? JSON.parse(yoast[1]) : null;
if (schema && JSON.stringify(schema).includes('AggregateRating')) throw new Error('Yoast graph carries AggregateRating');

// ---- write ------------------------------------------------------------------------------------

// The stylesheet is served as a static file, not imported: the bundler's CSS parser rejects the whole file on a
// selector a browser simply skips (Gravity Forms ships `[\:has\(…\)]` fallbacks), and WordPress CSS is full of them.
// Served as-is, the browser applies its own error recovery — exactly what happens on production.
const css = `/* GENERATED by scripts/extract-home.mjs from the saved chimcare.com homepage — do not edit; fixes go in app/_home/overrides.css. */\n${await buildCss([...styleBlocks(head), ...bodyCss])}\n`;
fs.writeFileSync(path.join(assetDir, 'home.css'), css);
const cssHref = `/home/home.css?v=${crypto.createHash('sha1').update(css).digest('hex').slice(0, 10)}`;
fs.writeFileSync(
  path.join(outDir, 'content.ts'),
  `// GENERATED by scripts/extract-home.mjs from the saved chimcare.com homepage — do not edit; rerun the script.\n\n` +
    `export const HOME_CSS_HREF = ${JSON.stringify(cssHref)};\n\n` +
    `export const HOME_BODY_CLASS = ${JSON.stringify([...bodyClasses].join(' '))};\n\n` +
    `export const HOME_META = ${JSON.stringify(meta, null, 2)} as const;\n\n` +
    `export const HOME_SCHEMA: Record<string, unknown> | null = ${JSON.stringify(schema)};\n\n` +
    `export const HOME_HTML = ${JSON.stringify(body)};\n`,
);

console.log(`home: ${(body.length / 1024).toFixed(0)} KB markup, ${(css.length / 1024).toFixed(0)} KB css, ${written} new asset(s), ${remote.size} remote url(s)`);
