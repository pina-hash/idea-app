# Armory C2: the Windows layer under the sync core, and the phase 0 probes one PC can answer

- Issued: 2026-09-27
- By: IDEA & FRC chat, for one local Codex session (GPT-6 Astra, high)
- Owns: in `pina-hash/idea-armory`, `src/Armory.Platform.Windows/**`, `tests/Armory.Platform.Windows.Tests/**`, `tools/Armory.Probe/**`, `docs/platform/**`, `docs/spike/**`, and README and AGENTS where the lane changes them. `Armory.Core` only to fix a real defect, reported.
- Does not touch: anything in `pina-hash/idea-app`.
- Migration permitted: no. Claims: none.
- Status: issued
- Notes: Mode solo, after C1. Durable journal on disk with a 200-kill torn-write test, atomic safe replace that refuses open or changed destinations, Restart Manager open-file detection, scan-backed change detection that survives watcher overflow, read-only enforcement of other people's locks, long paths. Probes: installed SolidWorks releases, a byte-level saved-release reader (a scope spike item), and Defender interference on replace. Written before the chat could read C1's tree; the prompt marks every interface name as a claim.
