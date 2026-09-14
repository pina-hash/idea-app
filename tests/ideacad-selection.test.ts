import { describe, expect, it } from 'vitest';
import {
	EMPTY_SELECTION,
	clearHoverCandidate,
	clearSelection,
	setHoverCandidate,
	setSelection,
	toggleSelection
} from '../src/lib/ideacad/selection';

describe('IdeaCAD selection model', () => {
	it('sets and clears selection without mutating its input', () => {
		const selected = setSelection(EMPTY_SELECTION, 'body-revolve');
		expect(selected).toEqual({ selectedFeatureId: 'body-revolve', hoverFeatureId: null });
		expect(EMPTY_SELECTION.selectedFeatureId).toBeNull();
		expect(clearSelection(selected)).toEqual(EMPTY_SELECTION);
	});

	it('toggles the requested feature and replaces a different selection', () => {
		const selected = setSelection(EMPTY_SELECTION, 'body-revolve');
		expect(toggleSelection(selected, 'body-revolve').selectedFeatureId).toBeNull();
		expect(toggleSelection(selected, 'blade-mount').selectedFeatureId).toBe('blade-mount');
	});

	it('sets and clears hover independently of current selection', () => {
		const selected = setSelection(EMPTY_SELECTION, 'body-revolve');
		const hovered = setHoverCandidate(selected, 'hex-extension');
		expect(hovered).toEqual({
			selectedFeatureId: 'body-revolve',
			hoverFeatureId: 'hex-extension'
		});
		expect(clearHoverCandidate(hovered)).toEqual(selected);
	});
});
