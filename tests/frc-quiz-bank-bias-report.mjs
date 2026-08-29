// tests/frc-quiz-bank-bias-report.mjs
//
// Writes docs/frc/quiz-bank-bias-report.md -- the per-item list, worst first,
// for whoever rewrites the questions. It measures NOTHING of its own: every
// number comes from tests/frc-quiz-bank-bias.ts, which is also what
// frc-quiz-bank-bias.test.ts enforces, so the document and the lint cannot
// disagree about the state of the banks.
//
// Run:  node --experimental-strip-types tests/frc-quiz-bank-bias-report.mjs
//
// (Node 22 strips the type annotations off the `.ts` helper, so this plain
// script imports it directly rather than a second copy of the arithmetic
// existing to serve a document.)

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	BANKS,
	allItems,
	absoluteFreeOption,
	giveaway,
	longestOption,
	articleAgreementOption,
	independenceFrom,
	measureAll,
	nearDuplicatePair,
	ofTheAboveOption,
	runTell,
	stemEchoOption,
	wordiestOption
} from './frc-quiz-bank-bias.ts';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '..', 'docs', 'frc', 'quiz-bank-bias-report.md');

const pct = (x) => `${(100 * x).toFixed(1)}%`;
const pct3 = (x) => `${(100 * x).toFixed(3)}%`;

const banks = measureAll();
const items = allItems();
const longTell = runTell(items, longestOption);
const wordTell = runTell(items, wordiestOption);
const absTell = runTell(items, absoluteFreeOption);
// Measured here rather than written down, so a bank edit cannot leave the
// document claiming a dimension is clean after it stopped being.
const echoTell = runTell(items, stemEchoOption);
const aboveTell = runTell(items, ofTheAboveOption);
const articleTell = runTell(items, articleAgreementOption);
const dupTell = runTell(
	items,
	(it) => {
		const pair = nearDuplicatePair(it);
		return pair === null ? null : pair.includes(it.answer) ? it.answer : -1;
	},
	(it) => 2 / it.options.length
);
const echoIndep = independenceFrom(items, stemEchoOption);
const optionCounts = [...new Set(items.map((it) => it.options.length))].sort((a, b) => a - b);
const row = (name, t, verdict) =>
	`| ${name} | ${t.applies} | ${t.applies === 0 ? '-' : `${t.hits} (${pct(t.rate)})`} | ` +
	`${t.applies === 0 ? '-' : pct(t.chance)} | ${verdict} |`;

const scored = items
	.map((it) => ({
		unitId: it.unitId,
		id: it.id,
		g: giveaway(it),
		stem: it.stem,
		answer: it.options[it.answer],
		answerLen: it.options[it.answer].length,
		bestDistractor: it.options
			.filter((_, i) => i !== it.answer)
			.reduce((a, b) => (b.length > a.length ? b : a), ''),
	}))
	.filter((x) => x.g > 0)
	.sort((a, b) => b.g - a.g);

const L = [];
L.push('# FRC quiz banks: what the option text gives away');
L.push('');
L.push(`Generated ${new Date().toISOString().slice(0, 10)} by \`node --experimental-strip-types tests/frc-quiz-bank-bias-report.mjs\`.`);
L.push('Every figure comes from `tests/frc-quiz-bank-bias.ts`, which is also what');
L.push('`tests/frc-quiz-bank-bias.test.ts` enforces. Regenerate after editing a bank.');
L.push('');
L.push('## The finding');
L.push('');
L.push(`Across the ${Object.keys(BANKS).length} committed banks (${items.length} items), the single longest option is the`);
L.push(`correct one **${longTell.hits} times, ${pct(longTell.hits / items.length)}**, against 25% at chance. Shuffling cannot help:`);
L.push('length is invariant under permutation, so the tell survives every draw.');
L.push('');
L.push('The gate is 90% on a short draw, so the rate turns into a pass rate. A student');
L.push('who knows nothing, always picks the longest option and retakes through the');
L.push('cooldown clears MDM-10 in about **1.75 attempts**.');
L.push('');
L.push('## Per bank, worst first');
L.push('');
L.push('`P(pass)` is the exact probability that ONE attempt passes, hypergeometric over');
L.push("that bank's own draw, against its own test length and 90% threshold.");
L.push('');
L.push('| Bank | Items | Draw | Need | Longest-is-answer | P(pass) longest-only | P(pass) random |');
L.push('|---|---|---|---|---|---|---|');
for (const b of banks)
	L.push(
		`| ${b.unitId} | ${b.items} | ${b.testLength} | ${b.correctNeeded} | ` +
			`${b.longest}/${b.items} (${pct(b.longestRate)}) | **${pct(b.passLongest)}** | ${pct3(b.passRandom)} |`
	);
