import { describe, expect, it } from 'vitest';

import {
	FOUNDRY_ALLOWED_EXTENSIONS,
	FOUNDRY_ENTRY_FILE,
	FOUNDRY_IGNORED_EXTENSIONS,
	FOUNDRY_LIMITS,
	FOUNDRY_STARTER_PATH,
	PLATFORM_FONTS_URL,
	foundryBuildContract,
	foundryContractProfiles,
	foundryFixPrompt,
	foundryIssueLine,
	scanJs,
	type FoundryContractProfileId,
	type FoundryIssue
} from '../src/lib/foundry/preflight.ts';
import {
	FOUNDRY_SANDBOX_BASE_FLAGS,
	foundryPortalOrigin,
	foundrySandboxFlags
} from '../src/lib/foundry/bundle-headers.ts';
import { FOUNDRY_STORAGE_SHIM_TAG } from '../src/lib/foundry/storage-shim.ts';

/**
 * THE CONTRACT IS A DOCUMENT STUDENTS ACT ON, AND ITS FAILURE MODE IS SILENT.
 *
 * Nothing about a wrong sentence in here is visible: the page renders, the
 * copy button works, and the only symptom is a student building an app around
 * a rule that stopped being true. That is exactly what happened -- the sandbox
 * merge granted forms, downloads, popups and durable storage, and the document
 * went on forbidding all four for as long as nobody re-read it against the
 * code. `tests/foundry-preflight-parity.test.ts` already asserts the generated
 * numbers and lists; what was missing is a check over the PROSE, and that is
 * this file.
 *
 * IT IS A CONTROL, NOT A TRANSCRIPT. Nothing here writes down what the
 * contract should say and compares. Every expectation is derived from the
 * constant that ENFORCES the thing -- the sandbox flag set, the extension
 * allowlist, the caps, the shim string -- and the direction of the assertion
 * is taken FROM that constant. So a flag removed from
 * `FOUNDRY_SANDBOX_BASE_FLAGS` does not merely fail to match a phrase: it
 * flips this file into demanding the contract stop claiming the capability,
 * which is the behaviour a document that cannot go stale needs.
 */

const contract = foundryBuildContract();
const profiles = foundryContractProfiles();

/**
 * THE FRAME SECTION, SPLIT INTO THE HALF THAT REFUSES AND THE HALF THAT
 * GRANTS, because a containment check over the whole document cannot tell the
 * two apart. "window.open" appears in a document that forbids it and in a
 * document that permits it; only WHICH SIDE OF THE HEADING it is on carries
 * the claim, and that is the thing this file has to be able to read.
 */
function frameHalves(text: string): { refused: string; works: string } {
	const start = text.indexOf('THE FRAME');
	const split = text.indexOf('WHAT DOES WORK', start);
	const end = text.indexOf('FILE TYPES', split);
	expect(start, 'the contract has a frame section').toBeGreaterThan(-1);
	expect(split, 'the frame section names what works').toBeGreaterThan(start);
	expect(end, 'the frame section ends before the file types').toBeGreaterThan(split);
	return { refused: text.slice(start, split), works: text.slice(split, end) };
}

const halves = frameHalves(contract);

