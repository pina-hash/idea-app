// tests/aria-disabled-in-flight.test.ts
//
// AN IN-FLIGHT STATE IS `disabled`; AN EXPLANATION IS `aria-disabled`. Twelve
// controls had folded the two into one attribute, and this sweep is what keeps
// them apart.
//
// THE RULE (CLAUDE.md, DOM traps): a genuinely `disabled` control swallows
// pointer events, so `aria-disabled` is used where the control has a SENTENCE
// to give when pressed -- the pass is taken, nothing is picked, the spec has
// not changed. A busy flag has no sentence: the request is already on its way
// and a second press could only queue behind it. Folding `busy` into the
// `aria-disabled` expression bought nothing a person could read and cost the
// one thing a real `disabled` gives, which is that the tap does not land.
// The exemplar is `FoundryMine.svelte`'s Submit control: `disabled={busy !==
// null}` beside `aria-disabled={!canSend ? 'true' : undefined}`, handler
// re-checking `canSend`.
//
// WHY A SOURCE SWEEP AND NOT A MOUNT. The two attributes render identically,
// the handler re-checks the busy flag either way, and the difference is only
// visible the moment a tap lands during a request -- which is exactly the
// moment nobody is looking. A regression here is silent in every harness and
// invisible to `svelte-check`. A text sweep with the sites pinned as a table
// reddens with a file and a line the day a fold comes back.
//
// WHAT IT CHECKS, IN BOTH DIRECTIONS:
//   * ABSENCE: no `aria-disabled={...}` expression on any control in the nine
//     files names an in-flight identifier -- anything containing `busy`,
//     `sending` or `loading`, in any case, so `shelfBusy`, `metaBusy`,
//     `loadingFiles`, `loadingSource` and `entryLoading` are caught by the
//     shape of the name rather than by a list that has to know each one.
//   * PRESENCE: each of the twelve controls carries `disabled={<its busy id>}`,
//     located by an anchor attribute that is unique in its file.
//   * The one control that never had an explanation to give (ReviewConsole's
//     Grade unit) carries `disabled=` and NOT `aria-disabled=`.
//   * POSITIVE CONTROLS: the pre-fix attribute, as a string fixture, is flagged
//     by the same predicate, and a fixture missing its `disabled` fails the
//     same presence check -- so "no findings" cannot be a sweep that scanned
//     nothing.
//
// The scan is a plain text walk: each `<button ...>` (and the other control
// elements) is cut out as one opening tag by tracking `{}` depth, because the
// attributes routinely carry `=>` and a `[^>]*` regex stops at the first arrow.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

/** The identifiers the pinned table's `disabled=` sites read: the vocabulary of the PRESENCE half. */
const BUSY_IDENTIFIERS = ['busy', 'sending', 'linkBusy', 'shotBusy'] as const;
/**
 * THE ABSENCE SWEEP'S PREDICATE, wider than the table on purpose: any
 * identifier containing `busy`, `sending` or `loading`, in any case. The nine
 * files declare `shelfBusy`, `metaBusy`, `loadingFiles`, `loadingSource`,
 * `loading` and `entryLoading` as in-flight flags beside the four above, and a
 * list of exact names is what let a fold spelled with one of those pass. The
 * trade is that a name which merely CONTAINS the word (`busyLabel`) is flagged
 * too; a label named for the flag beside it reads as the flag, and renaming
 * the label is cheaper than a sweep that misses `shelfBusy`.
 */
const BUSY_PATTERN = /\b\w*(busy|sending|loading)\w*\b/i;

/** Every file the fold was found in, plus the feedback box the same prompt fixed. */
const FILES = [
	'src/lib/feedback/FeedbackBox.svelte',
	'src/lib/classroom/HallPass.svelte',
	'src/lib/classroom/SongQueue.svelte',
	'src/lib/foundry/FoundryInspector.svelte',
	'src/lib/foundry/FoundryTrustRoster.svelte',
	'src/lib/notebook/EntryMove.svelte',
	'src/lib/classroom/SpecImporter.svelte',
	'src/lib/notebook/SessionManager.svelte',
	'src/lib/notebook/ReviewConsole.svelte'
] as const;

