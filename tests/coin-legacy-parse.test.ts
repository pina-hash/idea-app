// tests/coin-legacy-parse.test.ts
//
// The migrate.ts parsing + preview math, run against the REAL archived pull
// (docs/coin-economy/archive/) -- the actual production data the migration
// will move, not a synthetic fixture. Pure, no database. This pins the data
// facts the whole migration rests on: if the sheet's shape drifts (a renamed
// column, a new transaction type, a name that stops reconciling), the next
// `npm test` says so by name instead of the wizard discovering it live.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import {
	buildMappingRows,
	buildRawSnapshot,
	eatingPassPurchases,
	expectedBalance,
	isKnownLegacyType,
	mappingIssues,
	parseContractsPayload,
	parseSummaryCsv,
	parseTransactionsCsv,
	patternEmail,
	previewRows,
	pullFlags,
	signedAmount,
	splitLegacyName,
	unresolvedContractors,
	type MappingRow
} from '$lib/coin-desk/migrate';

const ARCHIVE = fileURLToPath(new URL('../docs/coin-economy/archive', import.meta.url));

const summary = parseSummaryCsv(readFileSync(join(ARCHIVE, '2026-08-11-summary.csv'), 'utf8'));
const transactions = parseTransactionsCsv(
	readFileSync(join(ARCHIVE, '2026-08-11-transactions.csv'), 'utf8')
);
const contracts = parseContractsPayload(
	JSON.parse(readFileSync(join(ARCHIVE, '2026-08-11-contracts.json'), 'utf8'))
);

const pull = buildRawSnapshot({
	summary,
	transactions,
	contracts,
	contractHistory: [],
	contractsAvailable: true,
	source: { note: 'archived pull, 2026-08-11' }
});

/** Every name mapped to a synthetic unique address, external rows relaxed. */
function identityMapping(): MappingRow[] {
	const rows = buildMappingRows(pull, [], []);
	return rows.map((r, i) => ({
		...r,
		email: r.email || `student-${i}@${r.status === 'external' ? 'example.com' : 'boscotech.net'}`,
		status: r.status === 'external' ? 'external' : 'hand'
	}));
}

describe('the archived production pull', () => {
	test('parses to the verified counts', () => {
		expect(summary).toHaveLength(71);
		expect(transactions).toHaveLength(216);
		expect(contracts.length).toBeGreaterThanOrEqual(12);
	});

	test('every transaction type is one 0084 knows how to sign', () => {
		expect(transactions.filter((t) => !isKnownLegacyType(t.type))).toEqual([]);
	});

	test('per student, the log sums exactly to the summary columns (0 diff)', () => {
		const rows = previewRows(pull, identityMapping());
		expect(rows).toHaveLength(71);
		expect(rows.filter((r) => r.diff !== 0)).toEqual([]);
		// The sheet's own verified property restated directly: awarded minus
		// fines minus spent minus paid out equals the signed transaction sum.
		const total = transactions.reduce((acc, t) => acc + signedAmount(t), 0);
		expect(total).toBe(summary.reduce((acc, s) => acc + expectedBalance(s), 0));
	});

	test('the flags panel facts: 3 eating passes, 7 external rows, no strays', () => {
		const passes = eatingPassPurchases(pull);
		expect(passes.map((p) => p.amount).sort()).toEqual([40, 50, 50]);
		const flags = pullFlags(pull);
		expect(flags.externalNames).toHaveLength(7);
		expect(flags.transactionOnlyNames).toEqual([]);
		expect(flags.unknownTypes).toEqual([]);
	});

	test('every contractor name resolves through the mapping union', () => {
		expect(unresolvedContractors(pull, identityMapping())).toEqual([]);
		// The union itself is exactly the summary roster: the real data has no
		// transaction-only or contractor-only names.
		expect(buildMappingRows(pull, [], [])).toHaveLength(71);
	});

	test('the identity mapping passes validation; a blank row blocks', () => {
		expect(mappingIssues(identityMapping()).ok).toBe(true);
		const withBlank = identityMapping();
		withBlank[3] = { ...withBlank[3], email: '' };
		const issues = mappingIssues(withBlank);
		expect(issues.ok).toBe(false);
		expect(issues.unmapped).toEqual([withBlank[3].legacy_name]);
	});
});

describe('name helpers against real name shapes', () => {
	test('pattern generation handles the roster conventions', () => {
		expect(patternEmail('first.last', 'de la Loza, Joseph')).toBe('joseph.delaloza@boscotech.net');
		expect(patternEmail('flast', 'Gonzalez, Diego S.')).toBe('dgonzalez@boscotech.net');
		expect(patternEmail('first.last', 'Jette-Kouri, Abraham')).toBe('abraham.jettekouri@boscotech.net');
	});

	test('partial External names produce no pattern, never a broken one', () => {
		expect(splitLegacyName('Colin')).toBeNull();
		expect(patternEmail('first.last', 'Colin')).toBeNull();
		// A no-comma two-token name still splits (First Last order).
		expect(splitLegacyName('Lance Yip')).toEqual({ first: 'lance', last: 'yip' });
	});
});
