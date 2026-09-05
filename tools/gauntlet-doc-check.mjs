// Asserts the mechanically checkable claims in `docs/GAUNTLET.md` against the
// tree it describes. `docs/GAUNTLET-DESIGN.md` is checked by the same path
// rules, because it names files too.
//
// WHY THIS EXISTS. `docs/GAUNTLET.md` is the reference somebody opening
// GAUNTLET reads first, and for months it carried a header telling that reader
// that every claim in it was a lead rather than a fact -- honest, and an
// admission that the document had stopped paying for itself. The 2026-08-29
// audit corrected it by hand; by 2026-09-05 it was stale in fifteen places
// again, which is the answer to whether a hand correction holds. Nothing about
// a stale document is visible from reading it, so the only durable fix is a
// check that reddens.
//
// WHAT IT DOES NOT DO. It never asserts that prose is TRUE -- "volume is the
// canonical correctness signal" is a design argument and no script can hold an
// opinion about it. It asserts the four things a script can be right about:
// that every migration is accounted for, that every path named exists, that
// every route is listed in both directions, and that every `gauntlet_*`
// identifier named is a real object rather than a plausible-sounding one
// (`gauntlet_practice_meter`, named twice in the document and once in an
// applied migration's comment, has never existed; the function is
// `gauntlet_practice_pressure`).
//
// EVERY FINDING NAMES THE CLAIM AND WHAT THE TREE SAYS INSTEAD. A checker that
// reports "the document is stale" sends a person to read 800 lines.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '..');

/**
 * One disagreement between a document and the tree. `claim` is what the
 * document says and `tree` is what the tree says instead; both are rendered
 * into the failure message, because a checker that only says "stale" sends a
 * person to read 800 lines.
 *
 * @typedef {{ check: string, claim: string, tree: string }} Finding
 */

// The migration table in `docs/GAUNTLET.md` is scoped, in its own heading, to
// what landed AFTER this number. Below it the migrations are described by the
// document body instead, so the two halves are checked by different rules.
export const TABLE_FLOOR = 27;

// A migration is GAUNTLET's if its filename says so, or if it is one of these:
// a migration written for another subsystem that changed GAUNTLET's meaning
// anyway. That is exactly the category the document says is easy to miss, so
// the list is here rather than left to a content grep -- nearly every
// migration in the tree MENTIONS gauntlet somewhere in a comment, and a
// membership rule that admits all of them would demand a table row for a
// short-link reserved-name list.
//
// An entry is added here when a migration executes DDL naming a GAUNTLET
// object. Verified that way on 2026-09-05 over all 181 files: 26 mention
// GAUNTLET outside their own filename and exactly these four touch one.
export const FOREIGN_GAUNTLET_MIGRATIONS = ['0038', '0067', '0137', '0149'];

const PATH_ROOTS = ['src/', 'static/', 'tools/', 'supabase/', 'docs/', 'tests/'];

/** @param {string} rel */
function read(rel) {
	return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}

/** Every migration filename in the tree, sorted. */
/**
 * Every migration filename in the tree, sorted.
 * @param {string} [root]
 * @returns {string[]}
 */
export function migrationFiles(root = REPO_ROOT) {
	return fs
		.readdirSync(path.join(root, 'supabase/migrations'))
		.filter((f) => f.endsWith('.sql'))
		.sort();
}

/** The GAUNTLET migrations, as `{ number, file }`, filename-matched plus the foreign four. */
/**
 * @param {string[]} files
 * @returns {{ number: string, file: string }[]}
 */
export function gauntletMigrations(files) {
	return files
		.filter((f) => /gauntlet/i.test(f) || FOREIGN_GAUNTLET_MIGRATIONS.includes(f.slice(0, 4)))
		.map((f) => ({ number: f.slice(0, 4), file: f }));
}

/**
 * The migration numbers the document's table has a row for. A row is a table
 * line whose first cell is a backticked four-digit number.
 */
/**
 * @param {string} doc
 * @returns {string[]}
 */
export function tableRows(doc) {
	/** @type {string[]} */
	const out = [];
	for (const line of doc.split('\n')) {
		const m = /^\|\s*`(\d{4})`\s*\|/.exec(line);
		if (m) out.push(m[1]);
	}
	return out;
}

/**
 * Backticked repo-relative paths the document names.
 *
 * A path named inside a sentence that says it DOES NOT EXIST is skipped, and
 * that exemption is load-bearing rather than a convenience: `static/gauntlet/`
 * is named in this document precisely to record that the tooling is not there,
 * which is a true claim about the tree and the opposite of a stale one. The
 * exemption is keyed on the sentence, so it applies to any such correction
 * written later with no edit here.
 */
/**
 * @param {string} doc
 * @returns {string[]}
 */