interface Site {
	file: (typeof FILES)[number];
	/** An attribute that occurs on exactly one control in the file. */
	anchor: string;
	/** The busy identifier that control's `disabled` must read. */
	busy: (typeof BUSY_IDENTIFIERS)[number];
	/** What the control read before the split, for the record. */
	before: string;
	/**
	 * Where the fold was INSIDE a `$derived` rather than in the attribute: the
	 * predicate the attribute read folded `!busy` in one level down, which a
	 * sweep over attribute text cannot see. Those two sites are checked one
	 * level deeper below, at the declaration the attribute now reads.
	 */
	foldedInside?: string;
}

/**
 * THE TWELVE, PINNED. A site that reintroduces the fold reddens on the
 * absence sweep; a site that drops its `disabled` reddens here, by anchor.
 */
const SITES: Site[] = [
	{ file: 'src/lib/classroom/HallPass.svelte', anchor: 'data-testid="hall-pass-close"', busy: 'busy', before: 'aria-disabled={busy}' },
	{ file: 'src/lib/classroom/HallPass.svelte', anchor: 'data-testid="hall-pass-open"', busy: 'busy', before: 'aria-disabled={!canOpen || busy}' },
	{ file: 'src/lib/classroom/HallPass.svelte', anchor: 'data-testid="hall-pass-override-go"', busy: 'busy', before: 'aria-disabled={busy || !overrideEmail}' },
	{ file: 'src/lib/classroom/SongQueue.svelte', anchor: 'data-testid="song-queue-send"', busy: 'busy', before: 'aria-disabled={!canRequest || busy}' },
	{ file: 'src/lib/classroom/SongQueue.svelte', anchor: 'data-testid="song-queue-approve"', busy: 'busy', before: 'aria-disabled={busy}' },
	{ file: 'src/lib/classroom/SongQueue.svelte', anchor: 'data-testid="song-queue-reject"', busy: 'busy', before: 'aria-disabled={busy}' },
	{ file: 'src/lib/classroom/SongQueue.svelte', anchor: 'data-testid="song-queue-reject-send"', busy: 'busy', before: 'aria-disabled={!reasonOk || busy}' },
	{ file: 'src/lib/foundry/FoundryInspector.svelte', anchor: 'class="btn fdy-send tap-44"', busy: 'sending', before: 'aria-disabled={!canSend || sending}' },
	{ file: 'src/lib/foundry/FoundryTrustRoster.svelte', anchor: 'class="btn fdy-trust-do tap-44"', busy: 'busy', before: "aria-disabled={!canGrant ? 'true' : undefined}", foldedInside: 'canGrant' },
	{ file: 'src/lib/notebook/EntryMove.svelte', anchor: 'data-testid="move-apply"', busy: 'busy', before: 'aria-disabled={!changed || busy}' },
	{ file: 'src/lib/classroom/SpecImporter.svelte', anchor: 'data-testid="spec-publish"', busy: 'busy', before: 'aria-disabled={!publishReady}', foldedInside: 'publishReady' },
	{ file: 'src/lib/notebook/SessionManager.svelte', anchor: 'data-testid="session-item-apply"', busy: 'linkBusy', before: "aria-disabled={linkChoice === '' || linkChoice === current?.id || linkBusy}" }
];

/** The control that carried BOTH attributes for one condition, and keeps only the real one. */
const GRADE_UNIT = { file: 'src/lib/notebook/ReviewConsole.svelte', anchor: 'data-testid="mode-grade"' } as const;

interface Tag {
	/** The whole opening tag, `<button` through `>`. */
	text: string;
	/** 1-based line of the `<`. */
	line: number;
}

