---
name: Express 5 wildcard routes
description: Express 5 uses path-to-regexp v8 which requires named captures for wildcards — `/*` is invalid, must use `/*splat`.
---

## Rule
In Express 5 route definitions, wildcards must be named. Use `/*splat` instead of `/*`.

**Why:** path-to-regexp v8 (used by Express 5 and the `router` package) throws `PathError: Missing parameter name` for unnamed wildcards like `/*`. The splat name is arbitrary but required.

**How to apply:** Any route like `router.all("/foo/*", handler)` must become `router.all("/foo/*splat", handler)`. Access the captured path via `req.params.splat`.
