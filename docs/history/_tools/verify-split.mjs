#!/usr/bin/env node
// The control for the 2026-08-28 split of `docs/HISTORY.md`.
//
// It reassembles every `record_order`-carrying file in `docs/history/`, in
// order, from the bytes that follow each file's front matter, and compares the
// result against the record body as it stood immediately before the split.
// It must be byte-identical: the split added front matter and nothing else.
//
// The reference is pinned two ways, because either can be unavailable:
//   * REFERENCE_COMMIT -- read with `git show`, which gives a real diff on
//     failure. Absent from a shallow clone that does not reach that commit.
//   * REFERENCE_SHA256 -- always checkable, but only ever answers yes or no.
// A run that can do neither reports that it verified nothing, and exits 1.
//
// Run: npm run history:verify

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readEntries } from './front-matter.mjs';

const REFERENCE_COMMIT = 'ea9f043b6ca0be58085c253e865ad77687363044';
const REFERENCE_PATH = 'docs/HISTORY.md';
const REFERENCE_FIRST_HEADING = '## What this is';
const REFERENCE_SHA256 = 'a7eac6860e43db23090a933931107fb791066784c9cc2a2534e4d982056a0545';
const REFERENCE_BYTES = 2252747;
const REFERENCE_ENTRIES = 168;

const problems = [];
const fail = (msg) => problems.push(msg);

const entries = readEntries();
const record = entries.filter((e) => Number.isInteger(e.record_order));

// --- structural checks the reassembly cannot make on its own ----------------

const seen = new Map();
for (const e of entries) {
  if (seen.has(e.file)) fail(`duplicate filename: ${e.file}`);
  seen.set(e.file, e);
  const heading = e.body.split('\n')[0];
  if (heading !== `## ${e.title}`) {
    fail(`${e.file}: front-matter title does not match the ## heading\n  title:   ${e.title}\n  heading: ${heading.replace(/^## /, '')}`);
  }
  if (!e.date || !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) fail(`${e.file}: date is missing or not YYYY-MM-DD`);
  if (!e.file.startsWith('record-') && Number.isInteger(e.record_order)) {
    fail(`${e.file}: carries record_order but is not a pre-split archive file. record_order belongs only to the 168 entries the split produced.`);
  }
  if (e.file.startsWith('record-') && !Number.isInteger(e.record_order)) {
    fail(`${e.file}: uses the reserved record- prefix without a record_order.`);
  }
}

record.sort((a, b) => a.record_order - b.record_order);
record.forEach((e, i) => {
  if (e.record_order !== i + 1) fail(`record_order is not 1..N contiguous: expected ${i + 1}, found ${e.record_order} (${e.file})`);
});
if (record.length !== REFERENCE_ENTRIES) {
  fail(`entry count moved: the split produced ${REFERENCE_ENTRIES} archive entries, found ${record.length}`);
}

// --- the reassembly ---------------------------------------------------------

const rebuilt = record.map((e) => e.body).join('');
const rebuiltBytes = Buffer.byteLength(rebuilt, 'utf8');
const rebuiltSha = createHash('sha256').update(rebuilt, 'utf8').digest('hex');

console.log(`entries reassembled : ${record.length} (expected ${REFERENCE_ENTRIES})`);
console.log(`reassembled bytes   : ${rebuiltBytes} (expected ${REFERENCE_BYTES})`);
console.log(`reassembled sha256  : ${rebuiltSha}`);
console.log(`reference sha256    : ${REFERENCE_SHA256}`);

let checkedAgainstGit = false;
try {
  const ref = execFileSync('git', ['show', `${REFERENCE_COMMIT}:${REFERENCE_PATH}`], {
    encoding: 'utf8',
    maxBuffer: 1 << 28,
  });
  const at = ref.indexOf(REFERENCE_FIRST_HEADING);
  if (at < 0) throw new Error(`${REFERENCE_FIRST_HEADING} not found in the reference`);
  const body = ref.slice(at);
  checkedAgainstGit = true;
  if (body === rebuilt) {
    console.log(`git byte compare    : IDENTICAL against ${REFERENCE_COMMIT.slice(0, 10)}:${REFERENCE_PATH}`);
  } else {
    const a = join(tmpdir(), 'history-reference.md');
    const b = join(tmpdir(), 'history-reassembled.md');
    writeFileSync(a, body);
    writeFileSync(b, rebuilt);
    fail(`reassembly differs from ${REFERENCE_COMMIT}:${REFERENCE_PATH}. Wrote ${a} and ${b}; diff them.`);
  }
} catch (err) {
  if (!checkedAgainstGit) {
    console.log(`git byte compare    : unavailable (${String(err.message).split('\n')[0]})`);
  }
}

const shaOk = rebuiltSha === REFERENCE_SHA256;
console.log(`sha256 compare      : ${shaOk ? 'IDENTICAL' : 'DIFFERENT'}`);
if (!shaOk) fail('reassembled sha256 does not match the pinned pre-split body.');

if (!checkedAgainstGit && !shaOk) fail('neither reference was reachable: this run verified nothing.');

if (problems.length) {
  console.error('\nFAILED:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('\nOK: the split is lossless. Every byte of the pre-split record body is present, in order.');
