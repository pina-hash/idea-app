import { SEED_SUBSYSTEMS, type CotsPart, type PartNumberRow, type ProjectPartNumbers } from '$lib/armory/part-numbers';

export const NOW = Date.parse('2026-10-18T19:30:00Z');
const PROJECT = '0f3c9a10-1111-4a5a-9e3b-6b0d5a2b7c01';

let seq = 0;
function row(subsystem: string, assembly: number, part: number, extra: Partial<PartNumberRow> = {}): PartNumberRow {
	seq += 1;
	const n = `5669-26-${subsystem}-${String(assembly).padStart(2, '0')}${String(part).padStart(2, '0')}`;
	return {
		id: `pn-${seq}`,
		part_number: n,
		prefix: '5669',
		season_yy: 26,
		subsystem,
		assembly,
		part,
		kind: part === 0 ? 'assembly' : 'part',
		revision: 'A',
		description: '',
		made_from: null,
		project_id: PROJECT,
		file_id: null,
		file_name: null,
		file_folder: null,
		file_deleted: false,
		assigned_name: 'Ana Reyes',
		assigned_at: new Date(NOW - seq * 3_600_000).toISOString(),
		...extra
	};
}

export function numbers(): PartNumberRow[] {
	seq = 0;
	return [
		row('DT', 1, 0, { description: 'Swerve module, front left', file_id: 'f-1', file_name: 'Swerve Module FL.SLDASM', file_folder: 'Drive' }),
		row('DT', 1, 1, { description: 'Wheel fork plate', revision: 'C', file_id: 'f-2', file_name: 'Fork Plate.SLDPRT', file_folder: 'Drive' }),
		row('DT', 1, 2, { description: 'Bevel gear spacer, cut down', made_from: 'WCP-0388', assigned_name: 'Ben Ortiz' }),
		row('DT', 1, 3, { description: 'Steering motor bracket', file_id: 'f-3', file_name: 'Steer Bracket.SLDPRT', file_folder: 'Drive', file_deleted: true }),
		row('DT', 2, 0, { description: 'Drive base frame' }),
		row('DT', 2, 1, { description: 'Bellypan', assigned_name: 'Lea Diaz' }),
		row('SH', 1, 0, { description: 'Flywheel shooter' }),
		row('SH', 1, 1, { description: 'Side plate, left' }),
		row('SH', 1, 2, { description: 'Side plate, right' }),
		row('SH', 1, 3, { description: 'Hood' }),
		row('EE', 1, 0, { description: 'Electrical board' }),
		row('EE', 1, 1, { description: 'PDH mount' })
	];
}

export function project(over: Partial<ProjectPartNumbers> = {}, list: PartNumberRow[] = numbers()): ProjectPartNumbers {
	return {
		project: { id: PROJECT, name: 'Robot 2026', season: 2026, season_yy: 26, prefix: '5669', archived: false, role: 'student' },
		can_take: true,
		can_set_prefix: false,
		can_curate: false,
		subsystems: SEED_SUBSYSTEMS.map((s) => ({ ...s, retired: false })),
		numbers: list,
		...over
	};
}

let cseq = 0;
function cots(vendor: string, vendorPart: string, description: string, extra: Partial<CotsPart> = {}): CotsPart {
	cseq += 1;
	return {
		id: `c-${cseq}`,
		vendor,
		vendor_part: vendorPart,
		cots_number: `${vendor}-${vendorPart}`,
		description,
		link: null,
		retired: false,
		file: null,
		added_at: new Date(NOW - cseq * 86_400_000).toISOString(),
		corrected_at: null,
		...extra
	};
}

export function library(): CotsPart[] {
	cseq = 0;
	return [
		cots('AM', '0059', 'Gear 14T'),
		cots('HW', 'NUT-NYLOCK-10-32', 'Nylock nut, 10-32'),
		cots('HW', 'SHCS-10-32x0.75', 'Socket head cap screw, 10-32 x 3/4 in'),
		cots('HW', 'SHCS-10-32x0.50', 'Socket head cap screw, 10-32 x 1/2 in'),
		cots('REV', '21-1650', 'NEO Brushless Motor', { link: 'https://www.revrobotics.com/rev-21-1650/' }),
		cots('REV', '21-2158', 'SPARK MAX Motor Controller'),
		cots('WCP', '0388', 'Hex Bearing, 1/2 in', {
			link: 'https://wcproducts.com/',
			file: { id: 'f-9', name: 'Hex Bearing.SLDPRT', project_id: PROJECT }
		}),
		cots('WCP', '0103', 'Old flanged bearing', { retired: true })
	];
}
