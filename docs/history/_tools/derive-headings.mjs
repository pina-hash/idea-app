#!/usr/bin/env node
// One-shot migration: drop the physically retyped `## <title>` heading line
// (plus its following blank line) from every docs/history/ entry's body.
//
// Before this ran, every entry duplicated its front-matter `title` as the
// literal first line of its body -- two hand-typed copies of one sentence,
// which is exactly the failure mode CLAUDE.md names elsewhere ("a second
// implementation ... is the thing that quietly stops matching"). It drifted
// three times (gauntlet-tolerance-test-fix-u79q4y, and
// btn-tap-target-floor-verify-6vj8r9 twice over two sessions).
//
// After this runs, `title` is the only copy. `verify-split.mjs` synthesizes
// `## ${title}` at reassembly time for the 168 pre-split entries, so the
// reconstructed pre-split record is unchanged; `index.mjs` already builds
// links from `title` alone and never echoed a body heading.
//
// Not idempotent by design -- it is meant to run exactly once. Re-running it
// against already-migrated files (whose body no longer starts with `## `)
// throws immediately, which is the intended guard against running it twice.
//
// Run: node docs/history/_tools/derive-headings.mjs

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HISTORY_DIR, parseEntry } from './front-matter.mjs';

function quote(s) {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

const files = readdirSync(HISTORY_DIR, { withFileTypes: true })
  .filter((d) => d.isFile() && d.name.endsWith('.md') && !d.name.startsWith('_'))
  .map((d) => d.name)
  .sort();

let changed = 0;
let titleFixed = 0;

for (const file of files) {
  const path = join(HISTORY_DIR, file);
  const text = readFileSync(path, 'utf8');
  const lines = text.split('\n');

  if (lines[0] !== '---') throw new Error(`${file}: does not open with a --- front-matter fence`);
  const close = lines.indexOf('---', 1);
  if (close < 0) throw new Error(`${file}: front matter is never closed`);
  if (lines[close + 1] !== '') throw new Error(`${file}: front matter must be followed by exactly one blank line`);

  const { meta, body } = parseEntry(text, file);
  const bodyLines = body.split('\n');
  if (!bodyLines[0].startsWith('## ')) {
    throw new Error(`${file}: body does not open with a ## heading -- already migrated? refusing to run twice.`);
  }
  if (bodyLines[1] !== '') {
    throw new Error(`${file}: no blank line between the heading and the body`);
  }

  const headingText = bodyLines[0].slice(3);
  if (headingText !== meta.title) {
    // The heading is the intended, more carefully written copy in every
    // observed case (it carries the backtick formatting the title dropped).
    // Front matter is corrected to match it -- this is the one place this
    // migration also fixes a pre-existing drift, so the derived heading it
    // produces is not a second, still-wrong retyping.
    titleFixed += 1;
    const titleLineIdx = lines.findIndex((l) => l.startsWith('title:'));
    if (titleLineIdx < 0 || titleLineIdx >= close) throw new Error(`${file}: no title: line found in front matter`);
    lines[titleLineIdx] = `title: ${quote(headingText)}`;
  }

  const newBody = bodyLines.slice(2).join('\n');
  const newFrontMatter = lines.slice(0, close + 1).join('\n');
  const newText = `${newFrontMatter}\n\n${newBody}`;
  writeFileSync(path, newText);
  changed += 1;
}

console.log(`migrated ${changed} entries (${titleFixed} needed their front-matter title corrected first)`);
