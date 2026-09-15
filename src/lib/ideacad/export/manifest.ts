import type { Evaluation } from '../blade/evaluate';

export interface ExportManifestInput {
	partName: string;
	material: string;
	stockThicknessMm: number;
}

/** UTF-8 JSON traceability record captured from the same evaluation as the part. */
export function exportManifest(evaluation: Evaluation, input: ExportManifestInput): Uint8Array {
	const manifest = {
		schema: 'ideacad-export-manifest-1',
		partName: input.partName,
		units: { mass: 'g', stockThickness: 'mm' },
		massG: null,
		material: input.material,
		stockThicknessMm: input.stockThicknessMm,
		rules: evaluation.rules.map(({ id, label, value, limit, pass }) => ({ id, label, value:id==='mass'?null:value, limit, pass:id==='mass'?null:pass }))
	};
	return new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`);
}
