import { describe, expect, it } from 'vitest';
import { evaluate } from '../src/lib/ideacad/blade/evaluate';
import { DEFAULT_BLADE_CONFIG, DEFAULT_BLADE_TREE } from '../src/lib/ideacad/blade/materials';
import { bladeWorkspace } from '../src/lib/ideacad/blade/workspace';
import {
	DuplicateWorkspaceIdError,
	UnknownWorkspaceError,
	WorkspaceContextVersionError,
	WorkspaceRegistry,
	workspaceRegistry
} from '../src/lib/ideacad/workspaces';

describe('IdeaCAD workspace registry', () => {
	it('resolves Blade and never substitutes it for an unknown id', () => {
		expect(workspaceRegistry.get('blade')).toBe(bladeWorkspace);
		expect(() => workspaceRegistry.get('not-a-workspace')).toThrow(UnknownWorkspaceError);
	});

	it('refuses duplicate workspace ids when a registry is constructed', () => {
		expect(() => new WorkspaceRegistry([bladeWorkspace, bladeWorkspace])).toThrow(
			DuplicateWorkspaceIdError
		);
	});
});

describe('Blade workspace adapter', () => {
	it('creates equal, independently mutable valid starting trees', () => {
		const first = bladeWorkspace.createStartingTree(bladeWorkspace.defaultContext);
		const second = bladeWorkspace.createStartingTree(bladeWorkspace.defaultContext);

		expect(first).toEqual(DEFAULT_BLADE_TREE);
		expect(second).toEqual(first);
		expect(first).not.toBe(second);
		first.materials.body = 'changed';
		expect(second.materials.body).toBe(DEFAULT_BLADE_TREE.materials.body);
		expect(bladeWorkspace.validate(second, bladeWorkspace.defaultContext)).toEqual([]);
	});

	it('delegates evaluation to the Blade evaluator', () => {
		const tree = bladeWorkspace.createStartingTree(bladeWorkspace.defaultContext);
		expect(bladeWorkspace.evaluate(tree, bladeWorkspace.defaultContext)).toEqual(
			evaluate(tree, DEFAULT_BLADE_CONFIG)
		);
	});

	it('migrates version 1 by identity and loudly refuses unknown or newer versions', () => {
		const current = bladeWorkspace.defaultContext;
		expect(bladeWorkspace.migrateContext(current)).toBe(current);
		expect(() => bladeWorkspace.migrateContext({ config: DEFAULT_BLADE_CONFIG })).toThrow(
			WorkspaceContextVersionError
		);
		expect(() =>
			bladeWorkspace.migrateContext({ version: 2, config: DEFAULT_BLADE_CONFIG })
		).toThrow(WorkspaceContextVersionError);
	});
});
