import type { Evaluation } from '../blade/evaluate';
import { evaluatedBladeTriangles } from './mesh';

const xmlEscape = (value: string) => value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
const u16 = (value: number) => [value & 255, value >>> 8 & 255];
const u32 = (value: number) => [value & 255, value >>> 8 & 255, value >>> 16 & 255, value >>> 24 & 255];
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ c >>> 1 : c >>> 1; return c >>> 0; });
function crc32(bytes: Uint8Array) { let crc = 0xffffffff; for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255]! ^ crc >>> 8; return (crc ^ 0xffffffff) >>> 0; }

/** A deterministic, dependency-free ZIP writer using valid stored entries. */
export function zip(entries: { name: string; bytes: Uint8Array }[]): Uint8Array {
	const output: number[] = [], central: number[] = [];
	for (const entry of entries) {
		const name = new TextEncoder().encode(entry.name), offset = output.length, crc = crc32(entry.bytes);
		output.push(...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(crc), ...u32(entry.bytes.length), ...u32(entry.bytes.length), ...u16(name.length), ...u16(0));
		for(const byte of name)output.push(byte);
		for(const byte of entry.bytes)output.push(byte);
		central.push(...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(crc), ...u32(entry.bytes.length), ...u32(entry.bytes.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...name);
	}
	const centralOffset = output.length;
	for(const byte of central)output.push(byte);
	output.push(...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(entries.length), ...u16(entries.length), ...u32(central.length), ...u32(centralOffset), ...u16(0));
	return Uint8Array.from(output);
}

/** 3MF core package of the evaluated viewport blade, with mm units and colour. */
export function exportThreeMf(evaluation: Evaluation, name = 'IdeaCAD blade', color = '#8B97A8'): Uint8Array {
	const triangles = evaluatedBladeTriangles(evaluation);
	const vertices: [number, number, number][] = [];
	const faces: [number, number, number][] = [];
	for (const triangle of triangles) { const start = vertices.length; vertices.push(triangle.a, triangle.b, triangle.c); faces.push([start, start + 1, start + 2]); }
	const model = `<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><metadata name="Title">${xmlEscape(name)}</metadata><resources><basematerials id="1"><base name="${xmlEscape(name)}" displaycolor="${xmlEscape(color)}"/></basematerials><object id="2" type="model" pid="1" pindex="0"><mesh><vertices>${vertices.map(([x,y,z])=>`<vertex x="${x}" y="${y}" z="${z}"/>`).join('')}</vertices><triangles>${faces.map(([v1,v2,v3])=>`<triangle v1="${v1}" v2="${v2}" v3="${v3}"/>`).join('')}</triangles></mesh></object></resources><build><item objectid="2"/></build></model>`;
	const types = `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>`;
	const rels = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`;
	const encode = (text: string) => new TextEncoder().encode(text);
	return zip([{ name: '[Content_Types].xml', bytes: encode(types) }, { name: '_rels/.rels', bytes: encode(rels) }, { name: '3D/3dmodel.model', bytes: encode(model) }]);
}
