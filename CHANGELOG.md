# Change register — Soulful Angels Till & Stock

Every version published to https://iggy545.github.io/stock-take/ is recorded here.
The version at the top of this file is what the app's header shows, so you can tell
at a glance which build a phone or till is running.

Version numbering: the middle number goes up for new features, the last number for
fixes.

---

## v1.5.5 - 24 August 2026, 02:05

### Added
- **A card sale now remembers which card payment paid for it.** When the reader takes a
  payment, SumUp's own reference for it is saved onto the sale instead of being shown once
  in a message and then forgotten. Nothing looks any different at the till.

### Notes
- **This is groundwork for refunding a card payment from the app.** At the moment a refund
  in the app records the return and puts the stock back, but the money has to be sent back
  separately in SumUp. Doing that from the till means being able to name the original
  payment, and until now nothing wrote it down.
- **It also helps straight away if a customer ever queries a card sale**, because the sale
  and the card slip can now be matched up without going hunting by amount and time.
- **The payment service only kept that reference for two days**, so waiting until the
  refunding was built would have meant every card sale taken before then could never be
  refunded from the app. That is why this went in on its own and first.
- **It applies from this build onwards.** Card sales taken before today have no reference
  stored and will always need refunding by hand in SumUp.

---

## v1.5.4 - 24 August 2026, 01:23

### Fixed
- **Photos are back.** v1.5.3 tightened what counts as a valid photo and got it wrong: it
  accepted only photos stored on the device and refused hosted ones, which is what almost
  all of the shop's photos are. They vanished from the list on every device that picked up
  that build. Both kinds are accepted again.

### Notes
- **Nothing was ever deleted.** The photos stayed on every record throughout; they were
  only being refused at the point of display. Updating to this build brings them back.
- The v1.5.3 fix it came from is still in place - a photo carrying anything other than a
  real image is still refused, so the hole it closed stays closed.

---

## v1.5.3 - 24 August 2026, 01:02

### Fixed
- **A photo could carry code that ran on every device showing the stock list.** Item
  photos were dropped straight into the page without checking them, so a photo value
  crafted to look like `x" onerror="..."` escaped the tag it was in and ran. Photos are
  now accepted only if they really are a picture stored on a device, and refused
  otherwise. Barcodes are escaped the same way.

### Notes
- **Nothing suggests this was ever used**, and it could not be triggered by a customer.
  It needed someone already signed in to the shop's own workspace, or a hand-edited
  backup file being restored. Fixed because "only the people we trust could do it" is
  not a safeguard, and a restored backup is the sort of thing that arrives by email.
- Ordinary photos taken on the till or the phone are unaffected.

---

## v1.5.2 - 24 August 2026, 00:55

### Changed
- **The build stamp now shows a time as well as a date**, e.g. `v1.5.2 - 24 Aug 2026, 00:55`.
  On a day when more than one build goes out, the date alone could not tell you whether a
  till was on the latest one. 24-hour clock so there is no am/pm to misread across a counter.

### Notes
- Set by hand, like the version and the date — there is no build step to fill it in, so
  publishing means editing `APP_VERSION`, `BUILD_DATE` and `BUILD_TIME` together.
- Change register entries now carry the time too, so this file and the app agree.

---

## v1.5.1 - 24 August 2026

### Added
- **Payouts now say where the money comes from.** Each maker's line shows what to hand
  over **from cash** and what to send **from card**, as well as the total. The bottom
  line splits the same way: how much comes out of the till, and how much needs
  transferring from the bank once SumUp has settled.
- Both figures are in the report CSV as **Pay from cash** and **Pay from card**.

### Notes
- The card fee comes off the card side only, since that is the only side it was ever
  charged on. Cash refunds reduce the cash side, card refunds the card side, because a
  refund is recorded against however the sale was originally paid.
- Payments taken as **Other** get their own figure rather than being counted as cash.
  Whatever it was, it is not notes in the till, and a payout sheet should not say it is.

---

## v1.5.0 - 24 August 2026

### Added
- **Supplier payouts now work themselves out.** At the bottom of **Sales -> Report**,
  for whatever period you pick, each maker gets a line showing what they are owed and
  the workings behind it: items sold, cash, card, refunds and the card fee. Until now
  this could only be done by exporting the CSV and building it in a spreadsheet.
- **Settings -> Supplier payouts** sets the card fee percentage. It starts at SumUp's
  standard **1.69%**; their GBP19/month plan drops it to **0.99%**, so it is a setting
  rather than a fixed number.
- The payout table is included in the report CSV, so it can be handed over as a
  statement or pasted into a spreadsheet.

### Notes
- A supplier is paid the **full sale price on cash**, and the sale price **less the card
  fee on card**. That matches how the three of us work.
- **The fee is taken on card sales, not on card sales after refunds.** If a card sale is
  refunded the card company generally keeps its fee, so the shop has still paid it.
  Netting refunds off first would quietly move that cost onto the shop.
- Refunds reduce what is owed, and the item count is a net figure, so a sold-then-returned
  item does not get paid out.
- Every part is shown separately rather than just a total, so the arithmetic can be
  checked rather than taken on trust.

