// tests/dom/cert-desk-engine.test.ts
//
// THE ENGINE EDITOR BUILDS THE PACKAGE IT SAVES FROM ITS OWN FIELDS, AND
// PUBLISH IS HELD WHILE A PROBLEM STANDS (ledger 0391, surface d). On the REAL
// `EngineEditor`, mounted so its effects run:
//
//   - `buildPackage()` round-trips the stored package through the editor's
//     normalization (idempotent: normalizing twice is normalizing once);
//   - typing a name marks the editor dirty; pressing Save revision hands the
//     injected transport the package with the typed name and nothing else
//     moved; the answer's `publish_problems` replaces the list;
//   - Publish is `aria-disabled` (never `disabled`) while problems stand or the
//     editor is dirty, and free once a save answered no problems;
//   - with no `save` transport every write control is absent and the editor
//     says it is read-only, with the sections still present (the control).
//
// Structure, events and call arguments only (happy-dom has no layout engine).

import { afterEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import EngineEditor from '../../src/lib/certifications/desk/EngineEditor.svelte';
import { normalizeEditorPackage, type EngineSaveAnswer } from '../../src/lib/certifications/desk/desk';
import type { CertPackage } from '../../src/lib/certifications/types';
import { ADMIN_GET_DRAFT, MILL, POOL, SAFE } from '../../src/routes/dev/cert-desk/fixtures';

type Exports = { buildPackage(): CertPackage };

let app: Exports | null = null;
let target: HTMLElement | null = null;
let saved: { pkg: CertPackage; note: string }[] = [];

function start(opts: { save: boolean; problemsAfterSave?: string[] }) {
	saved = [];
	target = document.createElement('div');
	document.body.appendChild(target);
	const save = opts.save
		? async (pkg: CertPackage, note: string): Promise<EngineSaveAnswer> => {
				saved.push({ pkg, note });
				return { ok: true, revision: 2, publish_problems: opts.problemsAfterSave ?? [] };
			}
		: null;
	app = mount(EngineEditor as never, {
		target,
		props: { cert: ADMIN_GET_DRAFT, pool: POOL, others: [MILL, SAFE].map((c) => ({ code: c.code, name: c.name })), save }
	}) as unknown as Exports;
	flushSync();
	return target;
}

const one = <T extends Element>(sel: string): T => {
	const el = target!.querySelector(sel);
	if (!el) throw new Error(`no element matched ${sel}`);
	return el as T;
};
const all = (sel: string) => Array.from(target!.querySelectorAll(sel));
const settle = async () => {
	flushSync();
	await new Promise((r) => setTimeout(r, 30));
	flushSync();
};

afterEach(async () => {
	if (app) await unmount(app as never);
	app = null;
	target?.remove();
	target = null;
});

describe('EngineEditor', () => {
	it('builds the stored package back from its fields, normalized once', () => {
		start({ save: true });
		const built = app!.buildPackage();
		const expected = normalizeEditorPackage(ADMIN_GET_DRAFT.package!);
		expect(built).toEqual(expected);
		expect(normalizeEditorPackage(built)).toEqual(built);
		// The round trip kept every part of the kit: the fixture is not empty.
		expect(built.training.items.length).toBe(2);
		expect(built.exam?.topics.length).toBe(2);
		expect(built.guided_project?.steps?.length).toBe(3);
		expect(built.prerequisites).toEqual(['SAFE-1']);
		expect(one('[data-testid="cert-engine-editor"]').getAttribute('data-dirty')).toBe('no');
	});

	it('holds Publish while problems stand, lists them in words, and frees it once a save answers none', async () => {
		start({ save: true, problemsAfterSave: [] });
		const publish = one<HTMLButtonElement>('[data-testid="cert-engine-publish"]');
		expect(publish.getAttribute('aria-disabled')).toBe('true');
		expect(publish.hasAttribute('disabled')).toBe(false);
		expect(all('[data-testid="cert-engine-problems"] li').length).toBe(3);
		expect(all('[data-testid="cert-engine-problems"] li').map((li) => li.textContent)).toContain('The study guide is empty.');

		// Type a name: the editor goes dirty and says Publish waits for a save.
		const name = one<HTMLInputElement>('[data-testid="cert-engine-name"]');
		name.value = 'Engine Lathe Level 1 (renamed)';
		name.dispatchEvent(new Event('input', { bubbles: true }));
		flushSync();
		expect(one('[data-testid="cert-engine-editor"]').getAttribute('data-dirty')).toBe('yes');
		expect(one('[data-testid="cert-engine-publish-why"]').textContent).toContain('Save the revision first');

		// Save revision: the transport gets exactly the typed package.
		const saveKey = all('.save-ind-btn').find((b) => b.textContent?.trim() === 'Save revision') as HTMLButtonElement | undefined;
		expect(saveKey).toBeDefined();
		saveKey!.click();
		await settle();
		expect(saved.length).toBe(1);
		expect(saved[0].pkg.name).toBe('Engine Lathe Level 1 (renamed)');
		expect({ ...saved[0].pkg, name: ADMIN_GET_DRAFT.package!.name }).toEqual(normalizeEditorPackage(ADMIN_GET_DRAFT.package!));
		expect(saved[0].pkg).toEqual(app!.buildPackage());

		// Acknowledged with no problems: Publish is free and the list is gone.
		expect(one('[data-testid="cert-engine-editor"]').getAttribute('data-dirty')).toBe('no');
		expect(one('[data-testid="cert-engine-publish"]').hasAttribute('aria-disabled')).toBe(false);
		expect(all('[data-testid="cert-engine-problems"]').length).toBe(0);
		expect(all('[data-testid="cert-engine-publish-why"]').length).toBe(0);
	});

	it('keeps Publish held when the save answers problems', async () => {
		start({ save: true, problemsAfterSave: ['The study guide is empty.'] });
		const name = one<HTMLInputElement>('[data-testid="cert-engine-name"]');
		name.value = 'Renamed';
		name.dispatchEvent(new Event('input', { bubbles: true }));
		flushSync();
		(all('.save-ind-btn').find((b) => b.textContent?.trim() === 'Save revision') as HTMLButtonElement).click();
		await settle();
		expect(saved.length).toBe(1);
		expect(one('[data-testid="cert-engine-publish"]').getAttribute('aria-disabled')).toBe('true');
		expect(all('[data-testid="cert-engine-problems"] li').length).toBe(1);
	});

	it('with no save transport every write control is absent and the editor says so', () => {
		start({ save: false });
		expect(all('[data-testid="cert-engine-publish"]').length).toBe(0);
		expect(all('[data-testid="cert-engine-delete"]').length).toBe(0);
		expect(all('.save-ind-btn').length).toBe(0);
		expect(all('[data-testid="cert-engine-readonly"]').length).toBe(1);
		// The control: the sections and the export link are still there to read.
		expect(all('.disc-trigger').length).toBeGreaterThanOrEqual(13);
		expect(all('[data-testid="cert-engine-export"]').length).toBe(1);
		expect(all('[data-testid="cert-pool-row"]').length).toBe(0);
		expect(all('[data-testid="cert-engine-pool-summary"]').length).toBe(1);
	});
});
