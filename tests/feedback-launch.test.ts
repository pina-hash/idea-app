import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import FeedbackTrigger from '../src/lib/feedback/FeedbackTrigger.svelte';
import { GET as COINS_GET } from '../src/routes/coins/[...path]/+server';
import { GET as ASSIGNMENT_GET } from '../src/routes/assignments/[slug]/+server';
import { load as embedLoad } from '../src/routes/feedback/embed/+page.server';
import { withDev } from './stubs/app-environment';
import {
	FEEDBACK_EMBED_MARKER,
	FEEDBACK_EMBED_MESSAGES,
	FEEDBACK_EMBED_PATH,
	FEEDBACK_ROOM_TOKENS,
	feedbackEmbedSrc,
	parseEmbedMessage,
	parseEmbedParams,
	filterRoomTokens,
	parseRoomTokens,
	roomTokenValueOk
} from '../src/lib/feedback/embed';
import {
	BUILD_MEANS,
	describeBuild,
	feedbackExclusion,
	FEEDBACK_LOAD_FAILED,
	FEEDBACK_OPENING,
	isFeedbackEmbedRoute,
	REPORT_LABEL
} from '../src/lib/feedback/context';
import {
	FEEDBACK_LAUNCH_FRAME_ID,
	FEEDBACK_LAUNCH_HOOK,
	FEEDBACK_LAUNCH_ID,
	feedbackLaunchScript,
	feedbackLaunchStyle,
	injectFeedbackLaunch
} from '../src/lib/server/feedback-launch';
import { injectVersionBadge } from '../src/lib/version-badge';
import { embedDevTransports, type EmbedDevSinkRecord } from '../src/lib/feedback/embed-dev-sink';
import {
	FEEDBACK_BOX_FONT_TOKENS,
	FEEDBACK_EMBED_TYPESET_WAIT_MS,
	faceSpecs,
	firstFamily,
	settleWithin,
	warmFaces,
	type FaceLike
} from '../src/lib/feedback/embed-typeset';
import { ANONYMOUS_FEEDBACK_ENDPOINT, type FeedbackEntry } from '../src/lib/feedback/feedback';

/**
 * ONE FEEDBACK WINDOW, EVERYWHERE (ledger 0396, reports 0fe82a80 and 80bb4d23).
 *
 * A legacy page that renders no layout -- the IDEA Coin Ledger, an assignment
 * handout -- used to carry a hand-built imitation of the site's box. It now
 * carries the REAL button, server-rendered into its bytes, which opens the REAL
 * window (`/feedback/embed`) in a same-origin frame. What this file holds, each
 * one silent when broken:
 *
 *   1. THE SERVED PAGE CARRIES THE BUTTON, its stylesheet and its script, read
 *      off the REAL route handlers' output, signed in and signed out. A page
 *      whose injection quietly did nothing renders perfectly -- with no way to
 *      send feedback -- so this asserts on the bytes a browser receives, not on
 *      a helper's return value.
 *   2. THE BUTTON IS THE COMPONENT, not a copy: the injected markup is
 *      `FeedbackTrigger`'s own server render.
 *   3. THE WINDOW TAKES ONLY WHAT IT CAN CHECK from its query string: a room
 *      token is a colour, a length, a shadow or a font list, never a value that
 *      can make a request; a build's words are derived, never taken.
 *   4. THE WINDOW MAY BE FRAMED BY THIS SITE ALONE, and its harness session
 *      exists only in dev.
 */

const ROOT = new URL('../', import.meta.url);
const read = (p: string) => readFileSync(new URL(p, ROOT), 'utf8');

