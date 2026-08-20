// tests/db/isolation-markers.ts
//
// The names the two isolation fixtures agree on. They live HERE, and not in
// db-isolation-a.test.ts, because importing a value from a .test.ts file also
// runs that file's describe/it registrations inside the importing file -- so
// half the proof would silently execute twice, in the wrong database, and the
// positive control would report on a fixture nobody meant to create.

export const LEAK_TABLE = 'idea_isolation_leak_marker';
export const LEAK_EMAIL = 'isolation-leak@boscotech.net';
export const LEAK_SEQUENCE = 'idea_isolation_leak_seq';
