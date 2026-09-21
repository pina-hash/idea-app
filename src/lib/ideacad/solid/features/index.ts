/**
 * THE EXECUTOR REGISTRY: one entry per feature type, exhaustive over the union
 * so a type added to `types.ts` without an executor is a type error here and
 * not a document that silently does nothing on replay.
 */
import type { Executor } from './context';
import type { Feature, FeatureType } from '../types';
import * as core from './core';
import { fillet, chamfer, shell } from './blends';
import { plane, axis, point } from './reference';
import { mate } from './mate';
import { hole, draft, sweep, loft, rib } from './extra';

export const EXECUTORS: { [T in FeatureType]: Executor<Extract<Feature, { type: T }>> } = {
	body: core.body,
	sketch: core.sketch,
	extrude: core.extrude,
	revolve: core.revolve,
	push: core.push,
	'move-selection': core.moveSelection,
	fillet,
	chamfer,
	shell,
	transform: core.transform,
	mirror: core.mirror,
	pattern: core.pattern,
	boolean: core.boolean,
	delete: core.deleteBodies,
	plane,
	axis,
	point,
	mate,
	hole,
	draft,
	sweep,
	loft,
	rib
};
export { solveMates } from './mate';
