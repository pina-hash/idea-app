---
title: "IdeaCAD gains an explicit workspace registry and a versioned Blade adapter that refuses unknown workspaces and contexts newer than the client (`codex/ideacad-workspaces-0230`, no migration)"
date: 2026-09-14
branches: [codex/ideacad-workspaces-0230]
migrations: []
subsystems: ["IdeaCAD"]
---

IdeaCAD previously selected Blade directly wherever it needed an engine value.
That was enough for one editor, but it made the next editor's boundary implicit
and left no place to decide what an older client should do with newer stored
context. This bundle adds the smallest common contract: identity and label, a
versioned default context, context migration, starting-tree construction,
validation, and evaluation. Trees crossing persistence remain `unknown`, and the
contract does not invent a common feature union, validation problem, or evaluation
shape.

The built-in registry is constructed explicitly with one direct Blade import.
There is no import-time registration API and no mutable global collection. Its
constructor refuses duplicate ids, and lookup throws `UnknownWorkspaceError` for
an unknown id; there is deliberately no Blade fallback.

Blade's current context is version 1 and its migration is identity at that
version. Missing, non-integer, older-with-no-defined-migration, and higher versions
throw the named `WorkspaceContextVersionError` before the adapter reads the
version-specific config. The higher-version case is the load-bearing safety rule:
an old client cannot partially interpret newer stored data and then overwrite it.

The Blade adapter contains no copied CAD knowledge. It clones the configured
default through `cloneTree`, validates through `validateBladeTree`, and evaluates
through `evaluate` with the context's `BladeConfig`. The attach transport still
sends the exact `DEFAULT_BLADE_CONFIG` object under the existing `bladeConfig`
property and the unchanged `p_config` payload; it now reaches that value through
the Blade workspace's default context.

The focused test measures registry closure, duplicate refusal, fresh independently
mutable starting trees, validation by the existing validator, evaluation equality
with the direct Blade evaluator, version-1 identity, and refusal of missing and
higher context versions. No migration, route, Svelte surface, or persistence
format changed. There is no visual change to verify.
