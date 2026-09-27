# 41 IDEA Armory, the team file vault: name, storage, lock authority, part numbers, and two things only he can do

- Raised: 2026-09-27  By: the IDEA & FRC chat, scoping the CacheCAD replacement Mr. Pina asked for.
- Status: open
- Build: NOT STARTED. Nothing is built until the phase 0 spike in `docs/ARMORY.md` has
  measured the school network, the SolidWorks add-in events and the agent on a real IDEA
  computer.
- Context: `docs/ARMORY.md` owns the scope and carries the reasoning for every default below.

## The seven choices, each with the default that will be taken

1. **Name.** Default: IDEA Armory. Alternatives: IdeaVault, IDEA Hangar.
2. **Where file contents live.** Default: Cloudflare R2 plus the existing Supabase, with a
   nightly readable mirror to a Google Shared Drive. Alternative: Google Drive as the
   primary store, as CacheCAD does.
3. **Who can break a lock and release a part.** Default: mentors and the CAD lead.
4. **Part number scheme.** Default: `5669-YY-SSNN` (team, season, subsystem, part), with a
   course prefix for class projects.
5. **Request a SOLIDWORKS Document Manager API key** under the team's account. His, because
   the account is his. The scope works without it.
6. **Ask school IT whether the agent may be installed on IDEA computers**, and whether they
   are reimaged. His, because IT is his to ask.
7. **Mixed SolidWorks versions (2026 personal computers, 2025 IDEA PCs).** Default: the
   add-in back-saves every 2026 save to the vault's release (2025) automatically, Armory
   keeps the custom properties the back-save drops, and a 2026-format file is refused at
   upload. Fallback if the spike shows back-saving is not licensed: personal computers
   install the vault's release. Raised by Mr. Pina 2026-09-27: "Can't be blocking anyone."
