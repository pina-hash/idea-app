/**
 * A MINIMAL XLSX WRITER, so an export can open in Google Sheets with its
 * formatting intact rather than as a wall of comma-separated text.
 *
 * WHY NOT CSV. A CSV opens in Sheets too, but it carries no frozen header, no
 * column widths and no wrapping -- and the grading export has columns holding a
 * paragraph of a student's writing beside columns holding a single digit.
 * Opened as CSV that is one unreadable row per student, and the first thing
 * anybody does with it is spend five minutes formatting it by hand. It also
 * cannot carry MORE THAN ONE TABLE, and this export has five of them (grades,
 * unmet checks, responses, files, and what the file itself is), which as CSV
 * would be five separate downloads to reassemble.
 *
 * WHY NOT A DEPENDENCY. `npm install` here rewrites `package-lock.json`'s
 * indentation to match `package.json`'s and turns a one-package add into a
 * 4,649-line diff (CLAUDE.md's toolchain traps). The format's minimum is six
 * small XML parts in a zip, and this repo already owns a spec-correct zip
 * writer -- `buildZip` in `$lib/foundry/zip-write.ts`, CRC-32 and all -- so the
 * whole cost of writing it here is the XML.
 *
 * WHAT IT DELIBERATELY DOES NOT DO: shared strings (every cell is an inline
 * string or a number, which costs bytes and buys simplicity), formulas, merged
 * cells, charts, number formats beyond the general one, and more than one style
 * per role. Anything wanting those has outgrown this file and should say so
 * rather than growing it.
 *
 * THE STYLE INDICES ARE A CLOSED SET AND THE SHEET XML NAMES THEM BY NUMBER:
 * 0 plain, 1 header (bold, reversed out of a dark plate), 2 wrapped body.
 * `STYLES_XML` below is the only place they are defined, so adding one means
 * adding it there and here in the same edit.
 */
import { buildZip } from '$lib/foundry/zip-write';

/** A cell: a string, a number, or nothing at all. Booleans are the caller's to word. */
export type XlsxCell = string | number | null | undefined;

export interface XlsxSheet {
	/**
	 * The tab name. Excel caps it at 31 characters and forbids `[]:*?/\`, so
	 * `sheetName` normalizes rather than trusting the caller -- a workbook that
	 * refuses to open is a much worse failure than a truncated tab.
	 */
	name: string;
	/** The header row: bold, frozen, and the autofilter's own row. */
	header: string[];
	rows: XlsxCell[][];
	/**
	 * Per-column width in characters, positionally against `header`. A missing
	 * or zero entry takes the default. These are the caller's because only the
	 * caller knows which column holds a paragraph.
	 */
	widths?: number[];
}

const STYLE_PLAIN = 0;
const STYLE_HEADER = 1;
const STYLE_WRAP = 2;

/**
 * XML 1.0 forbids most C0 control characters OUTRIGHT -- they cannot be
 * escaped, only removed -- and a student's pasted text is exactly where one
 * arrives. A workbook carrying one does not open at all, so they are dropped
 * here rather than anywhere that could be forgotten. Tab, newline and carriage
 * return are legal and are deliberately NOT in the class.
 */
const ILLEGAL_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

