// tests/dom/ideacad-viewport-mount.test.ts
//
// THE VIEWPORT'S STRUCTURE, AND THE PATH A MACHINE WITH NO WEBGL TAKES.
//
// happy-dom has no WebGL, so `canvas.getContext('webgl2')` answers null here --
// which makes this environment the no-WebGL case for free, and that case is not
// hypothetical: the budget this whole subsystem is written against is "the
// school's desktop computers, roughly 6-8 years old", where a tired driver on
// the blocklist is an ordinary Monday.
//
// WHAT MUST HOLD THERE: the numbers on the rail are computed from the feature
// tree and are still correct, so the refusal says so IN WORDS rather than
// leaving an empty rectangle. A blank pane reads as a broken page and sends a
// student to ask why their blade has no mass.
//
// THE CONTEXT TEST COMES BEFORE THE `three` IMPORT, deliberately, and that
// ordering is asserted here by its consequence: a machine that cannot use the
// renderer must not pay to download it.
//
// NO WIDTH, RATIO OR TAP TARGET (`tests/dom/README.md`): happy-dom has no
// layout engine and all three read zero. The canvas geometry, the model itself
// and the frame time are measured in `tools/browser-verify/routes/ideacad.mjs`
// against a real Chromium.

import { describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import Viewport from '$lib/ideacad/viewport/Viewport.svelte';
import BladeEditor from '$lib/ideacad/BladeEditor.svelte';
import { evaluate } from '$lib/ideacad/blade/evaluate';
import { DEFAULT_BLADE_CONFIG, DEFAULT_BLADE_TREE } from '$lib/ideacad/blade/materials';
import { mountInto } from './mount';

const Pane = Viewport as unknown as Component<Record<string, unknown>>;
const Editor = BladeEditor as unknown as Component<Record<string, unknown>>;
const evaluation = evaluate(DEFAULT_BLADE_TREE, DEFAULT_BLADE_CONFIG);

const open = (props: Record<string, unknown> = {}) => mountInto(Pane, { evaluation, ...props });

describe('the viewport, mounted', () => {
	it('renders a canvas whatever the machine can do', async () => {
		const m = open();
		await m.settle();
		expect(m.all('canvas[data-testid="ideacad-canvas"]').length).toBe(1);
		await m.stop();
	});

	it('carries the focus and the role its own key map needs', async () => {
		/* The key map (F, Z, the arrows, Ctrl+1 to Ctrl+7) is bound to this
		   element, and an element that cannot take focus cannot take a
		   keystroke. `application` is what hands a screen reader's keys to the
		   widget rather than spending them on browse mode. */
		const m = open();
		await m.settle();
		const pane = m.one<HTMLElement>('[data-testid="ideacad-viewport"]');
		expect(pane.getAttribute('tabindex')).toBe('0');
		expect(pane.getAttribute('role')).toBe('application');
		expect(pane.getAttribute('aria-label')).toBeTruthy();
		await m.stop();
	});

	it('SAYS SO when the machine cannot draw, rather than leaving a blank pane', async () => {
		const m = open();
		await m.settle();
		const said = m.one('.nogl').textContent ?? '';
		expect(said).toMatch(/cannot draw 3D/i);
		/* And it says the numbers are unaffected, which is the part that stops a
		   student reading a blank pane as a broken calculation. */
		expect(said).toMatch(/still correct/i);
		expect(m.one('.nogl').getAttribute('role')).toBe('status');
		await m.stop();
	});

	it('names the view and the axes without a renderer', async () => {
		/* The triad and the view name are an SVG overlay driven by the camera
		   quaternion, not a second WebGL scene, so they are readable here and
		   stay crisp and themed in a browser. */
		const m = open();
		await m.settle();
		expect(m.one('.view').textContent?.trim()).toBe('Isometric');
		expect(m.all('.triad text').map((t) => t.textContent).sort()).toEqual(['X', 'Y', 'Z']);
		await m.stop();
	});

	it('gives each axis its own letter, so colour is never the only signal', async () => {
		const m = open();
		await m.settle();
		const letters = m.all('.triad text');
		expect(letters.length).toBe(3);
		for (const l of letters) expect((l.textContent ?? '').trim().length).toBe(1);
		await m.stop();
	});

	it('takes no frame measurement when none was asked for', async () => {
		/* Instrumentation is HANDED IN. The real classroom page supplies no
		   `onFrame`, so production carries no measurement at all, and absence is
		   the mechanism rather than a flag. */
		let called = 0;
		const m = open({ onFrame: () => called++ });
		await m.settle();
		/* No renderer here, so no frame -- which is the honest answer and not a
		   silent zero: the callback exists and was simply never reached. */
		expect(called).toBe(0);
		await m.stop();
	});

	it('hands over no probe when the renderer never started', async () => {
		let probe: unknown = 'untouched';
		const m = open({ onReady: (p: unknown) => (probe = p) });
		await m.settle();
		expect(probe).toBe('untouched');
		await m.stop();
	});
});

describe('the editor mounts the real viewport, not a picture of one', () => {
	it('puts a canvas inside the viewport pane', async () => {
		const m = mountInto(Editor, { tree: DEFAULT_BLADE_TREE, config: DEFAULT_BLADE_CONFIG });
		await m.settle();
		expect(m.all('.viewport canvas[data-testid="ideacad-canvas"]').length).toBe(1);
		await m.stop();
	});

	it('has none of the three CSS divs that used to stand in for a model', async () => {
		/* Ledger 0160 measured what sat where the graphics area belongs: an
		   ellipse and two bars under a `rotateX(58deg)`. They are gone, and an
		   absence is worth asserting precisely because nothing else would ever
		   mention them again. */
		const m = mountInto(Editor, { tree: DEFAULT_BLADE_TREE, config: DEFAULT_BLADE_CONFIG });
		await m.settle();
		expect(m.all('.model').length).toBe(0);
		expect(m.all('.disc').length).toBe(0);
		expect(m.all('.blade').length).toBe(0);
		await m.stop();
	});

	it('offers the five heads-up controls and an orientation list behind one of them', async () => {
		const m = mountInto(Editor, { tree: DEFAULT_BLADE_TREE, config: DEFAULT_BLADE_CONFIG });
		await m.settle();
		const nav = m.all<HTMLButtonElement>('.viewport nav button');
		expect(nav.map((b) => b.textContent?.trim())).toEqual([
			'Fit',
			'Previous',
			'Orientation',
			'Edges',
			'Perspective'
		]);
		const orientation = nav[2];
		expect(orientation.getAttribute('aria-expanded')).toBe('false');
		expect(m.all('.orient').length).toBe(0);
		orientation.click();
		m.flush();
		expect(orientation.getAttribute('aria-expanded')).toBe('true');
		expect(m.all('.orient button').map((b) => b.textContent?.replace(/Ctrl\+\d/, '').trim())).toEqual([
			'Front',
			'Back',
			'Left',
			'Right',
			'Top',
			'Bottom',
			'Isometric'
		]);
		await m.stop();
	});

	it('says which limits the rail is quoting when the config is unusable', async () => {
		/* The config guard, at the boundary where a document row arrives. It
		   NAMES the substitution rather than making it silently. */
		const m = mountInto(Editor, { tree: DEFAULT_BLADE_TREE, config: { rules: {} } });
		await m.settle();
		const notices = m.all('.readouts .notice').map((n) => n.textContent ?? '');
		expect(notices.some((n) => /CONFIG UNREADABLE/.test(n))).toBe(true);
		/* And still renders every rule, because the defaults are real limits. */
		expect(m.all('.readouts .metric').length).toBe(5);
		await m.stop();
	});

	it('says nothing of the kind for the config the page actually passes', async () => {
		const m = mountInto(Editor, { tree: DEFAULT_BLADE_TREE, config: DEFAULT_BLADE_CONFIG });
		await m.settle();
		const notices = m.all('.readouts .notice').map((n) => n.textContent ?? '');
		expect(notices.some((n) => /CONFIG UNREADABLE/.test(n))).toBe(false);
		await m.stop();
	});
});
