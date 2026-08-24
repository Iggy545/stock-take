# Tests

The app is one HTML file with no build step, so these do not import anything. Each one
**slices the real code out of `index.html`** by its comment markers and runs that in a
Node `vm` context with the browser bits stood in for. What runs is the shipped source,
not a copy of it that can drift.

```bash
node tests/photos.js index.html
node tests/website-list.js index.html
```

Both print a pass/fail line per check and exit non-zero on failure.

| File | Covers | Added |
|---|---|---|
| `photos.js` | Backups keeping their photos, restores not deleting them, Remove photo still working | v1.7.1 |
| `website-list.js` | What lands on the website list, the wording, ticking off, the `webQty: 0` trap | v1.8.0 |

## If a test stops finding the code

Each file names the comment markers it slices between, near the top. Moving that block
in `index.html` is fine — update the marker. A test that cannot find its block exits 2
with a message rather than silently passing.

## Worth knowing

Both suites were checked against the commit *before* the fix as well as after, so they
are known to actually catch the thing they describe. A test that has never failed has
not been shown to work. `git show HEAD~1:index.html > /tmp/before.html` and run against
that.
