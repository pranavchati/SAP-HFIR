---
name: Inspection portal demo visibility
description: Visibility expectations for the SAP–HFIR portal's seeded work orders and dashboard counts.
---

Portal demo work orders must appear in dashboard counts for every signed-in role, including operators. Real work orders remain limited to the operator they are assigned to.

**Why:** Seeded mappings use synthetic demo operator IDs, so filtering operators only by their Clerk user ID left the Overview counts at zero even though sample records existed.

**How to apply:** When changing portal role visibility, include records from the shared demo import batch in operator dashboard and sample views, without broadening visibility for non-demo work orders.
