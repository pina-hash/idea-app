/**
 * ONE ICON PER TREE ROW, and the palette's own icon wherever a feature has a
 * tool: an extrude row wears the Extrude button's drawing, a fillet row the
 * Fillet button's, so the tree and the palette teach one picture per idea.
 * `TOOLS` is read, never copied. The few feature types no tool makes (a
 * sketch, a combine, a mirror, a saved body) get a drawing here in the same
 * 24-unit stroke style.
 */
import { TOOLS } from '../tools';
import type { Tool } from '../viewport';
import type { FeatureType } from '../types';

const tool = (id: Tool) => TOOLS.find((t) => t.id === id)?.icon ?? '';
/** Drawings for the rows no palette tool makes. */
export const TREE_ICONS = {
	sketch: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4M3 3h6M3 3v6',
	body: 'M4 7l8-4 8 4v10l-8 4-8-4zM4 7l8 4 8-4M12 11v10',
	push: 'M4 15h16v6H4zM12 2v10m-3-3 3 3 3-3',
	mirror: 'M12 2v20M9 6l-6 6 6 6zM15 6l6 6-6 6z',
	boolean: 'M14 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0M20 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0',
	delete: 'M4 7l8-4 8 4v10l-8 4-8-4zM8 9l8 8M16 9l-8 8',
	rib: 'M3 20h18M6 20V11l6-6 6 6v9M12 5v15',
	plane: 'M3 17l5-10h13l-5 10z',
	origin: 'M12 3v18M3 12h18M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
	eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
	eyeClosed: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM4 20L20 4'
} as const;
/** The drawing a feature row wears. A pattern draws its own mode. */
export function featureIcon(type: FeatureType, mode?: 'linear' | 'circular'): string {
	switch (type) {
		case 'sketch': return TREE_ICONS.sketch;
		case 'body': return TREE_ICONS.body;
		case 'push': return TREE_ICONS.push;
		case 'mirror': return TREE_ICONS.mirror;
		case 'boolean': return TREE_ICONS.boolean;
		case 'delete': return TREE_ICONS.delete;
		case 'rib': return TREE_ICONS.rib;
		case 'move-selection': case 'transform': return tool('move');
		case 'pattern': return tool(mode === 'circular' ? 'circular-pattern' : 'linear-pattern');
		case 'plane': case 'axis': case 'point': return tool('reference');
		default: return tool(type as Tool) || TREE_ICONS.body;
	}
}