describe('the contract cannot claim a sandbox capability the flags contradict', () => {
	const flags = FOUNDRY_SANDBOX_BASE_FLAGS.split(' ');

	/**
	 * ONE PHRASE PER FLAG. The phrase is what the document says when the
	 * capability is GRANTED; whether the document is required to carry it or
	 * required not to is read off the flag set, never decided here.
	 */
	const CLAIMS: { flag: string; phrase: string }[] = [
		{ flag: 'allow-forms', phrase: 'Forms. A <form> submits.' },
		{ flag: 'allow-downloads', phrase: 'Downloads.' },
		{ flag: 'allow-popups', phrase: 'window.open. A popup opens' },
		{ flag: 'allow-modals', phrase: 'alert, confirm and prompt.' },
		{ flag: 'allow-pointer-lock', phrase: 'Pointer lock' },
		{ flag: 'allow-orientation-lock', phrase: 'Orientation lock' }
	];

	it('names every granted flag under what works, and nowhere under what does not', () => {
		// Positive control on the instrument itself: the split really did find
		// two non-trivial halves, so the absence assertions below are absences
		// from a real section rather than from an empty string.
		expect(halves.refused.length).toBeGreaterThan(200);
		expect(halves.works.length).toBeGreaterThan(200);

		for (const { flag, phrase } of CLAIMS) {
			if (flags.includes(flag)) {
				expect(halves.works, `${flag} granted`).toContain(phrase);
				expect(halves.refused, `${flag} granted`).not.toContain(phrase);
			} else {
				// The flag was withdrawn. The document must stop promising it.
				expect(halves.works, `${flag} withheld`).not.toContain(phrase);
			}
		}
	});

	/**
	 * THE TWO FLAGS THAT STAY REFUSED IN EVERY CONFIGURATION, asserted from the
	 * constant rather than from the document, and then required to be stated.
	 * Neither is about what a bundle may do to itself, so a change here is a
	 * change to what a student app can do to the page around it.
	 */
	it('states the two refusals that survive every configuration', () => {
		expect(flags).not.toContain('allow-top-navigation');
		expect(flags).not.toContain('allow-popups-to-escape-sandbox');

		// Top navigation, in the student's own vocabulary rather than the flag's.
		expect(halves.refused).toContain('target="_top"');
		expect(halves.refused).toContain('window.top.location');
		// A popup inherits the sandbox, which is the consequence of the second.
		expect(halves.works).toContain('runs under the same rules as your app');
	});

	/**
	 * `window.parent` AND `window.top` ARE BLOCKED BY THE ORIGIN SPLIT RATHER
	 * THAN BY A FLAG, so the licence for this sentence is that the resolved
	 * portal origin differs from the bundle origin -- which is what
	 * `foundryPortalOrigin` guarantees in every configuration that has an apps
	 * origin at all.
	 */
	it('says the page around the app is unreachable, and the origins say why', () => {
		const apps = 'https://apps.ideabosco.com';
		const portal = foundryPortalOrigin(apps, '');
		expect(portal).not.toBe('');
		expect(portal).not.toBe(apps);

		expect(halves.refused).toContain('window.parent');
		expect(halves.refused).toContain('window.top');
		expect(halves.refused).toContain('SecurityError');
	});

	/**
	 * THE PERMISSIONS-POLICY FEATURES ARE A DIFFERENT MECHANISM FROM THE
	 * SANDBOX, AND THE DOCUMENT HAS TO SAY THE TRUE ONE.
	 *
	 * `AppFrame.svelte` sets no `allow` attribute on the iframe, so every
	 * feature whose permissions-policy default allowlist is `self` is not
	 * delegated to a cross-origin frame. That is why the camera is unavailable,
	 * and it is NOT because of a sandbox flag -- there is no sandbox flag for
	 * a camera. A document that put them in the sandbox list would send a
	 * student looking for a flag to ask for.
	 */
	it('attributes the camera and its neighbours to the frame rather than to a flag', () => {
		for (const feature of [
			'camera',
			'microphone',
			'clipboard',
			'geolocation',
			'notifications',
			// Fullscreen is the one that reads like a sandbox flag and is not.
			// `AppFrame` sets neither `allowfullscreen` nor an `allow`, so a
			// cross-origin frame is not in the default `self` allowlist and
			// `requestFullscreen()` is refused -- while the page AROUND the app
			// has a control that resizes the frame instead.
			'fullscreen'
		]) {
			expect(halves.refused, feature).toContain(feature);
			expect(FOUNDRY_SANDBOX_BASE_FLAGS, feature).not.toContain(feature);
		}
		expect(halves.refused).toContain('not granted any of them');
		expect(halves.refused).toContain('governed by the frame\'s permissions');
		// And it does not appear in the granted half by another spelling.
		expect(halves.works).not.toContain('ullscreen');
	});
});

