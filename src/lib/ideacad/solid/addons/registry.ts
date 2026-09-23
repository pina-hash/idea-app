/**
 * ADD-ONS CONTRIBUTE TOOLS. This is the contract every add-on meets and the
 * registry the panel reads, stated once so `AddonPanel.svelte` lists whatever
 * is registered and knows nothing about IdeaBlade in particular.
 *
 * AN ADD-ON MAY ADVISE BUT NEVER RESTRICT, AND THAT IS A PROPERTY OF THIS
 * FILE'S TYPES RATHER THAN A RULE ANYBODY HAS TO REMEMBER. Read what an add-on
 * IS: tools, starters, reference geometry and an optional advisory read. Every
 * function an add-on may carry is listed in `ADDON_MEMBERS`, `TOOL_MEMBERS` and
 * the two member lists beside them, and the `Exact<>` assertions at the bottom
 * fail to compile the moment a key joins one of these interfaces without
 * joining its list. What is NOT here, and cannot be added quietly: a hook that
 * runs before a base command, a hook whose answer is a verdict on a command or
 * on a typed value, a way to hide or disable a base tool, or a bound on an
 * input. A tool's only door into the document is `api.apply` with the same
 * `add-feature` and `metadata` commands a student's own press sends, so what
 * the kernel accepts from a tool is exactly what it accepts from a hand; a
 * value the kernel will not take is the feature row's own sentence, and
 * nothing in this module gets a look at the number first.
 *
 * `tests/ideacad-solid-addons-registry.test.ts` sweeps this file and the
 * IdeaBlade add-on for the words that would break the property, with a planted
 * control, and checks every registered add-on's keys against the lists here.
 */
import type { AdvisoryCheck, AdvisoryRules } from '../advisory';
import type { AddonState, BodyRole, Feature, ModelProjection } from '../types';
import type { WorkspaceApi } from '../workspace-api';

/** A number a student types: a label, a unit for the label, and the value the field opens on. No bound of any kind. */
export interface AddonNumberInput { kind: 'number'; key: string; label: string; unit: 'in' | 'deg' | ''; default: number; hint?: string }
/** Free text a tool parses itself, such as a list of stations. */
export interface AddonTextInput { kind: 'text'; key: string; label: string; default: string; hint?: string; rows?: number }
export type AddonInput = AddonNumberInput | AddonTextInput;
/** What `run` is handed: every input's key, a finite number for a number input and the text as typed for a text one. */
export type AddonInputValues = Record<string, number | string>;

/**
 * ONE STEP OF A PLAN: a feature to add, the label the history row shows, and
 * optionally the role to mark on the body that feature creates (`<id>#0`,
 * the engine's own deterministic body id) once it exists. A tool, a starter
 * and a reference all produce steps, and `runSteps` is the one thing that
 * applies them, so "features go in through `api.apply`" is one code path.
 */
export interface AddonStep { feature: Feature; label: string; role?: BodyRole }

export interface AddonTool {
	id: string;
	name: string;
	description: string;
	/** An SVG path in a 24x24 box, drawn beside the name. Decoration: the name is always there. */
	icon?: string;
	inputs: AddonInput[];
	/** What must be selected before running, in words. `No selection needed.` when nothing must be. */
	selection: string;
	/** Builds geometry by applying ordinary commands through `api`. */
	run(api: WorkspaceApi, inputs: AddonInputValues): Promise<void>;
}
/** A named set of features a document can begin from, applied in order. */
export interface AddonStarter { id: string; name: string; description: string; steps(): AddonStep[] }
/** One piece of reference geometry (a plane or an axis feature) a student can build against. */
export interface AddonReference { id: string; name: string; description: string; step(): AddonStep }

export interface Addon {
	id: string;
	name: string;
	description: string;
	tools: AddonTool[];
	starters: AddonStarter[];
	references: AddonReference[];
	/** A read of the model against the rules: checks with a status each. Advice only; it changes nothing. */
	advise?(model: ModelProjection, rules: AdvisoryRules): AdvisoryCheck[];
}

