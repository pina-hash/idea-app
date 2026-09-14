import type { BladeConfig } from './materials';
import { featureDependencies, type BladeTree } from './tree';

export interface BladeProblem {
	featureId: string;
	parameter: string;
	message: string;
}

export function validateBladeTree(tree: BladeTree, config?: BladeConfig): BladeProblem[] {
	const problems: BladeProblem[] = [];
	if (tree?.schema !== 1 || tree.editor !== 'blade' || tree.units !== 'in') {
		return [
			{
				featureId: 'document',
				parameter: 'schema',
				message: 'This is not a supported blade document.'
			}
		];
	}

	const ids = new Map<string, number>();
	tree.features.forEach((feature, index) => {
		if (!feature.id.trim()) {
			problems.push({
				featureId: 'document',
				parameter: `features.${index}.id`,
				message: 'Give every feature an ID.'
			});
		} else if (ids.has(feature.id)) {
			problems.push({
				featureId: feature.id,
				parameter: 'id',
				message: `Feature ID “${feature.id}” is already in this tree.`
			});
		} else {
			ids.set(feature.id, index);
		}
		if (feature.name !== undefined && !feature.name.trim()) {
			problems.push({
				featureId: feature.id,
				parameter: 'name',
				message: 'A feature name cannot be blank.'
			});
		}
	});

	const activeBodies = tree.features.filter(
		(feature) => feature.type === 'revolve' && !feature.suppressed
	);
	if (activeBodies.length === 0) {
		problems.push({
			featureId: 'body-revolve',
			parameter: 'stations',
			message: 'Add an active body feature.'
		});
	}

	for (const feature of tree.features) {
		for (const dependency of featureDependencies(feature)) {
			const dependencyIndex = ids.get(dependency);
			const featureIndex = ids.get(feature.id);
			if (dependencyIndex === undefined) {
				problems.push({
					featureId: feature.id,
					parameter: 'dependency',
					message: `${feature.id} needs ${dependency}, which is not in this tree.`
				});
			} else if (featureIndex !== undefined && dependencyIndex >= featureIndex) {
				problems.push({
					featureId: feature.id,
					parameter: 'dependency',
					message: `${feature.id} must come after ${dependency}.`
				});
			} else if (!feature.suppressed && tree.features[dependencyIndex].suppressed) {
				problems.push({
					featureId: feature.id,
					parameter: 'dependency',
					message: `${feature.id} cannot use suppressed feature ${dependency}.`
				});
			}
		}
	}

	for (const body of tree.features.filter((feature) => feature.type === 'revolve')) {
		if (body.type !== 'revolve') continue;
		if (body.stations.length < 3 || body.stations.length > 8) {
			problems.push({
				featureId: body.id,
				parameter: 'stations',
				message: 'Use 3 to 8 body stations.'
			});
		}
		body.stations.forEach((station, index) => {
			if (station.r < 0) {
				problems.push({
					featureId: body.id,
					parameter: `stations.${index}.r`,
					message: 'Radius cannot be negative.'
				});
			}
			if (index && station.z <= body.stations[index - 1].z) {
				problems.push({
					featureId: body.id,
					parameter: `stations.${index}.z`,
					message: 'Station heights must increase.'
				});
			}
		});
		if (config && body.stations[0]?.z !== config.tipHeightIn) {
			problems.push({
				featureId: body.id,
				parameter: 'stations.0.z',
				message: 'Start the body at the configured tip height.'
			});
		}
	}

	for (const pattern of tree.features.filter((feature) => feature.type === 'circularPattern')) {
		if (
			pattern.type === 'circularPattern' &&
			(pattern.count < 2 || pattern.count > 8 || !Number.isInteger(pattern.count))
		) {
			problems.push({
				featureId: pattern.id,
				parameter: 'count',
				message: 'Use 2 to 8 blades.'
			});
		}
	}
	if (tree.materials.bodySolidFraction < 0.1 || tree.materials.bodySolidFraction > 1) {
		problems.push({
			featureId: 'materials',
			parameter: 'bodySolidFraction',
			message: 'Body fill must be between 10% and 100%.'
		});
	}
	return problems;
}
