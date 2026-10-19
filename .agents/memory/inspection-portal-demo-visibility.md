---
name: Inspection portal demo visibility
description: Visibility expectations for the SAP–HFIR portal's seeded work orders and dashboard counts.
---

Portal demo work orders and their matching HFIR round history must appear for every signed-in user, including operators and users before the first administrator is bootstrapped. Real work orders and round history remain limited to the operator they are assigned to.

**Why:** Seeded mappings and round records use synthetic demo operator IDs, and the identity endpoint can successfully report bootstrap availability before it has a portal user. Gating shared rounds on an existing portal-user record leaves that view empty.

**How to apply:** When changing portal role visibility, share seeded work orders and their linked demo events in dashboard/history/round views. Start shared-round reads after identity loads successfully, even if no portal user exists yet. Keep non-demo records assignment-scoped and sample-history seeding idempotent.
