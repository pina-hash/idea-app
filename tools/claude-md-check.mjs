// Asserts the mechanically checkable claims in `CLAUDE.md` against the tree it
// describes.
//
// WHY THIS EXISTS. `CLAUDE.md` is read by every Claude Code session in this
// repository before it does anything, so a false sentence in it is not a stale
// document -- it is an instruction. Between 2026-09-05 and 2026-09-06 seven
// separate bundles each found a sentence in it that was wrong, and every one of
// them correctly declined to edit a file outside its ownership, writing the
// correction into a history entry instead, where the next session does not look.
// Prompt 0060 had already run this experiment one directory over: `docs/GAUNTLET.md`
// was corrected by hand on 2026-08-29 and was stale in fifteen places by
// 2026-09-05. A hand correction does not hold. Nothing about a stale document is
// visible from reading it, so the only durable fix is a check that reddens.
//
// WHAT IT DOES NOT DO, and this is most of the document. `CLAUDE.md` is prose
// where `docs/GAUNTLET.md` was a table, and the overwhelming majority of it is
// GUIDANCE -- "a refusal renders where the user was working", "colour is never
// the only signal", "prefer measuring to reasoning". No script can hold an
// opinion about any of that, and one that tried would be asserting its author's
// reading of a sentence rather than a fact about the tree. It also never checks
// a MEASUREMENT (a contrast ratio, a warning count, a millisecond figure): those
// are true of a moment and are corrected by re-measuring, not by grepping.
//
// What is left is the part a script can be exactly right about: a NAME. The
// document names files, routes, database objects, exported symbols, npm scripts
// and CSS custom properties, and every one of those either exists in the tree or
// does not. Six parsers, six existence rules, and one inverse rule for the
// handful of names the document says are ABSENT -- a deleted module, a retired
// environment variable, a column that must never be created. Those are checked
// as absent, because a document that says `$lib/server/foundry-serve.ts` is gone
// is just as wrong if it comes back.
//
// EVERY FINDING NAMES THE CLAIM AND WHAT THE TREE SAYS INSTEAD. A checker that
// reports "the document is stale" sends a person to read four thousand lines.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '..');

export const DOC = 'CLAUDE.md';

/**
 * One disagreement between the document and the tree. `claim` is what
 * `CLAUDE.md` says; `tree` is what the tree says instead. Both are rendered into
 * the failure message.
 *
 * @typedef {{ check: string, claim: string, tree: string, line: number }} Finding
 */

/**
 * The line the document first writes a name on, so a finding sends a reader to a
 * SENTENCE rather than to a four-thousand-line file. Zero when the token cannot
 * be located, which is never expected -- every token reaching a finding came out
 * of a parser that read it from this same string.
 *
 * @param {string} doc
 * @param {string} token
 * @returns {number}
 */
export function lineOf(doc, token) {
	const lines = doc.split('\n');
	// The `$lib` spelling too: an ABSENT_BY_DESIGN entry is keyed by the path a
	// file would occupy on disk, and the document writes the alias. Without this
	// the one finding that matters most reported line 0.
	const forms = [token];
	if (token.startsWith('src/lib/')) forms.push('$lib/' + token.slice('src/lib/'.length));
	for (const form of forms) {
		for (let i = 0; i < lines.length; i++) {
			if (lines[i].includes('`' + form + '`') || lines[i].includes('`' + form + '(')) return i + 1;
		}
	}
	for (const form of forms) {
		for (let i = 0; i < lines.length; i++) if (lines[i].includes(form)) return i + 1;
	}
	return 0;
}

/** Directories that are not the tree under description. */
const SKIP_DIRS = new Set(['node_modules', '.git', '.svelte-kit', '.vercel', 'build', 'dist']);

/**
 * Roots a documented path may start from. A token that begins with one of these
 * is a repo path and is resolved literally; anything else is either a `$lib`
 * alias or a bare basename.
 */
const PATH_ROOTS = ['src/', 'tests/', 'tools/', 'docs/', 'supabase/', 'static/', '.github/', 'materials/', 'scripts/'];

/**
 * Extensions a `$lib` or bare token may be missing. `.svelte.ts` is in the list
 * because the document cites two of those modules without it.
 */
