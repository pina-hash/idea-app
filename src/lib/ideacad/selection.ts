export interface SelectionState {
	selectedFeatureId: string | null;
	hoverFeatureId: string | null;
}

export const EMPTY_SELECTION: Readonly<SelectionState> = Object.freeze({
	selectedFeatureId: null,
	hoverFeatureId: null
});

export function setSelection(state: SelectionState, featureId: string): SelectionState {
	return { ...state, selectedFeatureId: featureId };
}

export function clearSelection(state: SelectionState): SelectionState {
	return { ...state, selectedFeatureId: null };
}

export function toggleSelection(state: SelectionState, featureId: string): SelectionState {
	return {
		...state,
		selectedFeatureId: state.selectedFeatureId === featureId ? null : featureId
	};
}

export function setHoverCandidate(state: SelectionState, featureId: string): SelectionState {
	return { ...state, hoverFeatureId: featureId };
}

export function clearHoverCandidate(state: SelectionState): SelectionState {
	return { ...state, hoverFeatureId: null };
}