describe('the contract cannot claim a storage behaviour the flags contradict', () => {
	/**
	 * THE PERSISTENCE CLAIM IS LICENSED BY `allow-same-origin`, AND THE LICENCE
	 * IS CONDITIONAL. The contract describes the published app, which is the
	 * cross-origin configuration; the same function withholds the flag when the
	 * two origins match, which is dev and preview. Both directions are asserted
	 * so this reads as the conditional it is rather than as a constant.
	 */
	it('claims durable storage exactly where the flag grants a real origin', () => {
		const apps = 'https://apps.ideabosco.com';
		const portal = foundryPortalOrigin(apps, '');
		const granted = foundrySandboxFlags(apps, portal);
		expect(granted).toContain('allow-same-origin');

		// Fail-closed control: same origin, no grant. The document is written
		// for the configuration above.
		expect(foundrySandboxFlags(apps, apps)).not.toContain('allow-same-origin');

		const flat = contract.replace(/\s+/g, ' ');
		expect(flat).toContain('SURVIVES A RELOAD');
		expect(flat).not.toContain('lost on reload');
		expect(flat).not.toContain('NO STORAGE AREA');
	});

	/**
	 * A REAL ORIGIN IS ONE origin, SHARED BY EVERY PUBLISHED APP -- which is
	 * the cost of the grant above and the one thing a student has to write code
	 * about. The remedy has to be an INSTRUCTION with an example in it, not a
	 * fact about the platform: "apps share storage" is not something a tool can
	 * act on.
	 */
	it('states the shared storage area and gives the key prefix as an instruction', () => {
		const flat = contract.replace(/\s+/g, ' ');
		expect(flat).toContain('SHARES ONE STORAGE AREA');
		expect(flat).toContain('PREFIX EVERY KEY');
		expect(contract).toContain("localStorage.setItem('snake-game:highscore'");
	});

	/**
	 * THE SHIM IS STILL HANDED OUT AND IS STILL THE SAME STRING. There is
	 * exactly one copy of it in the repo; a contract carrying a retyped or
	 * edited version would hand students a snippet that is not the one injected
	 * beside it, and `isStorageShim` would then warn about their paste.
	 */
	it('embeds the live shim verbatim and reframes why it is there', () => {
		expect(contract).toContain(FOUNDRY_STORAGE_SHIM_TAG);
		// Reframed from "your data will not survive" to what it now does.
		expect(contract.replace(/\s+/g, ' ')).toContain('behave the SAME in both places');
		expect(contract).toContain('file://');
	});
});

