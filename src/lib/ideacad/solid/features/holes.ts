/**
 * STANDARD HOLE SIZES: what a Hole feature drills for a named fastener size,
 * as three fits -- the TAP DRILL for a tapped hole, and CLOSE and NORMAL
 * clearance for a bolt that passes through. Plain data; no kernel in here.
 *
 * EVERY NUMBER NAMES ITS SOURCE, and a size that could not be sourced is not
 * in this table (there is no #2, no #12, no M2.5, no 7/16). The sources, all
 * read on 2026-09-21 from inside this repository's session:
 *
 *   [B18]  ASME B18.2.8-1999 "Clearance holes for bolts, screws and studs", as
 *          transcribed at https://amesweb.info/Screws/Clearance-Hole-Chart.aspx
 *          (inch) and https://amesweb.info/Screws/Metric-Clearance-Hole-Chart.aspx
 *          (metric). The inch chart names the DRILL for each fit and prints the
 *          hole as a min-max range; the diameter stored here is the named
 *          drill's nominal decimal, which is the range's low end.
 *   [TAP]  UNC tap drills for about 75% thread, d-P rounded to a stock drill,
 *          https://threadspec.org/tap-drill-chart/ (drill designation and its
 *          size in mm), the same designations the Wikipedia table below lists
 *          beside each drill row.
 *   [DEC]  Decimal inch equivalents of number, letter and fractional drills,
 *          "List of drill and tap sizes", https://en.wikipedia.org/wiki/List_of_drill_and_tap_sizes
 *          (the drill-bit rows: #43 = 0.0890, #36 = 0.1065, #29 = 0.1360,
 *          #25 = 0.1495, #7 = 0.2010, F = 0.2570, #31 = 0.1200, #30 = 0.1285,
 *          #23 = 0.1540, #18 = 0.1695, #15 = 0.1800, #9 = 0.1960, #5 = 0.2055,
 *          #2 = 0.2210). Fractional drills are exact arithmetic.
 *   [ISO]  Metric coarse tap drills, https://amesweb.info/Screws/metric-tap-drill-chart.aspx,
 *          which cites ISO 2306:1972 "Drills for use prior to tapping screw
 *          threads" and ISO 68-1; the same six figures appear in [TAP]'s metric
 *          table. ONE DISAGREEMENT IS KNOWN: [DEC]'s metric rows give 6.9 mm
 *          for M8x1.25 where [ISO] and [TAP] both give 6.8 mm (d-P is 6.75).
 *          6.8 is stored, with the two agreeing sources.
 *
 * DIAMETERS ARE STORED IN THE UNIT THEIR CHART PRINTS THEM IN and converted
 * to inches at lookup, because the document is in inches (`types.ts`) and a
 * metric figure retyped in inches is a figure with no source.
 */
export type HoleFit = 'tapped' | 'close' | 'normal' | 'custom';
export interface HoleFigure { drill: string; diameter: number; unit: 'in' | 'mm'; source: string }
export interface HoleStandard { id: string; label: string; system: 'inch' | 'metric'; tapped: HoleFigure; close: HoleFigure; normal: HoleFigure }

const inch = (drill: string, diameter: number, source: string): HoleFigure => ({ drill, diameter, unit: 'in', source });
const mm = (drill: string, diameter: number, source: string): HoleFigure => ({ drill, diameter, unit: 'mm', source });
export const MM_PER_IN = 25.4;

