/**
 * /dev/avatars -- the claim that a FACE DOES NOT MOVE A ROW.
 *
 * This bundle puts an avatar beside a student's name on staff surfaces. The
 * failure it can produce is not a broken picture, which somebody would notice
 * -- it is a roster whose rows change height depending on whether each
 * person's image happens to load, so a class list reflows every time an object
 * 404s. Nothing reports that; it just looks slightly wrong forever.
 *
 * SO THE LOAD-BEARING ROWS HERE ARE THE `orderResult` PROBES, not the presence
 * counts. `horizontal-scroll` and `contrast` cannot see a height difference
 * between two rows, and `tapTargets` measures a control rather than a row --
 * so the row geometry is read directly and compared case against case, which
 * is the only thing that answers the question.
 *
 * WHY THE FIXTURE IS FABRICATED END TO END, said here because it is a privacy
 * decision rather than a convenience: every real surface this bundle touches
 * is staff-gated precisely because it renders a minor's face, and `/dev` has
 * no guard. The "uploaded" avatar is a data: URI and the "broken" one is a
 * path that resolves to nothing, so this page holds no real person and makes
 * no request.
 *
 * THE EIGHT TINTS ARE MEASURED HERE AND NOWHERE ELSE. `$lib/avatars.ts` picks
 * an initials colour per person from a pinned set, and the set was chosen at
 * one lightness precisely so it could be cleared as a set -- `contrast` with
 * `all: true` reports the WORST of the eight against the real rendered ground,
 * which is the assertion that says so.
 */