describe('the contract cannot claim a file type the allowlist contradicts', () => {
	/**
	 * THE PROSE MAKES EXTENSION CLAIMS OF ITS OWN, outside the generated list:
	 * the engine profile promises `.wasm` and `.pck` upload and that a
	 * compressed export does not. Each is checked against the allowlist, so a
	 * change to the constant reddens the sentence rather than leaving it to be
	 * discovered by a student whose export is refused.
	 */
	it('is right about every extension its prose names', () => {
		const all = FOUNDRY_ALLOWED_EXTENSIONS as readonly string[];
		const engine = profiles.find((p) => p.id === 'engine')!;

		for (const ext of ['wasm', 'pck', 'data', 'mem', 'bin']) {
			expect(all, ext).toContain(ext);
			expect(engine.text, ext).toContain(`.${ext}`);
		}
		for (const ext of ['gz', 'br']) {
			expect(all, ext).not.toContain(ext);
			expect(engine.text, ext).toContain(`.${ext}`);
		}
		expect(engine.text).toContain('REFUSED here');
	});

	it('lists the allowlist and the ignored list from the constants, and nothing else', () => {
		const line = contract.split('\n').find((l) => l.includes('.html') && l.includes('.wasm'));
		expect(line).toBeDefined();
		for (const ext of FOUNDRY_ALLOWED_EXTENSIONS) expect(line, ext).toContain(`.${ext}`);
		// An ignored extension is never on the allowed line: the two lists are
		// different decisions and a file on both would make one branch dead.
		for (const ext of FOUNDRY_IGNORED_EXTENSIONS) {
			expect(FOUNDRY_ALLOWED_EXTENSIONS as readonly string[], ext).not.toContain(ext);
			expect(line, ext).not.toContain(`.${ext}`);
			expect(contract, ext).toContain(`.${ext}`);
		}
	});

	it('carries the caps, the entry file and the fonts URL from the constants', () => {
		const mb = (b: number) => `${Math.round(b / (1024 * 1024))} MB`;
		expect(contract).toContain(`At most ${FOUNDRY_LIMITS.maxFiles} files.`);
		expect(contract).toContain(mb(FOUNDRY_LIMITS.maxTotalBytes));
		expect(contract).toContain(mb(FOUNDRY_LIMITS.maxZipBytes));
		expect(contract).toContain(mb(FOUNDRY_LIMITS.warnAssetBytes));
		expect(contract).toContain(FOUNDRY_ENTRY_FILE);
		expect(contract).toContain(`<link rel="stylesheet" href="${PLATFORM_FONTS_URL}">`);
	});

	/**
	 * `<base href>` WORKS NOW, and the document has to say so AND repeat the
	 * warning the upload already gives. This rule used to be "a <base> cannot
	 * work", which was true while the CSP carried `base-uri 'none'`; it names
	 * the bundle origin and `https:` now.
	 */
	it('says a base href works and repeats the dependency warning', () => {
		const flat = contract.replace(/\s+/g, ' ');
		expect(flat).toContain('<base href="..."> WORKS');
		expect(flat).toContain('a school network blocks it, your app is broken');
		expect(flat).not.toContain("base-uri 'none'");
	});
});

/* -------------------------------------------------------------------------
 * The profiles.
 * ---------------------------------------------------------------------- */

/**
 * THE CORE, TAKEN FROM THE DEFAULT DOCUMENT RATHER THAN RETYPED. It is
 * everything from the first generated heading onwards, which is the whole of
 * what a profile must carry unchanged. Deriving it here is what makes "the
 * profile contains the core" an assertion about the shipping string instead of
 * an assertion about a copy of it kept in this file.
 */
const CORE_START = 'OUTPUT SHAPE\n';
const core = contract.slice(contract.indexOf(CORE_START));

const EXPECTED_IDS: FoundryContractProfileId[] = [
	'new',
	'port',
	'single-file',
	'canvas',
	'engine',
	'fix'
];