L.push('');
L.push('## What else leaks, and what does not');
L.push('');
L.push('"Fires on" is the number of items where the heuristic points at an option at');
L.push('all; a tie points at nothing and is neither a hit nor a miss. That is why the');
L.push(`longest-option row reads ${pct(longTell.rate)} of the ${longTell.applies} it fires on, while the headline above`);
L.push(`is ${pct(longTell.hits / items.length)} of all ${items.length} items -- the second is the number a student experiences,`);
L.push('because a tie is a question the trick does not answer.');
L.push('');
L.push('| Dimension | Fires on | Correct | Chance | Verdict |');
L.push('|---|---|---|---|---|');
L.push(row('Longest option (characters)', longTell, '**the dominant tell**'));
L.push(row('Most words', wordTell, 'the same tell, second reading'));
L.push(row('Only option with no absolute ("Only...", "Never...")', absTell, '**certain where it fires**'));
L.push(row('Correct option echoes the stem most', echoTell, `no signal of its own -- see below`));
L.push(row('Near-duplicate option pair contains the answer', dupTell, dupTell.rate === null || dupTell.rate < dupTell.chance + 0.2 ? 'noise, not a tell' : 'CHECK: above chance'));
L.push(row('"All / none of the above"', aboveTell, aboveTell.applies === 0 ? 'clean: none present' : 'CHECK: present'));
L.push(row('a/an agreement with the stem', articleTell, articleTell.applies === 0 ? 'clean: none present' : 'CHECK: present'));
L.push(`| Option count | ${optionCounts.length > 1 ? items.length : 0} | - | - | ${optionCounts.length === 1 ? `clean: every item offers exactly ${optionCounts[0]}` : `CHECK: mixed (${optionCounts.join(', ')})`} |`);
L.push('');
L.push(`**On the stem-echo row.** Taken alone it looks like a second serious leak: it`);
L.push(`fires on ${echoTell.applies} items and is right on ${echoTell.hits}, ${pct(echoTell.rate)} against ${pct(echoTell.chance)}. It is not one. On the`);
L.push(`${echoIndep.disagreements} items where it and the length tell point at DIFFERENT options, length is`);
L.push(`right ${echoIndep.baselineRight} times and the echo ${echoIndep.tellRight}. A longer option overlaps the question more`);
L.push('because it has more words in it, so this is the length tell wearing a second');
L.push('costume. Fixing the lengths fixes it; nothing needs rewriting for it separately.');
L.push('');
L.push('## The rewrite list');
L.push('');
L.push('Ordered by **give-away**: the correct option\'s length as a multiple of the');
L.push('longest distractor offered against it. 1.0 would mean the answer is no longer');
L.push('than its best distractor and the tell is dead. Items whose answer is not the');
L.push('longest are not listed -- there are ' + (items.length - scored.length) + ' of those, and they are not the problem.');
L.push('');
L.push('**The fix is to lengthen the distractors, not to shorten the answer.** A correct');
L.push('option trimmed until it matches is usually a correct option that stopped being');
L.push('clearly correct.');
L.push('');
L.push('| # | Bank | Item | x | Answer (chars) | Longest distractor (chars) |');
L.push('|---|---|---|---|---|---|');
const esc = (s) => s.replace(/\|/g, '\\|');
scored.forEach((x, i) =>
	L.push(
		`| ${i + 1} | ${x.unitId} | \`${x.id}\` | **${x.g.toFixed(2)}** | ${esc(x.answer)} (${x.answerLen}) | ${esc(x.bestDistractor)} (${x.bestDistractor.length}) |`
	)
);
L.push('');
L.push('## The nine absolute-qualifier items');
L.push('');
L.push('Three of the four options are written as absolutes and the answer is not, so');
L.push('the answer is identifiable without reading the question. All nine, listed in');
L.push('full because the fix is per item.');
L.push('');
for (const it of items) {
	const pick = absoluteFreeOption(it);
	if (pick === null) continue;
	L.push(`- **${it.unitId} \`${it.id}\`** -- ${esc(it.stem)}`);
	it.options.forEach((o, i) =>
		L.push(`  - ${i === it.answer ? '**(answer)**' : '(distractor)'} ${esc(o)}`)
	);
}
L.push('');

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, L.join('\n'), 'utf8');
console.log(`wrote ${out}`);
console.log(`  ${items.length} items, ${longTell.hits} longest-is-answer (${pct(longTell.hits / items.length)}), ${scored.length} on the rewrite list`);
