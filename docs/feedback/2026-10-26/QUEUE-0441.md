# Ledger 0441: one lab computer, one line on the website

Mr. Pina, 2026-10-26 05:58, on the request written up in `docs/ARMORY.md` ("A request for Mr. Pina, not built: one computer as one line on the website"): "go for the server change".

Armory v0.5.0 was published at 2026-10-26 12:56 UTC, so the app half ships as **v0.5.1** (not published by the session; Mr. Pina publishes).

## What to build (from that section, the authority)
- A nullable `computer_key` on `armory_devices`, written by `armory_register_device` and `armory_heartbeat` from a new OPTIONAL argument. The app already computes a per-computer hash, its incident `machineId` (it hashes the network address too, because lab images copied without Sysprep share `MachineGuid`). Validate it the way `armory_app_incidents.machine_id` does (1 to 64 letters, digits, dashes or underscores, else null).
- The widening must be additive (CLAUDE.md "DEPLOY ORDERING"): v0.5.0 computers keep calling the old arities and keep working; a 0.5.1 app talking to a database without the migration falls back (PGRST202) and keeps working.
- The website groups by computer: the Team view shows one line per computer (every person signed in on it, most recent first), the Files and Checked out views label a device by its computer, and `presenceDevices` (ledger 0430) folds by `computer_key` when present and by name only when it is not, so two cloned computers both named IDEA-06 are two lines and one shared computer with five sign-ins is one.
- Probing must reveal nothing: a member sees computers only for their own projects, exactly the devices they could already see. Mutation-prove the read in the permissive direction.
- The connector picks up any new staff read on its own; check the Armory tools that list devices still read sensibly.