/* -------------------------------------------------------------------------
 * THE MEMBER LISTS, which are what the never-restrict property is stated over.
 * ---------------------------------------------------------------------- */
export const ADDON_MEMBERS = ['id', 'name', 'description', 'tools', 'starters', 'references', 'advise'] as const;
export const TOOL_MEMBERS = ['id', 'name', 'description', 'icon', 'inputs', 'selection', 'run'] as const;
export const STARTER_MEMBERS = ['id', 'name', 'description', 'steps'] as const;
export const REFERENCE_MEMBERS = ['id', 'name', 'description', 'step'] as const;
/** The only function-valued members an add-on may carry, anywhere in its shape. */
export const ADDON_FUNCTIONS = ['run', 'advise', 'steps', 'step'] as const;

/* -------------------------------------------------------------------------
 * THE REGISTRY
 * ---------------------------------------------------------------------- */
import { ideaBlade } from './ideablade';
import { spinnerWeapon } from './spinner';
import { frcChecks } from './frc';

/**
 * Every installed add-on, in the order the panel lists them. A FUNCTION rather
 * than a constant: `ideablade.ts` imports `runSteps` from here and this file
 * imports `ideaBlade` from there, and a constant list read during module
 * evaluation would hit the temporal dead zone whichever module a caller loads
 * first. Read at call time, both are initialised.
 */
export function installedAddons(): readonly Addon[] { return [ideaBlade, spinnerWeapon, frcChecks]; }
export const addonById = (id: string): Addon | undefined => installedAddons().find((a) => a.id === id);

/**
 * Whether an add-on is on, read from the document's own `addons` map. The
 * reducer stores a plain boolean for a switch and `{enabled, ...settings}`
 * when settings ride along, so both shapes are read; anything else is off.
 */
export function addonEnabled(state: AddonState | undefined, id: string): boolean {
	const value = state?.[id];
	if (typeof value === 'boolean') return value;
	if (value && typeof value === 'object') return (value as { enabled?: unknown }).enabled === true;
	return false;
}

/**
 * Applies a plan through the api, one ordinary command at a time, and stops
 * at the first step that did not land. The workspace's `apply` shows a
 * refusal where every refusal shows and returns rather than throwing, so the
 * only way to know a step landed is to look for its feature in the projection
 * afterwards; carrying on past a missing sketch would add an extrude that
 * points at nothing. An `apply` that throws (the engine's own, in a test)
 * propagates as it is.
 */
export async function runSteps(api: WorkspaceApi, steps: readonly AddonStep[]): Promise<void> {
	for (const step of steps) {
		await api.apply({ type: 'add-feature', feature: step.feature }, step.label);
		if (!api.model.features.some((f) => f.id === step.feature.id)) return;
		if (step.role) {
			const bodyId = `${step.feature.id}#0`;
			if (!api.model.bodies.some((b) => b.id === bodyId)) return;
			await api.apply({ type: 'metadata', bodyId, role: step.role }, `${step.label} role`);
		}
	}
}

/* -------------------------------------------------------------------------
 * THE COMPILE-TIME HALF OF THE PROPERTY. `Exact` is `true` only when the two
 * unions are the same set, so a key added to an interface above without its
 * list entry -- or a hook name added to a list -- is a type error here.
 * ---------------------------------------------------------------------- */
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const addonKeysAreListed: Exact<keyof Addon, (typeof ADDON_MEMBERS)[number]> = true;
const toolKeysAreListed: Exact<keyof AddonTool, (typeof TOOL_MEMBERS)[number]> = true;
const starterKeysAreListed: Exact<keyof AddonStarter, (typeof STARTER_MEMBERS)[number]> = true;
const referenceKeysAreListed: Exact<keyof AddonReference, (typeof REFERENCE_MEMBERS)[number]> = true;
export const CONTRACT_CHECKED = addonKeysAreListed && toolKeysAreListed && starterKeysAreListed && referenceKeysAreListed;
