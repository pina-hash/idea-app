import type { BladeTree, Station } from './tree';

export interface PartPlacement {
	/** Height in inches along the hex-core axis. */
	z: number;
	/** Clocking in degrees about the hex-core axis. */
	angleDeg: number;
}

interface PartBase extends PartPlacement {
	id: string;
	name: string;
}

export interface BodyPart extends PartBase {
	kind: 'body';
	parameters: {
		stations: Station[];
		material: string;
		solidFraction: number;
	};
}

export interface BladePart extends PartBase {
	kind: 'blade';
	parameters: {
		rootWidth: number;
		tipWidth: number;
		length: number;
		sweepDeg: number;
		mountRadius: number;
		count: number;
		stock: string;
	};
}

export type BladePartDefinition = BodyPart | BladePart;

/**
 * The part collection is an additive, in-memory representation. Keeping schema 1
 * and its feature array intact lets every existing reader continue to open and
 * evaluate stored documents without rewriting them.
 */
export type BladePartsTree = BladeTree & { parts: BladePartDefinition[] };

export interface PartProblem {
	partId: string;
	message: string;
}

const finite = (value: number) => Number.isFinite(value);

export function validatePartCollection(tree: BladePartsTree): PartProblem[] {
	const problems: PartProblem[] = [];
	const ids = new Set<string>();
	for (const part of tree.parts) {
		if (!part.id.trim()) problems.push({ partId: part.id, message: 'Give every part an ID.' });
		else if (ids.has(part.id))
			problems.push({ partId: part.id, message: `Part ID “${part.id}” is already in this design.` });
		ids.add(part.id);
		if (!part.name.trim()) problems.push({ partId: part.id, message: 'Give every part a name.' });
		if (!finite(part.z) || !finite(part.angleDeg))
			problems.push({ partId: part.id, message: 'Part placement must use finite numbers.' });

		if (part.kind === 'body') {
			const { stations, solidFraction } = part.parameters;
			if (stations.length < 3 || stations.length > 8)
				problems.push({ partId: part.id, message: 'A body part needs 3 to 8 stations.' });
			stations.forEach((station, index) => {
				if (!finite(station.r) || !finite(station.z) || station.r < 0)
					problems.push({ partId: part.id, message: 'Body stations need finite, nonnegative radii.' });
				if (index > 0 && station.z <= stations[index - 1].z)
					problems.push({ partId: part.id, message: 'Body station heights must increase.' });
			});
			if (!part.parameters.material.trim() || !finite(solidFraction) || solidFraction < 0.1 || solidFraction > 1)
				problems.push({ partId: part.id, message: 'A body needs material and 10% to 100% fill.' });
		} else {
			const p = part.parameters;
			if (
				![p.rootWidth, p.tipWidth, p.length, p.sweepDeg, p.mountRadius].every(finite) ||
				p.rootWidth <= 0 ||
				p.tipWidth <= 0 ||
				p.length <= 0 ||
				p.mountRadius < 0 ||
				!Number.isInteger(p.count) ||
				p.count < 1 ||
				!p.stock.trim()
			)
				problems.push({ partId: part.id, message: 'Blade parameters must describe usable stock and geometry.' });
		}
	}
	if (!tree.parts.some((part) => part.kind === 'body'))
		problems.push({ partId: 'design', message: 'A blade design needs at least one body part.' });
	return problems;
}

/** Upgrade a stored fixed-feature document without changing or discarding a stored byte. */
export function upgradeBladeParts(tree: BladeTree): BladePartsTree {
	const existing = (tree as Partial<BladePartsTree>).parts;
	if (Array.isArray(existing)) return structuredClone(tree as BladePartsTree);

	const body = tree.features.find((feature) => feature.type === 'revolve');
	const sketch = tree.features.find((feature) => feature.type === 'bladeSketch');
	const pattern = tree.features.find((feature) => feature.type === 'circularPattern');
	const mount = tree.features.find((feature) => feature.type === 'mount');
	const parts: BladePartDefinition[] = [];
	if (body?.type === 'revolve') {
		parts.push({
			id: body.id,
			name: body.name?.trim() || 'Body',
			kind: 'body',
			z: 0,
			angleDeg: 0,
			parameters: {
				stations: structuredClone(body.stations),
				material: tree.materials.body,
				solidFraction: tree.materials.bodySolidFraction
			}
		});
	}
	if (sketch?.type === 'bladeSketch' && pattern?.type === 'circularPattern') {
		parts.push({
			id: pattern.id,
			name: pattern.name?.trim() || 'Blade row',
			kind: 'blade',
			z: mount?.type === 'mount' ? mount.z : 0,
			angleDeg: 0,
			parameters: {
				rootWidth: sketch.rootWidth,
				tipWidth: sketch.tipWidth,
				length: sketch.length,
				sweepDeg: sketch.sweepDeg,
				mountRadius: sketch.mountRadius,
				count: pattern.count,
				stock: tree.materials.bladeStock
			}
		});
	}
	return Object.assign(structuredClone(tree), { parts });
}
