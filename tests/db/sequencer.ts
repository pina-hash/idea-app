// tests/db/sequencer.ts
//
// The default vitest sequencer orders files by CACHED FILE SIZE, descending
// (falling back to the previous run's duration). That is fine for everything
// here except one thing: the isolation proof is a PAIR, and half of it only
// means anything if the other half has already run and left its database
// behind. Under the size rule, which half runs first depends on which file
// happens to be longer -- so the proof's positive control would silently go
// vacuous the moment someone edited a comment in it.
//
// This sequencer therefore does exactly one thing: it keeps the default order
// for every file, then makes sure db-isolation-a comes before db-isolation-b.
// Nothing else moves, so no existing file's position changes relative to any
// other, and the rest of the suite keeps the size-based ordering it was tuned
// with.
//
// It is NOT a licence to write order-dependent tests. Every other file in this
// suite must pass in any order, and the shared cluster does not change that:
// each file gets its own database (see tests/db/harness.ts).

import { BaseSequencer } from 'vitest/node';
import type { TestSpecification } from 'vitest/node';

const FIRST = 'db-isolation-a.test.ts';
const SECOND = 'db-isolation-b.test.ts';

function isFile(spec: TestSpecification, name: string): boolean {
	return spec.moduleId.replace(/\\/g, '/').endsWith(`/${name}`);
}

export default class IdeaSequencer extends BaseSequencer {
	async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
		const sorted = await super.sort(files);

		const firstAt = sorted.findIndex((f) => isFile(f, FIRST));
		const secondAt = sorted.findIndex((f) => isFile(f, SECOND));
		if (firstAt === -1 || secondAt === -1 || firstAt < secondAt) return sorted;

		// Move the leak-leaving half to just before the half that checks it,
		// leaving every other file exactly where the default put it.
		const [leaver] = sorted.splice(firstAt, 1);
		sorted.splice(sorted.findIndex((f) => isFile(f, SECOND)), 0, leaver);
		return sorted;
	}
}
