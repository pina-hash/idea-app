// tests/cert-desk-telemetry.test.ts
//
// THE TELEMETRY CHARTS DRAW ONE BAR PER ROW WITH ITS LABEL, AND EMPTY DATA
// SAYS SO IN WORDS (ledger 0391, surface d). Plain SVG, no chart library: a
// row's label is the data's own words, the figure is printed at the bar's end
// so length is never the only signal, and a chart with nothing renders the
// sentence rather than an empty axis. `barLayout` is the arithmetic; the
// render is the real `Telemetry` component, server-rendered.

import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import Telemetry from '../src/lib/certifications/desk/Telemetry.svelte';
import { CHART_EMPTY_WORDS, barLayout, telemetryCharts } from '../src/lib/certifications/desk/desk';
import { TELEMETRY_DATA, TELEMETRY_EMPTY } from '../src/routes/dev/cert-desk/fixtures';

const count = (body: string, re: RegExp) => (body.match(re) ?? []).length;
const chartOf = (body: string, id: string) => {
	const start = body.indexOf(`data-chart="${id}"`);
	expect(start).toBeGreaterThan(-1);
	const end = body.indexOf('</section>', start);
	return body.slice(start, end);
};

describe('barLayout', () => {
	it('one row per bar, the longest bar at full span, a second bar where a row carries two values', () => {
		const layout = barLayout([
			{ label: 'MILL-1', value: 5, second: 2 },
			{ label: 'SAFE-1', value: 10, second: 0 }
		]);
		expect(layout.rows.length).toBe(2);
		expect(layout.rows[1].w1).toBeGreaterThan(layout.rows[0].w1);
		expect(layout.rows[1].w1).toBe(layout.width - layout.labelWidth - 56);
		expect(layout.rows[0].w1 * 2).toBe(layout.rows[1].w1);
		// A zero draws no bar; a non-zero value never vanishes under rounding.
		expect(layout.rows[1].w2).toBe(0);
		expect(barLayout([{ label: 'x', value: 1 }, { label: 'y', value: 1000 }]).rows[0].w1).toBeGreaterThanOrEqual(2);
		expect(layout.height).toBe(2 * 26);
	});

	it('an empty list is one empty row of height, not a crash', () => {
		expect(barLayout([]).rows).toEqual([]);
		expect(barLayout([]).height).toBe(26);
	});
});

describe('telemetryCharts', () => {
	it('derives five charts from the payload and none from nothing', () => {
		expect(telemetryCharts(null)).toEqual([]);
		const charts = telemetryCharts(TELEMETRY_DATA);
		expect(charts.map((c) => c.id)).toEqual(['active', 'pass-rates', 'exam-topics', 'missed', 'completion']);
		expect(charts[0].bars.map((b) => b.label)).toEqual(['MILL-1', 'SAFE-1', 'LATHE-1']);
		expect(charts[2].bars.find((b) => b.label === 'MILL-1 speeds')?.value).toBe(65);
		for (const c of telemetryCharts(TELEMETRY_EMPTY)) expect(c.bars).toEqual([]);
	});
});

describe('Telemetry, rendered', () => {
	it('draws one bar per row with its label and prints its figure', () => {
		const body = render(Telemetry, { props: { telemetry: TELEMETRY_DATA } }).body;
		const active = chartOf(body, 'active');
		expect(count(active, /<rect class="bar/g)).toBe(6);
		expect(count(active, /<g class="row"/g)).toBe(3);
		for (const label of ['MILL-1', 'SAFE-1', 'LATHE-1']) expect(active).toContain(`>${label}</text>`);
		for (const figure of ['>5</text>', '>2</text>', '>11</text>', '>1</text>']) expect(active).toContain(figure);
		const topics = chartOf(body, 'exam-topics');
		expect(count(topics, /<rect class="bar/g)).toBe(3);
		expect(topics).toContain('MILL-1 speeds');
		expect(topics).toContain('>65</text>');
		expect(count(body, /data-testid="cert-chart"/g)).toBe(7);
		expect(count(body, /<svg class="cert-chart"/g)).toBe(6);
		expect(count(body, new RegExp(CHART_EMPTY_WORDS.replace('.', '\\.'), 'g'))).toBe(0);
		expect(body).toContain('Cy Nguyen');
		expect(body).toContain('41 days idle');
		expect(count(body, /class="dk-legend"/g)).toBe(6);
	});

	it('empty data renders the words on every chart and no axis', () => {
		const body = render(Telemetry, { props: { telemetry: TELEMETRY_EMPTY } }).body;
		expect(count(body, /data-testid="cert-chart-empty"/g)).toBe(7);
		expect(count(body, new RegExp(CHART_EMPTY_WORDS.replace('.', '\\.'), 'g'))).toBe(7);
		expect(count(body, /<svg class="cert-chart"/g)).toBe(0);
		expect(count(body, /<rect class="bar/g)).toBe(0);
	});

	it('no payload at all says so once', () => {
		const body = render(Telemetry, { props: { telemetry: null } }).body;
		expect(count(body, /data-testid="cert-telemetry-none"/g)).toBe(1);
		expect(count(body, /data-testid="cert-chart"/g)).toBe(0);
	});
});
