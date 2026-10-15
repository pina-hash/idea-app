/**
 * THE GEOMETRY OF A STUDENT'S COIN CHARTS (2.14), pure, so the arithmetic is
 * assertable without a browser. Plain inline SVG; no chart library.
 *
 * The balance line plots the balance at the end of each day coins moved,
 * against time (so a quiet month is a long flat stretch, not a squeezed one).
 * The weekly bars are DIVERGING: earned rises above a zero baseline and spent
 * falls below it, so the direction says which is which before any colour.
 */

export interface ChartBox {
	width: number;
	height: number;
	left: number;
	right: number;
	top: number;
	bottom: number;
}

export const COIN_CHART_BOX: ChartBox = { width: 640, height: 220, left: 52, right: 16, top: 14, bottom: 30 };

function dayMs(day: string): number {
	const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
	return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : NaN;
}

/** A tidy step for an axis that spans `span`: 1, 2 or 5 times a power of ten. */
export function niceStep(span: number, ticks = 4): number {
	if (!(span > 0)) return 1;
	const raw = span / ticks;
	const p = Math.pow(10, Math.floor(Math.log10(raw)));
	const f = raw / p;
	return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

/** Axis bounds that include zero and land on a tidy step. */
export function niceBounds(values: number[], ticks = 4): { min: number; max: number; step: number; ticks: number[] } {
	let lo = Math.min(0, ...values);
	let hi = Math.max(0, ...values);
	if (lo === hi) hi = lo + 1;
	const step = niceStep(hi - lo, ticks);
	lo = Math.floor(lo / step) * step;
	hi = Math.ceil(hi / step) * step;
	const out: number[] = [];
	for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v * 100) / 100);
	return { min: lo, max: hi, step, ticks: out };
}

export interface LineGeometry {
	path: string;
	points: { x: number; y: number; day: string; balance: number }[];
	yTicks: { y: number; value: number }[];
	zeroY: number;
	xLabels: { x: number; day: string; anchor: 'start' | 'end' }[];
}

/** The balance line's geometry inside `box`. Null for no points. */
export function balanceLine(
	series: readonly { day: string; balance: number }[],
	box: ChartBox = COIN_CHART_BOX
): LineGeometry | null {
	const pts = series.filter((p) => Number.isFinite(dayMs(p.day)));
	if (!pts.length) return null;
	const t0 = dayMs(pts[0].day);
	const t1 = dayMs(pts[pts.length - 1].day);
	const span = Math.max(t1 - t0, 1);
	const b = niceBounds(pts.map((p) => p.balance));
	const w = box.width - box.left - box.right;
	const h = box.height - box.top - box.bottom;
	const x = (t: number) => box.left + (pts.length === 1 ? w / 2 : ((t - t0) / span) * w);
	const y = (v: number) => box.top + (1 - (v - b.min) / (b.max - b.min)) * h;
	const points = pts.map((p) => ({ x: x(dayMs(p.day)), y: y(p.balance), day: p.day, balance: p.balance }));
	// A balance holds between the days it moved, so the line steps.
	let path = '';
	points.forEach((p, i) => {
		if (i === 0) path += `M${p.x.toFixed(1)},${p.y.toFixed(1)}`;
		else path += `H${p.x.toFixed(1)}V${p.y.toFixed(1)}`;
	});
	const xLabels: LineGeometry['xLabels'] = [{ x: points[0].x, day: pts[0].day, anchor: 'start' }];
	if (points.length > 1) xLabels.push({ x: points[points.length - 1].x, day: pts[pts.length - 1].day, anchor: 'end' });
	return {
		path,
		points,
		yTicks: b.ticks.map((v) => ({ y: y(v), value: v })),
		zeroY: y(0),
		xLabels
	};
}

export interface BarsGeometry {
	bars: {
		week_start: string;
		x: number;
		width: number;
		earnedY: number;
		earnedH: number;
		spentY: number;
		spentH: number;
		earned: number;
		spent: number;
	}[];
	zeroY: number;
	yTicks: { y: number; value: number }[];
}

/** The weekly bars' geometry: earned above zero, spent below. Null for no weeks. */
export function weekBars(
	weeks: readonly { week_start: string; earned: number; spent: number }[],
	box: ChartBox = COIN_CHART_BOX
): BarsGeometry | null {
	if (!weeks.length) return null;
	const b = niceBounds([...weeks.map((w) => w.earned), ...weeks.map((w) => -w.spent)]);
	const w = box.width - box.left - box.right;
	const h = box.height - box.top - box.bottom;
	const y = (v: number) => box.top + (1 - (v - b.min) / (b.max - b.min)) * h;
	const zeroY = y(0);
	const slot = w / weeks.length;
	const bw = Math.max(4, Math.min(28, slot * 0.6));
	return {
		zeroY,
		yTicks: b.ticks.map((v) => ({ y: y(v), value: v })),
		bars: weeks.map((wk, i) => {
			const x = box.left + slot * i + (slot - bw) / 2;
			const ey = y(wk.earned);
			const sy = y(-wk.spent);
			return {
				week_start: wk.week_start,
				x,
				width: bw,
				earnedY: ey,
				earnedH: Math.max(0, zeroY - ey),
				spentY: zeroY,
				spentH: Math.max(0, sy - zeroY),
				earned: wk.earned,
				spent: wk.spent
			};
		})
	};
}