const CONTROL_ELEMENTS = ['button', 'a', 'input', 'select', 'textarea'];

/**
 * Cut every control's OPENING TAG out of a file. Attribute values written as
 * `{...}` are skipped at brace depth, and string literals inside them are
 * skipped too, so a `>` inside `onclick={() => ...}` does not end the tag.
 */
function openingTags(src: string): Tag[] {
	const tags: Tag[] = [];
	const opener = new RegExp(`<(${CONTROL_ELEMENTS.join('|')})(?=[\\s/>])`, 'g');
	let m: RegExpExecArray | null;
	while ((m = opener.exec(src))) {
		const start = m.index;
		let i = start + m[0].length;
		let depth = 0;
		let quote: string | null = null;
		let end = -1;
		for (; i < src.length; i++) {
			const ch = src[i];
			if (quote) {
				if (ch === '\\') { i++; continue; }
				if (ch === quote) quote = null;
				continue;
			}
			if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
			if (ch === '{') { depth++; continue; }
			if (ch === '}') { depth--; continue; }
			if (ch === '>' && depth === 0) { end = i; break; }
		}
		if (end < 0) throw new Error(`unterminated tag at offset ${start}`);
		tags.push({ text: src.slice(start, end + 1), line: src.slice(0, start).split('\n').length });
		opener.lastIndex = end + 1;
	}
	return tags;
}

