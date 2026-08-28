# Tests

The app is one HTML file with no build step, so these do not import anything. Each one
**slices the real code out of `index.html`** by its comment markers and runs that in a
Node `vm` context with the browser bits stood in for. What runs is the shipped source,
not a copy of it that can drift.

```bash
node tests/photos.js index.html
node tests/website-list.js index.html
node tests/import-items.js index.html
node tests/add-item.js index.html
node tests/tombstones.js index.html
node tests/own-photos.js index.html
node tests/read-policy.js index.html
node tests/reconcile-reads.js index.html
node tests/sales-export.js index.html
```

Each prints a pass/fail line per check and exits non-zero on failure.

| File | Covers | Added |
|---|---|---|
| `photos.js` | Backups keeping their photos, restores not deleting them, Remove photo still working | v1.7.1 |
| `website-list.js` | What lands on the website list, the wording, ticking off, the `webQty: 0` trap | v1.8.0 |
| `import-items.js` | Import adding only and never overwriting, the website fields and the label travelling, photo URLs being refused | v1.9.0, label v1.18.0 |
| `add-item.js` | A new item starting counted rather than sold out, the website flag and description, the label the shop needs to print, no stray fields | v1.12.0, label v1.18.0 |
| `tombstones.js` | The sync tidy-up: that it can only ever reach a tombstone and never a live item, and that recent deletions are kept | v1.13.0 |
| `own-photos.js` | Preferring our own copies of the photographs over SumUp's, the fallback for anything we did not archive, and the v1.5.3 escaping hole staying shut | v1.14.0 |
| `read-policy.js` | Whether a connect may read from the local cache: the team-code switch, a cleared cache, and a refusal never being read as nothing-has-changed | v1.15.0 |
| `reconcile-reads.js` | The real `reconcile()` against a fake Firestore — that the cheap path costs one read, and that it ends in **identical** shadow state to the full read | v1.15.0 |
| `sales-export.js` | All three exports: that each CSV is byte for byte what it always was, and that the .xlsx is a real workbook — every part it promises present, every CRC right, money a number in a pound-sign format rather than text | v1.16.0, stock take and currency v1.17.0, Label column v1.18.0 |

## If a test stops finding the code

Each file names the comment markers it slices between, near the top. Moving that block
in `index.html` is fine — update the marker. A test that cannot find its block exits 2
with a message rather than silently passing.

## Worth knowing

Every suite here was checked against deliberately broken copies as well as the real
file, so each is known to actually catch the thing it describes. `read-policy.js` found
one of its own checks useless that way — it passed for the wrong reason until the case
was sharpened — which is the whole argument for doing it. A test that has never failed has
not been shown to work. `git show HEAD~1:index.html > /tmp/before.html` and run against
that.
