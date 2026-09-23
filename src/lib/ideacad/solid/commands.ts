/**
 * COMMANDS ARE EDITS OF THE MANIFEST, AND THIS IS THE ONE REDUCER. It takes a
 * manifest and a command and returns the next manifest, without a kernel, so
 * every rule about what an edit may do -- where a feature may move, what a
 * delete refuses, how a legacy sketch becomes a feature -- is assertable in
 * a plain test. The engine replays whatever comes out of it.
 */
import { TYPE_LABELS, dependents, legacySketchFeature, newFeatureId, reorderRange } from './features';
import type { BodyRole, Feature, FeatureType, SolidCommand, SolidManifest } from './types';

const clone = <T>(v: T): T => structuredClone(v);
/** `Extrude 3`: the label plus one more than the count of that type already in the list. */
export function defaultName(type: FeatureType, features: readonly Feature[]): string {
	return `${TYPE_LABELS[type]} ${features.filter((f) => f.type === type).length + 1}`;
}
export function featureAt(m: SolidManifest, id: string): { feature: Feature; index: number } {
	const index = m.features.findIndex((f) => f.id === id);
	if (index < 0) throw Error('That feature is no longer in the tree.');
	return { feature: m.features[index], index };
}
const ROLES: readonly BodyRole[] = ['part', 'hex-core', 'collar', 'spin-bolt', 'blade'];