export default {
	path: '/dev/avatars',
	label: 'Avatar cases: no picture, a broken picture, a long name',
	presence: [
		{ selector: '.harness h1', label: 'page heading', expectPresent: 1 },
		/* THE POSITIVE CONTROL FOR EVERY ROW BELOW. Without it a page that
		   failed to render at all would satisfy the absence rows and the
		   geometry probes would compare nothing against nothing. */
		{ selector: '[data-testid="avatar-row"]', label: 'the six roster cases', expectPresent: 6, maxPresent: 6 },
		{ selector: '[data-testid="avatar-tint"]', label: 'one sample per tint (a key per BUCKET, searched)', expectPresent: 8, maxPresent: 8 },
		{ selector: '[data-testid="avatar-parity-row"]', label: 'the five parity rows (identical text)', expectPresent: 5, maxPresent: 5 },
		/* The picture that LOADS, and the preset glyph: the two states that
		   must still be a picture rather than a tile. One img is the data: URI
		   (the broken one has swapped to a tile by the time this reads). */
		{ selector: '[data-case="loads"] img', label: 'the avatar that loads is an img', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-case="preset"] svg path', label: 'the chosen preset is a glyph', expectPresent: 1, maxPresent: 1 },
		/* THE BROKEN ONE MUST NOT STILL BE AN IMG. This is the row that says
		   `onerror` fired in a REAL browser rather than in happy-dom, where
		   the mount test dispatches the event by hand. */
		{ selector: '[data-case="broken"] img', label: 'the broken avatar left no img behind', expectPresent: 0 },
		{ selector: '[data-case="broken"] .initials', label: 'the broken avatar became a tile', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-case="none"] .initials', label: 'no picture is a tile', expectPresent: 1, maxPresent: 1 }
	],
	contrast: [
		{ selector: '.harness h1', label: 'h1 on its plate', min: 4.5 },
		/* ALL EIGHT, worst reported. This is the row that would have caught
		   reusing the preset palette as ink -- two of those eight measure
		   under 3:1 as text on this ground. */
		{ selector: '[data-testid="avatar-tint"] .initials', label: 'every initials tint on the real ground', min: 4.5, all: true },
		{ selector: '[data-testid="avatar-row"] .roster-name', label: 'the name beside the face', min: 4.5, all: true },
		{ selector: '[data-testid="avatar-row"] .roster-email', label: 'the address under it', min: 4.5, all: true }
	],
	orderResult: [
		{
			/* THE WHOLE POINT OF THIS SPEC. Six rows, four of them differing
			   only in what the picture is doing, and the heights must agree. It
			   answers a CATEGORY rather than a pixel count because an
			   `orderResult` array has to be identical at both widths, and the
			   long-name row genuinely wraps at 375 -- so the comparison is made
			   over the rows whose content is one line, with the wrapping row
			   reported separately below. */
			label: 'a missing or broken picture does not change a row height',
			evaluate:
				'() => { const rows = [...document.querySelectorAll("[data-testid=\\"avatar-parity-row\\"]")]; if (rows.length !== 5) return ["EXPECTED 5 PARITY ROWS, GOT " + rows.length]; const hs = rows.map((r) => Math.round(r.getBoundingClientRect().height)); if (hs.some((v) => v < 1)) return ["A ROW HAD NO BOX: " + JSON.stringify(hs)]; const same = hs.every((v) => Math.abs(v - hs[0]) <= 1); return [same ? "identical" : "DIFFER: " + rows.map((r, i) => r.dataset.case + "=" + hs[i]).join(" ")]; }',
			expected: ['identical']
		},
		{
			/* THE AVATAR ITSELF IS THE SAME BOX IN EVERY CASE, which is the
			   mechanism underneath the row claim: if a tile were a different
			   size from an image the rows could still agree by accident (a
			   taller name line absorbing it) and would stop agreeing the day
			   the name got shorter. */
			label: 'the avatar box is the same size whatever it is painting',
			evaluate:
				'() => { const boxes = [...document.querySelectorAll("[data-testid=\\"avatar-row\\"] .avatar, [data-testid=\\"avatar-parity-row\\"] .avatar")].map((e) => { const r = e.getBoundingClientRect(); return Math.round(r.width) + "x" + Math.round(r.height); }); if (boxes.length !== 11) return ["EXPECTED 11, GOT " + boxes.length]; const uniq = [...new Set(boxes)]; return [uniq.length === 1 ? "one size: " + uniq[0] : "DIFFER: " + uniq.join(", ")]; }',
			expected: ['one size: 28x28']
		},
		{
			/* A LONG NAME MUST NOT SQUEEZE THE PICTURE. The failure this
			   forbids is the avatar shrinking to a sliver at 375 because a
			   50-character name won the flex negotiation -- which is what
			   happens without `flex-shrink: 0` and an inline min-width, and
			   which reads as a broken image rather than as a layout bug. */
			label: 'a name too long for its row does not shrink the face',
			evaluate:
				'() => { const el = document.querySelector("[data-case=\\"longname\\"] .avatar"); if (!el) return ["NO LONGNAME ROW"]; const w = Math.round(el.getBoundingClientRect().width); return [w === 28 ? "held at 28" : "SQUEEZED to " + w]; }',
			expected: ['held at 28']
		},
		{
			/* AND THE ROW STILL DOES NOT OVERFLOW ITS PAGE. `horizontal-scroll`
			   covers the document; this says the long name wrapped INSIDE the
			   row rather than the row growing past its container. */
			label: 'the long-name row stays inside the page at either width',
			evaluate:
				'() => { const el = document.querySelector("[data-case=\\"longname\\"]"); const main = document.querySelector("main.harness"); if (!el || !main) return ["NO ROW"]; const r = el.getBoundingClientRect(); const m = main.getBoundingClientRect(); return [r.right <= m.right + 1 ? "inside" : "OVERFLOWS by " + Math.round(r.right - m.right)]; }',
			expected: ['inside']
		},
		{
			/* EVERY TINT IS DISTINCT, which is what makes the set worth having.
			   A hash that collapsed to one bucket would pass the contrast row
			   (one colour, measured once) and defeat the feature silently. */
			label: 'the eight tints render as eight different colours',
			evaluate:
				'() => { const c = [...document.querySelectorAll("[data-testid=\\"avatar-tint\\"] .initials")].map((e) => getComputedStyle(e).color); if (c.length !== 8) return ["EXPECTED 8, GOT " + c.length]; return ["distinct:" + new Set(c).size]; }',
			expected: ['distinct:8']
		}
	],
	/* NO `tapTargets` BLOCK, deliberately, and an EMPTY one would have been
	   worse than none: a spec that lists a check with no rows runs nothing
	   while reading as covered. The avatar is `aria-hidden`, carries no
	   handler and is not a tap target -- nothing in this page is tappable at
	   all. The 44px claim that matters is on PeoplePanel's own row controls
	   (`.btn.tiny`), which belong to that panel and are untouched here; this
	   bundle adds a 28px decoration to the left of them and moves neither. */
	/* THE BROKEN IMAGE IS DELIBERATE, and the key is `ignoreConsole` -- the
	   name `run.mjs` actually reads (`spec.ignoreConsole ?? []`). A 404 on an
	   <img> logs a network error in Chromium and this page causes exactly one
	   on purpose; naming it by pattern is what keeps the row honest about
	   every error it did not expect. */
	ignoreConsole: [/this-object-does-not-exist\.png/, /Failed to load resource/]
};
