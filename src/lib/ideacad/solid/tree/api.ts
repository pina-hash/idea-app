/**
 * WHAT THE TREE CAN USE WHEN THE WORKSPACE OFFERS IT. Every member here is
 * OPTIONAL and the tree reads it off the same `api` object it is handed, so
 * the workspace (a single-writer file) grows each one on its own schedule and
 * the tree lights the matching control the moment it appears. ABSENCE IS THE
 * MECHANISM: no `rollback`, no bar at all; no `hover`, nothing is sent.
 *
 * THE EXACT SHAPES ARE THE CONTRACT. `WorkspaceApi` does not declare these
 * yet; when it does, it must declare them with these signatures, and this
 * file then narrows to a re-export.
 */
import type { Selection } from '../types';
import type { WorkspaceApi } from '../workspace-api';

/** One entry in a row's menu. `refusal` set means the entry is shown `aria-disabled` and says why; a press on it says so where every refusal shows. */
export interface TreeMenuItem {
	id: string;
	label: string;
	/** The drawing beside the word, as a 24-unit SVG path. */
	icon?: string;
	refusal?: string | null;
	run(): void;
}
/** What the tree hands the workspace's own right-click menu, when it has one. */
export interface TreeMenuRequest {
	/** What the menu is about, for a screen reader: "Extrude 1 actions". */
	label: string;
	/** Where the menu opens, in viewport pixels. */
	x: number;
	y: number;
	items: TreeMenuItem[];
	/** Where focus returns when the menu closes. */
	returnFocus?: HTMLElement | null;
}
export interface TreeExtras {
	/** Light the geometry these selections name, as a preselection. Null clears it. */
	hover?(selections: Selection[] | null): void;
	/** Hear what the pointer is over in the viewport, to light its row. Returns the unsubscribe. */
	onHover?(listener: (hovered: Selection | null) => void): () => void;
	/** Build only features [0, index); null builds everything. Workspace state: it never enters the manifest. */
	rollback?(index: number | null): void | Promise<void>;
	/** Where the rollback bar stands: the build index it stands before, or null at the end. */
	readonly rollbackIndex?: number | null;
	/** Open the workspace's own right-click menu with these entries. */
	contextMenu?(request: TreeMenuRequest): void;
}
export type TreeApi = WorkspaceApi & TreeExtras;
/** The same object, read with the optional members visible. */
export const treeApi = (api: WorkspaceApi): TreeApi => api as TreeApi;