export function citedPaths(doc) {
	/** @type {Set<string>} */
	const out = new Set();
	for (const para of doc.split(/\n\s*\n/)) {
		if (/does not exist/i.test(para)) continue;
		for (const m of para.matchAll(/`([^`\s]+)`/g)) {
			const v = m[1].replace(/[.,;:]+$/, '');
			if (!v.includes('/')) continue;
			if (!PATH_ROOTS.some((r) => v.startsWith(r))) continue;
			if (v.includes('*') || v.includes('[') || v.includes('<')) continue;
			out.add(v);
		}
	}
	return [...out].sort();
}

/** Backticked `gauntlet_*` / `gauntlet-*` identifiers the document names. */
/**
 * @param {string} doc
 * @returns {string[]}
 */
export function citedIdentifiers(doc) {
	/** @type {Set<string>} */
	const out = new Set();
	for (const m of doc.matchAll(/`(gauntlet[_-][a-z0-9_-]+)`/g)) out.add(m[1]);
	return [...out].sort();
}

/**
 * One `## `-level section of a markdown document, heading included.
 *
 * The route inventory is asserted against the SHELL SECTION and not against
 * the whole file, because a route named only in passing -- `/gauntlet/run-review`
 * was named once, in a migration table row -- is not a route a reader looking
 * for the route list will find. Checking the whole document passes on exactly
 * the case worth catching.
 */
/**
 * @param {string} doc
 * @param {string} heading
 * @returns {string}
 */
export function section(doc, heading) {
	const lines = doc.split('\n');
	const start = lines.findIndex((l) => l.trim() === heading);
	if (start < 0) return '';
	let end = lines.length;
	for (let i = start + 1; i < lines.length; i++) {
		if (/^## /.test(lines[i])) {
			end = i;
			break;
		}
	}
	return lines.slice(start, end).join('\n');
}

/** `/gauntlet/...` literal route paths the document names, shorthand forms dropped. */
/**
 * @param {string} doc
 * @returns {string[]}
 */
export function citedRoutes(doc) {
	/** @type {Set<string>} */
	const out = new Set();
	for (const m of doc.matchAll(/`(\/gauntlet(?:\/[a-z0-9-]+)*)`/g)) out.add(m[1]);
	return [...out].sort();
}

/** Non-parameterized `/gauntlet/...` routes that exist in the tree. */
/**
 * @param {string} [root]
 * @returns {string[]}
 */
export function treeRoutes(root = REPO_ROOT) {
	const base = path.join(root, 'src/routes');
	/** @type {string[]} */
	const out = [];
	/** @param {string} dir */
	const walk = (dir) => {
		for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
			const p = path.join(dir, e.name);
			if (e.isDirectory()) walk(p);
			else if (e.name === '+page.svelte') {
				const url = '/' + path.relative(base, dir).split(path.sep).join('/');
				if (!url.includes('[')) out.push(url);
			}
		}
	};
	walk(path.join(base, 'gauntlet'));
	return out.sort();
}

/**
 * Every `gauntlet_*` / `gauntlet-*` identifier that appears in a migration
 * outside a full-line SQL comment, or anywhere under `src/`.
 *
 * THE COMMENT STRIPPING IS THE POINT, not tidiness. `gauntlet_practice_meter`
 * appears in this repository exactly once, in a comment inside an applied
 * migration, and an existence test that read comments would certify it.
 */
/**
 * @param {string} [root]
 * @returns {Set<string>}
 */
export function realIdentifiers(root = REPO_ROOT) {
	/** @type {Set<string>} */
	const out = new Set();
	/** @param {string} text */
	const add = (text) => {
		for (const m of text.matchAll(/\b(gauntlet[_-][a-z0-9_-]+)\b/g)) out.add(m[1]);
	};
	const migDir = path.join(root, 'supabase/migrations');
	for (const f of fs.readdirSync(migDir).filter((f) => f.endsWith('.sql'))) {
		const body = fs
			.readFileSync(path.join(migDir, f), 'utf8')
			.split('\n')
			.filter((l) => !/^\s*--/.test(l))
			.join('\n');
		add(body);
	}
	/** @param {string} dir */
	const walk = (dir) => {
		for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
			const p = path.join(dir, e.name);
			if (e.isDirectory()) walk(p);
			else if (/\.(ts|svelte|js|css)$/.test(e.name)) add(fs.readFileSync(p, 'utf8'));
		}
	};
	walk(path.join(root, 'src'));
	return out;
}

/**
 * Run every check. Returns `{ ok, findings }` where each finding is
 * `{ check, claim, tree }` -- what the document says, and what the tree says
 * instead.
 */
/**
 * @param {string} [root]
 * @returns {{ ok: boolean, findings: Finding[] }}
 */
