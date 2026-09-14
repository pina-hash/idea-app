import { evaluate, type Evaluation } from './evaluate';
import { DEFAULT_BLADE_CONFIG, type BladeConfig } from './materials';
import { cloneTree, type BladeTree } from './tree';
import { validateBladeTree, type BladeProblem } from './validate';
import type { Workspace, WorkspaceContext } from '../workspaces';

/** A named refusal shared by all reads of Blade's versioned context boundary. */
export class WorkspaceContextVersionError extends Error {
	constructor(readonly workspaceId: string, readonly version: unknown, readonly currentVersion: number) {
		super(
			`IdeaCAD workspace ${workspaceId} cannot open context version ${String(version)}; this code supports version ${currentVersion}.`
		);
		this.name = 'WorkspaceContextVersionError';
	}
}

/** Refuse before reading any property whose meaning belongs to this context version. */
function requireCurrentContext(context: unknown): asserts context is BladeWorkspaceContext {
	const version =
		context !== null && typeof context === 'object' && 'version' in context
			? (context as { version?: unknown }).version
			: undefined;
	if (!Number.isInteger(version) || version !== 1) {
		throw new WorkspaceContextVersionError('blade', version, 1);
	}
}

export interface BladeWorkspaceContext extends WorkspaceContext {
	readonly version: 1;
	readonly config: BladeConfig;
}

export const bladeWorkspace: Workspace<
	BladeWorkspaceContext,
	BladeTree,
	BladeProblem[],
	Evaluation
> = {
	id: 'blade',
	label: 'Blade',
	defaultContext: { version: 1, config: DEFAULT_BLADE_CONFIG },
	migrateContext(context: unknown): BladeWorkspaceContext {
		requireCurrentContext(context);
		return context;
	},
	createStartingTree(context): BladeTree {
		return cloneTree(context.config.defaultFeatures);
	},
	validate(tree, context): BladeProblem[] {
		return validateBladeTree(tree as BladeTree, context.config);
	},
	evaluate(tree, context): Evaluation {
		return evaluate(tree as BladeTree, context.config);
	}
};
