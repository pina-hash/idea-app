import { bladeWorkspace, WorkspaceContextVersionError } from './blade/workspace';

export { WorkspaceContextVersionError };

/** The only state every workspace context has in common. */
export interface WorkspaceContext {
	readonly version: number;
}

/**
 * A CAD workspace without assuming that its tree, problems, or evaluation look
 * anything like another workspace's. Values crossing persistence stay unknown
 * until the owning workspace migrates or interprets them.
 */
export interface Workspace<
	Context extends WorkspaceContext,
	Tree,
	Problems,
	Evaluation
> {
	readonly id: string;
	readonly label: string;
	readonly defaultContext: Context;
	migrateContext(context: unknown): Context;
	createStartingTree(context: Context): Tree;
	validate(tree: unknown, context: Context): Problems;
	evaluate(tree: unknown, context: Context): Evaluation;
}

type RegisteredWorkspace = Workspace<WorkspaceContext, unknown, unknown, unknown>;

export class UnknownWorkspaceError extends Error {
	constructor(readonly workspaceId: string) {
		super(`Unknown IdeaCAD workspace: ${workspaceId}`);
		this.name = 'UnknownWorkspaceError';
	}
}

export class DuplicateWorkspaceIdError extends Error {
	constructor(readonly workspaceId: string) {
		super(`Duplicate IdeaCAD workspace id: ${workspaceId}`);
		this.name = 'DuplicateWorkspaceIdError';
	}
}

/** An immutable, explicitly constructed set of workspace adapters. */
export class WorkspaceRegistry {
	readonly #byId: ReadonlyMap<string, RegisteredWorkspace>;

	constructor(workspaces: readonly RegisteredWorkspace[]) {
		const byId = new Map<string, RegisteredWorkspace>();
		for (const workspace of workspaces) {
			if (byId.has(workspace.id)) throw new DuplicateWorkspaceIdError(workspace.id);
			byId.set(workspace.id, workspace);
		}
		this.#byId = byId;
	}

	get(id: string): RegisteredWorkspace {
		const workspace = this.#byId.get(id);
		if (!workspace) throw new UnknownWorkspaceError(id);
		return workspace;
	}
}

/** The complete built-in registry. Adapters never register themselves. */
export const workspaceRegistry = new WorkspaceRegistry([bladeWorkspace]);