describe('every profile is a preamble plus the one set of rules', () => {
	it('offers the six situations, in the order somebody arrives in them', () => {
		expect(profiles.map((p) => p.id)).toEqual(EXPECTED_IDS);
		// Positive control on the derivation: the core really is a substantial
		// document and not an empty slice from a missing heading.
		expect(core.length).toBeGreaterThan(3000);
		expect(core.startsWith(CORE_START)).toBe(true);
	});

	// ONE TEST PER PROFILE, named after it, so a failure says which document
	// lost the rules rather than "profiles[3]".
	for (const id of EXPECTED_IDS) {
		it(`the ${id} profile contains the core, verbatim and once`, () => {
			const p = profiles.find((v) => v.id === id)!;
			expect(p.text).toContain(core);
			// Once, not twice: a profile that pasted the core into its preamble
			// as well would pass a containment check and ship the rules twice.
			expect(p.text.split(CORE_START).length - 1).toBe(1);
			// And it is the TAIL of the document, so the preamble is the only
			// thing above the rules.
			expect(p.text.endsWith(core)).toBe(true);
		});
	}

	it('is the same document as foundryBuildContract for the default profile', () => {
		// FoundryContract.svelte renders the server-sent string for `new` and
		// the profile's own text for the other five. That branch is only honest
		// while these two are the same bytes.
		expect(profiles.find((p) => p.id === 'new')!.text).toBe(contract);
	});

	/**
	 * NO PREAMBLE RESTATES A RULE THE CORE ALREADY STATES, which is the whole
	 * design: a second statement is a second thing to keep true, and the copy
	 * that goes stale is never the generated one.
	 *
	 * WHAT IS CHECKED IS THE GENERATED VALUES, because those are the ones that
	 * MOVE. A preamble that spelled a cap, the extension list or the shim would
	 * be frozen at whatever the constants said the day it was written.
	 */
	it('states no generated value in any preamble', () => {
		const mb = (b: number) => `${Math.round(b / (1024 * 1024))} MB`;
		const forbidden = [
			FOUNDRY_STORAGE_SHIM_TAG,
			PLATFORM_FONTS_URL,
			`${FOUNDRY_LIMITS.maxFiles} files`,
			mb(FOUNDRY_LIMITS.maxZipBytes),
			mb(FOUNDRY_LIMITS.maxTotalBytes),
			FOUNDRY_ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(' ')
		];
		for (const p of profiles) {
			for (const value of forbidden) {
				expect(p.preamble, `${p.id}`).not.toContain(value);
			}
		}
		// Positive control: every one of those values IS in the core, so the
		// absences above are about where they are said and not about whether.
		for (const value of forbidden) expect(core).toContain(value);
	});

	it('gives every profile a label and a one-line reason to pick it', () => {
		const labels = new Set<string>();
		for (const p of profiles) {
			expect(p.label.trim(), p.id).not.toBe('');
			expect(p.pick.trim(), p.id).not.toBe('');
			// ONE line. The picker shows nothing else, so a second line is a
			// paragraph nobody reads in a grid of six.
			expect(p.pick.includes('\n'), p.id).toBe(false);
			labels.add(p.label);
		}
		expect(labels.size).toBe(profiles.length);
	});

	it('gives every profile a distinct preamble that opens the document', () => {
		const seen = new Set<string>();
		for (const p of profiles) {
			expect(p.text.startsWith('BUILD CONTRACT -- IDEA Foundry'), p.id).toBe(true);
			expect(p.text, p.id).toContain(p.preamble);
			expect(p.preamble.length, p.id).toBeGreaterThan(80);
			seen.add(p.preamble);
		}
		expect(seen.size).toBe(profiles.length);
	});

	/**
	 * THE FIX PROFILE IS THE ONE THAT IS NOT A BUILD CONTRACT, and it has to
	 * read as an instruction about messages rather than as rules with a
	 * different opening. It still carries the core, because the rules are what
	 * every message is enforcing.
	 */
	it('makes the fix profile an instruction with somewhere to paste the messages', () => {
		const fix = profiles.find((p) => p.id === 'fix')!;
		expect(fix.preamble).toContain('Fix EVERY failure');
		expect(fix.preamble).toContain('[paste them here]');
		expect(fix.text).toContain(core);
	});

	/**
	 * THE PORTING PROFILE IS THE ONE THAT NEEDS THE MOST HELP, and the four
	 * things it exists to answer are the four a student gets wrong. Asserted by
	 * subject rather than by wording, so it can be rewritten without this
	 * pinning the prose.
	 */
	it('answers the four porting questions', () => {
		const port = profiles.find((p) => p.id === 'port')!.preamble;
		// What to upload: the build OUTPUT, not the source.
		expect(port).toContain('upload the OUTPUT folder');
		// Why a base href mirror works, and what it costs.
		expect(port).toContain('<base href>');
		expect(port).toContain('depends completely on that other site');
		// What to strip.
		expect(port).toContain('node_modules');
		// What to do when it wants a server.
		expect(port).toContain('IF THE GAME WANTS A SERVER');
		expect(port).toContain('Never put an API key');
	});
});

/* -------------------------------------------------------------------------
 * The fix prompt.
 * ---------------------------------------------------------------------- */