const EXT_CANDIDATES = ['', '.ts', '.svelte', '.svelte.ts', '.css', '.js', '.mjs', '/index.ts'];

/**
 * NAMES THE DOCUMENT SAYS DO NOT EXIST, checked in the inverse direction: a
 * finding is raised when one of these IS found. A retired path that comes back
 * makes the paragraph describing its retirement wrong, and no existence check
 * would ever notice.
 *
 * `where` is the corpus the name must stay out of. `why` is the sentence in
 * `CLAUDE.md` that makes it a claim.
 */
export const ABSENT_BY_DESIGN = [
	{
		token: 'src/lib/server/foundry-serve.ts',
		where: 'path',
		why: 'the deleted token-proxy module; the responder is `foundry-bundle-response.ts` and the document forbids renaming it back'
	},
	{
		token: 'scripts/foundry-edge-routes.mjs',
		where: 'path',
		why: 'the deleted Build-Output route-table rewriter from the second-Vercel-host lane'
	},
	{ token: 'PUBLIC_FOUNDRY_APPS_HOST', where: 'source', why: 'retired; nothing reads it' },
	{ token: 'PUBLIC_FOUNDRY_APP_ORIGIN', where: 'source', why: 'retired; nothing reads it' },
	{ token: 'FOUNDRY_TOKEN_SECRET', where: 'source', why: 'retired with the signed read tokens' },
	{ token: 'COIN_API_KEY', where: 'source', why: 'retired; Supabase is the sole ledger' },
	{ token: 'COIN_LEDGER_URL', where: 'source', why: 'retired; Supabase is the sole ledger' },
	{
		token: 'tests/db/html-assignment-write-gate.test.ts',
		where: 'path',
		why: "the probe 0134 wrote to measure the shut HTML-assignment write gate, written to be DELETED rather than inverted once 0197 widened it; the document names it to record that it went"
	},
	{
		token: 'IDEA_Design_System.md',
		where: 'path',
		why: 'retired 2026-08-25 and absorbed into `IDEA_CLAUDE_DESIGN_STANDARDS.md`; the document names it to say it does not resolve'
	},
	{
		token: 'IDEA_VERIFICATION_STANDARDS.md',
		where: 'path',
		why: 'a name cited into being and never written; the real document is `IDEA_VERIFICATION_ADDENDA.md`'
	},
	{
		token: 'gauntlet_practice_meter',
		where: 'sql',
		why: "a name that has never existed, born in `0155`'s own comment and copied into this document from it; the function is `gauntlet_practice_pressure`"
	},
	{
		token: 'classroom_set_spec',
		where: 'sql',
		why: 'a contraction of `classroom_set_assignment_spec` and `classroom_set_reference_spec` that names no object; three source comments still use it'
	},
	{
		token: 'CoinDeskTool',
		where: 'symbol',
		why: 'the retired whole-screen coin desk component; the desk is one component per area now, and four source comments still name it'
	},
	{
		token: 'is_instructor',
		where: 'sql',
		why: "an instructor's answers are their own table, and the document says one forgotten `and not is_instructor` is the failure a column would create"
	}
];

/**
 * Names that look like ours and are not. Each carries the reason somebody
 * checked, and the list length is pinned by the test so a stale entry reddens
 * rather than quietly widening the exemption.
 */
export const NOT_OURS = [
	{
		token: 'normalizeContentType',
		why: "storage-api's own renderer, upstream at Supabase; the document cites its measured behaviour, not our code"
	},
	{
		token: 'closeBundle',
		why: "the Vercel adapter's Rollup hook, named in the Windows EPERM trap"
	},
	{
		token: 'helperTable',
		why: 'the invented export in the `+server.ts` non-method-export trap, which exists precisely to not exist'
	},
	{
		token: 'style.css',
		why: "an example filename inside a student's Foundry bundle, not a file in this repo"
	},
	{
		token: 'supabase/.temp/',
		why: 'written by `supabase link` and gitignored; the document says so in the same sentence that names it'
	},
	{ token: 'CSSStyleRule', why: "the DOM interface, named in the stylesheet-walking trap" },
	{ token: 'CSSRuleList', why: 'the DOM interface, named in the same trap' },
	{ token: 'FontFace', why: 'the DOM interface, named in the opaque-origin font measurement' },
	{
		token: 'updateWheelTransformWorld',
		why: "cannon-es's own method, named in the `isInContact` trap"
	}
];

