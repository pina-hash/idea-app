/**
 * WHAT THE TREE CAN USE WHEN THE WORKSPACE OFFERS IT. Every member is
 * OPTIONAL on `WorkspaceApi` and the tree reads it off the same `api` object
 * it is handed, lighting the matching control the moment it appears. ABSENCE
 * IS THE MECHANISM: no `rollback`, no bar at all; no `hover`, nothing is sent.
 * The shapes are declared once, in `workspace-api.ts`; this file re-exports.
 */
import type { WorkspaceApi, WorkspaceMenuItem, WorkspaceMenuRequest } from '../workspace-api';

/** One entry in a row's menu: the workspace's own menu row. */
export type TreeMenuItem = WorkspaceMenuItem;
/** What the tree hands the workspace's right-click menu. */
export type TreeMenuRequest = WorkspaceMenuRequest;
/** The optional members the tree lights a control for, as `WorkspaceApi` declares them. */
export type TreeExtras = Pick<WorkspaceApi, 'hover' | 'onHover' | 'rollback' | 'rollbackIndex' | 'contextMenu'>;
export type TreeApi = WorkspaceApi;
/** The same object; kept so the tree reads its optional members through one name. */
export const treeApi = (api: WorkspaceApi): TreeApi => api;
