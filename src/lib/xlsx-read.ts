/**
 * A MINIMAL XLSX READER: the deliberate mirror of `./xlsx.ts`, exactly as
 * `$lib/foundry/zip.ts` is the mirror of `zip-write.ts`.
 *
 * WHY IT EXISTS. Everything worth asserting about the grading workbook is a
 * claim about the BYTES that came out -- the sheet names, a table sheet's real
 * header row, how many rows survived the blank-row drop, whether any row is
 * taller than the cap, whether a name is in the file. Asserting those against
 * the object that was passed to the writer proves only that the writer agrees
 * with itself. Two surfaces need to make those claims (the vitest suite and the
 * `/dev/grading-incomplete` browser harness), and a second parser in one of them
 * is the copy that stops agreeing about what the file says.
 *
 * IT READS ONLY WHAT THIS REPO WRITES, AND THAT IS THE POINT RATHER THAN A
 * LIMITATION. Inline strings and plain numbers, one `<row>` per row, no shared
 * string table, no styles resolution, no formulas, no dates. A workbook from
 * anywhere else may parse into nonsense here and that is fine: this is an
 * instrument aimed at `buildXlsx`, not a general reader. If `xlsx.ts` ever
 * grows shared strings, this grows with it in the same edit or every assertion
 * built on it silently starts reading empty cells.
 */
import { inflateEntry, readCentralDirectory } from '$lib/foundry/zip';

export interface XlsxReadSheet {
	name: string;
	/** Row 1, which the writer always makes the header. */
	header: string[];
	/** Every row after the header. */
	rows: string[][];
	/**
	 * The explicit `ht` on each body row, in points, positionally against
	 * `rows`; null where a row carries none and the reader would auto-fit.
	 */
	heights: (number | null)[];
}

function unescapeXml(text: string): string {
	return text
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		// LAST, or an escaped `&lt;` written as `&amp;lt;` would come back as a
		// real `<` instead of the four characters the student actually typed.
		.replace(/&amp;/g, '&');
}

function parseRows(sheetXml: string): { rows: string[][]; heights: (number | null)[] } {
	const rows: string[][] = [];
	const heights: (number | null)[] = [];
	const rowRe = /<row r="\d+"([^>]*)>([\s\S]*?)<\/row>/g;
	let rowMatch: RegExpExecArray | null;
	while ((rowMatch = rowRe.exec(sheetXml))) {
		const ht = /\bht="([\d.]+)"/.exec(rowMatch[1]);
		heights.push(ht ? Number(ht[1]) : null);
		const cells: string[] = [];
		// A self-closing `<c .../>` is an EMPTY cell and still occupies its
		// column, so it has to produce an entry rather than be skipped -- every
		// positional assertion downstream depends on the column index.
		const cellRe = /<c [^>]*?(?:\/>|>([\s\S]*?)<\/c>)/g;
		let cellMatch: RegExpExecArray | null;
		while ((cellMatch = cellRe.exec(rowMatch[2]))) {
			const inner = cellMatch[1] ?? '';
			const t = /<t[^>]*>([\s\S]*?)<\/t>/.exec(inner);
			const v = /<v>([\s\S]*?)<\/v>/.exec(inner);
			cells.push(t ? unescapeXml(t[1]) : v ? v[1] : '');
		}
		rows.push(cells);
	}
	return { rows, heights };
}

/** Every part of the package, by path, as text. */
export async function readXlsxParts(bytes: Uint8Array): Promise<Map<string, string>> {
	const records = readCentralDirectory(bytes);
	if (!records) throw new Error('Not a readable zip: no central directory.');
	const out = new Map<string, string>();
	for (const rec of records) {
		if (rec.directory) continue;
		const raw = await inflateEntry(bytes, rec, rec.name);
		out.set(rec.name, new TextDecoder().decode(raw));
	}
	return out;
}

/**
 * The workbook by SHEET NAME.
 *
 * Sheet order in `xl/workbook.xml` is the order of `sheetN.xml`, so a name maps
 * to a part without guessing. That is what lets an assertion name the sheet it
 * means rather than an index, which moves the moment a sheet is inserted.
 */
export async function readXlsxWorkbook(bytes: Uint8Array): Promise<Map<string, XlsxReadSheet>> {
	const parts = await readXlsxParts(bytes);
	const wb = parts.get('xl/workbook.xml');
	if (!wb) throw new Error('Not a readable workbook: no xl/workbook.xml.');
	const names = [...wb.matchAll(/<sheet name="([^"]*)"/g)].map((m) => unescapeXml(m[1]));
	const out = new Map<string, XlsxReadSheet>();
	names.forEach((name, i) => {
		const sheetXml = parts.get(`xl/worksheets/sheet${i + 1}.xml`);
		if (!sheetXml) return;
		const { rows, heights } = parseRows(sheetXml);
		out.set(name, {
			name,
			header: rows[0] ?? [],
			rows: rows.slice(1),
			heights: heights.slice(1)
		});
	});
	return out;
}