function xml(text: string): string {
	return text
		.replace(ILLEGAL_XML, '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/** 1-based column index to its letters: 1 -> A, 27 -> AA. */
export function columnLetter(index: number): string {
	let n = index;
	let out = '';
	while (n > 0) {
		const rem = (n - 1) % 26;
		out = String.fromCharCode(65 + rem) + out;
		n = Math.floor((n - 1) / 26);
	}
	return out;
}

/** Excel's tab-name rules applied rather than assumed. */
export function sheetName(raw: string): string {
	const cleaned = raw.replace(/[[\]:*?/\\]/g, ' ').trim() || 'Sheet';
	return cleaned.slice(0, 31);
}

function cellXml(ref: string, value: XlsxCell, style: number): string {
	const s = style ? ` s="${style}"` : '';
	if (value == null || value === '') return `<c r="${ref}"${s}/>`;
	if (typeof value === 'number' && Number.isFinite(value)) {
		return `<c r="${ref}"${s}><v>${value}</v></c>`;
	}
	// `xml:space="preserve"` or Excel eats leading and trailing whitespace,
	// which silently rewrites a student's own text.
	return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xml(String(value))}</t></is></c>`;
}

function sheetXml(sheet: XlsxSheet): string {
	const width = Math.max(sheet.header.length, ...sheet.rows.map((r) => r.length), 1);
	const lastCol = columnLetter(width);
	const lastRow = sheet.rows.length + 1;
	const cols = sheet.widths?.length
		? `<cols>${sheet.widths
				.map((w, i) =>
					w && w > 0 ? `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>` : ''
				)
				.join('')}</cols>`
		: '';
	const head = sheet.header
		.map((h, i) => cellXml(`${columnLetter(i + 1)}1`, h, STYLE_HEADER))
		.join('');
	const body = sheet.rows
		.map((row, r) => {
			const n = r + 2;
			const cells = row
				.map((v, i) =>
					cellXml(`${columnLetter(i + 1)}${n}`, v, typeof v === 'number' ? STYLE_PLAIN : STYLE_WRAP)
				)
				.join('');
			return `<row r="${n}">${cells}</row>`;
		})
		.join('');
	// ELEMENT ORDER IS THE SCHEMA'S, NOT A PREFERENCE: dimension, sheetViews,
	// sheetFormatPr, cols, sheetData, then autoFilter. Out of order the part is
	// invalid and the workbook does not open at all.
	return (
		'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
		'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
		`<dimension ref="A1:${lastCol}${lastRow}"/>` +
		'<sheetViews><sheetView workbookViewId="0">' +
		'<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
		'</sheetView></sheetViews>' +
		'<sheetFormatPr defaultRowHeight="15"/>' +
		cols +
		`<sheetData><row r="1">${head}</row>${body}</sheetData>` +
		`<autoFilter ref="A1:${lastCol}${lastRow}"/>` +
		'</worksheet>'
	);
}

const STYLES_XML =
	'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
	'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
	'<fonts count="2">' +
	'<font><sz val="11"/><name val="Calibri"/></font>' +
	'<font><b/><sz val="11"/><name val="Calibri"/><color rgb="FFFFFFFF"/></font>' +
	'</fonts>' +
	// Fill 0 and 1 are RESERVED by the format (none, gray125) and must both be
	// present even though nothing uses the second; the header fill is index 2.
	'<fills count="3">' +
	'<fill><patternFill patternType="none"/></fill>' +
	'<fill><patternFill patternType="gray125"/></fill>' +
	'<fill><patternFill patternType="solid"><fgColor rgb="FF1B3226"/><bgColor indexed="64"/></patternFill></fill>' +
	'</fills>' +
	'<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
	'<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
	'<cellXfs count="3">' +
	'<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
	'<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' +
	'<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
	'</cellXfs>' +
	'<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
	'</styleSheet>';

const utf8 = (s: string) => new TextEncoder().encode(s);

/**
 * The workbook as bytes. Every sheet is written whole, so this buffers the
 * entire export in memory exactly as `buildZip` does -- which is free here,
 * because the caller is a browser already holding the same data on screen.
 */
export async function buildXlsx(sheets: XlsxSheet[]): Promise<Uint8Array> {
	if (!sheets.length) throw new Error('A workbook needs at least one sheet.');
	const names = sheets.map((s) => sheetName(s.name));
	const sheetRels = names
		.map(
			(_, i) =>
				`<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
		)
		.join('');

	const entries = [
		{
			path: '[Content_Types].xml',
			bytes: utf8(
				'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
					'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
					'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
					'<Default Extension="xml" ContentType="application/xml"/>' +
					'<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
					names
						.map(
							(_, i) =>
								`<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
						)
						.join('') +
					'<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
					'</Types>'
			)
		},
		{
			path: '_rels/.rels',
			bytes: utf8(
				'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
					'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
					'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
					'</Relationships>'
			)
		},
		{
			path: 'xl/workbook.xml',
			bytes: utf8(
				'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
					'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
					'<sheets>' +
					names
						.map((n, i) => `<sheet name="${xml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
						.join('') +
					'</sheets></workbook>'
			)
		},
		{
			path: 'xl/_rels/workbook.xml.rels',
			bytes: utf8(
				'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
					'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
					sheetRels +
					`<Relationship Id="rId${names.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
					'</Relationships>'
			)
		},
		{ path: 'xl/styles.xml', bytes: utf8(STYLES_XML) },
		...sheets.map((s, i) => ({
			path: `xl/worksheets/sheet${i + 1}.xml`,
			bytes: utf8(sheetXml(s))
		}))
	];

	return buildZip(entries);
}