export function checkGauntletDocs(root = REPO_ROOT) {
	/** @type {Finding[]} */
	const findings = [];
	/**
	 * @param {string} check
	 * @param {string} claim
	 * @param {string} tree
	 */
	const say = (check, claim, tree) => findings.push({ check, claim, tree });

	const doc = fs.readFileSync(path.join(root, 'docs/GAUNTLET.md'), 'utf8');
	const design = fs.readFileSync(path.join(root, 'docs/GAUNTLET-DESIGN.md'), 'utf8');

	const files = migrationFiles(root);
	const mig = gauntletMigrations(files);
	const rows = tableRows(doc);
	const rowSet = new Set(rows);

	// 1. Every GAUNTLET migration above the table floor has a row.
	for (const { number, file } of mig) {
		if (Number(number) <= TABLE_FLOOR) continue;
		if (!rowSet.has(number)) {
			say(
				'migration-table-missing-row',
				`docs/GAUNTLET.md's migration table has no row for \`${number}\``,
				`supabase/migrations/${file} exists and the table covers every GAUNTLET migration after ${String(TABLE_FLOOR).padStart(4, '0')}`
			);
		}
	}

	// 2. Every row names a migration that exists.
	const byNumber = new Map(files.map((f) => [f.slice(0, 4), f]));
	for (const number of rows) {
		if (!byNumber.has(number)) {
			say(
				'migration-table-phantom-row',
				`docs/GAUNTLET.md's migration table has a row for \`${number}\``,
				'no supabase/migrations/' + number + '_*.sql exists'
			);
		}
	}

	// 3. Every GAUNTLET migration at or below the floor is named somewhere in
	//    the body, since the table does not claim to cover them.
	for (const { number, file } of mig) {
		if (Number(number) > TABLE_FLOOR) continue;
		const base = file.replace(/\.sql$/, '');
		if (!doc.includes('`' + number + '`') && !doc.includes(base)) {
			say(
				'migration-unnamed',
				`docs/GAUNTLET.md never names \`${number}\``,
				`supabase/migrations/${file} exists; migrations at or below ${String(TABLE_FLOOR).padStart(4, '0')} are described by the document body`
			);
		}
	}

	// 4. Every path either document names exists.
	for (const [label, text] of [
		['docs/GAUNTLET.md', doc],
		['docs/GAUNTLET-DESIGN.md', design]
	]) {
		for (const p of citedPaths(text)) {
			if (!fs.existsSync(path.join(root, p))) {
				say('cited-path-missing', `${label} names \`${p}\``, 'that path does not exist in the tree');
			}
		}
	}

	// 5. Routes, both directions.
	const routes = treeRoutes(root);
	const shell = section(doc, '## Shell');
	if (!shell) {
		say(
			'shell-section-missing',
			'docs/GAUNTLET.md has no `## Shell` section',
			'the route inventory is asserted against that section, so its absence disables the check rather than passing it'
		);
	}
	for (const url of routes) {
		if (shell && !shell.includes('`' + url + '`')) {
			say(
				'route-unlisted',
				`docs/GAUNTLET.md's Shell section never names \`${url}\``,
				`src/routes${url}/+page.svelte exists`
			);
		}
	}
	const routeSet = new Set(routes);
	for (const url of citedRoutes(doc)) {
		if (url === '/gauntlet') continue;
		if (!routeSet.has(url)) {
			say('route-phantom', `docs/GAUNTLET.md names the route \`${url}\``, `src/routes${url}/+page.svelte does not exist`);
		}
	}

	// 6. Every `gauntlet_*` identifier named is a real object.
	const real = realIdentifiers(root);
	for (const [label, text] of [
		['docs/GAUNTLET.md', doc],
		['docs/GAUNTLET-DESIGN.md', design]
	]) {
		for (const id of citedIdentifiers(text)) {
			if (real.has(id)) continue;
			const near = [...real]
				.filter((r) => r.split(/[_-]/)[1] === id.split(/[_-]/)[1])
				.slice(0, 4);
			say(
				'identifier-unknown',
				`${label} names \`${id}\``,
				near.length
					? `no such object outside a SQL comment; the real ones starting the same way are ${near.map((n) => '`' + n + '`').join(', ')}`
					: 'no such object appears in any migration outside a SQL comment, or anywhere under src/'
			);
		}
	}

	return { ok: findings.length === 0, findings };
}

/**
 * @param {Finding[]} findings
 * @returns {string}
 */
export function formatFindings(findings) {
	return findings
		.map((f) => `  [${f.check}] ${f.claim}\n      tree: ${f.tree}`)
		.join('\n');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
	const { ok, findings } = checkGauntletDocs();
	if (ok) {
		console.log('gauntlet-doc-check: docs/GAUNTLET.md and docs/GAUNTLET-DESIGN.md agree with the tree.');
		process.exit(0);
	}
	console.error(`gauntlet-doc-check: ${findings.length} finding(s).\n${formatFindings(findings)}`);
	process.exit(1);
}
