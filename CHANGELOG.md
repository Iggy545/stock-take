# Change register — Soulful Angels Till & Stock

Every version published to https://iggy545.github.io/stock-take/ is recorded here.
The version at the top of this file is what the app's header shows, so you can tell
at a glance which build a phone or till is running.

Version numbering: the middle number goes up for new features, the last number for
fixes.

---

## v1.1.0 — 17 August 2026

### Added
- **Delete all selected, on the Stock tab.** Tick items with ☑ (or tap **All**), then the
  new **🗑 Delete** button removes the whole selection in one go. The confirmation names
  the first few items and how many others there are, so a mis-tap on **All** is obvious
  before anything goes. Sales already recorded are not affected.

### Fixed
- **The "Delete this item?" confirmation appeared behind the edit form.** It was there all
  along but hidden underneath, so the edit box had to be dismissed before the question
  could be answered. Confirmation boxes now always sit in front.

---

## v1.0.1 — 17 August 2026

Two team-sync fixes. Both were written on 3 August but had never been published — they
sat in a working copy that was missing the bulk edit and import features, so that copy
could not be published as-is. The fixes have now been moved across individually.

### Fixed
- **A till sitting idle was writing to the cloud database non-stop.** Every save cycle
  wrote two pointless records — one junk entry into the stock list, and a repeat of the
  session details — and it never stopped, even with nobody touching the app. On a
  measured ten-cycle test the old build made 19 writes where the new one makes none.
  This was burning through the free database allowance for no reason.
- **First connect to a brand-new team workspace uploaded nothing.** The app assumed the
  cloud already held everything on the device, so a device joining an empty workspace
  kept its whole stock list to itself while the header cheerfully read "Synced". Stock
  only started uploading once each item happened to be edited. A first connect now
  uploads properly.

### Notes
- A device that already has the shop's stock will now push anything the cloud is missing
  the moment it connects. That is the point of the fix, but it does mean the first
  connect after updating may take a few seconds longer than usual.
- Pulling data down was never affected — a new phone joining an existing workspace
  always received the stock list correctly, and still does.
- There may be leftover junk `__meta` entries in the cloud stock list from the old
  behaviour. They are harmless and ignored by the app.

---

## v1.0.0 — 17 August 2026

First version to carry a version number. Everything before this was published without
one, which is why older builds show no version line in the header.

### Added
- **Version stamp in the header.** Shows `v1.0.0 · 17 Aug 2026` on every tab, so you
  can confirm which build a device is running without opening anything.
- **"Closes after each scan" toggle in the scanner.** The camera now shuts down after a
  successful scan instead of staying open. The toggle switches it back to staying open
  for working through a pile of stock, and the choice is remembered on that device.

### Fixed
- **CSV exports mangled em dashes and accents.** Names containing `—` came out as `â€”`
  when opened in Excel. All three exports (stock take, sales, end-of-day report) now
  start with a UTF-8 marker so Excel reads them correctly. Re-export any affected file
  to get a clean copy.

### Notes
- A failed scan (unknown code, no stock left, promo code on the wrong tab) deliberately
  leaves the camera open so the code can be presented again.
- Scanning an unknown barcode still closes the camera and opens the add-item form, as before.

---

## Before v1.0.0

Published by hand without version numbers or a change record. The last such build went
live on 17 July 2026. Its history is not recoverable — this register starts here.
