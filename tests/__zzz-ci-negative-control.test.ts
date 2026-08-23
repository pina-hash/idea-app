import { describe, it, expect } from 'vitest';
describe('CI negative control', () => {
	it('is deliberately wrong, to prove the gate catches it', () => {
		expect(1).toBe(2);
	});
});