/**
 * THE PROMPT IS BUILT FROM THE REAL ISSUE LIST AND NEVER FROM A DESCRIPTION OF
 * IT, which is the one property worth guarding here: a summarising layer would
 * be a second statement of what the rules are, and the second statement is the
 * one that stops matching the sentences the student can also read on screen.
 *
 * THE FIXTURE IS REAL SCANNER OUTPUT rather than hand-written issues, because
 * a hand-written issue is a shape the producer may not emit -- and the whole
 * claim being tested is that what goes into the prompt is what came out of the
 * scanners.
 */
describe('the fix prompt carries the real messages', () => {
	const scanned = scanJs('app.js', "import x from '/lib/a.js';\nlocalStorage.getItem('save');");
	const failures = scanned.failures;
	const warnings = scanned.warnings;

	it('is built from output the scanners actually produced', () => {
		expect(failures.length).toBeGreaterThan(0);
		expect(warnings.length).toBeGreaterThan(0);
	});

	it('reproduces every sentence verbatim, through the panel’s own renderer', () => {
		const prompt = foundryFixPrompt(failures, warnings);
		for (const issue of [...failures, ...warnings]) {
			expect(prompt).toContain(issue.message);
			// And through the SAME renderer the per-issue Copy button uses, so
			// the two clipboards cannot differ.
			expect(prompt).toContain(foundryIssueLine(issue));
		}
		// No summarising: one bullet per issue and no more.
		const bullets = (prompt.match(/^- /gm) ?? []).length;
		const instructionBullets = (foundryFixPrompt(failures, []).match(/^- /gm) ?? []).length;
		expect(bullets).toBe(instructionBullets + warnings.length);
	});

	it('keeps failures and warnings apart, because the instruction treats them differently', () => {
		const prompt = foundryFixPrompt(failures, warnings);
		const f = prompt.indexOf('FAILURE');
		const w = prompt.indexOf('WARNING (');
		expect(f).toBeGreaterThan(-1);
		expect(w).toBeGreaterThan(f);
		// The failure's sentence is above the warnings heading; the warning's is
		// below it. That is what "kept apart" means and a containment check
		// cannot see it.
		expect(prompt.indexOf(failures[0]!.message)).toBeLessThan(w);
		expect(prompt.indexOf(warnings[0]!.message)).toBeGreaterThan(w);
	});

	it('tells the tool what to do with them, not merely what they are', () => {
		const prompt = foundryFixPrompt(failures, warnings);
		expect(prompt).toContain('Fix EVERY failure');
		expect(prompt).toContain('output every CHANGED FILE IN FULL');
		expect(prompt).toContain('/foundry/contract');
	});

	/**
	 * WARNINGS ALONE STILL PRODUCE A PROMPT. An upload that PASSED carrying a
	 * `<base href>` and an unprefixed storage key is exactly the app that
	 * behaves oddly later, and the student is standing on the surface now.
	 */
	it('is offered for warnings with no failures', () => {
		const prompt = foundryFixPrompt([], warnings);
		expect(prompt).not.toBe('');
		expect(prompt).toContain(warnings[0]!.message);
		expect(prompt).not.toContain('FAILURE');
	});

	/**
	 * AND NOTHING AT ALL WHEN THERE IS NOTHING TO ACT ON, so the caller has one
	 * thing to test and cannot offer a control that copies an instruction with
	 * no instructions in it.
	 */
	it('is empty when there is nothing to act on', () => {
		expect(foundryFixPrompt([], [])).toBe('');
		const none: FoundryIssue[] = [];
		expect(foundryFixPrompt(none)).toBe('');
	});
});

describe('the contract is reachable and says where the starter is', () => {
	it('names the starter path from the constant the routes use', () => {
		expect(FOUNDRY_STARTER_PATH).toBe('/foundry/starter');
	});
});

/* -------------------------------------------------------------------------
 * What the surfaces actually render.
 *
 * SSR-ONLY, the `tests/foundry-gallery.test.ts` pattern: `svelte/server`'s
 * render() mounts the REAL components and hands back the markup a browser
 * receives. Nothing here re-implements the markup under test.
 * ---------------------------------------------------------------------- */

