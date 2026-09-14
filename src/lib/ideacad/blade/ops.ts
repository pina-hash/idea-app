import {
	cloneTree,
	featureDependencies,
	isStructuralFeature,
	MAX_BODY_STATIONS,
	MIN_BODY_STATIONS,
	type BladeFeature,
	type BladeTree,
	type Station
} from './tree';
import { validateBladeTree } from './validate';

export type BladeTreeRefusalCode =
	| 'invalid-tree'
	| 'feature-not-found'
	| 'duplicate-id'
	| 'dependency-blocked'
	| 'structural-feature'
	| 'station-limit'
	| 'invalid-position'
	| 'invalid-name';

export interface BladeTreeRefusal {
	ok: false;
	code: BladeTreeRefusalCode;
	message: string;
}

export interface BladeTreeSuccess {
	ok: true;
	tree: BladeTree;
}

export type BladeTreeOperationResult = BladeTreeSuccess | BladeTreeRefusal;

function refuse(code: BladeTreeRefusalCode, message: string): BladeTreeRefusal {
	return { ok: false, code, message };
}

function featureName(feature: BladeFeature): string {
	return feature.name?.trim() || feature.id;
}

function validInput(tree: BladeTree): BladeTreeRefusal | null {
	const problems = validateBladeTree(tree);
	return problems.length
		? refuse('invalid-tree', `This feature tree needs attention first: ${problems[0].message}`)
		: null;
}

function finish(tree: BladeTree): BladeTreeOperationResult {
	const problems = validateBladeTree(tree);
	return problems.length
		? refuse('invalid-tree', `That change would make the feature tree invalid: ${problems[0].message}`)
		: { ok: true, tree };
}

function locate(tree: BladeTree, id: string): number | BladeTreeRefusal {
	const index = tree.features.findIndex((feature) => feature.id === id);
	return index < 0
		? refuse('feature-not-found', `Feature “${id}” is not in this tree.`)
		: index;
}

function dependentsOf(tree: BladeTree, id: string, activeOnly = false): BladeFeature[] {
	return tree.features.filter(
		(feature) =>
			(!activeOnly || !feature.suppressed) && featureDependencies(feature).includes(id)
	);
}

export function addFeature(
	tree: BladeTree,
	feature: BladeFeature,
	position = tree.features.length
): BladeTreeOperationResult {
	const invalid = validInput(tree);
	if (invalid) return invalid;
	if (tree.features.some((candidate) => candidate.id === feature.id)) {
		return refuse('duplicate-id', `A feature named “${feature.id}” is already in this tree.`);
	}
	if (!Number.isInteger(position) || position < 0 || position > tree.features.length) {
		return refuse('invalid-position', 'Choose a position inside the feature tree.');
	}
	const next = cloneTree(tree);
	next.features.splice(position, 0, structuredClone(feature));
	return finish(next);
}

/** Delete refuses rather than cascading so one student action never removes unseen work. */
export function deleteFeature(tree: BladeTree, id: string): BladeTreeOperationResult {
	const invalid = validInput(tree);
	if (invalid) return invalid;
	const found = locate(tree, id);
	if (typeof found !== 'number') return found;
	const feature = tree.features[found];
	if (
		isStructuralFeature(feature) &&
		tree.features.filter((candidate) => isStructuralFeature(candidate) && !candidate.suppressed)
			.length === 1
	) {
		return refuse(
			'structural-feature',
			`${featureName(feature)} is the body that all blade geometry needs, so it cannot be deleted.`
		);
	}
	const dependents = dependentsOf(tree, id);
	if (dependents.length) {
		return refuse(
			'dependency-blocked',
			`${featureName(feature)} cannot be deleted because ${dependents.map(featureName).join(', ')} ${dependents.length === 1 ? 'depends' : 'depend'} on it.`
		);
	}
	const next = cloneTree(tree);
	next.features.splice(found, 1);
	return finish(next);
}

export function reorderFeature(
	tree: BladeTree,
	id: string,
	position: number
): BladeTreeOperationResult {
	const invalid = validInput(tree);
	if (invalid) return invalid;
	const found = locate(tree, id);
	if (typeof found !== 'number') return found;
	if (!Number.isInteger(position) || position < 0 || position >= tree.features.length) {
		return refuse('invalid-position', 'Choose a position inside the feature tree.');
	}
	if (found === position) return { ok: true, tree: cloneTree(tree) };
	const next = cloneTree(tree);
	const [feature] = next.features.splice(found, 1);
	next.features.splice(position, 0, feature);
	const problems = validateBladeTree(next);
	const dependencyProblem = problems.find((problem) => problem.parameter === 'dependency');
	if (dependencyProblem) {
		return refuse('dependency-blocked', `That reorder is not possible: ${dependencyProblem.message}`);
	}
	return finish(next);
}