export const HOLE_STANDARDS: readonly HoleStandard[] = [
	{ id: '#4-40', label: '#4-40 UNC', system: 'inch', tapped: inch('#43', 0.089, '[TAP] #43; [DEC] #43 = 0.0890'), close: inch('#31', 0.12, '[B18] close #31, 0.120-0.124; [DEC] #31 = 0.1200'), normal: inch('#30', 0.1285, '[B18] normal #30, 0.128-0.135; [DEC] #30 = 0.1285') },
	{ id: '#6-32', label: '#6-32 UNC', system: 'inch', tapped: inch('#36', 0.1065, '[TAP] #36; [DEC] #36 = 0.1065'), close: inch('#23', 0.154, '[B18] close #23, 0.154-0.159; [DEC] #23 = 0.1540'), normal: inch('#18', 0.1695, '[B18] normal #18, 0.170-0.177; [DEC] #18 = 0.1695') },
	{ id: '#8-32', label: '#8-32 UNC', system: 'inch', tapped: inch('#29', 0.136, '[TAP] #29; [DEC] #29 = 0.1360'), close: inch('#15', 0.18, '[B18] close #15, 0.180-0.185; [DEC] #15 = 0.1800'), normal: inch('#9', 0.196, '[B18] normal #9, 0.196-0.203; [DEC] #9 = 0.1960') },
	{ id: '#10-24', label: '#10-24 UNC', system: 'inch', tapped: inch('#25', 0.1495, '[TAP] #25; [DEC] #25 = 0.1495'), close: inch('#5', 0.2055, '[B18] close #5, 0.206-0.211; [DEC] #5 = 0.2055'), normal: inch('#2', 0.221, '[B18] normal #2, 0.221-0.228; [DEC] #2 = 0.2210') },
	{ id: '1/4-20', label: '1/4-20 UNC', system: 'inch', tapped: inch('#7', 0.201, '[TAP] #7; [DEC] #7 = 0.2010'), close: inch('17/64', 17 / 64, '[B18] close 17/64, 0.266-0.272'), normal: inch('9/32', 9 / 32, '[B18] normal 9/32, 0.281-0.290') },
	{ id: '5/16-18', label: '5/16-18 UNC', system: 'inch', tapped: inch('F', 0.257, '[TAP] F; [DEC] F = 0.2570'), close: inch('21/64', 21 / 64, '[B18] close 21/64, 0.328-0.334'), normal: inch('11/32', 11 / 32, '[B18] normal 11/32, 0.344-0.354') },
	{ id: '3/8-16', label: '3/8-16 UNC', system: 'inch', tapped: inch('5/16', 5 / 16, '[TAP] 5/16'), close: inch('25/64', 25 / 64, '[B18] close 25/64, 0.391-0.397'), normal: inch('13/32', 13 / 32, '[B18] normal 13/32, 0.406-0.416') },
	{ id: '1/2-13', label: '1/2-13 UNC', system: 'inch', tapped: inch('27/64', 27 / 64, '[TAP] 27/64'), close: inch('17/32', 17 / 32, '[B18] close 17/32, 0.531-0.538'), normal: inch('9/16', 9 / 16, '[B18] normal 9/16, 0.562-0.572') },
	{ id: 'M3', label: 'M3 x 0.5', system: 'metric', tapped: mm('2.5 mm', 2.5, '[ISO] 2.50; [TAP] 2.5'), close: mm('3.2 mm', 3.2, '[B18] metric close 3.2'), normal: mm('3.4 mm', 3.4, '[B18] metric normal 3.4') },
	{ id: 'M4', label: 'M4 x 0.7', system: 'metric', tapped: mm('3.3 mm', 3.3, '[ISO] 3.30; [TAP] 3.3'), close: mm('4.3 mm', 4.3, '[B18] metric close 4.3'), normal: mm('4.5 mm', 4.5, '[B18] metric normal 4.5') },
	{ id: 'M5', label: 'M5 x 0.8', system: 'metric', tapped: mm('4.2 mm', 4.2, '[ISO] 4.20; [TAP] 4.2'), close: mm('5.3 mm', 5.3, '[B18] metric close 5.3'), normal: mm('5.5 mm', 5.5, '[B18] metric normal 5.5') },
	{ id: 'M6', label: 'M6 x 1.0', system: 'metric', tapped: mm('5.0 mm', 5, '[ISO] 5.00; [TAP] 5.0'), close: mm('6.4 mm', 6.4, '[B18] metric close 6.4'), normal: mm('6.6 mm', 6.6, '[B18] metric normal 6.6') },
	{ id: 'M8', label: 'M8 x 1.25', system: 'metric', tapped: mm('6.8 mm', 6.8, '[ISO] 6.80; [TAP] 6.8 ([DEC] prints 6.9, see header)'), close: mm('8.4 mm', 8.4, '[B18] metric close 8.4'), normal: mm('9.0 mm', 9, '[B18] metric normal 9.0') },
	{ id: 'M10', label: 'M10 x 1.5', system: 'metric', tapped: mm('8.5 mm', 8.5, '[ISO] 8.50; [TAP] 8.5'), close: mm('10.5 mm', 10.5, '[B18] metric close 10.5'), normal: mm('11.0 mm', 11, '[B18] metric normal 11.0') }
];
export const HOLE_FIT_WORDS: Record<HoleFit, { word: string; sentence: string }> = {
	tapped: { word: 'Tapped', sentence: 'the tap drill, for cutting a thread afterwards' },
	close: { word: 'Close', sentence: 'a close clearance, for a bolt that must locate the part' },
	normal: { word: 'Normal', sentence: 'a normal clearance, for a bolt that passes through' },
	custom: { word: 'Custom', sentence: 'a diameter you type' }
};
export const holeStandard = (id: string): HoleStandard | undefined => HOLE_STANDARDS.find((s) => s.id === id);
/** A chart figure in inches, the document's unit. */
export const figureInches = (f: HoleFigure) => (f.unit === 'mm' ? f.diameter / MM_PER_IN : f.diameter);
/**
 * The diameter a hole drills, in inches. A custom fit takes the typed
 * diameter as is; the three chart fits read the named standard. Unknown
 * standards and missing custom diameters throw in the student's terms.
 */
export function holeDiameter(standard: string, fit: HoleFit, custom?: number): number {
	if (fit === 'custom') {
		if (custom === undefined || !Number.isFinite(custom)) throw Error('Enter a hole diameter in inches, like 0.25.');
		if (custom <= 0) throw Error('Use a hole diameter greater than zero.');
		return custom;
	}
	const s = holeStandard(standard);
	if (!s) throw Error(`${standard || 'That size'} is not in the hole chart. Pick a listed size, or use a custom diameter.`);
	return figureInches(s[fit]);
}
/** The words a panel shows beside the chosen size: the drill and the diameter in inches. */
export function describeHole(standard: string, fit: HoleFit, custom?: number): string {
	if (fit === 'custom') return Number.isFinite(custom) && (custom as number) > 0 ? `${Number((custom as number).toFixed(4))} in` : 'Type a diameter in inches';
	const s = holeStandard(standard); if (!s) return 'Pick a size';
	const f = s[fit];
	return `${f.drill} drill, ${Number(figureInches(f).toFixed(4))} in`;
}
