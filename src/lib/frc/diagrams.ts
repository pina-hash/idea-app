import designProcessLoop from '$lib/frc/assets/diagrams/diagram-design-process-loop.svg';
import orthographicViews from '$lib/frc/assets/diagrams/diagram-orthographic-views.svg';
import shaftStackup from '$lib/frc/assets/diagrams/diagram-shaft-stackup.svg';
import clearanceVsTapped from '$lib/frc/assets/diagrams/diagram-clearance-vs-tapped.svg';
import clearanceVsInterference from '$lib/frc/assets/diagrams/diagram-clearance-vs-interference.svg';

/**
 * Brief concept-diagram assets, keyed by the diagram key used in the
 * `[[diagram:KEY|caption]]` seed token (see `parseDiagram` in
 * inline-markup.ts). Imported the same way FrcShell imports the FRC logo
 * PNGs, so Vite serves them as fingerprinted, cache-busted production assets
 * rather than raw file references.
 */
export const DIAGRAMS: Record<string, string> = {
	'design-process-loop': designProcessLoop,
	'orthographic-views': orthographicViews,
	'shaft-stackup': shaftStackup,
	'clearance-vs-tapped': clearanceVsTapped,
	'clearance-vs-interference': clearanceVsInterference
};