/** The `{...}` expression an `aria-disabled` reads, or null when the attribute is absent or a literal. */
function ariaDisabledExpression(tag: string): string | null {
	const at = tag.search(/(^|\s)aria-disabled=\{/);
	if (at < 0) return null;
	const open = tag.indexOf('{', at);
	let depth = 0;
	for (let i = open; i < tag.length; i++) {
		if (tag[i] === '{') depth++;
		else if (tag[i] === '}') {
			depth--;
			if (depth === 0) return tag.slice(open + 1, i);
		}
	}
	return null;
}

/** THE PREDICATE: does this opening tag fold a busy identifier into `aria-disabled`. */
function foldsBusyIntoAria(tag: string): boolean {
	const expr = ariaDisabledExpression(tag);
	return expr !== null && BUSY_PATTERN.test(expr);
}

/** Does this opening tag carry `disabled={<id>}` -- the real attribute, not `aria-disabled`. */
function carriesDisabled(tag: string, id: string): boolean {
	return new RegExp(`(^|\\s)disabled=\\{${id}\\}`).test(tag);
}

function tagsOf(file: string): Tag[] {
	return openingTags(read(file));
}

/**
 * The expression of `const <name> = $derived(<expr>);` in a file, or null when
 * there is no such declaration. `$derived.by(() => <expr>)` answers the same
 * `<expr>`, and `$derived.by(() => { ... })` answers the block's body, so a
 * fold spelled through `.by` is read by the same predicate rather than skipped
 * -- a declaration this returned null for was a declaration nobody checked.
 */
function derivedExpression(src: string, name: string): string | null {
	const m = new RegExp(`const\\s+${name}\\s*=\\s*\\$derived(\\.by)?\\(`).exec(src);
	if (!m) return null;
	const by = m[1] !== undefined;
	const open = m.index + m[0].length - 1;
	let depth = 0;
	let arg: string | null = null;
	for (let i = open; i < src.length; i++) {
		if (src[i] === '(') depth++;
		else if (src[i] === ')') {
			depth--;
			if (depth === 0) {
				arg = src.slice(open + 1, i);
				break;
			}
		}
	}
	if (arg === null || !by) return arg;
	// `() => EXPR` or `() => { ... }`: strip the arrow, then the block's braces.
	const body = arg.replace(/^\s*\(\s*\)\s*=>\s*/, '');
	const block = /^\{([\s\S]*)\}\s*$/.exec(body);
	return block ? block[1] : body;
}

/** Every identifier an expression names. */
function identifiersIn(expr: string): string[] {
	return Array.from(new Set(expr.match(/[A-Za-z_$][\w$]*/g) ?? []));
}

/** The one tag in a file carrying the anchor; throws (rather than skipping) on zero or many. */
function tagAt(file: string, anchor: string): Tag {
	const hits = tagsOf(file).filter((t) => t.text.includes(anchor));
	if (hits.length !== 1) {
		throw new Error(`${file}: anchor ${anchor} matched ${hits.length} controls, expected exactly 1`);
	}
	return hits[0];
}

describe('the instrument bites: the pre-fix attributes are what it flags', () => {
	it('flags every "before" spelling that named the flag in the attribute, as a fixture tag', () => {
		// The exact text each control carried before the split, wrapped as a
		// tag. If the predicate ever stops matching these, the absence sweep
		// below is scanning for nothing.
		const inAttribute = SITES.filter((s) => !s.foldedInside);
		expect(inAttribute).toHaveLength(10);
		for (const site of inAttribute) {
			const fixture = `<button type="button" class="btn" ${site.anchor} ${site.before} onclick={go}>`;
			expect(foldsBusyIntoAria(fixture), `${site.file} ${site.anchor}: ${site.before}`).toBe(true);
		}
	});

	it('says plainly what it cannot see: a fold one level down, inside the predicate', () => {
		// `aria-disabled={!canGrant ...}` with `canGrant = $derived(... && !busy)`
		// is the same defect and this text predicate is blind to it, by
		// construction. Recorded here rather than left implied, and closed one
		// level down in the PRESENCE block: the identifier the attribute reads
		// must be declared without a busy flag in it.
		const hidden = SITES.filter((s) => s.foldedInside).map((s) => s.foldedInside);
		expect(hidden).toEqual(['canGrant', 'publishReady']);
		for (const site of SITES.filter((s) => s.foldedInside)) {
			const fixture = `<button ${site.anchor} ${site.before} onclick={go}>`;
			expect(foldsBusyIntoAria(fixture)).toBe(false);
		}
		// And the deeper check bites on the pre-fix declaration.
		const preFix = "const canGrant = $derived(email.trim().length > 3 && email.includes('@') && !busy);";
		expect(BUSY_PATTERN.test(derivedExpression(preFix, 'canGrant') ?? '')).toBe(true);
		const split = 'const emailOk = $derived(email.trim().length > 3);\nconst canGrant = $derived(emailOk && !busy);';
		expect(BUSY_PATTERN.test(derivedExpression(split, 'emailOk') ?? '')).toBe(false);
	});

	it('reads a fold spelled through $derived.by, in the arrow form and in the block form', () => {
		// The same fold, spelled the other way `$derived` can be written. A
		// reader that matched `$derived(` alone answered null here, and a null
		// was skipped -- so this shape passed silently.
		const arrow = 'const publishReady = $derived.by(() => publishable && !busy);';
		expect(derivedExpression(arrow, 'publishReady')).toBe('publishable && !busy');
		expect(BUSY_PATTERN.test(derivedExpression(arrow, 'publishReady') ?? '')).toBe(true);
		const block = 'const publishReady = $derived.by(() => {\n\tconst held = shelfBusy;\n\treturn publishable && !held;\n});';
		const body = derivedExpression(block, 'publishReady');
		expect(body).not.toBeNull();
		expect(body).toContain('return publishable && !held;');
		expect(BUSY_PATTERN.test(body ?? '')).toBe(true);
		// A `.by` naming no flag is clean: the wider reader is not what flags.
		const clean = 'const changed = $derived.by(() => entryMoveChanged(current, next));';
		expect(derivedExpression(clean, 'changed')).toBe('entryMoveChanged(current, next)');
		expect(BUSY_PATTERN.test(derivedExpression(clean, 'changed') ?? '')).toBe(false);
	});

	it('flags a fold whether the busy identifier is alone, first, or last in the expression', () => {
		expect(foldsBusyIntoAria('<button aria-disabled={busy} onclick={() => go(x)}>')).toBe(true);
		expect(foldsBusyIntoAria('<button aria-disabled={!canOpen || busy} onclick={signOut}>')).toBe(true);
		expect(foldsBusyIntoAria('<button aria-disabled={busy || !overrideEmail} onclick={sendOut}>')).toBe(true);
		expect(foldsBusyIntoAria("<button aria-disabled={a === '' || linkBusy}>")).toBe(true);
		expect(foldsBusyIntoAria("<button aria-disabled={sending ? 'true' : undefined}>")).toBe(true);
	});

	it('flags the in-flight flags the table does not name, by the shape of the name', () => {
		// The nine files declare each of these beside `busy`; every one sits on
		// a real `disabled=` today, and a fold spelled with one must redden.
		expect(foldsBusyIntoAria('<button aria-disabled={shelfBusy}>')).toBe(true);
		expect(foldsBusyIntoAria('<button aria-disabled={!canSave || metaBusy}>')).toBe(true);
		expect(foldsBusyIntoAria('<button aria-disabled={loadingFiles}>')).toBe(true);
		expect(foldsBusyIntoAria('<button aria-disabled={loadingSource || !path}>')).toBe(true);
		expect(foldsBusyIntoAria('<button aria-disabled={loading}>')).toBe(true);
		expect(foldsBusyIntoAria("<button aria-disabled={entryLoading ? 'true' : undefined}>")).toBe(true);
		// Case is not a way past it.
		expect(foldsBusyIntoAria('<button aria-disabled={isBusy}>')).toBe(true);
		expect(foldsBusyIntoAria('<button aria-disabled={SENDING}>')).toBe(true);
		// The deliberate over-match: a name that merely contains the word reads
		// as the flag, and renaming it is the cheaper answer.
		expect(foldsBusyIntoAria('<button aria-disabled={busyLabel !== null}>')).toBe(true);
	});

	it('does NOT flag the split shape, nor an explanation that names no flag', () => {
		expect(foldsBusyIntoAria('<button disabled={busy} aria-disabled={!canOpen} onclick={signOut}>')).toBe(false);
		expect(foldsBusyIntoAria("<button disabled={busy} aria-disabled={!emailOk ? 'true' : undefined}>")).toBe(false);
		expect(foldsBusyIntoAria("<button disabled={linkBusy} aria-disabled={linkChoice === '' || linkChoice === current?.id}>")).toBe(false);
		// The explanations as they stand name no flag at all.
		expect(foldsBusyIntoAria('<button aria-disabled={!changed}>')).toBe(false);
		expect(foldsBusyIntoAria('<button aria-disabled={!publishable}>')).toBe(false);
		// No `aria-disabled` at all is not a fold.
		expect(foldsBusyIntoAria('<button disabled={busy} onclick={go}>')).toBe(false);
	});

	it('the presence check refuses a tag whose `disabled` is missing or reads the wrong flag', () => {
		expect(carriesDisabled('<button disabled={busy} aria-disabled={!canOpen}>', 'busy')).toBe(true);
		expect(carriesDisabled('<button aria-disabled={!canOpen || busy}>', 'busy')).toBe(false);
		// `aria-disabled={busy}` must not satisfy a check for `disabled={busy}`.
		expect(carriesDisabled('<button aria-disabled={busy}>', 'busy')).toBe(false);
		expect(carriesDisabled('<button disabled={linkBusy}>', 'busy')).toBe(false);
	});

	it('the tag cutter survives an arrow function in an attribute and reports the line', () => {
		const src = 'a\nb\n<button\n\tonclick={() => decide(row.id)}\n\taria-disabled={busy}\n>\nGo</button>';
		const tags = openingTags(src);
		expect(tags).toHaveLength(1);
		expect(tags[0].line).toBe(3);
		expect(tags[0].text.endsWith('\n>')).toBe(true);
		expect(foldsBusyIntoAria(tags[0].text)).toBe(true);
	});
});

describe('ABSENCE: no control in the nine files folds a busy identifier into aria-disabled', () => {
	for (const file of FILES) {
		it(file, () => {
			const tags = tagsOf(file);
			// The file was actually scanned: every one of these renders controls.
			expect(tags.length).toBeGreaterThan(0);
			const folds = tags.filter((t) => foldsBusyIntoAria(t.text)).map((t) => `${file}:${t.line} ${ariaDisabledExpression(t.text)}`);
			expect(folds).toEqual([]);
		});
	}
});

describe('PRESENCE: each of the twelve controls carries the real disabled for its busy flag', () => {
	it('the table is the twelve sites the prompt named', () => {
		expect(SITES).toHaveLength(12);
		// Every anchor is unique within its file, or the check above would be
		// asserting about the wrong control.
		for (const site of SITES) expect(() => tagAt(site.file, site.anchor)).not.toThrow();
	});

	for (const site of SITES) {
		it(`${site.file} ${site.anchor} -> disabled={${site.busy}}`, () => {
			const tag = tagAt(site.file, site.anchor);
			expect(carriesDisabled(tag.text, site.busy), `${site.file}:${tag.line}\n${tag.text}`).toBe(true);
			// And the explanation half, where there is one, no longer names the flag.
			expect(foldsBusyIntoAria(tag.text), `${site.file}:${tag.line}`).toBe(false);
			// ONE LEVEL DOWN: every `$derived` the explanation reads is declared
			// without a busy flag in it. This is what closes the two sites whose
			// fold the attribute text never showed (`canGrant`, `publishReady`).
			const expr = ariaDisabledExpression(tag.text);
			if (expr === null) return;
			const src = read(site.file);
			for (const id of identifiersIn(expr)) {
				const decl = derivedExpression(src, id);
				if (decl === null) continue;
				// Named without the `$derived(` spelling, because the declaration may be a `.by`.
				expect(BUSY_PATTERN.test(decl), `${site.file}: aria-disabled reads ${id}, whose declaration names a flag: ${decl.trim()}`).toBe(false);
			}
		});
	}

	it('the split keeps an explanation on the controls that have one to give', () => {
		// Nine of the twelve carry a sentence; the three pure in-flight controls
		// (Sign back in, Approve, Reject) carry none and must not grow one.
		const withExplanation = SITES.filter((s) => ariaDisabledExpression(tagAt(s.file, s.anchor).text) !== null);
		const pure = SITES.filter((s) => ariaDisabledExpression(tagAt(s.file, s.anchor).text) === null).map((s) => s.anchor);
		expect(withExplanation).toHaveLength(9);
		expect(pure).toEqual([
			'data-testid="hall-pass-close"',
			'data-testid="song-queue-approve"',
			'data-testid="song-queue-reject"'
		]);
	});
});

describe('SessionManager applyLink: the handler re-asks the whole explanation, and says so', () => {
	it('refuses both clauses in words on linkErr, and keeps the busy guard silent', () => {
		// A SOURCE PROXY, said so. The control's `aria-disabled` reads two
		// clauses (nothing picked, or the item it is already attached to), and
		// an `aria-disabled` control still receives the press -- so the aria
		// form is only safe when the handler refuses BOTH, and only honest when
		// each refusal SAYS something: a bare `return` is a press that does
		// nothing, the exact defect the aria form exists to avoid. Before this
		// bundle the handler refused the empty pick alone and silently, and a
		// press on "Attach" for the current item re-sent the link RPC for a row
		// that had not moved. The whole component needs a section, a grid and
		// four transports to mount, which is why this is asserted at the
		// source and not driven.
		const src = read('src/lib/notebook/SessionManager.svelte');
		const handler = src.slice(src.indexOf('async function applyLink('), src.indexOf('async function applyUnlink('));
		expect(handler.length).toBeGreaterThan(0);
		// The in-flight half stays a silent return: a disabled control does not
		// receive the press, so there is nobody to say anything to.
		expect(handler).toContain('if (!itemLink || linkBusy) return;');
		// Each explanation clause lands on `linkErr`, the line a refused link
		// already renders on (`data-testid="session-item-error"`).
		expect(handler).toContain("if (linkChoice === '') {\n\t\t\tlinkErr = 'Pick an item first.';\n\t\t\treturn;\n\t\t}");
		expect(handler).toContain("if (linkChoice === linkedItem(sessionId)?.id) {\n\t\t\tlinkErr = 'That item is already attached to this check-in.';\n\t\t\treturn;\n\t\t}");
		expect(handler).not.toContain("linkChoice === '') return;");
		expect(handler).not.toContain('linkedItem(sessionId)?.id) return;');
		expect(src).toContain('data-testid="session-item-error">{linkErr}</p>');
		// And the template reads the same two clauses, no more.
		const tag = tagAt('src/lib/notebook/SessionManager.svelte', 'data-testid="session-item-apply"');
		expect(ariaDisabledExpression(tag.text)).toBe("linkChoice === '' || linkChoice === current?.id");
	});
});

describe('FoundryTrustRoster Trust them: the explanation half has its sentence', () => {
	it('grant() answers !emailOk on `problem`, keeps the busy guard silent, and the aria state is painted', () => {
		// A SOURCE PROXY, like the block above. `emailOk` is the control's
		// `aria-disabled`, so the press lands; a handler that returned bare on
		// it was a press that did nothing. The busy half is a real `disabled`
		// and its guard stays silent.
		const src = read('src/lib/foundry/FoundryTrustRoster.svelte');
		const handler = src.slice(src.indexOf('async function grant('), src.indexOf('async function revoke('));
		expect(handler.length).toBeGreaterThan(0);
		expect(handler).toContain('if (!transports.grantTrust || busy) return;');
		// The refusal SAYS something on `problem` and clears the previous press's
		// success sentence beside it, then returns without touching `busy`.
		const refusal = handler.slice(handler.indexOf('if (!emailOk) {'), handler.indexOf('busy = true;'));
		expect(refusal).toContain('problem = "Type the student\'s school email address first.";');
		expect(refusal).toContain('said = null;');
		expect(refusal).toContain('\n\t\t\treturn;\n\t\t}');
		expect(refusal).not.toContain('busy');
		// `problem` is the line a refused grant already renders on.
		expect(src).toContain('<p class="fdy-trust-problem" role="status">{problem}</p>');
		// And the aria state is painted, in the shape the sibling files use.
		expect(src).toContain(".fdy-trust-do[aria-disabled='true'] {\n\t\topacity: 0.55;\n\t\tcursor: not-allowed;\n\t}");
	});
});

describe('ReviewConsole Grade unit: a real disabled and nothing pretending to explain', () => {
	it('carries disabled= and NOT aria-disabled=', () => {
		const tag = tagAt(GRADE_UNIT.file, GRADE_UNIT.anchor);
		expect(/(^|\s)disabled=\{unit === null\}/.test(tag.text), `${GRADE_UNIT.file}:${tag.line}`).toBe(true);
		expect(/(^|\s)aria-disabled=/.test(tag.text), `${GRADE_UNIT.file}:${tag.line}\n${tag.text}`).toBe(false);
		// The hover reading survives: the title is what a disabled control can still say.
		expect(tag.text).toContain('title=');
	});

	it('paints the disabled state through :disabled, since .mode is not a .btn', () => {
		const src = read(GRADE_UNIT.file);
		expect(src).toContain('.mode:disabled {');
		// The old selector would be dead: nothing with class `mode` carries the attribute now.
		expect(src).not.toContain(".mode[aria-disabled='true']");
	});
});
