#!/usr/bin/env node
/**
 * REPLAY THE IDEA STOCK FORMULA OVER EIGHT WEEKS (ledger 0402).
 *
 *   node tools/coin-stock-backtest.mjs [out-dir]
 *
 * Runs `tests/db/coin-stocks-backtest.test.ts` (the REAL migrations on an
 * embedded Postgres, a seeded eight weeks of school, the REAL nightly run)
 * with COIN_BACKTEST_OUT set, so the closes land as CSV; then draws them as
 * one plain SVG chart beside it. The test itself is the assertion: no stock
 * closes at its floor or its ceiling, and every class day has a close. This
 * script judges the run by the summary line on stdout AND stderr, never by
 * vitest's exit code (CLAUDE.md, the mutation-script traps).
 *
 * Default out-dir: docs/coin-economy/backtests. Files are named for today.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const outDir = resolve(process.argv[2] ?? 'docs/coin-economy/backtests');
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
const csvPath = join(outDir, `${stamp}-stocks-v1.csv`);
const svgPath = join(outDir, `${stamp}-stocks-v1.svg`);

const run = spawnSync('npx', ['vitest', 'run', '--project', 'node', 'tests/db/coin-stocks-backtest.test.ts'], {
	env: { ...process.env, COIN_BACKTEST_OUT: csvPath },
	encoding: 'utf8',
	maxBuffer: 64 * 1024 * 1024
});
const text = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
const passed = /Tests\s+1 passed/.test(text);
const failed = /Tests\s+\d+ failed/.test(text) || /failed to apply|Failed Suites/.test(text);
if (!passed || failed) {
	console.error(text.slice(-4000));
	console.error(passed ? 'The backtest reported a failure.' : 'No passing summary line: the backtest did not run to the end.');
	process.exit(1);
}

const rows = readFileSync(csvPath, 'utf8')
	.trim()
	.split('\n')
	.slice(1)
	.map((l) => {
		const [stock, ticker, day, close] = l.split(',');
		return { stock, ticker, day, close: Number(close) };
	});
const tickers = [...new Set(rows.map((r) => r.ticker))];
const days = [...new Set(rows.map((r) => r.day))].sort();

// A plain SVG: one line per stock, the index heavier, a labelled y axis.
const W = 960;
const H = 420;
const L = 48;
const R = 130;
const T = 24;
const B = 40;
const all = rows.map((r) => r.close);
const lo = Math.floor(Math.min(...all) - 0.5);
const hi = Math.ceil(Math.max(...all) + 0.5);
const x = (d) => L + ((W - L - R) * days.indexOf(d)) / Math.max(days.length - 1, 1);
const y = (v) => T + ((H - T - B) * (hi - v)) / (hi - lo);
const colors = ['#2f7d4a', '#2b6cb0', '#b7791f', '#805ad5', '#c05621', '#2c7a7b'];
// End labels are spread at least 15px apart so two stocks ending close together stay readable.
const ends = tickers
	.map((t, i) => ({ t, i, close: rows.filter((r) => r.ticker === t).at(-1).close }))
	.map((e) => ({ ...e, ly: y(e.close) + 4 }))
	.sort((a, b) => a.ly - b.ly);
for (let k = 1; k < ends.length; k++) ends[k].ly = Math.max(ends[k].ly, ends[k - 1].ly + 15);
const lines = tickers.map((t, i) => {
	const pts = rows.filter((r) => r.ticker === t).map((r) => `${x(r.day).toFixed(1)},${y(r.close).toFixed(1)}`);
	const end = ends.find((e) => e.t === t);
	const w = t === 'IDEA' ? 3 : 1.6;
	return (
		`<polyline fill="none" stroke="${colors[i % colors.length]}" stroke-width="${w}" points="${pts.join(' ')}"/>` +
		`<text x="${W - R + 8}" y="${end.ly}" font-size="12" fill="${colors[i % colors.length]}">${t} ${end.close.toFixed(2)}</text>`
	);
});
const ticks = [];
for (let v = lo; v <= hi; v += Math.max(1, Math.round((hi - lo) / 6))) {
	ticks.push(`<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#ccd" stroke-width="0.5"/><text x="${L - 6}" y="${y(v) + 4}" font-size="11" text-anchor="end" fill="#445">${v}</text>`);
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="sans-serif">
<rect width="${W}" height="${H}" fill="#fbfbf8"/>
<text x="${L}" y="16" font-size="13" fill="#223">IDEA stocks, formula v1, eight weeks replayed (${days[0]} to ${days.at(-1)}), floor 1, ceiling 100</text>
${ticks.join('\n')}
${lines.join('\n')}
<text x="${L}" y="${H - 12}" font-size="11" fill="#445">${days.length} class days. Seeded data; see tests/db/coin-stocks-backtest.test.ts.</text>
</svg>
`;
writeFileSync(svgPath, svg);

const summary = tickers.map((t) => {
	const c = rows.filter((r) => r.ticker === t).map((r) => r.close);
	return `${t}: ${c[0].toFixed(2)} to ${c.at(-1).toFixed(2)}, low ${Math.min(...c).toFixed(2)}, high ${Math.max(...c).toFixed(2)}`;
});
console.log(`Backtest passed: ${days.length} class days, ${tickers.length} stocks, no floor or ceiling hits.`);
for (const s of summary) console.log(`  ${s}`);
console.log(`  ${csvPath}\n  ${svgPath}`);