/**
 * Leading-underscore fragments the document writes as an ELISION inside a comma
 * list whose first member carried the prefix -- `classroom_view_as_section`,
 * `_item`, `_can_read_attachment`, `_sections`. They are not object names and
 * resolving them would mean teaching the parser to read a sentence.
 */
export const ELIDED_SQL = ['_item', '_can_read_attachment', '_sections'];

/** @param {string} rel @param {string} [root] */
function read(rel, root = REPO_ROOT) {
	return fs.readFileSync(path.join(root, rel), 'utf8');
}

/** @param {string} dir @param {(p: string) => void} fn */
function walk(dir, fn) {
	let entries;
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const e of entries) {
		if (SKIP_DIRS.has(e.name)) continue;
		const p = path.join(dir, e.name);
		if (e.isDirectory()) walk(p, fn);
		else fn(p);
	}
}

/**
 * Every backticked span in the document, in order. Every parser below is a
 * filter over this one list, so a claim outside backticks is deliberately not a
 * claim -- the document's own convention is that a name is written in code font.
 *
 * @param {string} doc
 * @returns {string[]}
 */
export function backticked(doc) {
	return [...doc.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]);
}

/** @param {string[]} xs */
const uniq = (xs) => [...new Set(xs)];

/**
 * Paths: a `$lib` alias, a token rooted at a real repo directory, or a bare
 * basename with a code-file extension.
 *
 * @param {string} doc
 * @returns {string[]}
 */
export function citedPaths(doc) {
	return uniq(
		backticked(doc).filter(
			(t) =>
				!t.includes(' ') &&
				!t.includes('*') &&
				(t.startsWith('$lib/') ||
					PATH_ROOTS.some((r) => t.startsWith(r)) ||
					/^[A-Za-z][A-Za-z0-9._-]*\.(svelte|ts|mjs|js|sql|py|css|html|json|sh|yml|md)$/.test(t))
		)
	);
}

/**
 * Where a documented path token may be on disk. A `$lib` alias maps to
 * `src/lib/`; a rooted token is literal; a bare basename is matched by NAME
 * anywhere in the tree, because the document names a component by its filename
 * far more often than by its path.
 *
 * @param {string} token
 * @param {Set<string>} basenames
 * @param {string} root
 * @returns {boolean}
 */
export function pathResolves(token, basenames, root) {
	const bases = [];
	if (token.startsWith('$lib/')) bases.push('src/lib/' + token.slice(5));
	else if (PATH_ROOTS.some((r) => token.startsWith(r))) bases.push(token);
	else {
		// A bare basename. Accept it if any file in the tree carries that name.
		if (basenames.has(token)) return true;
		// The document cites two `.svelte.ts` modules without the `.ts`.
		if (basenames.has(token + '.ts')) return true;
		return false;
	}
	return bases.some((b) => EXT_CANDIDATES.some((e) => fs.existsSync(path.join(root, b + e))));
}

/** Every filename in the tree, by basename. @param {string} [root] */
export function treeBasenames(root = REPO_ROOT) {
	/** @type {Set<string>} */
	const out = new Set();
	walk(root, (p) => out.add(path.basename(p)));
	return out;
}

/**
 * Routes: a backticked token that begins with a single `/` and looks like a URL
 * path rather than a filesystem path or a CLI flag.
 *
 * @param {string} doc
 * @returns {string[]}
 */
