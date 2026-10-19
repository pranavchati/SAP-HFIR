---
name: Inspection portal demo visibility
description: Visibility expectations for the SAP–HFIR portal's seeded work orders and dashboard counts.
---

Portal demo work orders and their matching HFIR round history must appear for every signed-in role, including operators. Real work orders and round history remain limited to the operator they are assigned to.

**Why:** Seeded mappings and round records use synthetic demo operator IDs, so filtering only by a Clerk user ID hid the demo dataset from normal operator accounts.

**How to apply:** When changing portal role visibility, share seeded work orders and their linked demo events in dashboard/history views. Keep all non-demo records assignment-scoped, and make sample-history seeding idempotent.
