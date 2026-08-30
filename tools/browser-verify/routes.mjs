/**
 * Which dev routes `tools/browser-verify` drives, and what it measures on each.
 *
 * THE SPECS THEMSELVES LIVE UNDER `routes/`, ONE FILE PER ROUTE. This file
 * ASSEMBLES them at load time and is the pointer explaining why, the way
 * `docs/HISTORY.md` points at `docs/history/` -- see that file and
 * `docs/history/_tools/` before changing anything here, and read the entry at
 * `docs/history/history-merge-split-vx1fmk.md` for the full argument. This is
 * the same split for the same reason: `routes.mjs` used to be one array every
 * lane appended a route object to at the same closing `];`, which is a shared
 * write point two branches touch on every unrelated pair of features -- and it
 * had already forced a hand resolution three times before this file existed.
 *
 * ONE FILE PER ROUTE, COLLISION-FREE BY CONSTRUCTION. A route's filename is
 * derived from its OWN `path` (see `slugify` below), never chosen or numbered
 * -- a session adding a new dev route is by definition adding a new, distinct
 * URL nothing else in the app answers on, so two lanes adding two routes
 * always produce two different files and share no line. A numbered prefix
 * (`026-...`) would be the exact anti-pattern the history split rejected: two
 * parallel sessions would both read 25 and both pick 26, and the conflict
 * would move from the array's closing bracket to a filename that collides
 * just as reliably.
 *
 * ADDING A ROUTE: create `routes/<slug of your path>.mjs` exporting the spec
 * as its default export (see any existing file, or `routes/README.md` for the
 * spec shape and the field reference the old top-of-file comment used to
 * carry). Do NOT add an `order` export -- that field exists only on the 25
 * files produced by the original split (see below) and works the same way
 * `record_order` does for `docs/history/`'s pre-split archive: a pinned
 * position on a CLOSED set, proving the split lossless, never a number a new
 * file picks. A new file sorts after every `order`-carrying one, by filename --
 * alphabetical, not append order, so it needs nobody to coordinate.
 *
 * `routes/_shared.mjs` holds `WIDTHS` and `SETTLE_ENTRANCE`, the two things
 * more than one route file needs; the loader below skips any `_`-prefixed
 * file in the directory, the same escape hatch a `+server.ts` uses for a
 * non-route export.
 */
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export { WIDTHS, SETTLE_ENTRANCE } from './routes/_shared.mjs';

const ROUTES_DIR = new URL('./routes/', import.meta.url);

const slugify = (path) =>
	path
		.replace(/^\/dev\//, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');

// Files with a pinned `order` (the original 25) sort first, by that number;
// everything else -- every route a future session adds -- sorts after them,
// alphabetically by filename. Mirrors `docs/history/_tools/index.mjs`'s
// `position()` exactly, including the reason: a closed set keeps its proven
// order, an open one sorts on something nobody has to pick.
const position = (entry) =>
	Number.isInteger(entry.order) ? [0, entry.order, ''] : [1, 0, entry.file];
const byPosition = (a, b) => {
	const [ak, an, as] = position(a);
	const [bk, bn, bs] = position(b);
	return ak - bk || an - bn || as.localeCompare(bs);
};

async function loadRoutes() {
	const files = readdirSync(fileURLToPath(ROUTES_DIR))
		.filter((f) => f.endsWith('.mjs') && !f.startsWith('_'))
		.sort();

	const entries = [];
	const seenPath = new Map();
	const seenSlug = new Map();
	for (const file of files) {
		const mod = await import(new URL(file, ROUTES_DIR));
		const spec = mod.default;
		if (!spec || typeof spec.path !== 'string') {
			throw new Error(`routes/${file} has no default export with a string \`path\``);
		}
		const slug = slugify(spec.path);
		// The duplicate-path and slug-collision checks run BEFORE the
		// filename-match check below, and must: `slug` is a pure function of
		// `spec.path`, so a file that reaches the filename-match check and
		// passes it is BY DEFINITION the unique file on disk named
		// `${slug}.mjs` -- readdirSync never returns two entries with the same
		// name, so no second file could ever also pass that check for the
		// same path or the same slug. Checking duplicates only after the
		// filename match would make both of these guards unreachable dead
		// code: reordering is what makes a same-path or same-slug collision
		// surface as ITS OWN error rather than being pre-empted by whichever
		// of the two files happens to carry the wrong name.
		if (seenPath.has(spec.path)) {
			throw new Error(`duplicate route path ${spec.path} in routes/${file} and routes/${seenPath.get(spec.path)}`);
		}
		seenPath.set(spec.path, file);
		if (seenSlug.has(slug)) {
			throw new Error(`slug collision "${slug}" between routes/${file} and routes/${seenSlug.get(slug)}`);
		}
		seenSlug.set(slug, file);
		const expected = file.slice(0, -'.mjs'.length);
		if (slug !== expected) {
			throw new Error(
				`routes/${file}: filename does not match its own path -- expected routes/${slug}.mjs for path ${spec.path}`
			);
		}
		entries.push({ file, order: mod.order, spec });
	}
	entries.sort(byPosition);
	return entries.map((e) => e.spec);
}

export const ROUTES = await loadRoutes();

export function selectRoutes(filter) {
	if (!filter || filter.length === 0) return ROUTES;
	return ROUTES.filter((r) => filter.some((f) => r.path.includes(f) || (r.label ?? '').includes(f)));
}

/** The URL to visit for a spec (an aliased spec measures a different state of the same route). */
export const urlFor = (spec) => spec.aliasOf ?? spec.path;
