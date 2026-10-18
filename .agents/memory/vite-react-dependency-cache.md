---
name: Vite React dependency cache
description: Runtime mismatch behavior when React versions are updated in this pnpm workspace.
---

When React and React DOM are aligned in the package manifest and lockfile but the browser still reports different versions, the artifact-local Vite optimized dependency cache may still point at the previous versions.

**Why:** After changing the inspection portal's React version, package resolution was correct but its optimized bundle still referenced the older React 19.1.0 pair and crashed before rendering.

**How to apply:** Verify resolved package versions first. If they match, clear only that artifact's generated `node_modules/.vite` cache and restart its managed workflow; do not change package versions again without evidence.