async function served(res: Response | Promise<Response>): Promise<string> {
	return (await res).text();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ledger = (claims: unknown) => COINS_GET({ params: { path: '' }, locals: { claims } } as any) as Promise<Response>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const assignment = () => ASSIGNMENT_GET({ params: { slug: 'idea100-blade-01' } } as any) as Promise<Response>;

/** The facts about the injection a reader of the served page depends on. */
function injectionFacts(html: string) {
	const lower = html.toLowerCase();
	const headEnd = lower.indexOf('</head>');
	const bodyEnd = lower.lastIndexOf('</body>');
	const wrapper = html.indexOf(`id="${FEEDBACK_LAUNCH_ID}"`);
	const style = html.indexOf(`<style id="${FEEDBACK_LAUNCH_ID}-css">`);
	// The button's own stylesheet: a `<style id="svelte-...">` carrying the
	// scoped `.sfb-shell` rule (the corner clearance block opens it now).
	const triggerStyle = html.search(/<style id="svelte-[a-z0-9]+">[^<]*\.sfb-shell\.svelte-/);
	const script = html.indexOf(`"frameId":"${FEEDBACK_LAUNCH_FRAME_ID}"`);
	return {
		wrappers: html.split(`id="${FEEDBACK_LAUNCH_ID}"`).length - 1,
		buttons: (html.match(/class="sfb-trigger svelte-[a-z0-9]+"/g) ?? []).length,
		label: html.includes(`<span class="sfb-word svelte-`) && html.includes(`>${REPORT_LABEL}</span>`),
		styleInHead: style > -1 && style < headEnd,
		triggerStyleInHead: triggerStyle > -1 && triggerStyle < headEnd,
		buttonInBody: wrapper > headEnd && wrapper < bodyEnd,
		scriptInBody: script > wrapper && script < bodyEnd,
		embedPath: html.includes(`"embedPath":"${FEEDBACK_EMBED_PATH}"`),
		oldPanel: /idea-ledger-report"|idea-legacy-report"|legacyReportPanel|\/api\/coin-feedback|\/api\/assignment-feedback/.test(
			html.replace(/#idea-ledger-report-btn/g, '')
		)
	};
}

const EXPECTED = {
	wrappers: 1,
	buttons: 1,
	label: true,
	styleInHead: true,
	triggerStyleInHead: true,
	buttonInBody: true,
	scriptInBody: true,
	embedPath: true,
	oldPanel: false
};

describe('the served legacy pages carry the real button and its window', () => {
	it('the Coin Ledger, signed OUT', async () => {
		const html = await served(ledger(null));
		expect(injectionFacts(html)).toEqual(EXPECTED);
		expect(html).toContain(`data-room="ledger"`);
		expect(html).toContain('"route":"/coins"');
		expect(html).toContain('"plate":true');
		expect(html).toContain('"tab":".tab-btn.active"');
	});

	it('the Coin Ledger, signed IN, carries the identical injection', async () => {
		const html = await served(ledger({ sub: 'u-1' }));
		expect(injectionFacts(html)).toEqual(EXPECTED);
	});

	it('an assignment handout', async () => {
		const res = await assignment();
		expect(res.status).toBe(200);
		const html = await res.text();
		expect(injectionFacts(html)).toEqual(EXPECTED);
		expect(html).toContain(`data-room="assignment"`);
		expect(html).toContain('"route":"/assignments/[slug]"');
		expect(html).toContain('"plate":false');
	});

	it('NEGATIVE CONTROL: the facts above tell a page with no injection from one with it', async () => {
		// The same frozen Ledger bytes, never injected: every fact must flip, or
		// the reading above is not looking at the injection at all.
		const raw = read('src/lib/legacy/coins/index.html');
		const facts = injectionFacts(raw);
		expect(facts.wrappers).toBe(0);
		expect(facts.buttons).toBe(0);
		expect(facts.styleInHead).toBe(false);
		expect(facts.scriptInBody).toBe(false);
	});

	it('a page whose anchors have drifted still gets the button, never a page without one', () => {
		const bare = '<div>no head, no body</div>';
		const out = injectFeedbackLaunch(bare, { route: '/coins', room: 'ledger', deploy: null, buildId: null });
		expect(out.startsWith(bare)).toBe(true);
		expect(out).toContain(`id="${FEEDBACK_LAUNCH_ID}"`);
		expect(out).toContain(`<style id="${FEEDBACK_LAUNCH_ID}-css">`);
		expect(out).toContain('"frameId"');
		// A head but no body: the stylesheet goes in the head, the button after it.
		const headOnly = '<html><head><title>x</title></head><p>y</p>';
		const out2 = injectFeedbackLaunch(headOnly, { route: '/coins', room: 'ledger', deploy: null, buildId: null });
		expect(out2.indexOf(`<style id="${FEEDBACK_LAUNCH_ID}-css">`)).toBeLessThan(out2.indexOf('</head>'));
		expect(out2.indexOf(`id="${FEEDBACK_LAUNCH_ID}"`)).toBeGreaterThan(out2.indexOf('</head>'));
	});

	it('goes before the LAST </body>, so a script carrying the string is not split', () => {
		const html = '<html><head></head><body><script>var t = "</body>";</script></body></html>';
		const out = injectFeedbackLaunch(html, { route: '/coins', room: 'ledger', deploy: null, buildId: null });
		expect(out).toContain('var t = "</body>";</script>');
		expect(out.lastIndexOf('</body>')).toBeGreaterThan(out.indexOf(`id="${FEEDBACK_LAUNCH_ID}"`));
	});
});

describe('the button is the component, not a copy', () => {
	it('the injected markup is FeedbackTrigger’s own server render, with its room named', async () => {
		const own = render(FeedbackTrigger, { props: { place: 'shell', label: REPORT_LABEL, id: FEEDBACK_LAUNCH_ID } });
		const html = await served(ledger(null));
		expect(html).toContain(
			own.body.replace(`id="${FEEDBACK_LAUNCH_ID}"`, `id="${FEEDBACK_LAUNCH_ID}" data-room="ledger" data-testid="${FEEDBACK_LAUNCH_HOOK}"`)
		);
		// The hook is the launcher's, never the component's (the root mount sits in every page's shell).
		expect(own.body).not.toContain('data-testid');
		// Its stylesheet too, scoped hashes and all.
		expect(html).toContain(own.head.trim());
		expect(own.head).toMatch(/\.sfb-trigger\.svelte-[a-z0-9]+ \{/);
	});

	it('the load-failed sentence is the one sentence both the button and the launcher say', () => {
		expect(read('src/lib/feedback/FeedbackTrigger.svelte')).toContain('{FEEDBACK_LOAD_FAILED}');
		const script = feedbackLaunchScript({ route: '/coins', room: 'ledger', deploy: null, buildId: null });
		expect(script).toContain(JSON.stringify(FEEDBACK_LOAD_FAILED));
	});
});

describe('the launcher and the window speak one protocol', () => {
	const script = feedbackLaunchScript({ route: '/coins', room: 'ledger', deploy: { sha: 'a1b2c3d', complete: true }, buildId: null });

	it('a frame whose document is not the window page fails at once, keyed on the one mark the page carries', () => {
		// The page renders the mark in its server markup, from the constant...
		expect(read('src/routes/feedback/embed/+page.svelte')).toContain('data-testid={FEEDBACK_EMBED_MARKER}');
		// ...and the launcher reads the same constant when the frame loads, so a
		// browser error page or the site's own error page fails the press
		// immediately instead of after the full wait for `ready`.
		expect(script).toContain(`"marker":${JSON.stringify(FEEDBACK_EMBED_MARKER)}`);
		expect(script).toContain("f.addEventListener('load'");
		expect(script).toContain("'[data-testid=\"' + CFG.marker + '\"]'");
	});

	it('names every message type the window answers, from the one list', () => {
		for (const type of Object.values(FEEDBACK_EMBED_MESSAGES)) expect(script).toContain(`"${type}"`);
	});

	it('builds the window address with the parameter names the window reads', () => {
		const src = feedbackEmbedSrc({
			route: '/coins',
			path: '/coins/index.html',
			build: describeBuild({ sha: 'a1b2c3d', complete: true }, null),
			plate: true,
			tokens: { '--fb-room-bg': '#111a14' }
		});
		const url = new URL(src, 'https://ideabosco.com');
		for (const name of url.searchParams.keys()) expect(script, name).toContain(`q.set('${name}'`);
		// And the window reads back what the launcher wrote.
		const opener = parseEmbedParams(url.searchParams);
		expect(opener.route).toBe('/coins');
		expect(opener.path).toBe('/coins/index.html');
		expect(opener.build).toEqual(describeBuild({ sha: 'a1b2c3d', complete: true }, null));
		expect(opener.plate).toBe(true);
		expect(opener.tokens).toEqual({ '--fb-room-bg': '#111a14' });
	});

	it('hands the window the room tokens it is allowed to take, and no others', () => {
		expect(script).toContain(JSON.stringify(FEEDBACK_ROOM_TOKENS));
		// The trigger's own hooks style the page's button, never the box.
		for (const own of ['--fb-room-trigger-face', '--fb-room-trigger-lift', '--fb-room-trigger-ink', '--fb-room-radius', '--fb-room-z'])
			expect(FEEDBACK_ROOM_TOKENS).not.toContain(own);
	});

	it('asks for the microphone inside the frame, and for nothing else', () => {
		expect(script).toContain(`frame.setAttribute('allow', 'microphone')`);
		expect(script).not.toMatch(/display-capture|camera|geolocation|allow-same-origin|sandbox/);
	});

	it('answers a message only from its own frame, on its own origin', () => {
		expect(script).toContain('e.source !== frame.contentWindow || e.origin !== location.origin');
		expect(script).toContain('postMessage(m, location.origin)');
		const page = read('src/routes/feedback/embed/+page.svelte');
		expect(page).toContain('e.origin !== location.origin || e.source !== window.parent');
		expect(page).toContain('window.parent.postMessage({ type }, location.origin)');
	});
});

describe('the window is the home box in the room\'s colours, and the page behind it waits (review round 1)', () => {
	const style = feedbackLaunchStyle();
	const block = (room: string) => {
		const at = style.indexOf(`[data-room='${room}'] {`);
		return style.slice(at, style.indexOf('}', at));
	};

	it('hands the box colours and never a typeface, so it keeps the home box\'s height and keys', () => {
		// Share Tech Mono for the body text made the Ledger's box 66px taller at
		// 1440x900 and dropped Cancel and Send below it (round 1, measured).
		for (const room of ['ledger', 'assignment']) {
			expect(block(room), room).toContain('--fb-room-bg:');
			expect(block(room), room).not.toContain('--fb-room-font');
		}
		expect(style).not.toMatch(/--fb-room-font(-mono)?:/);
	});

	it('takes no typeface from any room: the box and the button set the site\'s own faces everywhere (review round 4)', () => {
		// FRC's Roboto and FSP's system stack, handed in through a font hook,
		// made the box 869px of content in an 826px box at 1440x900 and put SEND
		// below its edge. The hook is gone, so no room can hand one in again.
		const files = (readdirSync(new URL('src/', ROOT), { recursive: true }) as string[]).filter((f) =>
			/\.(svelte|css|ts|js|html)$/.test(f)
		);
		// The sweep read the files that once declared or read the hook.
		for (const known of ['lib/frc/frc-theme.css', 'lib/fsp/fsp-theme.css', 'lib/feedback/SiteFeedback.svelte']) {
			expect(files).toContain(known);
		}
		const declaring = files.filter((f) => read(`src/${f}`).includes('--fb-room-font'));
		expect(declaring).toEqual([]);
		// POSITIVE CONTROL: the FRC and FSP rooms still hand the box their colours.
		expect(read('src/lib/frc/frc-theme.css')).toContain('--fb-room-accent: #0066b3;');
		expect(read('src/lib/fsp/fsp-theme.css')).toContain('--fb-room-accent: #123a5e;');
		// And the box reads the site faces directly.
		const site = read('src/lib/feedback/SiteFeedback.svelte');
		expect(site).toContain('--fb-font: var(--font-display);');
		expect(site).toContain('--fb-font-mono: var(--font-mono);');
		expect(read('src/lib/feedback/FeedbackTrigger.svelte')).toContain(
			"font-family: var(--font-mono, 'Share Tech Mono', monospace);"
		);
	});

	it('hands the Ledger\'s own lit-key word to the plate, which reads it before its unlit ink', () => {
		expect(block('ledger')).toContain('--plate-lit-ink: var(--lp-lit-ink);');
		expect(FEEDBACK_ROOM_TOKENS).toContain('--plate-lit-ink');
		// The plate's lit key reads the hook with the unlit ink as its fallback,
		// so every page that does not set it is byte-for-byte what it was.
		expect(read('src/lib/classroom/plate.css')).toContain('color: var(--plate-lit-ink, var(--plate-btn-ink));');
		// POSITIVE CONTROL: nothing in the plate itself declares the hook.
		expect(read('src/lib/classroom/plate.css')).not.toMatch(/--plate-lit-ink:/);
	});

	it('says the press is waiting, in the component\'s own words and attribute', () => {
		const script = feedbackLaunchScript({ route: '/coins', room: 'ledger', deploy: null, buildId: null });
		expect(script).toContain(`"opening":${JSON.stringify(FEEDBACK_OPENING)}`);
		expect(script).toContain("btn.setAttribute('aria-busy', 'true')");
		expect(script).toContain("btn.removeAttribute('aria-busy')");
		// The Svelte button carries the same two for its own wait.
		const { body } = render(FeedbackTrigger, { props: { pending: true } });
		expect(body).toContain('aria-busy="true"');
		expect(body).toContain(`>${FEEDBACK_OPENING}</span>`);
		const idle = render(FeedbackTrigger, { props: {} }).body;
		expect(idle).not.toContain('aria-busy');
		expect(idle).toContain(`>${REPORT_LABEL}</span>`);
	});

	it('makes the page behind the open window inert, and gives back only what it took', () => {
		const script = feedbackLaunchScript({ route: '/coins', room: 'ledger', deploy: null, buildId: null });
		expect(script).toContain('function inertPage(on)');
		expect(script).toContain('el === frame || el.inert');
		expect(script).toContain('inertPage(true)');
		expect(script).toContain('inertPage(false)');
	});

	it('hands the window the field AND the ink a person types in, from the one room (review round 2)', () => {
		// The text area's ground was the Ledger's while the words were the
		// window's own theme's: two sources for one pair. Both come from the room.
		for (const pair of [
			'--plate-ink: var(--white);',
			'--plate-chip-top: var(--lp-chip-top);',
			'--plate-well-face: var(--lp-well-face);',
			'--plate-panel-bot: var(--lp-panel-bot);'
		])
			expect(block('ledger'), pair).toContain(pair);
		for (const name of ['--plate-ink', '--plate-chip-top', '--plate-chip-shade', '--plate-well-face', '--plate-well-ground'])
			expect(FEEDBACK_ROOM_TOKENS, name).toContain(name);
		// POSITIVE CONTROL: the plate's text area really does read those names.
		const plate = read('src/lib/classroom/plate.css');
		const textarea = plate.slice(plate.indexOf(':is(.cr-plate, .site-plate) textarea {'));
		expect(textarea.slice(0, textarea.indexOf('}'))).toMatch(/var\(--plate-chip-top\)[\s\S]*color: var\(--plate-ink\)/);
	});

	it('stands the version chip aside while the "did not load" sentence sits where it was lifted to', () => {
		expect(style).toContain(`body:has(#${FEEDBACK_LAUNCH_ID} .sfb-load-failed) [data-idea-version-badge] {\n\tvisibility: hidden;`);
		expect(injectVersionBadge('<body></body>', 'portal')).toContain('data-idea-version-badge');
	});
});

describe('the window follows the page\'s theme after it was built (review round 2)', () => {
	const script = feedbackLaunchScript({ route: '/coins', room: 'ledger', deploy: null, buildId: null });
	const fn = (name: string) => {
		const at = script.indexOf(`function ${name}(`);
		return script.slice(at, script.indexOf('\n\t}\n', at));
	};

	it('re-reads the room whenever the page\'s theme attribute moves, and posts only a set that changed', () => {
		expect(script).toContain("observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })");
		expect(fn('syncRoom')).toContain('if (!frame || !ready) return;');
		expect(fn('syncRoom')).toContain('if (s === sent) return;');
		expect(fn('syncRoom')).toContain('post(MSG.room, { tokens: t });');
		// The set in the address counts as sent, so a load and an open with no
		// theme change between them post nothing.
		expect(fn('src')).toContain('sent = JSON.stringify(t);');
	});

	it('checks the room again at every open, before the window is shown, and once the window says it is ready', () => {
		const opening = fn('open');
		expect(opening.indexOf('syncRoom();')).toBeGreaterThan(-1);
		expect(opening.indexOf('syncRoom();')).toBeLessThan(opening.indexOf('show();'));
		const ready = script.slice(script.indexOf('if (d.type === MSG.ready) {'));
		expect(ready.slice(0, ready.indexOf('}'))).toContain('syncRoom();');
		// A frame thrown away forgets what it was sent.
		expect(fn('fail')).toContain('sent = null;');
	});

	it('the window applies a room message through the same filter as its address, and takes back a name the newer set drops', () => {
		const page = read('src/routes/feedback/embed/+page.svelte');
		expect(page).toContain('if (msg.type === MSG.room) applyRoom(msg.tokens ?? {});');
		expect(page).toContain('for (const name of applied) if (!(name in tokens)) roomEl.style.removeProperty(name);');
		expect(page).toContain('applyRoom(opener.tokens);');
		const msg = parseEmbedMessage({
			type: FEEDBACK_EMBED_MESSAGES.room,
			tokens: { '--fb-room-field': ' #060d08 ', '--plate-ink': '#E8FFE8', '--fb-room-bg': 'url(https://evil.example/x)', '--not-a-token': 'red' }
		});
		expect(msg?.tokens).toEqual({ '--fb-room-field': '#060d08', '--plate-ink': '#E8FFE8' });
		// The query string's door and the message's door are one filter.
		expect(parseRoomTokens(JSON.stringify({ '--plate-ink': '#E8FFE8', '--x': '1' }))).toEqual(filterRoomTokens({ '--plate-ink': '#E8FFE8', '--x': '1' }));
		// Only a room message carries tokens; an open message never does.
		expect(parseEmbedMessage({ type: FEEDBACK_EMBED_MESSAGES.open, tokens: { '--fb-room-field': '#000' } })?.tokens).toBeNull();
		for (const bad of [null, 'x', ['#000'], 7]) expect(parseEmbedMessage({ type: FEEDBACK_EMBED_MESSAGES.room, tokens: bad })?.tokens).toEqual({});
	});
});

describe('the window opens already set in its own faces, and only for a press still standing (review polish round)', () => {
	/** A font set that loads what it is asked for, refusing any face named in `fail`. */
	function fakeFonts(faces: FaceLike[], fail: string[] = []) {
		const asked: string[] = [];
		return {
			asked,
			forEach: (cb: (f: FaceLike) => void) => faces.forEach(cb),
			load: (font: string) => {
				asked.push(font);
				return fail.some((f) => font.includes(f)) ? Promise.reject(new Error('404')) : Promise.resolve([]);
			}
		};
	}
	const ROOT_FACES: FaceLike[] = [
		{ family: 'Rajdhani', weight: '300', style: 'normal' },
		{ family: 'Rajdhani', weight: '400', style: 'normal' },
		// @fontsource declares one face per subset; the same weight twice is one load.
		{ family: '"Rajdhani"', weight: '400', style: 'normal' },
		{ family: 'Rajdhani', weight: '700', style: 'normal' },
		{ family: 'Share Tech Mono', weight: '400', style: 'normal' },
		{ family: 'Orbitron', weight: '600', style: 'normal' },
		{ family: 'Some Variable', weight: '300 700', style: 'oblique 10deg' }
	];

	it('the faces warmed are the two the box is set in, read off the page, at every weight the page declares', () => {
		// The tokens are the ones SiteFeedback names on the box's scrim.
		const site = read('src/lib/feedback/SiteFeedback.svelte');
		expect(site).toContain('--fb-font: var(--font-display);');
		expect(site).toContain('--fb-font-mono: var(--font-mono);');
		expect([...FEEDBACK_BOX_FONT_TOKENS]).toEqual(['--font-display', '--font-mono']);
		expect(firstFamily("'Rajdhani', sans-serif")).toBe('Rajdhani');
		expect(firstFamily('"Share Tech Mono", monospace')).toBe('Share Tech Mono');
		expect(firstFamily('sans-serif')).toBeNull();
		expect(firstFamily('')).toBeNull();
		const fonts = fakeFonts(ROOT_FACES);
		expect(faceSpecs(fonts, ['Rajdhani', 'Share Tech Mono'])).toEqual([
			'normal 300 16px "Rajdhani"',
			'normal 400 16px "Rajdhani"',
			'normal 700 16px "Rajdhani"',
			'normal 400 16px "Share Tech Mono"'
		]);
		// NEGATIVE CONTROL: a family the box is not set in is never loaded.
		expect(faceSpecs(fonts, ['Rajdhani', 'Share Tech Mono']).join()).not.toContain('Orbitron');
		// A variable face is loaded at the first weight a shorthand can name.
		expect(faceSpecs(fonts, ['Some Variable'])).toEqual(['oblique 300 16px "Some Variable"']);
		// A set that cannot be walked still loads each family's regular face.
		expect(faceSpecs({ load: () => Promise.resolve([]) }, ['Rajdhani'])).toEqual(['16px "Rajdhani"']);
	});

	it('a face that fails is reported, never thrown, and the cap opens the box anyway', async () => {
		expect(await warmFaces(fakeFonts(ROOT_FACES), ['Rajdhani', 'Share Tech Mono'])).toBe(true);
		expect(await warmFaces(fakeFonts(ROOT_FACES, ['Share Tech Mono']), ['Rajdhani', 'Share Tech Mono'])).toBe(false);
		expect(await warmFaces(null, ['Rajdhani'])).toBe(true);
		// An injected clock: the cap fires only when it is told to.
		let fire: () => void = () => {};
		const timer = (fn: () => void) => {
			fire = fn;
		};
		expect(await settleWithin(Promise.resolve(true), 800, timer)).toBe('set');
		expect(await settleWithin(Promise.resolve(false), 800, timer)).toBe('missing');
		expect(await settleWithin(Promise.reject(new Error('x')), 800, timer)).toBe('missing');
		const never = settleWithin(new Promise<boolean>(() => {}), 800, timer);
		fire();
		expect(await never).toBe('capped');
		// The cap is short: the box is never held for a face that is not coming.
		expect(FEEDBACK_EMBED_TYPESET_WAIT_MS).toBeGreaterThan(0);
		expect(FEEDBACK_EMBED_TYPESET_WAIT_MS).toBeLessThanOrEqual(1000);
	});

	it('the window warms its faces when it mounts and every open waits for them; a close withdraws an open still waiting', () => {
		const page = read('src/routes/feedback/embed/+page.svelte');
		expect(page).toContain('faces = warmFaces(document.fonts, boxFamilies(document.documentElement));');
		expect(page).toContain('else if (msg.type === MSG.open) openWhenSet({ pathname: msg.path, tab: msg.tab });');
		// A direct visit opens through the same wait.
		expect(page).toContain('else openWhenSet();');
		// NEGATIVE CONTROL: nothing opens the box around the wait.
		expect(page.match(/fb\?\.openWindow\(/g)?.length).toBe(1);
		const opener = page.slice(page.indexOf('function openWhenSet('), page.indexOf('function framed('));
		expect(opener).toContain('if (seq !== openSeq) return;');
		const closer = page.slice(page.indexOf('function closed('), page.indexOf('function onKeydown('));
		expect(closer).toContain('openSeq++;');
		// A box whose code is still arriving is withdrawn too, not left to mount in a hidden frame.
		expect(closer).toContain('fb?.closeWindow();');
		expect(closer).toContain('if (closing) return;');
	});

	it('the button says the press is waiting until the box is on screen, and a box that came up after a no is closed again', () => {
		const script = feedbackLaunchScript({ route: '/coins', room: 'ledger', deploy: null, buildId: null });
		const at = (needle: string) => script.slice(script.indexOf(needle));
		const show = at('function show() {');
		expect(show.slice(0, show.indexOf('\n\t}\n'))).not.toContain('busy(');
		const opened = at('} else if (d.type === MSG.opened) {');
		const openedArm = opened.slice(0, opened.indexOf('} else if', 10));
		expect(openedArm).toContain('busy(false);');
		expect(openedArm).toContain('if (!isOpen) post(MSG.close);');
		const closed = at('} else if (d.type === MSG.closed) {');
		expect(closed.slice(0, closed.indexOf('} else if', 10))).toContain('busy(false);');
		// The first open in a frame waits; a later one opens at once, with no flash of the word.
		expect(at('function open() {')).toContain('if (!seen) busy(true);');
		// Escape before the frame has loaded withdraws the press.
		expect(script).toContain('else if (wantOpen) { e.preventDefault(); wantOpen = false; busy(false); }');
	});
});

describe('the window checks everything it is handed', () => {
	it('a room token is a colour, a length, a shadow or a font list', () => {
		for (const ok of [
			'#111a14',
			'#fff',
			'rgba(2, 10, 4, 0.82)',
			'rgb(0 0 0 / 50%)',
			'11px',
			"'Share Tech Mono', monospace",
			'0 2px 8px rgba(35, 31, 32, 0.18)',
			'inset 0 0 0 1px rgba(190,255,200,0.06), 0 2px 3px 0 rgba(0,0,0,0.55)',
			'color-mix(in srgb, #00ff41 40%, transparent)',
			'transparent'
		])
			expect(roomTokenValueOk(ok), ok).toBe(true);
	});

	it('and never a value that could make a request or break out of a declaration', () => {
		for (const bad of [
			'url(https://evil.example/x.png)',
			'URL(//evil.example)',
			'image-set("x.png" 1x)',
			'var(--x)',
			'red; background: url(x)',
			'red } body { display: none',
			'red !important',
			'\\75 rl(x)',
			'<script>',
			'@import "x"',
			'element(#x)',
			'attr(data-x)',
			'calc(1px',
			'1px)',
			'',
			'x'.repeat(201)
		])
			expect(roomTokenValueOk(bad), bad).toBe(false);
		expect(roomTokenValueOk(12 as unknown as string)).toBe(false);
	});

	it('drops a token whose name is not on the list, and a malformed blob entirely', () => {
		expect(
			parseRoomTokens(
				JSON.stringify({
					'--fb-room-bg': '#111a14',
					'--fb-room-accent': 'url(x)',
					'--not-a-hook': '#fff',
					color: 'red',
					'--plate-face-top': '#1d2a21'
				})
			)
		).toEqual({ '--fb-room-bg': '#111a14', '--plate-face-top': '#1d2a21' });
		for (const raw of [null, '', 'not json', '[1,2]', '"str"', '{"--fb-room-bg": 3}']) {
			expect(Object.keys(parseRoomTokens(raw)).length, String(raw)).toBe(0);
		}
	});

	it('a build stamp says what it is in words the window derives, never words the link supplies', () => {
		const q = new URLSearchParams({ route: '/coins', build: 'a1b2c3d', buildSource: 'git-commit', means: 'a lie' });
		const opener = parseEmbedParams(q);
		expect(opener.build.means).toBe(BUILD_MEANS['git-commit']);
		expect(opener.build.complete).toBe(false);
		// An unknown source or a malformed value is "none", never coerced.
		expect(parseEmbedParams(new URLSearchParams({ build: 'a1b2c3d', buildSource: 'magic' })).build.source).toBe('none');
		expect(parseEmbedParams(new URLSearchParams({ build: '<b>', buildSource: 'git-commit' })).build.source).toBe('none');
	});

	it('a route and a path are path-shaped or they are not taken', () => {
		expect(parseEmbedParams(new URLSearchParams({ route: '/assignments/[slug]' })).route).toBe('/assignments/[slug]');
		for (const bad of ['javascript:alert(1)', '//evil.example', 'coins', '/x"><script>', '/a b'])
			expect(parseEmbedParams(new URLSearchParams({ route: bad })).route, bad).toBeNull();
		// With no route the window reports itself, the honest answer for a direct visit.
		expect(parseEmbedParams(new URLSearchParams()).path).toBe(FEEDBACK_EMBED_PATH);
	});

	it('reads a message by its shape, so a well-placed sender with a bad body changes nothing', () => {
		expect(parseEmbedMessage({ type: FEEDBACK_EMBED_MESSAGES.open, path: '/coins', tab: '  Transaction   Log ' })).toEqual({
			type: FEEDBACK_EMBED_MESSAGES.open,
			path: '/coins',
			tab: 'Transaction Log',
			tokens: null
		});
		for (const bad of [null, 'idea-feedback:open', [], { type: 'idea-feedback:delete' }, { type: 3 }])
			expect(parseEmbedMessage(bad)).toBeNull();
		expect(parseEmbedMessage({ type: FEEDBACK_EMBED_MESSAGES.open, path: 'javascript:x' })?.path).toBeNull();
	});
});

describe('the window is a page of this site, framed by this site alone', () => {
	const call = (url: string) => {
		const headers: Record<string, string> = {};
		const data = embedLoad({
			url: new URL(url),
			setHeaders: (h: Record<string, string>) => Object.assign(headers, h)
		} as never) as Record<string, unknown>;
		return { headers, data };
	};

	it('refuses to be framed by another origin, and is never shared-cached', () => {
		const { headers } = call('https://ideabosco.com/feedback/embed?route=/coins');
		expect(headers['content-security-policy']).toBe("frame-ancestors 'self'");
		expect(headers['x-frame-options']).toBe('SAMEORIGIN');
		expect(headers['cache-control']).toBe('private, no-store');
	});

	it('its harness session exists only in dev, and only with the in-memory sink', () => {
		const harness = 'https://ideabosco.com/feedback/embed?sink=memory&signedIn=1';
		expect(withDev(false, () => call(harness).data)).toEqual({});
		expect(withDev(true, () => call(harness).data).claims).toBeTruthy();
		// The parameter alone, without the sink, is nothing even in dev.
		expect(withDev(true, () => call('https://ideabosco.com/feedback/embed?signedIn=1').data)).toEqual({});
	});

	it('is its own exclusion category, so no second button floats inside the window', () => {
		expect(isFeedbackEmbedRoute('/feedback/embed')).toBe(true);
		expect(feedbackExclusion('/feedback/embed')?.id).toBe('embed');
		expect(feedbackExclusion('/feedback')).toBeNull();
	});

	it('the root layout floats nothing else over a page from inside the frame', () => {
		const layout = read('src/routes/+layout.svelte');
		expect(layout).toContain('const bare = $derived(isFeedbackEmbedRoute(page.route.id));');
		expect(layout).toContain('{#if !bare}<div class="bg-fx" aria-hidden="true"></div>{/if}');
		expect(layout).toMatch(/\{#if !bare\}[\s\S]*?<PathwayPicker \/>[\s\S]*?<InstallPrompt \/>[\s\S]*?\{\/if\}/);
	});
});

/**
 * THE FOCUS RING SURVIVES EVERY ROOM (review round 3). The button and every key
 * in the box said focus with an edge colour and `outline: none`, and the plate
 * paints a key's border with a gradient at a heavier specificity, so on every
 * plated page a keyboard focus changed 0 of the button's 9128 pixels (measured).
 * The browser pass measures the ring; this holds the rules that draw it, and
 * that no rule cancels it again.
 */
describe('a keyboard focus is drawn on the button and on every key in the window (review round 3)', () => {
	/** Every rule body whose selector names `:focus-visible`, out of a stylesheet. */
	const focusRules = (css: string) =>
		[...css.matchAll(/([^{}]*:focus-visible[^{}]*)\{([^{}]*)\}/g)].map((m) => ({
			selector: m[1].trim(),
			body: m[2]
		}));
	const style = (file: string) => {
		const src = read(file);
		return src.slice(src.indexOf('<style>'), src.indexOf('</style>'));
	};

	it('the button draws the site ring through the room hook, and no focus rule on it says none', () => {
		const { head } = render(FeedbackTrigger, { props: {} });
		const rules = focusRules(head);
		expect(rules.length).toBeGreaterThan(0);
		expect(rules.some((r) => r.body.includes('outline: 2px solid var(--fb-room-focus, var(--focus-ring, #5abda8))'))).toBe(true);
		expect(rules.some((r) => r.body.includes('outline-offset: 2px'))).toBe(true);
		for (const r of rules) expect(r.body, r.selector).not.toMatch(/outline:\s*none/);
		// POSITIVE CONTROL: the plate's own keyed focus (the theme switch) is the
		// same ring, which is the convention the button now follows.
		expect(read('src/lib/classroom/plate.css')).toContain('outline: 2px solid var(--focus-ring);');
	});

	it('every key and field in the box reads the ring hook; only the dialog container itself draws none', () => {
		const rules = focusRules(style('src/lib/feedback/FeedbackBox.svelte'));
		const quiet = rules.filter((r) => /outline:\s*none/.test(r.body)).map((r) => r.selector);
		expect(quiet).toEqual(['.fb-box:focus-visible']);
		const keys = rules.find((r) => r.selector.includes('.fb-btn:focus-visible') && r.selector.includes('.fb-kind:focus-visible'));
		expect(keys?.body).toContain('outline: var(--fb-focus-ring, none)');
		expect(keys?.selector).toContain('.fb-x:focus-visible');
		for (const field of ['.fb-area:focus-visible', '.fb-contact:focus-visible', '.fb-shot-input:focus-visible + .fb-shot-choose'])
			expect(rules.find((r) => r.selector === field)?.body, field).toContain('var(--fb-focus-ring,');
		// The site hands the box the ring; a host that sets nothing (GREENLINE)
		// keeps `none` and its edge change, byte for byte.
		expect(style('src/lib/feedback/SiteFeedback.svelte')).toContain(
			'--fb-focus-ring: 2px solid var(--fb-room-focus, var(--focus-ring, #5abda8));'
		);
	});

	it('every room that hands in its own colours hands in its own ring, and the window may take it', () => {
		const css = feedbackLaunchStyle();
		for (const room of [`[data-room='ledger'] {`, `[data-room='assignment'] {`, `[data-room='assignment'][data-tone='light'] {`]) {
			const at = css.indexOf(room);
			expect(at, room).toBeGreaterThan(-1);
			expect(css.slice(at, css.indexOf('}', at)), room).toMatch(/--fb-room-focus: /);
		}
		expect(FEEDBACK_ROOM_TOKENS).toContain('--fb-room-focus');
		expect(style('src/lib/feedback/SiteFeedback.svelte')).toContain('--fb-room-focus: #c8ff00;');
		// The two LIGHT rooms, where the site's dark-ground ring (#5abda8)
		// measures about 2:1 on the paper, hand in their own.
		expect(read('src/lib/frc/frc-theme.css')).toContain('--fb-room-focus: #0066b3;');
		expect(read('src/lib/fsp/fsp-theme.css')).toContain('--fb-room-focus: #123a5e;');
	});
});

/**
 * THE HARNESS FILES A SIGNED-OUT REPORT THE WAY PRODUCTION DOES (review round 3).
 * Its sink used to send every report through the signed-in writer, so a
 * signed-out harness row carried an account and no contact.
 */
describe('the window\'s harness sink takes the real writer for each kind of reporter', () => {
	const entry: FeedbackEntry = {
		app: 'assignments',
		context: 'idea100-blade-01',
		kind: 'bug',
		message: 'The leaderboard did not refresh.',
		meta: { route: '/assignments/[slug]', path: '/assignments/idea100-blade-01' },
		contact: 'period 3',
		tried: 'Reloaded the page.'
	} as FeedbackEntry;
	const host = globalThis as unknown as { window?: unknown };
	const run = async (anonymous: boolean) => {
		const before = host.window;
		const fake = { __ideaFeedbackSink: [] as EmbedDevSinkRecord[] } as Record<string, unknown>;
		fake.parent = fake;
		host.window = fake;
		try {
			const result = await embedDevTransports({ anonymous: () => anonymous }).submit(entry);
			return { result, sink: fake.__ideaFeedbackSink as EmbedDevSinkRecord[] };
		} finally {
			host.window = before;
		}
	};

	it('signed out: the body the anonymous route receives, with the contact and no account', async () => {
		const { result, sink } = await run(true);
		expect(result.error).toBeNull();
		expect(sink.map((r) => r.kind)).toEqual(['entry', 'anonymous']);
		const sent = sink[1].value as { endpoint: string; method: string; body: Record<string, unknown> };
		expect(sent.endpoint).toBe(ANONYMOUS_FEEDBACK_ENDPOINT);
		expect(sent.method).toBe('POST');
		expect(sent.body.contact).toBe('period 3');
		expect(sent.body).not.toHaveProperty('user_id');
		expect((sent.body.meta as Record<string, unknown>).tried).toBe('Reloaded the page.');
		expect((sent.body.meta as Record<string, unknown>).route).toBe('/assignments/[slug]');
	});

	it('signed in: the row the direct insert receives, with the account and no contact', async () => {
		const { sink } = await run(false);
		expect(sink.map((r) => r.kind)).toEqual(['entry', 'row']);
		const row = sink[1].value as Record<string, unknown>;
		expect(row.user_id).toBeTruthy();
		expect(row).not.toHaveProperty('contact');
	});
});
