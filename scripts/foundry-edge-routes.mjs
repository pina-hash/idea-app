/**
 * THE APPS HOST REACHES THE FUNCTION FOR EVERY PATH, INCLUDING THE ONES VERCEL
 * WOULD OTHERWISE ANSWER OFF DISK.
 *
 * `hooks.server.ts` is the origin split's boundary, and a boundary only binds
 * requests that reach it. Vercel serves `static/` and `_app/immutable/*`
 * straight from the filesystem WITHOUT INVOKING THE FUNCTION AT ALL, so on the
 * bundle host those files answered whatever the hook said. Measured on
 * production before this script existed: `/coins/index.html` served 200 with
 * 177,019 bytes of text/html, alongside `/robots.txt`, `/push-sw.js`,
 * `/manifest.webmanifest` and every `_app/immutable` asset.
 *
 * THIS CANNOT BE DONE FROM `vercel.json`, AND THAT WAS MEASURED RATHER THAN
 * ASSUMED. Two probe deployments settled it:
 *
 *   - a `routes` entry carrying `status: 404` FIRES but does not suppress the
 *     body: `/robots.txt` answered 404 with the file's own 142 bytes and
 *     `/coins/index.html` answered 404 with all 175,996 of its. A status
 *     without a destination is the exact shape of a fix that looks right and
 *     changes nothing.
 *   - a `routes` entry carrying `dest` DOES shadow the file -- but Vercel
 *     merges `vercel.json` routes AFTER the framework's own, and
 *     `adapter-vercel` emits `{ src: '/_app/immutable/.+', headers: {...} }`
 *     with NO `continue`, which terminates the pre-filesystem phase. So
 *     `/robots.txt`, `/push-sw.js`, `/manifest.webmanifest` and
 *     `/coins/index.html` all closed from `vercel.json` and the entire client
 *     build stayed open.
 *
 * So the route has to go in FIRST, ahead of the adapter's own, which means
 * editing the generated Build Output config rather than `vercel.json`. That is
 * what this does, and it is why there is a build step here at all.
 *
 * IT SENDS EVERYTHING TO THE FUNCTION RATHER THAN NAMING THE ALLOWLIST AGAIN.
 * A second copy of "what may this host serve" in the routing layer is the copy
 * that stops matching `$lib/foundry/host.ts`. One route, no predicate: the
 * host branch in the hook stays the only place that decides, and it now
 * decides for every path instead of for the subset Vercel happened to hand it.
 *
 * FAILS LOUD, NEVER SILENT. A missing config, a missing catch-all or a route
 * that did not land throws and takes the build down with it. The failure mode
 * this replaces was invisible -- bytes served from an origin nobody checked --
 * so the one thing this must never do is quietly not run.
 *
 * UNSET `PUBLIC_FOUNDRY_APPS_HOST` IS A NO-OP, matching `isFoundryAppsHost`:
 * with no second origin configured nothing is the apps host, so there is no
 * host to match and no route to add.
 */
import fs from 'node:fs';

const CONFIG = '.vercel/output/config.json';

const appsHost = (process.env.PUBLIC_FOUNDRY_APPS_HOST ?? '').trim().toLowerCase().replace(/\.$/, '');

if (!appsHost) {
	console.log('[foundry-edge] PUBLIC_FOUNDRY_APPS_HOST unset; no apps host, no edge route added.');
	process.exit(0);
}

if (!fs.existsSync(CONFIG)) {
	throw new Error(`[foundry-edge] ${CONFIG} not found. The adapter must run before this script.`);
}

const config = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));

if (!Array.isArray(config.routes)) {
	throw new Error('[foundry-edge] generated config has no routes array.');
}

/**
 * The adapter's own catch-all, taken FROM THE GENERATED CONFIG rather than
 * hardcoded: its destination is an internal name (`/![-]/catchall`) that is
 * the adapter's to change, and a stale literal here would route the whole
 * bundle host at a function that no longer exists.
 */
const catchall = [...config.routes].reverse().find((r) => r.dest && /\/catchall$/.test(r.dest));

if (!catchall) {
	throw new Error('[foundry-edge] could not find the adapter catch-all route to point the apps host at.');
}

const route = {
	src: '^/.*$',
	has: [{ type: 'host', value: appsHost }],
	dest: catchall.dest
};

config.routes.unshift(route);

fs.writeFileSync(CONFIG, JSON.stringify(config, null, '\t'));

const landed = JSON.parse(fs.readFileSync(CONFIG, 'utf8')).routes[0];
if (landed?.has?.[0]?.value !== appsHost || landed.dest !== catchall.dest) {
	throw new Error('[foundry-edge] route did not land at the front of the route table.');
}

console.log(`[foundry-edge] ${appsHost} -> ${catchall.dest} inserted ahead of ${config.routes.length - 1} adapter routes.`);