export function reduce(current: SolidManifest, command: SolidCommand): SolidManifest {
	const m = clone(current);
	switch (command.type) {
		case 'add-feature': {
			const feature = clone(command.feature);
			if (!feature.id) feature.id = newFeatureId();
			if (m.features.some((f) => f.id === feature.id)) throw Error('A feature with this ID already exists.');
			if (!feature.name?.trim()) feature.name = defaultName(feature.type, m.features);
			const at = command.at ?? m.features.length;
			if (!Number.isInteger(at) || at < 0 || at > m.features.length) throw Error('Invalid tree position.');
			m.features.splice(at, 0, feature);
			return m;
		}
		case 'set-feature': {
			const { feature, index } = featureAt(m, command.id);
			const patch = { ...command.patch } as Record<string, unknown>;
			delete patch.id; delete patch.type;
			m.features[index] = { ...feature, ...patch } as Feature;
			return m;
		}
		case 'remove-feature': {
			const { feature, index } = featureAt(m, command.id);
			const children = dependents(feature.id, m.features);
			if (children.length) throw Error(`${children.length === 1 ? 'A later feature depends' : `${children.length} later features depend`} on ${feature.name} (${children.map((c) => c.name).join(', ')}). Delete those first, or suppress this one.`);
			m.features.splice(index, 1);
			return m;
		}
		case 'move-feature': {
			const { feature, index } = featureAt(m, command.id);
			const range = reorderRange(feature.id, m.features)!;
			const to = command.to;
			if (!Number.isInteger(to) || to < 0 || to > m.features.length - 1) throw Error('Invalid tree position.');
			const without = m.features.filter((f) => f.id !== feature.id);
			if (to < range.min || to > range.max) throw Error(to < range.min ? `${feature.name} uses ${without[range.min - 1]?.name ?? 'an earlier feature'}, so it cannot move above it.` : `${without[range.max]?.name ?? 'A later feature'} uses ${feature.name}, so it cannot move below it.`);
			if (to === index) return m;
			without.splice(to, 0, feature);
			m.features = without;
			return m;
		}
		case 'move-features': {
			const ids = m.features.map((f) => f.id), moving = new Set(command.ids);
			if (!command.ids.length || command.ids.some((id) => !ids.includes(id))) throw Error('That feature is no longer in the tree.');
			const rest = ids.filter((id) => !moving.has(id)), block = ids.filter((id) => moving.has(id)), to = command.to;
			if (!Number.isInteger(to) || to < 0 || to > rest.length) throw Error('Invalid tree position.');
			const target = [...rest.slice(0, to), ...block, ...rest.slice(to)];
			/* The same single steps a hand would take, each checked by `move-feature`'s own rule: a block moving up goes front first, one moving down back first, so no member is lifted past something the finished order keeps on its other side. */
			let next = m;
			const current = [...ids];
			const step = (id: string, i: number) => { next = reduce(next, { type: 'move-feature', id, to: i }); current.splice(current.indexOf(id), 1); current.splice(i, 0, id); };
			if (to <= ids.indexOf(block[0])) { for (let i = 0; i < target.length; i++) if (current[i] !== target[i]) step(target[i], i); }
			else for (let i = target.length - 1; i >= 0; i--) if (current[i] !== target[i]) step(target[i], i);
			return next;
		}
		case 'suppress-feature': {
			const { feature, index } = featureAt(m, command.id);
			m.features[index] = { ...feature, suppressed: command.suppressed || undefined };
			if (!command.suppressed) delete (m.features[index] as { suppressed?: boolean }).suppressed;
			return m;
		}
		case 'rename-feature': {
			const { feature, index } = featureAt(m, command.id);
			const name = command.name.trim();
			if (!name || name.length > 60) throw Error('Name the feature using 1 to 60 characters.');
			m.features[index] = { ...feature, name };
			return m;
		}
		case 'metadata': {
			const record = m.bodies.find((b) => b.id === command.bodyId);
			if (!record) throw Error('Select a body.');
			if (command.name !== undefined) { const name = command.name.trim(); if (!name || name.length > 60) throw Error('Name the body using 1 to 60 characters.'); record.name = name; }
			if (command.materialId !== undefined) record.materialId = command.materialId;
			if (command.role !== undefined) { if (!ROLES.includes(command.role)) throw Error('Choose a body role.'); record.role = command.role; }
			if (command.massG !== undefined) { if (command.massG !== null && !(Number.isFinite(command.massG) && command.massG >= 0)) throw Error('Mass cannot be negative.'); record.massG = command.massG; }
			if (command.massSource !== undefined) record.massSource = command.massSource;
			if (command.color !== undefined) { if (command.color !== null && !/^#[0-9a-f]{6}$/i.test(command.color)) throw Error('Choose a colour.'); if (command.color === null) delete record.color; else record.color = command.color.toLowerCase(); }
			if (command.fixed !== undefined) { if (command.fixed) record.fixed = true; else delete record.fixed; }
			return m;
		}
		case 'addon': {
			const key = command.addon ?? 'ideaBlade';
			if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(key)) throw Error('Invalid add-on.');
			if (command.settings) m.addons[key] = { ...(typeof m.addons[key] === 'object' ? (m.addons[key] as Record<string, unknown>) : {}), enabled: command.enabled, ...command.settings };
			else m.addons[key] = command.enabled;
			if (key === 'ideaBlade' && typeof m.addons.ideaBlade !== 'boolean') m.addons.ideaBlade = command.enabled;
			return m;
		}
		case 'title': {
			const title = command.title.trim() || 'Untitled document';
			if (title.length > 120) throw Error('Use a document name between 1 and 120 characters.');
			m.title = title;
			return m;
		}
		case 'sketch': {
			const feature = legacySketchFeature(command.sketch);
			feature.id = command.sketch.id && !m.features.some((f) => f.id === command.sketch.id) ? command.sketch.id : newFeatureId();
			feature.name = defaultName('sketch', m.features);
			if (command.planeRef) (feature as Extract<Feature, { type: 'sketch' }>).plane = command.planeRef;
			m.features.push(feature);
			return m;
		}
		case 'batch': {
			if (!Array.isArray(command.commands) || !command.commands.length) throw Error('Nothing to change.');
			return command.commands.reduce((next, c) => reduce(next, c), m);
		}
		case 'delete': {
			const bodies = [...new Set(command.selections.filter((s) => s.kind === 'body').map((s) => s.bodyId))];
			const sketches = command.selections.filter((s) => s.kind === 'sketch' || s.kind === 'feature' || s.kind === 'reference').map((s) => s.id);
			if (command.selections.some((s) => !['body', 'sketch', 'feature', 'reference'].includes(s.kind))) throw Error('Select a whole body in Objects to delete it, or a feature in the tree.');
			let next = m;
			for (const id of sketches) next = reduce(next, { type: 'remove-feature', id });
			if (bodies.length) next = reduce(next, { type: 'add-feature', feature: { id: newFeatureId(), name: defaultName('delete', next.features), type: 'delete', bodies } });
			return next;
		}
	}
}