export function duplicateFeature(tree: BladeTree, id: string): BladeTreeOperationResult {
	const invalid = validInput(tree);
	if (invalid) return invalid;
	const found = locate(tree, id);
	if (typeof found !== 'number') return found;
	const source = tree.features[found];
	let suffix = 2;
	let copyId = `${source.id}-copy`;
	while (tree.features.some((feature) => feature.id === copyId)) {
		copyId = `${source.id}-copy-${suffix++}`;
	}
	const copy = structuredClone(source);
	copy.id = copyId;
	copy.name = `${featureName(source)} copy`;
	return addFeature(tree, copy, found + 1);
}

export function renameFeature(tree: BladeTree, id: string, name: string): BladeTreeOperationResult {
	const invalid = validInput(tree);
	if (invalid) return invalid;
	const found = locate(tree, id);
	if (typeof found !== 'number') return found;
	const trimmed = name.trim();
	if (!trimmed) return refuse('invalid-name', 'Give this feature a name before saving it.');
	const next = cloneTree(tree);
	next.features[found].name = trimmed;
	return finish(next);
}

/**
 * Insert a body station through the same immutable boundary as other tree edits.
 * The upper bound is checked before mutation instead of relying on a later
 * validation pass that a programmatic caller may never run.
 */
export function addBodyStation(
	tree: BladeTree,
	bodyId: string,
	station: Station,
	position: number
): BladeTreeOperationResult {
	const invalid = validInput(tree);
	if (invalid) return invalid;
	const found = locate(tree, bodyId);
	if (typeof found !== 'number') return found;
	const body = tree.features[found];
	if (body.type !== 'revolve') {
		return refuse('feature-not-found', `Feature “${bodyId}” is not a body feature.`);
	}
	if (body.stations.length >= MAX_BODY_STATIONS) {
		return refuse(
			'station-limit',
			`A body can have at most ${MAX_BODY_STATIONS} stations.`
		);
	}
	if (!Number.isInteger(position) || position < 0 || position > body.stations.length) {
		return refuse('invalid-position', 'Choose a position inside the body stations.');
	}
	const next = cloneTree(tree);
	const nextBody = next.features[found];
	if (nextBody.type !== 'revolve') {
		return refuse('feature-not-found', `Feature “${bodyId}” is not a body feature.`);
	}
	nextBody.stations.splice(position, 0, structuredClone(station));
	return finish(next);
}

/** Removing a station cannot take the body below its stored minimum. */
export function removeBodyStation(
	tree: BladeTree,
	bodyId: string,
	position: number
): BladeTreeOperationResult {
	const invalid = validInput(tree);
	if (invalid) return invalid;
	const found = locate(tree, bodyId);
	if (typeof found !== 'number') return found;
	const body = tree.features[found];
	if (body.type !== 'revolve') {
		return refuse('feature-not-found', `Feature “${bodyId}” is not a body feature.`);
	}
	if (body.stations.length <= MIN_BODY_STATIONS) {
		return refuse(
			'station-limit',
			`A body needs at least ${MIN_BODY_STATIONS} stations.`
		);
	}
	if (!Number.isInteger(position) || position < 0 || position >= body.stations.length) {
		return refuse('invalid-position', 'Choose a station in the body.');
	}
	const next = cloneTree(tree);
	const nextBody = next.features[found];
	if (nextBody.type !== 'revolve') {
		return refuse('feature-not-found', `Feature “${bodyId}” is not a body feature.`);
	}
	nextBody.stations.splice(position, 1);
	return finish(next);
}

export function suppressFeature(
	tree: BladeTree,
	id: string,
	suppressed = true
): BladeTreeOperationResult {
	const invalid = validInput(tree);
	if (invalid) return invalid;
	const found = locate(tree, id);
	if (typeof found !== 'number') return found;
	const feature = tree.features[found];
	if (
		suppressed &&
		isStructuralFeature(feature) &&
		tree.features.filter((candidate) => isStructuralFeature(candidate) && !candidate.suppressed)
			.length === 1
	) {
		return refuse(
			'structural-feature',
			`${featureName(feature)} is the active body that all blade geometry needs, so it cannot be suppressed.`
		);
	}
	if (suppressed) {
		const dependents = dependentsOf(tree, id, true);
		if (dependents.length) {
			return refuse(
				'dependency-blocked',
				`${featureName(feature)} cannot be suppressed while ${dependents.map(featureName).join(', ')} ${dependents.length === 1 ? 'depends' : 'depend'} on it.`
			);
		}
	} else {
		const suppressedDependency = featureDependencies(feature)
			.map((dependency) => tree.features.find((candidate) => candidate.id === dependency))
			.find((dependency) => dependency?.suppressed);
		if (suppressedDependency) {
			return refuse(
				'dependency-blocked',
				`${featureName(feature)} cannot be restored until ${featureName(suppressedDependency)} is restored.`
			);
		}
	}
	const next = cloneTree(tree);
	next.features[found].suppressed = suppressed;
	return finish(next);
}
