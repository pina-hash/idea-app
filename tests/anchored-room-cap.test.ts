import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * EVERY PANEL `anchored` PLACES EITHER CAPS ITSELF TO THE ROOM BESIDE ITS KEY OR
 * SAYS WHY IT NEED NOT (ledger 0396, integration review 4).
 *
 * The action writes `--anchor-room` on every panel it places: the tallest the
 * panel may be and still sit beside its key, clear of the corner feedback
 * button (`anchorFitHeight`). A panel taller than that has nowhere to go but
 * over its own key, which is what the rich-text editor's picture panel did on a
 * short phone once the corner reserve took the room under its key away: at
 * 375x548 with the Image key at 164px the room below was 255px against a 284px
 * panel, and a tap on the key landed on the panel. Only the Quick note read the
 * value then. So this is a census: every `use:anchored` element in the tree
 * either has a rule giving it a `max-height` that names `--anchor-room` and a
 * scrolling overflow, or is listed below with the reason somebody checked. A new
 * anchored panel therefore has to decide, rather than inherit the hole.
 */

const SRC = join(__dirname, '..', 'src');

function walk(dir: string, out: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) walk(p, out);
		else if (name.endsWith('.svelte')) out.push(p);
	}
	return out;
}

/**
 * The panels that need no cap, each keyed `file::its class attribute`. The
 * reason is what was measured or read; a stale entry fails the census.
 */
const NO_CAP: Record<string, string> = {
	'lib/classroom/RichTextEditor.svelte::link-pop':
		'the Link panel is one row (54px measured at 375 and 1440), always inside the room beside its key; its picture sibling carries the cap',
	'lib/classroom/InfoTip.svelte::info-tip-panel':
		'a tooltip with `pointer-events: none`: a cap would cut text nobody can scroll to, and a tip drawn over its key cannot take the tap meant for it',
	'lib/classroom/GradingConsole.svelte::level-tip':
		'the level descriptor tooltip, `pointer-events: none` and never truncated by design: a cap would cut a standard nobody can scroll to, and over its key it cannot take the tap',
	'lib/classroom/StudentSectionsMenu.svelte::ssm-panel':
		'sized by hand to the room beside its key (`anchorRooms`, written as an inline max-height), so it has its cap already',
	'lib/InstallAppKey.svelte::ia-card':
		'a fixed 182px card (a title, two steps, Close) that closes when its key leaves the window; the smallest room measured under its key is 244px, at 568x320'
};

const SKIP = /^routes\/dev\//;

type Site = { file: string; classes: string; line: number };

/** The static class attribute of the start tag carrying each `use:anchored`. */
function anchoredSites(rel: string, text: string): Site[] {
	const out: Site[] = [];
	const re = /use:anchored=/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(text))) {
		const open = text.lastIndexOf('<', m.index);
		const tag = text.slice(open, m.index);
		const cls = tag.match(/\sclass="([^"]*)"/);
		out.push({ file: rel, classes: cls ? cls[1].trim() : '', line: text.slice(0, m.index).split('\n').length });
	}
	return out;
}

/** Every innermost `selector { body }` in the file's own stylesheet, comments out. */
function rules(text: string): { selector: string; body: string }[] {
	const style = [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((s) => s[1]).join('\n');
	const bare = style.replace(/\/\*[\s\S]*?\*\//g, '');
	return [...bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((r) => ({ selector: r[1], body: r[2] }));
}

function forToken(all: { selector: string; body: string }[], token: string) {
	const re = new RegExp(`\\.${token.replace(/[-]/g, '\\-')}(?![\\w-])`);
	return all.filter((r) => re.test(r.selector));
}

const capped = (body: string) => /max-height\s*:[^;]*--anchor-room/.test(body);
const scrolls = (body: string) => /overflow(-y)?\s*:\s*auto/.test(body);

const files = walk(SRC)
	.map((p) => ({ rel: relative(SRC, p).split('\\').join('/'), text: readFileSync(p, 'utf8') }))
	.filter((f) => !SKIP.test(f.rel));

describe('every anchored panel caps itself to the room beside its key, or says why not', () => {
	const sites = files.flatMap((f) => anchoredSites(f.rel, f.text).map((s) => ({ ...s, rules: rules(f.text) })));

	it('finds the panels (the census is not empty)', () => {
		// POSITIVE CONTROL: the sweep reads real sites, each with a class to look a rule up by.
		expect(sites.length).toBeGreaterThanOrEqual(11);
		for (const s of sites) expect(s.classes, `${s.file}:${s.line} has no static class`).not.toBe('');
	});

	it('gives every panel not listed a max-height naming --anchor-room and a scrolling overflow', () => {
		const missing: string[] = [];
		let checked = 0;
		for (const s of sites) {
			const key = `${s.file}::${s.classes}`;
			if (key in NO_CAP) continue;
			checked += 1;
			const mine = s.classes.split(/\s+/).flatMap((t) => forToken(s.rules, t));
			const ok = mine.some((r) => capped(r.body)) && mine.some((r) => scrolls(r.body));
			if (!ok) missing.push(`${key} (line ${s.line})`);
		}
		expect(missing, 'anchored panels with no --anchor-room cap and no reason listed').toEqual([]);
		// The capped ones: the picture panel, the Quick note, the row menu, IdeaCAD's Views menu,
		// the strip's Archived list and the lines-of-code panel.
		expect(checked).toBeGreaterThanOrEqual(6);
	});

	it('lists no panel that is not there any more, and caps none it says it need not', () => {
		const keys = new Set(sites.map((s) => `${s.file}::${s.classes}`));
		const stale = Object.keys(NO_CAP).filter((k) => !keys.has(k));
		expect(stale, 'NO_CAP entries naming no anchored panel').toEqual([]);
	});
});
