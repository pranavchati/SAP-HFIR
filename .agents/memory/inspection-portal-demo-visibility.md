---
name: Inspection portal demo visibility
description: Visibility expectations for the SAP–HFIR portal's seeded work orders and dashboard counts.
---

Portal demo work orders and their matching HFIR round history must appear for every signed-in user, including operators and users before the first administrator is bootstrapped. Real work orders and round history remain limited to the operator they are assigned to.

Mapping and Assignments must be available to all signed-in roles, not only planners or operators respectively.

**Why:** The user explicitly requested both menus for all roles. Shared demo assignments should therefore populate the assignment view even for a newly signed-in user without personal assignments.

**Why:** Seeded mappings and round records use synthetic demo operator IDs, and the identity endpoint can successfully report bootstrap availability before it has a portal user. Gating shared rounds on an existing portal-user record leaves that view empty.

**How to apply:** When changing portal role visibility, share seeded work orders and their linked demo events in dashboard/history/round views. Start shared-round reads after identity loads successfully, even if no portal user exists yet. Keep non-demo records assignment-scoped and sample-history seeding idempotent.

All-role Mapping must also work before first-administrator setup without provisioning a portal role merely to access sample data.

**Why:** A signed-in identity can legitimately have no portal-user record while the administrator claim is still available. Requiring a stored role blocks the sample selectors; automatically provisioning that identity can consume eligibility for the first-admin claim.

**How to apply:** Keep authentication required, treat missing portal roles as least-privileged for work-order visibility, and preserve the separate administrator bootstrap flow. Never treat a missing role as permission to see all real work orders.
