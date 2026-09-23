// tests/dom/ideacad-body-properties-mount.test.ts
//
// THE PER-BODY PANEL, MOUNTED against a recorder standing in for the
// workspace's `apply` and `error`. The appearance decision and the density
// discipline are proven pure in `tests/ideacad-solid-appearance-materials.test.ts`;
// what is here is the half that only exists once the component is wired:
//
//   * the appearance SENTENCE names the rung that applies, and moves when the
//     body's colour or material moves under a mounted panel (reactive props);
//   * a swatch press sends ONE `metadata` command with that hex, the current
//     swatch carries a mark and a press on it sends nothing;
//   * "Material colour" clears the override with `color: null`;
//   * the hex box normalises what was typed, blank clears, and an unparseable
//     value is a SENTENCE to `error` with NOTHING applied;
//   * the density row: a cited material shows the number, the source link and
//     "Estimate" and NO Unverified chip; an uncited one shows the chip, the
//     reason naming MatWeb or Bambu Lab, and NO number -- both directions,
//     counted on one mount as the material moves;
//   * the fixed checkbox carries its sentence and sends `fixed` both ways;
//   * a read-only body has EVERY control disabled and still shows the sentence
//     and the chip (both directions counted against the writable mount);
//   * the mass box carries NO min, so a negative value reaches the reducer.
//
// NO GEOMETRY, CONTRAST OR TAP TARGET HERE (`tests/dom/README.md`); the 44px
// controls are measured in a real Chromium in the surface's browser drive.
import { afterEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import BodyProperties from '$lib/ideacad/solid/BodyProperties.svelte';
import { BODY_COLOUR_PALETTE } from '$lib/ideacad/solid/appearance';
import { STOCK_MATERIALS } from '$lib/ideacad/solid/advisory';
import type { BodyProjection, SolidCommand } from '$lib/ideacad/solid/types';
import { controlsIn, isEnabled, mountInto, type Mounted } from './mount';
import { reactiveProps } from './reactive-props.svelte';

const Panel = BodyProperties as unknown as Component<Record<string, unknown>>;
const mesh = () => ({ positions: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array() });
const body = (over: Partial<BodyProjection> = {}): BodyProjection => ({ id: 'x1#0', name: 'Base', materialId: null, role: 'part', createdBy: 'x1', volume: 2, bounds: [0, 0, 0, 1, 2, 1], centerOfMass: [0.5, 1, 0.5], inertia: [], mesh: mesh(), faces: [], edges: [], vertices: [], ...over });

interface Harness { props: { body: BodyProjection; canWrite: boolean; change: (command: SolidCommand, label: string) => void; error?: (message: string) => void }; applied: { command: SolidCommand; label: string }[]; errors: string[] }
function harness(over: Partial<BodyProjection> = {}, canWrite = true, withError = true): Harness {
	const h: Harness = { props: null as never, applied: [], errors: [] };
	const props: Harness['props'] = { body: body(over), canWrite, change: (command, label) => { h.applied.push({ command, label }); } };
	if (withError) props.error = (m) => { h.errors.push(m); };
	h.props = reactiveProps(props);
	return h;
}
const mounted: Mounted[] = [];
function mountPanel(h: Harness) { const m = mountInto(Panel, h.props); mounted.push(m); return m; }
afterEach(async () => { for (const m of mounted) await m.stop(); mounted.length = 0; });
const text = (m: Mounted, testId: string) => m.one(`[data-testid="${testId}"]`).textContent?.replace(/\s+/g, ' ').trim() ?? '';
const has = (m: Mounted, testId: string) => m.all(`[data-testid="${testId}"]`).length;
const press = (m: Mounted, testId: string) => { m.one<HTMLButtonElement>(`[data-testid="${testId}"]`).click(); m.flush(); };
const typeChange = (m: Mounted, testId: string, value: string) => { const el = m.one<HTMLInputElement>(`[data-testid="${testId}"]`); el.value = value; el.dispatchEvent(new Event('change', { bubbles: true })); m.flush(); };
const tick = (m: Mounted, testId: string, checked: boolean) => { const el = m.one<HTMLInputElement>(`[data-testid="${testId}"]`); el.checked = checked; el.dispatchEvent(new Event('change', { bubbles: true })); m.flush(); };
const ALU = 'aluminum-6061-t6';
const RED = BODY_COLOUR_PALETTE.find((c) => c.id === 'signal-red')!;

describe('the appearance sentence', () => {
	it('names the rung that applies and moves with the body', () => {
		const h = harness(); const m = mountPanel(h);
		expect(text(m, 'ideacad-body-appearance')).toBe('No material: drawn as machined stock');
		expect(has(m, 'ideacad-body-colour-name')).toBe(0);
		h.props.body = body({ materialId: ALU }); m.flush();
		expect(text(m, 'ideacad-body-appearance')).toBe("Drawn in 6061-T6/T651 aluminum's colour");
		h.props.body = body({ materialId: ALU, color: RED.hex }); m.flush();
		expect(text(m, 'ideacad-body-appearance')).toBe(`Drawn in the body's own colour, overriding 6061-T6/T651 aluminum · ${RED.name} ${RED.hex}`);
		expect(has(m, 'ideacad-body-colour-name')).toBe(1);
		h.props.body = body({ materialId: null, color: '#123456' }); m.flush();
		expect(text(m, 'ideacad-body-appearance')).toBe("Drawn in the body's own colour · #123456 #123456");
	});
	it('marks exactly one swatch current, and it is the material one with no override', () => {
		const h = harness({ materialId: ALU }); const m = mountPanel(h);
		const pressed = () => m.all<HTMLButtonElement>('.swatch[aria-pressed="true"]');
		expect(pressed()).toHaveLength(1);
		expect(pressed()[0].dataset.testid).toBe('ideacad-body-colour-clear');
		expect(pressed()[0].textContent).toContain('Material colour');
		expect(pressed()[0].textContent).toContain('current');
		h.props.body = body({ materialId: ALU, color: RED.hex }); m.flush();
		expect(pressed()).toHaveLength(1);
		expect(pressed()[0].dataset.testid).toBe('ideacad-body-swatch-signal-red');
		/* Every swatch carries its word, never colour alone. */
		for (const c of BODY_COLOUR_PALETTE) expect(text(m, `ideacad-body-swatch-${c.id}`)).toContain(c.name);
		expect(m.all('.swatch')).toHaveLength(BODY_COLOUR_PALETTE.length + 1);
	});
});

describe('choosing a colour', () => {
	it('a swatch press sends one metadata command with that hex, and the current one sends nothing', () => {
		const h = harness({ materialId: ALU }); const m = mountPanel(h);
		press(m, 'ideacad-body-swatch-signal-red');
		expect(h.applied).toEqual([{ command: { type: 'metadata', bodyId: 'x1#0', color: RED.hex }, label: `Colour body ${RED.name}` }]);
		h.props.body = body({ materialId: ALU, color: RED.hex }); m.flush();
		press(m, 'ideacad-body-swatch-signal-red');
		expect(h.applied).toHaveLength(1);
		press(m, 'ideacad-body-colour-clear');
		expect(h.applied[1]).toEqual({ command: { type: 'metadata', bodyId: 'x1#0', color: null }, label: 'Use material colour' });
		expect(h.errors).toEqual([]);
	});
	it('the hex box normalises, blank clears, and an unparseable value is a sentence to error with nothing applied', () => {
		const h = harness({ materialId: ALU, color: RED.hex }); const m = mountPanel(h);
		expect(m.one<HTMLInputElement>('[data-testid="ideacad-body-colour-hex"]').value).toBe(RED.hex);
		typeChange(m, 'ideacad-body-colour-hex', ' FF8800 ');
		expect(h.applied).toEqual([{ command: { type: 'metadata', bodyId: 'x1#0', color: '#ff8800' }, label: 'Colour body #ff8800' }]);
		typeChange(m, 'ideacad-body-colour-hex', '#4C9AD6');
		expect(h.applied[1].command).toEqual({ type: 'metadata', bodyId: 'x1#0', color: '#4c9ad6' });
		expect(h.applied[1].label).toBe('Colour body Sky blue');
		typeChange(m, 'ideacad-body-colour-hex', '');
		expect(h.applied[2]).toEqual({ command: { type: 'metadata', bodyId: 'x1#0', color: null }, label: 'Use material colour' });
		typeChange(m, 'ideacad-body-colour-hex', 'red');
		expect(h.applied).toHaveLength(3);
		expect(h.errors).toEqual(['Enter a colour as six hex digits, like #ff8800.']);
		/* The same typed value with the body already on it sends nothing: no history row for no change. */
		typeChange(m, 'ideacad-body-colour-hex', RED.hex.toUpperCase());
		expect(h.applied).toHaveLength(3);
	});
	it('without an error prop an unparseable value goes to the reducer as typed, whose refusal is the workspace\'s', () => {
		const h = harness({ materialId: ALU }, true, false); const m = mountPanel(h);
		typeChange(m, 'ideacad-body-colour-hex', 'red');
		expect(h.applied).toEqual([{ command: { type: 'metadata', bodyId: 'x1#0', color: 'red' }, label: 'Set body colour' }]);
	});
});

describe('the density row', () => {
	it('a cited material shows the number, the source and Estimate and no Unverified chip; an uncited one the reverse', () => {
		const h = harness({ materialId: ALU }); const m = mountPanel(h);
		expect(has(m, 'ideacad-body-density-unverified')).toBe(0);
		expect(has(m, 'ideacad-body-density-reason')).toBe(0);
		expect(has(m, 'ideacad-body-density-value')).toBe(1);
		expect(text(m, 'ideacad-body-density-value')).toBe('2.70 g/cm³ · Estimate');
		const link = m.one<HTMLAnchorElement>('[data-testid="ideacad-body-density-source"]');
		expect(link.getAttribute('href')).toBe(STOCK_MATERIALS.find((x) => x.id === ALU)!.source);
		expect(link.textContent).toContain('MatWeb');
		expect(link.getAttribute('rel')).toBe('noreferrer');
		expect(text(m, 'ideacad-body-mass-readout')).toBe(`Mass: ${(2 * 16.387064 * 2.7).toFixed(2)} g · Estimate`);
		h.props.body = body({ materialId: 'carbon-steel' }); m.flush();
		expect(has(m, 'ideacad-body-density-value')).toBe(0);
		expect(has(m, 'ideacad-body-density-source')).toBe(0);
		expect(has(m, 'ideacad-body-density-unverified')).toBe(1);
		expect(text(m, 'ideacad-body-density-unverified')).toBe('Unverified');
		expect(text(m, 'ideacad-body-density-reason')).toContain('MatWeb or Bambu Lab source');
		expect(text(m, 'ideacad-body-density-reason')).toContain('Identify the grade or enter a measured mass.');
		expect(text(m, 'ideacad-body-density')).not.toMatch(/\d\.\d\d g\/cm/);
		expect(text(m, 'ideacad-body-mass-readout')).toBe('Mass: Unknown');
		/* A printed material has no bulk density either: the chip, the mass source control, and no number. */
		h.props.body = body({ materialId: 'printed-pla' }); m.flush();
		expect(has(m, 'ideacad-body-density-unverified')).toBe(1);
		expect(has(m, 'ideacad-body-density-value')).toBe(0);
		expect(has(m, 'ideacad-body-mass-source')).toBe(1);
		expect(text(m, 'ideacad-body-mass-readout')).toBe('Mass: Unknown');
		/* No material: no density row at all, and no mass source control. */
		h.props.body = body({ materialId: null }); m.flush();
		expect(has(m, 'ideacad-body-density')).toBe(0);
		expect(has(m, 'ideacad-body-mass-source')).toBe(0);
	});
	it('an entered printed mass reads as an estimate only when its source is the slicer', () => {
		const h = harness({ materialId: 'printed-pla', massG: 25, massSource: 'bambu-studio' }); const m = mountPanel(h);
		expect(text(m, 'ideacad-body-mass-readout')).toBe('Mass: 25.00 g · Estimate');
		h.props.body = body({ materialId: 'printed-pla', massG: 25, massSource: 'measured' }); m.flush();
		expect(text(m, 'ideacad-body-mass-readout')).toBe('Mass: 25.00 g');
	});
});

describe('the other controls', () => {
	it('the fixed checkbox carries its name, no instruction, and sends fixed both ways', () => {
		const h = harness(); const m = mountPanel(h);
		const box = m.one<HTMLInputElement>('[data-testid="ideacad-body-fixed"]');
		expect(box.type).toBe('checkbox');
		expect(box.checked).toBe(false);
		expect(box.closest('label')?.textContent?.trim()).toMatch(/^Fixed in place$/);
		tick(m, 'ideacad-body-fixed', true);
		expect(h.applied[0]).toEqual({ command: { type: 'metadata', bodyId: 'x1#0', fixed: true }, label: 'Fix body in place' });
		h.props.body = body({ fixed: true }); m.flush();
		expect(m.one<HTMLInputElement>('[data-testid="ideacad-body-fixed"]').checked).toBe(true);
		tick(m, 'ideacad-body-fixed', false);
		expect(h.applied[1]).toEqual({ command: { type: 'metadata', bodyId: 'x1#0', fixed: false }, label: 'Free body for mates' });
	});
	it('the mass box carries no min or max, so a negative value reaches the reducer, and the material select clears the entered mass', () => {
		const h = harness({ materialId: ALU }); const m = mountPanel(h);
		const massBox = m.one<HTMLInputElement>('[data-testid="ideacad-body-mass"]');
		expect(massBox.hasAttribute('min')).toBe(false);
		expect(massBox.hasAttribute('max')).toBe(false);
		typeChange(m, 'ideacad-body-mass', '-4');
		expect(h.applied[0]).toEqual({ command: { type: 'metadata', bodyId: 'x1#0', massG: -4, massSource: 'measured' }, label: 'Set part mass' });
		typeChange(m, 'ideacad-body-mass', '');
		expect(h.applied[1].command).toEqual({ type: 'metadata', bodyId: 'x1#0', massG: null, massSource: 'measured' });
		const select = m.one<HTMLSelectElement>('[data-testid="ideacad-body-material"]');
		for (const opt of Array.from(select.options)) opt.selected = opt.value === 'steel-1018';
		select.value = 'steel-1018'; select.dispatchEvent(new Event('change', { bubbles: true })); m.flush();
		expect(h.applied[2]).toEqual({ command: { type: 'metadata', bodyId: 'x1#0', materialId: 'steel-1018', massG: null, massSource: 'measured' }, label: 'Set material' });
		expect(Array.from(select.options).map((o) => o.value)).toEqual(['', ...STOCK_MATERIALS.map((x) => x.id)]);
	});
	it('a read-only body disables every control and still says what is drawn and what is unverified', () => {
		const writable = mountPanel(harness({ materialId: 'carbon-steel', color: RED.hex }));
		const readOnly = mountPanel(harness({ materialId: 'carbon-steel', color: RED.hex }, false));
		const enabledW = controlsIn(writable.target).filter(isEnabled).length + writable.all<HTMLButtonElement>('button').filter((b) => !b.disabled).length;
		const enabledR = controlsIn(readOnly.target).filter(isEnabled).length + readOnly.all<HTMLButtonElement>('button').filter((b) => !b.disabled).length;
		const totalW = controlsIn(writable.target).length + writable.all('button').length;
		expect(totalW).toBeGreaterThanOrEqual(6 + BODY_COLOUR_PALETTE.length + 1);
		expect(enabledW).toBe(totalW);
		expect(enabledR).toBe(0);
		expect(text(readOnly, 'ideacad-body-appearance')).toContain("Drawn in the body's own colour, overriding Carbon steel · Grade unknown");
		expect(has(readOnly, 'ideacad-body-density-unverified')).toBe(1);
		expect(readOnly.all('.swatch[aria-pressed="true"]')).toHaveLength(1);
	});
});