export function citedRoutes(doc) {
	return uniq(
		backticked(doc)
			.filter((t) => /^\/[A-Za-z0-9_[\]./*-]*$/.test(t))
			.filter((t) => !t.startsWith('/opt/') && !t.startsWith('/mnt/') && !t.startsWith('/IDEA'))
			.filter((t) => t !== '/')
	);
}

/**
 * The real route table, read from `src/routes`. A group directory `(name)`
 * contributes no segment; a `+page`, `+server` or `+layout` file makes the
 * directory a route.
 *
 * @param {string} [root]
 * @returns {Set<string>}
 */
export function treeRoutes(root = REPO_ROOT) {
	/** @type {Set<string>} */
	const out = new Set();
	const base = path.join(root, 'src/routes');
	/** @param {string} dir @param {string} url */
	const rec = (dir, url) => {
		for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
			const p = path.join(dir, e.name);
			if (e.isDirectory()) rec(p, /^\(.*\)$/.test(e.name) ? url : url + '/' + e.name);
			else if (/^\+(page|server|layout)/.test(e.name)) out.add(url || '/');
		}
	};
	rec(base, '');
	return out;
}

/**
 * Whether a documented route is served. A `[param]` segment in the tree matches
 * any documented segment, and a documented token that is a PREFIX of real routes
 * (`/api/notebook`, `/maps/edit`) counts -- the document names sections as often
 * as it names pages.
 *
 * @param {string} url
 * @param {Set<string>} routes
 * @returns {boolean}
 */
export function routeResolves(url, routes) {
	const clean = url.replace(/\/\*+$/, '').replace(/\/$/, '') || '/';
	if (routes.has(clean)) return true;
	const segs = clean.split('/');
	for (const cand of routes) {
		const cs = cand.split('/');
		if (cs.length !== segs.length) continue;
		if (cs.every((c, i) => c === segs[i] || /^\[.*\]$/.test(c))) return true;
	}
	return [...routes].some((r) => r.startsWith(clean + '/'));
}

/** Subsystem prefixes that make a snake_case token a claim about the database. */
const SQL_PREFIXES =
	/^(gauntlet_|classroom_|notebook_|maps_|foundry_|coin_|tournament_|greenline_|fsp_|frc_|app_|student_|admin_|profiles_|is_|_gauntlet|_classroom|_notebook|_maps|_foundry|_coin|_admin|_tournament)/;

/**
 * Database object names: a backticked snake_case token carrying a subsystem
 * prefix, with any argument list stripped.
 *
 * @param {string} doc
 * @returns {string[]}
 */
export function citedSqlObjects(doc) {
	return uniq(
		backticked(doc)
			.map((t) => {
				const m = t.match(/^([a-z_][a-z0-9_]*)\s*(\([^)]*\))?$/);
				return m ? m[1] : null;
			})
			.filter(
				/** @returns {t is string} */
				(t) => !!t && t.length > 3 && t.includes('_') && !t.endsWith('_') && SQL_PREFIXES.test(t)
			)
			.filter((t) => !ELIDED_SQL.includes(t))
	);
}

/**
 * Every database object name that appears in a migration or under `src/`,
 * OUTSIDE a comment.
 *
 * THE COMMENT STRIPPING IS THE WHOLE POINT, not tidiness. `gauntlet_practice_meter`
 * appears in this repository only inside comments -- once in applied migration
 * 0155 and, until this bundle, in `CLAUDE.md` -- and the function is
 * `gauntlet_practice_pressure`. An existence test that read comments would
 * certify the wrong name from the very comment that introduced it, which is what
 * happened. `classroom_set_spec` is the same shape one subsystem over: three
 * source files name it in a comment and no such RPC exists.
 *
 * @param {string} [root]
 * @returns {Set<string>}
 */
export function realSqlObjects(root = REPO_ROOT) {
	/** @type {Set<string>} */
	const out = new Set();
	/** @param {string} text */
	const add = (text) => {
		for (const m of text.matchAll(/\b([a-z_][a-z0-9_]{3,})\b/g)) out.add(m[1]);
	};
	const migDir = path.join(root, 'supabase/migrations');
	for (const f of fs.readdirSync(migDir).filter((f) => f.endsWith('.sql'))) {
		add(stripSqlComments(fs.readFileSync(path.join(migDir, f), 'utf8')));
	}
	for (const dir of ['src', 'supabase/functions']) {
		walk(path.join(root, dir), (p) => {
			if (!/\.(ts|svelte|js|sql)$/.test(p)) return;
			const body = fs.readFileSync(p, 'utf8');
			add(p.endsWith('.sql') ? stripSqlComments(body) : stripJsComments(body));
		});
	}
	return out;
}

/** @param {string} s */
export function stripSqlComments(s) {
	return s
		.replace(/\/\*[\s\S]*?\*\//g, ' ')
		.split('\n')
		.map((l) => l.replace(/--.*$/, ''))
		.join('\n');
}

/**
 * Comments out of TypeScript and Svelte. LINE-LEADING ONLY, in both forms, and
 * that restriction is load-bearing rather than lazy.
 *
 * The obvious implementation -- strip every `/* ... *\u002f` anywhere -- SILENTLY ATE
 * MOST OF `vitest.config.ts`, because a vitest include glob (`tests/**\u002f*.test.ts`)
 * contains the opening delimiter and the next `*\u002f` in the file is hundreds of
 * lines away. `globalSetup` vanished from the corpus and was reported as a name
 * this repository does not use. That failure is invisible: an over-stripped
 * corpus produces FINDINGS rather than silence, but the finding names the
 * document instead of the stripper.
 *
 * Every comment in this repository that names an object names it in a
 * line-leading block, so the narrow rule removes what it exists to remove. A
 * trailing `// note` naming a phantom is the accepted gap; under-stripping costs
 * a missed finding, and over-stripping costs a false one.
 *
 * @param {string} s
 */
export function stripJsComments(s) {
	const lines = s.split('\n');
	const out = [];
	let inBlock = false;
	for (const line of lines) {
		if (inBlock) {
			if (/\*\//.test(line)) inBlock = false;
			out.push('');
			continue;
		}
		if (/^\s*\/\*/.test(line)) {
			if (!/\*\//.test(line)) inBlock = true;
			out.push('');
			continue;
		}
		if (/^\s*(\/\/|\*(?!\/))/.test(line)) {
			out.push('');
			continue;
		}
		if (/^\s*<!--/.test(line)) {
			out.push('');
			continue;
		}
		out.push(line);
	}
	return out.join('\n');
}

/**
 * Exported symbols: a backticked camelCase or PascalCase identifier of five
 * characters or more, with an optional empty argument list. The mixed case is
 * the discriminator -- it is how this document writes a code symbol and how it
 * writes nothing else.
 *
 * @param {string} doc
 * @returns {string[]}
 */
export function citedSymbols(doc) {
	return uniq(
		backticked(doc)
			.map((t) => {
				const m = t.match(/^([A-Za-z][A-Za-z0-9]*)(\(\))?$/);
				return m ? m[1] : null;
			})
			.filter(
				/** @returns {t is string} */
				(t) => !!t && t.length >= 5 && /[a-z][A-Z]/.test(t)
			)
	);
}

/**
 * Every mixed-case identifier that appears in code we ship, outside a comment.
 *
 * @param {string} [root]
 * @returns {Set<string>}
 */
export function realSymbols(root = REPO_ROOT) {
	/** @type {Set<string>} */
	const out = new Set();
	for (const f of ['vitest.config.ts', 'vite.config.ts', 'svelte.config.js']) {
		const p = path.join(root, f);
		if (!fs.existsSync(p)) continue;
		for (const m of stripJsComments(fs.readFileSync(p, 'utf8')).matchAll(/\b([A-Za-z][A-Za-z0-9]{4,})\b/g)) {
			out.add(m[1]);
		}
	}
	for (const dir of ['src', 'tools', 'tests', 'supabase/functions']) {
		walk(path.join(root, dir), (p) => {
			if (!/\.(ts|svelte|js|mjs|css)$/.test(p)) return;
			for (const m of stripJsComments(fs.readFileSync(p, 'utf8')).matchAll(
				/\b([A-Za-z][A-Za-z0-9]{4,})\b/g
			)) {
				out.add(m[1]);
			}
		});
	}
	return out;
}

/**
 * npm scripts: `npm run <name>`, taken from prose as well as from backticks,
 * because the document invokes several of them inside a fenced block.
 *
 * @param {string} doc
 * @returns {string[]}
 */
export function citedNpmScripts(doc) {
	return uniq([...doc.matchAll(/npm run ([a-z][a-z0-9:_-]*)/g)].map((m) => m[1]));
}

/** @param {string} [root] @returns {Set<string>} */
export function realNpmScripts(root = REPO_ROOT) {
	return new Set(Object.keys(JSON.parse(read('package.json', root)).scripts ?? {}));
}

/**
 * CSS custom properties. A CLI long flag has the same shape, so a token is only
 * a custom property if it carries a lowercase letter after the dashes AND is not
 * one of the flags the document also writes in backticks.
 *
 * @param {string} doc
 * @returns {string[]}
 */
export function citedCssTokens(doc) {
	const flags = new Set([
		'--dry-run',
		'--no-file-parallelism',
		'--no-ff',
		'--force',
		'--force-with-lease',
		'--probe',
		'--selftest',
		'--break',
		'--static',
		'--linked',
		'--ref'
	]);
	return uniq(
		backticked(doc).filter((t) => /^--[a-z][a-z0-9-]*$/.test(t) && !flags.has(t))
	);
}

/** @param {string} [root] @returns {Set<string>} */
export function realCssTokens(root = REPO_ROOT) {
	/** @type {Set<string>} */
	const out = new Set();
	walk(path.join(root, 'src'), (p) => {
		if (!/\.(css|svelte)$/.test(p)) return;
		for (const m of fs.readFileSync(p, 'utf8').matchAll(/(--[a-z][a-z0-9-]*)/g)) out.add(m[1]);
	});
	return out;
}

/**
 * Every name in the tree that could satisfy an ABSENT_BY_DESIGN claim, so the
 * inverse check reads one corpus rather than three.
 *
 * @param {string} [root]
 * @returns {{ paths: Set<string>, source: string, sql: Set<string> }}
 */
export function absenceCorpus(root = REPO_ROOT) {
	/** @type {Set<string>} */
	const paths = new Set();
	let source = '';
	/**
	 * `source` IS `src/` ALONE, WITH COMMENTS STRIPPED, and both halves are the
	 * point. "Nothing reads it" is a claim about shipped code: a test that SWEEPS
	 * for a retired name is the enforcement of the retirement, not a violation of
	 * it, and this checker's own ABSENT_BY_DESIGN table names every one of them.
	 * A corpus that read `tools/` or `tests/` would report itself.
	 */
	for (const dir of ['src', 'supabase/functions']) {
		walk(path.join(root, dir), (p) => {
			paths.add(path.relative(root, p).split(path.sep).join('/'));
			if (/\.(ts|svelte|js)$/.test(p)) source += stripJsComments(fs.readFileSync(p, 'utf8')) + '\n';
		});
	}
	for (const dir of ['tools', 'scripts']) {
		walk(path.join(root, dir), (p) => paths.add(path.relative(root, p).split(path.sep).join('/')));
	}
	return { paths, source, sql: realSqlObjects(root) };
}

/**
 * Run every check.
 *
 * @param {string} [root]
 * @returns {{ ok: boolean, findings: Finding[] }}
 */
export function checkClaudeMd(root = REPO_ROOT) {
	/** @type {Finding[]} */
	const findings = [];
	const doc = read(DOC, root);
	/** @param {string} check @param {string} token @param {string} claim @param {string} tree */
	const say = (check, token, claim, tree) =>
		findings.push({ check, claim, tree, line: lineOf(doc, token) });
	const notOurs = new Set(NOT_OURS.map((n) => n.token));

	// 1. Every path named exists.
	const basenames = treeBasenames(root);
	const absentPaths = new Set(
		ABSENT_BY_DESIGN.filter((a) => a.where === 'path').map((a) => a.token)
	);
	for (const t of citedPaths(root === REPO_ROOT ? doc : doc)) {
		if (notOurs.has(t) || absentPaths.has(t) || absentPaths.has(t.replace('$lib/', 'src/lib/')))
			continue;
		if (!pathResolves(t, basenames, root)) {
			say(
				'path-missing',
				t,
				`${DOC} names the path \`${t}\``,
				t.startsWith('$lib/')
					? `no file at src/lib/${t.slice(5)} with any of ${EXT_CANDIDATES.filter(Boolean).join(', ')}`
					: 'no such file anywhere in the tree, by path or by basename'
			);
		}
	}

	// 2. Every route named is served.
	const routes = treeRoutes(root);
	for (const url of citedRoutes(doc)) {
		if (!routeResolves(url, routes)) {
			say(
				'route-missing',
				url,
				`${DOC} names the route \`${url}\``,
				'no +page, +server or +layout under src/routes answers it'
			);
		}
	}

	// 3. Every database object named is real, outside a comment.
	const sql = realSqlObjects(root);
	const absentSql = new Set(ABSENT_BY_DESIGN.filter((a) => a.where === 'sql').map((a) => a.token));
	for (const id of citedSqlObjects(doc)) {
		if (absentSql.has(id) || sql.has(id)) continue;
		const stem = id.replace(/^_/, '').split('_').slice(0, 2).join('_');
		const near = [...sql].filter((r) => r.startsWith(stem)).slice(0, 4);
		say(
			'sql-object-unknown',
			id,
			`${DOC} names \`${id}\``,
			near.length
				? `no such object outside a comment; the real ones starting \`${stem}\` include ${near.map((n) => '`' + n + '`').join(', ')}`
				: 'no such object appears in any migration or under src/ outside a comment'
		);
	}

	// 4. Every exported symbol named is real, outside a comment.
	const syms = realSymbols(root);
	const absentSyms = new Set(
		ABSENT_BY_DESIGN.filter((a) => a.where === 'symbol').map((a) => a.token)
	);
	for (const id of citedSymbols(doc)) {
		if (notOurs.has(id) || absentSyms.has(id) || syms.has(id)) continue;
		say(
			'symbol-unknown',
			id,
			`${DOC} names \`${id}\``,
			'no such identifier appears under src/, tools/, tests/ or supabase/functions outside a comment'
		);
	}

	// 5. Every npm script named is defined.
	const scripts = realNpmScripts(root);
	for (const s of citedNpmScripts(doc)) {
		if (!scripts.has(s)) {
			say(
				'npm-script-missing',
				s,
				`${DOC} says to run \`npm run ${s}\``,
				`package.json defines ${[...scripts].map((x) => '`' + x + '`').join(', ')}`
			);
		}
	}

	// 6. Every CSS custom property named is declared or read somewhere.
	const css = realCssTokens(root);
	for (const t of citedCssTokens(doc)) {
		if (!css.has(t)) {
			say(
				'css-token-unknown',
				t,
				`${DOC} names \`${t}\``,
				'no such custom property appears under src/'
			);
		}
	}

	// 7. THE INVERSE RULE. Every name the document says is gone must stay gone.
	const corpus = absenceCorpus(root);
	for (const a of ABSENT_BY_DESIGN) {
		let present = false;
		if (a.where === 'path') {
			present = a.token.includes('/')
				? corpus.paths.has(a.token)
				: [...corpus.paths].some((p) => p.endsWith('/' + a.token)) ||
					fs.existsSync(path.join(root, 'docs/standards', a.token));
		}
		else if (a.where === 'source') present = new RegExp('\\b' + a.token + '\\b').test(corpus.source);
		// `symbol` reads the SAME src-only, comment-stripped corpus as `source`,
		// and for the same reason: this file names every retired symbol in the
		// table above, so a corpus that read `tools/` would report itself. It did,
		// on `CoinDeskTool`, the first time this rule ran.
		else if (a.where === 'symbol') present = new RegExp('\\b' + a.token + '\\b').test(corpus.source);
		else present = corpus.sql.has(a.token);
		if (present) {
			say(
				'absent-by-design-returned',
				a.token,
				`${DOC} says \`${a.token}\` does not exist -- ${a.why}`,
				a.where === 'path'
					? 'that file is in the tree again'
					: a.where === 'source'
						? 'that name is read by code again'
						: 'that name appears in real code again, outside a comment'
			);
		}
	}

	return { ok: findings.length === 0, findings };
}

/** @param {Finding[]} findings @returns {string} */
export function formatFindings(findings) {
	return findings
		.map((f) => `  [${f.check}] ${DOC}:${f.line} -- ${f.claim}\n      tree: ${f.tree}`)
		.join('\n');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
	const { ok, findings } = checkClaudeMd();
	if (ok) {
		console.log('claude-md-check: CLAUDE.md agrees with the tree.');
		process.exit(0);
	}
	console.error(`claude-md-check: ${findings.length} finding(s).\n${formatFindings(findings)}`);
	process.exit(1);
}
