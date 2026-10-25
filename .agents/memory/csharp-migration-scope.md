---
name: C# migration scope
description: Preserve the original SAP-HFIR portal while migrating a separate v2.
---

Keep the original SAP-HFIR portal intact while developing the C# v2.

**Why:** The user asked to take a backup and create a duplicate named SAP-HFIR Portal v2 by rewriting the entire codebase in C#, rather than replacing the original portal.

**How to apply:** Treat v2 migration work as separate from the original application. Do not remove or replace the original portal as part of completing the migration unless the user explicitly requests that.