describe('the contract page renders the picker and the selected document', () => {
	it('offers all six profiles, each with the line saying which to pick', async () => {
		const { render } = await import('svelte/server');
		const FoundryContract = (await import('../src/lib/foundry/FoundryContract.svelte')).default;
		const { body } = render(FoundryContract, { props: { contract } });

		// One radio per profile, in one group, so the six are a choice and not
		// six independent toggles.
		const radios = body.match(/type="radio"/g) ?? [];
		expect(radios.length).toBe(profiles.length);
		expect((body.match(/name="contract-profile"/g) ?? []).length).toBe(profiles.length);

		for (const p of profiles) {
			expect(body, p.id).toContain(p.label);
			// The picker's one line, escaped the way Svelte escapes it. Svelte's
			// text escaping covers `&` and `<` and leaves `>` alone, which is
			// correct in a text node -- so the fixture has to match the encoder
			// rather than the other way round.
			const escaped = p.pick.replace(/&/g, '&amp;').replace(/</g, '&lt;');
			expect(body, p.id).toContain(escaped);
		}
	});

	it('renders the server-sent document, not a second generation of it', async () => {
		const { render } = await import('svelte/server');
		const FoundryContract = (await import('../src/lib/foundry/FoundryContract.svelte')).default;
		const marker = 'A SENTENCE ONLY THIS FIXTURE CONTAINS';
		const { body } = render(FoundryContract, { props: { contract: `${contract}\n${marker}` } });
		// The `new` tab shows the prop. A component that ignored it and
		// regenerated would render a document without the marker in it.
		expect(body).toContain(marker);
	});
});

describe('the submit surface puts the contract in front of the first upload', () => {
	/** The narrowest transports the component will mount with. */
	function transports() {
		const ok = async () => ({ ok: true }) as never;
		return {
			uid: 'u1',
			createApp: ok,
			uploadZip: ok,
			createVersion: ok,
			ingest: ok,
			uploadCover: ok,
			saveField: ok,
			existingApps: []
		} as never;
	}

	it('names the contract and the six profiles above the drop zone', async () => {
		const { render } = await import('svelte/server');
		const FoundrySubmit = (await import('../src/lib/foundry/FoundrySubmit.svelte')).default;
		const { body } = render(FoundrySubmit, { props: { transports: transports() } });

		expect(body).toContain('Read this before you upload');
		expect(body).toContain('href="/foundry/contract"');
		expect(body).toContain(`href="${FOUNDRY_STARTER_PATH}"`);

		// The six are NAMED, from the profiles themselves. A page that typed the
		// list out in prose would go on naming a renamed profile forever; this
		// reddens instead.
		for (const p of profiles) expect(body, p.id).toContain(p.label);

		// The link is ABOVE the drop zone, so it is read before the thing it is
		// about rather than after the refusal. Ordering, not presence.
		expect(body.indexOf('Read this before you upload')).toBeLessThan(
			body.indexOf('Drop your app here')
		);
	});

	/**
	 * THE OTHER DIRECTION, which is the half a presence check cannot give: with
	 * nothing picked there are no issues, so the fix-prompt control must not be
	 * on the page at all. `foundryFixPrompt` returning the empty string is what
	 * the `{#if}` reads, and that function is pinned above.
	 */
	it('offers no fix prompt before anything has been checked', async () => {
		const { render } = await import('svelte/server');
		const FoundrySubmit = (await import('../src/lib/foundry/FoundrySubmit.svelte')).default;
		const { body } = render(FoundrySubmit, { props: { transports: transports() } });

		expect(body).not.toContain('Copy as a fix prompt');
		expect(body).not.toContain('Hand this back to whatever built your app');
		// Positive control on the same render: the pane really did draw, so the
		// two absences are absences from a page rather than from nothing.
		expect(body).toContain('Drop your app here');
	});
});