---

## v1.4.0 — 23 August 2026

### Added
- **Item codes now say whose item it is.** Every maker owns a letter, and their codes run
  from **001 to 999** within it before rolling on to the next block: Kay **KA-001 … KA-999**
  then **KB-001**, Claire **CA-…**, Claire Bear **BA-…**, Marie **MA-…**. Before this, every
  code began with K no matter who made the item.
- **✨ Generate now asks whose item it is** and takes that maker's next free number. It fills
  in **Made by** and starts the folder off for you, so the code, the folder and the maker
  cannot end up disagreeing. Change **Made by** afterwards and it offers to reissue the code.
- **Settings → Item codes** lists the makers, how many items each has and what their next
  code will be. Add or remove a maker there; each one needs a letter of their own.
- **Settings → Renumber codes** puts the whole stock list onto the scheme in one pass. It
  shows every old → new code first and changes nothing until you confirm. Items already
  sitting on the right number keep it, so their labels do not need reprinting. It is safe
  to run again later — it only moves what is actually out of place.
- **Settings → Print labels** prints a sheet of QR labels, four to a row: just the ones a
  renumbering changed, one maker's stock, or everything. Previously labels came one PNG at
  a time.

### Notes
- **Renumbering means relabelling.** A code that changes stops the sticker already on that
  item from scanning. Save a backup first, do it on one device with the other closed, and
  print the new labels before anything goes back on the shelf.
- Whose item it is comes from the **top level of the folder** first (Kay/…, Claire/…), and
  only then from **Made by** — the folder is the more reliable of the two. Anything neither
  field can place is listed and left alone rather than guessed at.
- Renumbering also updates the codes recorded against past sales, so refunding an old sale
  still puts the stock back, and it settles **Made by** on one spelling per person.
- Makers and their counters travel with backups and team sync, so both tills issue codes
  from the same set. A till still on v1.3.0 carries on with Kay's numbering untouched.

---

## v1.3.0 — 23 August 2026

### Added
- **Card payments can now go straight to a SumUp card reader.** Pick **Card** on the
  payment screen and the till sends the amount to the reader; the sale is only recorded
  once the payment is actually confirmed. A declined or cancelled card leaves the basket
  exactly as it was, with nothing sold, no stock taken off and no receipt number used up.
- **A new waiting screen** shows the amount and what the reader is doing, with **Cancel
  payment** while it is running, and **Try the card again** or **Take cash instead** if it
  fails.
- **Settings → Card reader** is where the service address goes. It has a **Test** button.
  The receipt number travels to the reader with the amount, so the printed card slip names
  the same receipt as the itemised one in the app.

### Notes
- **Nothing changes unless you fill that address in.** Left empty, the Card button behaves
  exactly as before — it records a card sale and you work the reader by hand. Cash is
  untouched either way, so neither the reader nor the internet can stop the shop selling.
- Reader payments need this device signed in to team sync, because that is how the payment
  service knows who is asking. If it is not signed in it says so rather than failing oddly.
- The card key is never in this file. It lives in a small service of our own
  (`sumup-worker/`), which is also the only thing that decides whether a payment
  succeeded — it asks SumUp directly rather than trusting anything sent to it.

---

## v1.2.1 — 17 August 2026

### Changed
- **Generated codes are now three digits with a moving letter: `KA-001`.** Published a few
  minutes after v1.2.0, which used four digits, so `KA-0001` becomes `KA-001`. Shorter to
  read off a label and quicker to type in if a camera is playing up.
- **After `KA-999` the letter moves on.** The next code is `KB-001`, then `KB-999` gives
  `KC-001`, and so on. That is 999 items per letter and 25,974 to `KZ-999`; past that it
  carries on `KAA-001`, `KAB-001`, so it cannot run out however far the shop grows.

### Notes
- If a code was generated on the v1.2.0 build in the meantime, the item keeps the `KA-0001`
  it was labelled with, and the app knows not to hand out `KA-001` to anything else. The
  numbering just carries on from there.
- All the duplicate protection from v1.2.0 still applies, now counting a four-digit
  `KA-0001` and a three-digit `KA-001` as the same number.

---

## v1.2.0 — 17 August 2026

### Changed
- **Generated codes now read `KA-0001` instead of `SA00000001`.** Tap **✨ Generate a QR
  code** on the Add tab and you get `KA-0001`, then `KA-0002`, and so on — short enough to
  read off a label and type in by hand if a camera is being difficult. The numbering starts
  fresh at 0001; the three old `SA…` items keep the codes already printed on them, and so
  does everything with a `JW-`, `CR-`, `CG-` style code. Nothing needs relabelling.

### Notes
- The number is shared across tills through the team sync, as before, so two devices cannot
  be handed the same one.
- Belt and braces on top of that: before issuing a code the app now checks the stock list
  and skips any number already in use. So even a till that has been off the internet, or one
  restored from an old backup, cannot produce a code that another item already has.
- Restoring a backup made before this version no longer carries its old code counter across.
  That counter was 1000-based to feed the `SA` format and would have pushed new codes up into
  the KA-1000s.

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
