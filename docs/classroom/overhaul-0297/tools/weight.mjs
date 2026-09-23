// Production JS/CSS weight of the class page and the item page, from the build's Vite manifest.
// Maps each route file to its generated node via .svelte-kit/generated/client-optimized/nodes/N.js,
// walks STATIC imports transitively from the client entry plus the node chain, gzip level 9.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
const ROOT = process.argv[2] || '/home/user/idea-app';
const CLIENT = join(ROOT, '.svelte-kit/output/client');
const m = JSON.parse(readFileSync(join(CLIENT, '.vite/manifest.json'), 'utf8'));
const GEN = join(ROOT, '.svelte-kit/generated/client-optimized/nodes');
const nodeOf = {};
for (const f of readdirSync(GEN)) {
  const src = readFileSync(join(GEN, f), 'utf8');
  const mm = [...src.matchAll(/src\/routes\/([^"']+?\.svelte)/g)].map((x) => 'src/routes/' + x[1]);
  for (const r of mm) nodeOf[r] = `.svelte-kit/generated/client-optimized/nodes/${f}`;
}
const size = (file) => { const b = readFileSync(join(CLIENT, file)); return { raw: b.length, gz: gzipSync(b, { level: 9 }).length }; };
function closure(keys) {
  const seen = new Set(), css = new Set(), dyn = new Set();
  const walk = (k) => { const e = m[k]; if (!e || seen.has(k)) return; seen.add(k);
    for (const c of e.css ?? []) css.add(c); for (const d of e.dynamicImports ?? []) dyn.add(d); for (const i of e.imports ?? []) walk(i); };
  keys.forEach(walk);
  return { files: [...seen].map((k) => m[k].file), css: [...css], dyn: [...dyn] };
}
const entry = Object.keys(m).filter((k) => m[k].isEntry && /entry\/(start|app)/.test(m[k].file));
const chains = {
  'class page': ['src/routes/+layout.svelte', 'src/routes/classroom/+layout.svelte', 'src/routes/classroom/[sectionId]/+layout.svelte', 'src/routes/classroom/[sectionId]/+page.svelte'],
  'item page': ['src/routes/+layout.svelte', 'src/routes/classroom/+layout.svelte', 'src/routes/classroom/[sectionId]/+layout.svelte', 'src/routes/classroom/[sectionId]/item/[itemId]/+page.svelte'],
  'home page': ['src/routes/+layout.svelte', 'src/routes/+page.svelte'],
  'notebook page': ['src/routes/+layout.svelte', 'src/routes/notebook/+page.svelte'],
};
const out = {};
for (const [name, chain] of Object.entries(chains)) {
  const missing = chain.filter((c) => !nodeOf[c]);
  const c = closure([...entry, ...chain.map((r) => nodeOf[r]).filter(Boolean)]);
  const js = c.files.filter((f) => f.endsWith('.js')).map(size);
  const cs = c.css.map(size);
  const sum = (a, k) => Math.round(a.reduce((s, x) => s + x[k], 0) / 102.4) / 10;
  out[name] = { missing, jsFiles: js.length, jsKB: sum(js, 'raw'), jsGzKB: sum(js, 'gz'), cssFiles: cs.length, cssKB: sum(cs, 'raw'), cssGzKB: sum(cs, 'gz'), lazyChunks: c.dyn.length };
}
console.log(JSON.stringify(out, null, 1));
