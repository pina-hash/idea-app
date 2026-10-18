# 41 IDEA Armory, the team file vault: name, storage, lock authority, part numbers, and two things only he can do

- Raised: 2026-09-27  By: the IDEA & FRC chat, scoping the CacheCAD replacement Mr. Pina asked for.
- Status: answered 2026-10-18 by Mr. Pina, all nine items (item 4 later the same day: scheme A).
- Build: OPEN in three lanes: ledger 0402 (per-project SolidWorks version, nightly Shared Drive backup), ledger 0403 (the part number registry and COTS library on the server and website), then the SolidWorks add-in, which assigns numbers at creation. The original Build line read: NOT STARTED. Nothing is built until the phase 0 spike in `docs/ARMORY.md` has
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

## Answered 2026-10-18 (Mr. Pina, in chat with the morning ops routine)

1. **Name:** IDEA Armory. Shipped.
2. **Storage:** R2 plus Supabase, shipped. The nightly readable Google Shared Drive backup is wanted ("finish the Google Shared Drive backup"). Ledger 0402 builds it.
3. **Lock authority:** answered earlier (v0.3, 0236). Releasing a part stays mentors and the CAD lead.
4. **Part numbers:** ANSWERED later on 2026-10-18: scheme A ("we can do a"). He then asked how COTS parts are named; the rule below was proposed to him with it. Originally: In his words: they "have to help organize the system", he would like them "maximally fully professional" if that is possible, and he is unsure what that looks like for high school students. Three candidates were put to him on 2026-10-18; the add-in lane waits on his pick.
5. **Document Manager API key:** he will request it; the steps were given to him (the key request form at solidworks.com/support/subscription/key-request, which needs an active subscription, so a sponsorship license may be refused).
6. **School IT:** closed. He is the IT department for the building.
7. **SolidWorks versions:** back-saving 2026 to 2025 tested and works ("It does save to 2025. That works well."). He also wants an ordinary 2026 project as an option, and could not find a way to make one. Found 2026-10-18: every project is created pinned to 2025 (0231 default) and the only way up is `armory_raise_pinned_release`, a mentor-only RPC with no control on the website. Ledger 0402 adds the control and a version choice at creation.
8. **Code signing:** declined. Internal tool; revisit only if Armory is ever released as a real product.
9. **Migration credential:** closed with no action. `supabase/roles/idea_migrator.sql` records that the role cannot be finished without a Supabase support ticket, which he declined on 2026-09-05, and that it would only change the username, not the privilege.

He also asked to start the SolidWorks add-in ("We do want to get that started for sure").

## Part numbers, as answered (scheme A) and the COTS rule proposed with it

- A made part or assembly: `5669-YY-SS-AAPP`. Team, two-digit season, a two-letter subsystem code (DT drivetrain, SH shooter, IN intake, EL elevator, AR arm, CL climber, FR frame, EE electrical, MS miscellaneous), then a two-digit assembly and two-digit part (an assembly ends `00`). Example: `5669-27-DT-0104` is part 4 of drivetrain assembly 01. Class projects swap the team for the course: `IDEA100-27-...`.
- A revision is a letter beside the number (`Rev B`), never part of it, so a revised part keeps its number.
- A number is assigned once and never reused, even after a part is deleted.
- COTS parts (bought, not made) never get a team number. They are named by vendor prefix and the vendor's own part number, then a short description, and live in one shared COTS library that projects reference and nobody edits: `WCP-0388 Hex Bearing`, `REV-21-1650 NEO Motor`, `AM-0059 Gear 14T`.
- Hardware is named by its spec, not a vendor: `HW-SHCS-10-32x0.75` (socket head cap screw), `HW-NUT-NYLOCK-10-32`.
- A COTS part the team modifies (cut, drilled) becomes a made part with a team number and a "made from" property naming the COTS number.
- Raw stock (tube, plate, shaft) is a material on a made part, never a part of its own.
