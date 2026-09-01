# Change register — Soulful Angels Till & Stock

Every version published to https://iggy545.github.io/stock-take/ is recorded here.
The version at the top of this file is what the app's header shows, so you can tell
at a glance which build a phone or till is running.

Version numbering: the middle number goes up for new features, the last number for
fixes.

---

## v1.35.0 - 1 September 2026, 14:58

**More than one photograph per item.** Edit item now has *More photos for the website*
underneath the existing photo. Take up to six; they show on the product page as a row of
thumbnails under the main picture, and the shop can reorder or remove them.

**These photographs stay on the device that took them until you export them.** They are
not in Team sync and they are not in a backup, and that is deliberate: a till pulls every
item record whenever it reconnects after a change, so photographs travelling with the
records would turn a 1.7 MB catch-up into something nearer 140 MB on shop wifi.

- **Settings -> Export extra photos** writes one file, shared through the normal iOS sheet,
  so on an iPad it goes straight into Google Drive or Files. The PC picks it up with
  `tools/photo-tidy.py --extras`.
- **Settings says how many are not exported yet**, and says plainly that until they are,
  that device is the only copy. If it has no record of an export it counts every one, which
  over-warns rather than under-warns.
- **EVERY iPad that takes extra photographs has to export.** Exporting on one does not
  cover another, because the pictures never leave the device that took them.
- The main photograph is completely unchanged: still taken here, still synced, still on the
  website by itself within 15-30 minutes.
- Extras are saved the moment they are taken, not on Save, so a mis-tapped Cancel cannot
  lose one. The form says so.
- The photo store moves to version 2. Existing photographs are untouched -- proven by
  loading this build onto a version 1 database and reading the photograph back.

---

## v1.34.0 - 29 August 2026, 22:45

### Added
- **The shop can now take its own percentage of every sale.** Settings -> Supplier payouts,
  **Shop commission on all sales (%)**. It comes off each supplier payout on top of the card
  and website fees, and every part of the sum is shown on the report as usual.
- **A supplier can be on their own terms.** Each maker under **Makers & codes** has a
  commission box. Leave it blank and they are on the shop-wide figure; put **0** in it and
  they pay none, whatever the shop rate later becomes. The figure travels between devices
  with the rest of the maker list.
- The report and the payout sheet name the rate they used, per maker, so a supplier can see
  where their number came from. Two new columns in the CSV and spreadsheet exports:
  **Commission %** and **Shop commission**.

### Worth knowing
- **It starts at 0, so nothing changed until you set a figure.** Payouts up to now are
  exactly as they were.
- **The supplier bears both**, which is what was agreed. On a £100 card sale at 20%:
  card fee −£1.69, commission −£20.00, **supplier is paid £78.31** and the shop keeps a
  clean £20.00 whichever way the customer paid.
- **Commission follows refunds down; the card fee deliberately does not.** A card company
  keeps its fee on a refunded sale, so the shop has really paid it - but there is no reason
  the shop should keep a cut of a sale it handed back. A sale refunded in full leaves no
  payout line at all.
- A misc amount - a reading, a deposit - has no supplier behind it, so it never reaches the
  payout table and no commission is taken on it.
- On the report, the **from cash / from card / from website** figures are the money that came
  in; the commission comes off the total underneath them. The total line also shows what the
  shop kept.
- New tests: `tests/payouts.js`, 33 checks, each shown to fail against a deliberately broken
  copy. The export test's reference was updated on purpose for the two new columns.

---

## v1.33.0 - 29 August 2026, 22:00

### Changed
- **The 🌐 Web button is off the Take payment screen.** A till operator taking a counter
  sale had no reason to ever pick it, and picking it by mistake did three things at once:
  booked the money to the wrong channel, paid the supplier at the website fee rate (2.5%)
  instead of the reader's (1.69%), and put the item on the "still on the shop floor" list
  after the customer had walked out with it. Take payment now offers Cash, Card and Other.
- **A website order is rung through from Sales → 🌐 Record a website order.** Put the items
  in the basket on the Till tab as usual, then record it there. Same basket, same stock
  movement, same receipt - only the way in has changed. It opens as **Website order** with
  no payment methods on it at all, so nothing can be switched halfway through.

### Added
- **The sales report can be narrowed to one maker.** A **Maker** picker under the dates:
  *All makers* as it has always been, or any one supplier. Everything on the panel follows -
  takings, sales, items, average, the cash / card / website split, discounts, refunds, top
  sellers and the payout section - and **Print** prints whatever is on the screen.
- The picker is built from whoever actually sold something in the chosen period, so it never
  offers a name with nothing behind it, and it hides itself when there is only one maker. Move
  the dates to a period a maker had no sales in and it falls back to *All makers* rather than
  leaving you looking at an empty report.

### Worth knowing
- **The CSV and spreadsheet exports are unchanged** and still cover the whole shop. The maker
  view is for reading on the screen; the supplier payout section in the export already breaks
  the figures down per maker. The tests that check those files byte for byte still pass.
- With a maker selected, **Sales** and **Avg sale** count whole sales that included something
  of theirs - a basket can hold more than one maker's things - while takings, items and
  discounts are theirs alone. The panel says so on screen rather than leaving it to be assumed.
- **— no maker** is a real choice in the list. It is where a misc amount lands, since a reading
  or a deposit has no supplier behind it.

---

## v1.32.0 - 29 August 2026, 21:45

### Removed
- **"Clear sales history" is gone from the Sales tab.** It sat one tap away from the till,
  beside Export sales, and a confirm box is no protection against somebody tapping through
  it. Three reasons it had to go rather than just move:
  - **It did not clear one device.** With sync on, emptying the list writes a delete marker
    for every sale, so every other till lost them too. It was a workspace-wide deletion
    wearing the words "clear history".
  - **It destroyed the supplier payout figures**, which are worked out from sales - real
    money owed to real people, recoverable only from a backup.
  - **Nothing needed it.** The report is already date-ranged - day, month, year or a custom
    from/to - so a clean figure never required clearing anything.

### Worth knowing
- **Nothing else changed.** Sales, the report, exports, undo and the payout sheet all behave
  exactly as before. The only difference is that the button is not there.
- Undoing a sale still leaves a **gap in the receipt numbers** - undo `S5-0003` and the next
  sale is `S5-0004`. That is deliberate and is not being changed: a receipt may already be
  printed and in a customer's hand, and giving its number to a different sale later is worse
  than a gap. Receipt numbers are per till, so gaps are per till too.

---

## v1.31.1 - 29 August 2026, 21:35

### Changed
- The "sold on the website" box said **"Paid for already."** It now says **"Sold online."**
  The till never sees the payment for a website sale - it only records that one was rung
  through - so it was stating something it had no way of knowing. It would have been wrong
  in two ordinary cases: ringing an item through to hold it for somebody before the money
  is in, and an order cancelled or refunded after the fact.
- What it says now is what the till actually knows: this was recorded as a website sale and
  the stock has come off, so do not sell it again at the counter.

---

## v1.31.0 - 29 August 2026, 21:20

### Added
- **The reminder now works with only one till open.** Ring a web order through and the item
  goes straight onto the "sold on the website" list on that same device, so the banner is
  there until somebody has been and taken it off the shelf. Before this, the list was only
  raised by a sale arriving from a *second* till, which does nothing on a shop running one
  iPad.

### Worth knowing
- **No sound and no pop-up for a sale rung through here** - only the banner. Interrupting
  the person who pressed the button a second ago tells them nothing, and teaches them to
  dismiss the box without reading it, which is the opposite of what is wanted on the days a
  second till *is* open. The flash is still there for a sale arriving from another device.
- It is the **same list, same Got it - off the floor, same storage**, so an order cannot
  appear twice however it arrives - rung through here and then echoed back over sync is
  still one job.
- Misc amounts are left off, as before. An order that is *only* a misc amount - a reading,
  a deposit - raises nothing at all, because there is nothing on a shelf to fetch.

### Worth knowing about the till already
- Selling the same one-off item twice was **already** prevented: adding an item with
  nothing left gives *"- no stock left to sell"* and refuses it. What this banner adds is
  getting the thing physically off the floor and packed - and the case the stock count
  cannot catch, where you hold more than one and only one of them sold.

---

## v1.30.0 - 29 August 2026, 20:30

### Added
- **The till now tells you when something has sold on the website.** Ring a web order
  through on one device and every **other** till flashes it up straight away: what sold,
  its code, and which folder it lives in, so it can be taken off the shop floor before
  somebody buys it again at the counter. Its own three-note sound, so it is not mistaken
  for a scan.
- A red banner above the tabs - visible on every tab, not just Stock - stays until each
  order is ticked off with **Got it - off the floor**. Tap the banner to see the list
  again at any time.
- A basket of three things is **one** job, not three interruptions. The website order
  number is on it where there is one, so it can be matched back to the store's order list.

### Worth knowing
- **It needs team sync on, and two devices.** It is the arrival of the sale from another
  till that raises it; the device the sale was rung through on is never told, because the
  person using it is holding the thing.
- **Nothing here talks to the website**, exactly like the website list. It rides on the
  sale record the shop already makes, which is why it works today with nothing bought and
  nothing switched on at SumUp. When the shop's own checkout arrives it writes that same
  record, and this fires with no human in the loop at all.
- A sale more than **twelve hours old never flashes up**. Connecting to sync hands the
  till the whole sales history at once, and without that limit opening a till on Monday
  morning would flash up every web sale the shop has ever made.
- Refunds do not raise anything - stock coming back is not a job anyone has to be pulled
  off the counter for - and neither do misc amounts, which were never on a shelf.
- A job left waiting **survives a reload**, and ticking one off is remembered, so a
  reconnect cannot raise the same order twice.
- New tests: `tests/web-sold-alert.js`, 43 checks. See [Tests](tests/README.md).

---

## v1.29.0 - 29 August 2026, 17:35

### Added
- **One description for a whole group of variants.** When an item's name puts it in a group
  - anything with the em dash in it, like `Wind Spinner — Blue` - and the others in that
  group already have a website description, a tick appears above the description box:
  **"Use the same description as the other 5 in Wind Spinner"**. Tick it and the box fills
  with what the group says and greys out; untick it and whatever you had typed comes back.
  It is on the Add form and the Edit item form.
- **Changing one of them offers to change the rest.** Save a description that the others in
  the group still hold the old version of, and the app asks whether to update them too, with
  the number spelled out. Say no and nothing else is touched.

### Worth knowing
- It **copies the words**; it does not link the items. Each variant keeps its own
  description on its own record, exactly as before, so nothing about exports, the website
  feed or sync changes. Nothing is stored to say a description is shared - the offer on
  save is what keeps a group together afterwards.
- Only variants **still saying the old thing** are offered. One you have written separately
  is left alone, and so is one with no description at all - never having had a description
  is not the same as having this one.
- Why it matters: the website shows whichever variant the customer picked out of the
  dropdown, so a group whose descriptions disagree makes the words change under them as
  they click through the colours.
- The offer is always a tap. Nothing is rewritten on its own, for the same reason a hyphen
  is never quietly promoted to an em dash: two products can look like variants of each
  other without being it.

---

## v1.28.0 - 29 August 2026, 15:20

### Changed
- **The website description box opens up when you tap into it.** On both the Add form and
  the Edit item form it sits at three lines while you are looking past it, and grows to
  about nine while the cursor is in it, so you can see what you have written without
  scrolling a two-line window. It shrinks back on its own when you move to the next field.
- In the Edit item form the box is inside a panel that scrolls, so when it grows the app
  nudges it back into view - it will not open out of sight below the bottom of the panel.
- Dragging the bottom-right corner still works and still wins: pull the box taller than it
  opens to and it keeps that size, cursor in it or not.

---

## v1.27.0 - 29 August 2026, 13:55

### Added
- **A misc amount can be charged for now: anything that was never stock.** A reading, a
  workshop deposit, a repair, postage. Tap **📝 Misc amount** on the Till, put in the amount
  and say what it is for, and it goes into the basket like an item. It is then paid for
  exactly the way everything else is - cash, or **sent to the card reader with the rest of
  the sale**, which is the point: there is no more taking the till total on one machine and
  the reading on another.
- **The description is not optional, and it is the whole reason this is safe to use.** It
  goes on the customer's receipt, it is what the sale is called in the sold list, and it is
  written out in full on the sales report and in the spreadsheet export. A sum of money on
  the report that nobody can account for would be worse than not taking it here.
- **Nothing comes off the shelf.** A misc amount was never on one, so the stock count does
  not move, and the item does not have to exist. Refunding one puts nothing back either.
- Two misc amounts in one sale stay two lines. They are different things, and folding them
  together would throw one of the descriptions away.

### Changed
- **The sales report has a Miscellaneous section.** It lists every misc amount taken in the
  period - date, receipt, what it was for, how it was paid - with a total. In the CSV and in
  the spreadsheet it is a section of its own between *Top sellers* and *Supplier payouts*;
  in the workbook it is a fourth sheet.
- **Misc money counts in the takings but not in *Items sold*.** It never came off a shelf,
  so counting it there would put the report at odds with the stock, and it has no business
  in *Top sellers* either. The **Miscellaneous** figure in the summary is what reconciles
  the two, and it only appears when there was any.
- **Misc money is kept out of the supplier payouts.** There is no supplier behind a reading
  or a deposit and there never can be, so leaving it in would inflate *Total to pay out* -
  a figure somebody acts on with real money.
- A shop that never takes a misc amount gets a byte-for-byte identical report file to the
  one it has always had. All three additions are written only when there is something to
  write.

### Tests
- `tests/misc-amount.js`, 67 checks. It slices five separate blocks out of `index.html` -
  the basket line, set pricing and the totals, completing the sale, the report figures and
  the supplier payouts - because the feature has to hold in five places that know nothing
  about each other. `tests/sales-export.js` grew from 76 to 95, including a byte-for-byte
  reference for the new report section and a four-sheet workbook.
- Checked against ten deliberately broken copies, one per guard, and all ten were caught.
  Two of them cover the same thing from either side - a misc line is kept out of a set
  price twice over - so that pair has to be removed together before anything notices.

---

## v1.26.0 - 29 August 2026, 12:08

### Added
- **The label wording can be tapped now, the same way a folder is.** *Label needed* was a
  plain box with a quiet list behind it that only appeared once you had typed the first
  letter of a wording you already use - and there is no guessing the first letter of a
  wording somebody else wrote. It now has the same folded-away **Choose label** button the
  folders got in v1.25.0: tap it and every wording the shop already uses is there to tap,
  each with how many items ask for it. Tap one and it folds back up showing the choice.
- Typing still works and still narrows the list, and a wording nobody has used yet reads
  **new** on the button, so a fresh one is deliberate rather than a slip.
- The button only appears once something has been labelled - on a shop with no labels yet
  there is nothing to offer, and the box is exactly as it was.

---

## v1.25.0 - 29 August 2026, 11:28

### Changed
- **The list of folders is folded away until you ask for it.** On the Add tab, the New item
  box and Edit item, the folder buttons used to sit open under the Folder box - three dozen
  of them, a wall to scroll past on the way to the quantity and the price. There is now a
  single line there instead, saying **which folder the item is in**, with **Choose folder**
  on the right. Tap that and the same list of buttons opens exactly as before; tap one and
  it folds back up showing what you picked.
- Nothing about picking a folder has changed - the maker's own folders are still offered
  first, *Show all* still widens it to the whole shop, and typing still works. It is a
  button rather than tapping into the Folder box on purpose: tapping the box throws the
  on-screen keyboard up over the folders you came to look at.

---

## v1.24.0 - 29 August 2026, 10:33

### Changed
- **Photographs stop costing the website money.** Nothing looks any different in the app.
  The shop's website rebuilds its list of stock out of the same database this till writes
  to, roughly ten times a day, and it was fetching **the whole photograph of every item**
  each time it did. A picture taken on the till is stored on the item as about 97KB of
  data, so fourteen photographed items meant 1.4MB dragged across the internet on every
  rebuild - including for items that are not even on the website.
- With about a hundred more photographs to take that would have been **roughly 2.9GB a
  month against a 10GiB allowance**, and it never comes back down: every new photograph
  joins it and none of them ever leave.
- The till now stores a short **key** beside each photo - a few characters saying *which*
  picture it is rather than the picture itself - and the website reads that. The rebuild
  now carries a few dozen bytes per item instead of a hundred thousand.

### Worth knowing
- **The first time this build connects it will re-send every item once.** That is the key
  being added to each record. It is a normal sync, it costs nothing, and it happens once.
- **Take the ~100 photographs after this build is on the tills, not before.** That was the
  whole reason for doing this first.
- Photographs already on the website keep working while the records catch up, and a device
  still on an older build cannot break them.
- 19 new checks in `tests/photo-keys.js`, and the key is pinned against the two other
  places the same fingerprint is worked out - `shop-worker` and `tools/photo-archive.py` -
  because if those three ever disagree every embedded picture quietly stops being served
  from the website and goes back to being fetched out of the database one at a time.

---

## v1.23.0 - 28 August 2026, 15:20

### Added
- **A way to say "this is the same thing in another colour".** Seven wind spinners in
  seven colours are still seven items in here, each with its own code, count and price —
  but the website can now show them as **one card with a dropdown** instead of seven
  near-identical cards in a row.
- The way you say so is the item's **name**: `Wind Spinner — Blue`, `Wind Spinner — Red`.
  Everything before the long dash is the card; everything after it is what the customer
  picks from the list.
- **You do not have to type that dash.** Under Item name, on all three places an item can
  be created or changed, there is now a row of buttons:
  - **➕ Colour, size or scent** puts the dash in for you and leaves the cursor where the
    colour goes.
  - **Groups you already have** appear as buttons the moment you start typing a name that
    matches one, so the second wind spinner is one tap.
  - If you type an ordinary hyphen where the long dash was meant, and the front of it is
    a group that already exists, it offers to swap it. Tapping is the only way it
    changes — it never rewrites a name on its own.
- The line under the box says what the website will do with the name as you type it, so
  there is no publishing and checking to find out.

### Worth knowing
- **Nothing about the till changes.** Each colour keeps its own barcode, its own count
  and its own price. Stock takes, sales, receipts, the export and supplier payouts all
  see seven separate items exactly as before.
- **Give each colour its own photograph.** Picking a colour on the website swaps the
  picture, so a group where only one has a photo looks broken.
- **Every colour still needs its website tick** — one that is not ticked simply will not
  be offered in the list.
- **Do not reuse the front of a name for something unrelated.** `Wind Spinner — Spare
  Hook` would be offered to customers as if it were a colour.
- If all but one of a group sells out and is deleted, the last one goes back to being an
  ordinary card showing its full name.

---

## v1.22.0 - 28 August 2026, 11:47

### Changed
- **Photos you take are now saved at a decent size for the website.** They used to be
  shrunk to 400 pixels; they are now 640, which is exactly the size of the pictures
  already on the website, so a photo you take sits beside those instead of looking soft
  next to them.
- The old limit was there because photos used to be kept in the browser's small storage,
  where one phone photo would have filled the lot. They have not lived there for a long
  time, and the number was simply left behind.
- A phone photo of 3024x4032 comes out 480x640 and about 97KB; a wide one of 4000x2250
  comes out 640x360 and about 27KB. Nothing else about taking a photo has changed.

### Worth knowing
- **Only photos taken from now on.** Nothing you have already is touched, re-saved or
  re-processed.
- Backups carry your photographs, so a lot of re-taken photos will make the backup file
  bigger — roughly 10MB per hundred, against about 3MB before.

---

## v1.21.0 - 28 August 2026, 10:41

### Added
- **The folder buttons are now on all three places an item can be created or changed** —
  the Add tab, the New item box that appears when you scan something unknown, and Edit
  item. Before this they were only on Edit item.
- **Fill in Made by and the buttons narrow to that person's folders.** Put Kay in and you
  are offered Kay's folders rather than the whole shop's. Change the name and the offer
  changes with it.
- It is only ever a first offer, never a wall: there is a **Show all … folders** button on
  the end, typing overrides it, and the folder an item is already in is never hidden even
  when it belongs to somebody else.
- A person with no folders yet — or no name filled in — simply gets the full list, so a
  new maker is never shut out of the shop's folders.
- **Generate a code and it all lines up at once:** picking Kay fills in the code, the Made
  by, and a `Kay/` folder to finish, with Kay's folders already listed underneath.

### Worth knowing
- Nothing about how folders work has changed, and no folder is ever hidden from you
  permanently — this only changes which ones are offered first.
- The buttons refresh as soon as a new folder exists, so an item added into a brand new
  folder puts it on the list for the next one straight away.

---

## v1.20.0 - 28 August 2026, 10:28

### Added
- **You can now do a stock take one folder at a time.** Tap **New count**, tick one
  folder, and the Stock list shows only that folder until you say otherwise — with a bar
  across the top telling you which one you are on and how far through it you are:
  *"1 of 3 counted · 2 to go · 2 in stock · £40.00"*, with a progress bar.
- Ticking one folder and tapping **Reset ticked folders only** now drops you straight
  into that folder, instead of leaving you to find it again in the whole list.
- There is a second button, **Just work through it — keep the counts**, for carrying on
  with a folder you have already started rather than wiping it and beginning again.
- **Tap Show all stock to come back to the whole shop.** Nothing is stuck: the app
  remembers which folder you are on if you close it and come back, and a full stock take
  clears it.
- While you are working through a folder, **searching searches inside that folder**, and
  scanning something that lives somewhere else still counts it but says so —
  *"Selenite tower → now 5 — not in 📁 Bracelets"* — so a stray tray gets noticed.
- Something unknown scanned while you are in a folder now starts with that folder
  already filled in on the new item form.

### Worth knowing
- **This only changes the Stock list.** The Till still sells the whole shop, sales and
  exports are unaffected, and the counts themselves are the same numbers as ever.
- **It is this device only.** The phone can work through Bracelets while the till shows
  everything — it is not sent to your other devices, in the same way that which folders
  are open is not.
- **"Counted" means the item has a number against it.** The app cannot tell a genuine
  zero from one nobody has reached yet — it never has — so the bar counts an item as
  done once it has been given a count, and the wording says exactly that.
- If every item in the folder you are on is moved out or deleted, the app steps back to
  showing all stock and tells you why.

---

## v1.19.0 - 28 August 2026, 09:53

### Added
- **Edit item now shows you the folders you already have.** Under the Folder box is a
  row of buttons, one for each folder in use, with the number of items in each — tap one
  and the item goes there. No more remembering exactly how a folder was spelt, or which
  ones exist.
- The folder the item is in now is the highlighted one, so you can see where it sits
  before you move it. There is a **No folder** button at the front for taking an item
  out of every folder.
- **Start typing and the buttons narrow down to what matches.** Type "bra" and you get
  the Bracelets ones. Typing still works exactly as before — a folder that does not
  exist yet is made by typing it, and using / still makes a subfolder.

### Worth knowing
- Nothing about how folders work has changed — this is only a quicker way to pick one.
  The Add tab and the bulk Move to folder box are untouched.

---

## v1.18.0 - 28 August 2026, 03:32

### Added
- **Every item can now carry the label it needs.** A new **Label needed** box on each
  item, under Price each — free text, whatever wording suits you: "Small swing tag",
  "Large barcode label", "No label, engraved". It is on all three places an item can be
  created or changed: the Add tab, the New item box that appears when you scan something
  unknown, and Edit item.
- **It comes out in the stock export as a new Label column**, in both CSV and Excel, on
  the end so every column that was already there is where it was.
- The box offers back the wordings you have used before, the same way the Folder box
  does, so the same label does not end up written three different ways.

### Worth knowing
- **This is never sent to the website.** Not in any form: the website's data is built by
  naming the fields it may have, one by one, and this is not one of them. There is now a
  test in the website's own code that fails if anyone ever adds it.
- It **does** travel between your own devices with team sync, and it is kept in backups
  and carried through an item import — it is your record, it just never leaves the shop.
- An item with no label has no label. The box left empty means nothing is stored, and the
  column comes out blank rather than saying anything.

---

## v1.17.0 - 28 August 2026, 03:18

### Added
- **The stock export asks CSV or Excel too.** Settings → Your data → **Export stock take**
  (it used to say Export CSV), and the weekly reminder banner's button with it.

### Changed
- **Money in the Excel files is now formatted as pounds** - £12.50 rather than 12.50.
  Every money column gets it: prices, discounts, takings, counted values, supplier
  payouts and fees. Quantities and item counts are left alone, because a £ in front of
  them would be wrong.
- The cells are still **real numbers**, so they add up exactly as before. The pound sign
  is the cell's format, not text typed into it.

### Worth knowing
- **The CSV files still hold plain numbers** - 12.50, not £12.50. A CSV is plain text and
  has no number formats to set; a pound sign in it would be a character sitting in the
  data, which stops other systems reading the column as a number. Open the Excel version
  for pounds, or format the column in Excel after opening the CSV.
- One small difference in the stock CSV: the item count in the TOTAL row is now quoted
  like every other cell in the file. Nothing that reads CSV can tell the difference.
- The weekly export reminder now only resets when a file is actually saved. Opening the
  chooser and cancelling leaves the reminder where it was.

---

## v1.16.0 - 28 August 2026, 03:04

### Added
- **The sales exports now ask whether you want CSV or Excel.** Both export buttons - the
  **Export sales** button on the Sales tab and **Export** in the sales report - now offer
  a choice. Nothing else about them changed.
- **The Excel file is a real spreadsheet, not a renamed CSV.** Prices and takings arrive
  as numbers, so you can select a column and see it added up, or write your own sum
  against it. The heading row is bold and stays put when you scroll, and the columns come
  out already wide enough to read.
- **The sales report becomes three tabs in one workbook** - Summary, Top sellers and
  Supplier payouts - instead of three lumps stacked in one column.

### Worth knowing
- **The CSV files are exactly what they always were**, down to the byte, so anything you
  or the accountant already do with them is untouched. There is a test that checks this
  against the old code rather than taking anyone's word for it.
- **Barcodes and order numbers stay text** in the Excel file. Written as numbers they
  would lose a leading zero, and then they would no longer match anything in the till.
- Excel opens either format. CSV is still the one to pick if the file is going into
  something else - most other systems read it and not much else.
- Nothing is downloaded from anywhere to do this: the app writes the .xlsx itself, so it
  still works with no internet.

---

## v1.15.0 - 26 August 2026, 09:41

### Changed
- **Opening the app no longer re-reads the whole shop from the database.** With team sync
  on, every load used to fetch every record and every deleted-record marker - around five
  hundred documents - however little had changed since the last time. It now asks one
  cheap question first: what is the most recently changed record? If nothing has moved, the
  same records are read from the copy already on the device instead.
- **A normal load costs one read instead of about five hundred.**

### Why this mattered
- The database's free daily allowance is 50,000 reads and the website's shop page is
  budgeted 40,000 of it, which left the till roughly **twenty app loads a day**. Two people
  on a shop day went through that, and when the allowance ran out **the website's shop page
  went down** - which is exactly what happened on 25 August.
- Nothing about your data changed, and nothing syncs differently. The app reads the same
  records; it just stops paying for them twice.

### Worth knowing
- **It re-reads properly whenever it should.** Anything changed on another device, a
  different team code, a cleared browser, or the database declining to answer all send it
  back to a full read. The rule is that not knowing is never treated as nothing-has-changed.
- If the device cannot keep a local copy at all - some private-browsing modes, or the same
  workspace open in several tabs - the app works exactly as before and now says so in the
  browser console instead of staying silent about it.

---

## v1.14.0 - 26 August 2026, 01:58

### Changed
- **The shop's photographs are now our own, and the app shows those.** Nearly every item's
  picture was never held here at all - the record stored a *link* to an image on SumUp's
  servers, and nothing else. **SumUp deletes that image when its listing is deleted.** Forty
  had already gone that way, and closing the SumUp store - the last step of the website plan
  - would have taken every remaining one down at once, with nothing anywhere to restore.
- All 477 photographs were downloaded, kept as masters, and republished at the shop's own
  address. The app now asks for ours when it draws a thumbnail.
- **They are about a tenth of the size**, so the stock list loads noticeably quicker on shop
  wifi. The originals were 640-pixel pictures saved as PNG, a format meant for flat-colour
  graphics rather than photographs; the same picture as WebP is a fraction of the weight and
  looks identical.

### Worth knowing
- **Nothing in your data changed.** The swap happens when a picture is drawn, not in the
  record. No sync, no migration, nothing to go wrong on the other till.
- **A photograph taken since this went out has no copy of ours yet**, so the app quietly
  falls back to the original. Nothing breaks; it is just the old, slower picture until the
  next publish.
- **The till was the last thing tied to SumUp's servers.** The website was moved earlier the
  same night. Closing the SumUp store is now safe to do, which it was not before.

---

## v1.13.0 - 25 August 2026, 22:31

### Added
- **Settings -> Tidy up old deleted records.** Deleting an item does not remove it from the
  team workspace; it leaves a marker behind so the other till learns the item went. Nothing
  ever cleared those markers, and by today they were **more than half the workspace - 1044
  records for 478 items**. Every till reads the whole lot each time it connects, so the
  markers were costing a database look-up each, per device, per load. That is what used up
  the free daily allowance and took the shop website down.
- The tidy-up asks only for the markers rather than the whole collection, so checking costs
  a look-up per marker instead of one per record.

### Worth knowing
- **It cannot reach a real item.** A record only qualifies if it is flagged deleted *and*
  carries no item data. Both conditions, every time, and a test holds each one.
- **Markers from the last 30 days are kept on purpose.** A till that has not synced since an
  item was deleted still has that item, and the marker is the only thing that will ever tell
  it otherwise. Clear the marker too early and that till puts the item back for everybody on
  its next sync. The confirmation says so, and so does the warning above the button.
- **Save a backup first, and open both tills before running it.** The one on the screen is
  not the one at risk.
- It needs team sync connected, and refuses politely if it is not.

---

## v1.12.0 - 25 August 2026, 18:27

### Added
- **Adding an item now puts it on the website in one go.** The Add form has the same
  **Website** box the edit screen has, and it is **already ticked**. Untick it for anything
  that is shop only. Before this, a new product had to be added, then found again in the
  list, then opened and ticked - which is a step that only ever got forgotten.
- **A description for the website** on the same form, so you can write it while the thing is
  in your hand rather than going back for it later.

### Fixed
- **A new item no longer arrives on the website as sold out.** The starting quantity now
  sets the counted figure as well. It did not before, and the consequence was worse than it
  sounds: the website works out available-or-sold-out from the counted figure, so every
  brand new product appeared online as sold out the moment it was added. An item you are
  adding is one you are holding.

### Worth knowing
- **Give it a two-level folder** - `Kay/Bracelets`, not just `Bracelets`. The website takes
  its category from the second level; the first is the maker's name, which customers never
  see. A one-level folder means the item only turns up under "Everything".
- **The website list will still ask you to add it.** That list is about the SumUp store,
  which is updated by hand. Our own site has it already, within a quarter of an hour.
- Ticking the box records that the item sells online. It does **not** send anything anywhere.

---

## v1.11.0 - 25 August 2026, 12:10

### Added
- **A starting count for stock nobody has counted yet.** Where the website is showing
  something as available, that is evidence at least one exists, and one is a better starting
  figure than a zero that only ever meant "nobody has looked". Comes in through the same
  import, alongside the website wording, in one go.
- **A count you have already taken is never overwritten.** An item with a real figure on it
  keeps it and is reported as left alone. Somebody standing at the shelf beats anything worked
  out from a web page, so the shelf always wins.
- The starting figure moves **counted, starting quantity and the website quantity together**.
  Raising the count on its own would put every one of those items straight back on the website
  list as *0 → 1 in stock* — hundreds of jobs that are not real.

### Worth knowing
- This is not a stock take and does not pretend to be. It gives the uncounted items a sensible
  place to start so the first real count is a correction rather than a blank page.
- Like the website wording, it cannot reach a name, a price, a photo, a maker or a folder, and
  will not create an item the device does not have. Only whole numbers of zero or more.
- `tests/import-items.js` now runs 66 checks. The three that matter most were each confirmed to
  fail against a deliberately broken copy first: one that overwrote real counts, one that let
  the file write any field, and one that left the website quantity behind.

---

## v1.10.0 - 25 August 2026, 12:00

### Added
- **The website's own wording can be brought in for items you already have.** Import a file
  holding website text and the app writes each description onto the matching item, several
  hundred at a time, instead of one at a time by hand. It says how many it will change and
  asks first.
- This is the only thing that can write to an item that already exists, and it is held to the
  website description alone. **A name, a price, a count, a photo, a maker or a folder cannot
  be changed this way**, even if the file tries — worth knowing, because these files are put
  together outside the app.
- Items already carrying the same wording are counted as unchanged rather than rewritten, so
  running the same file twice does nothing the second time.

### Worth knowing
- Importing new items is unchanged and still adds only. The two jobs are told apart by what is
  in the file, so an ordinary items file can never start a wording update by accident.
- `tests/import-items.js` now covers both. As before, every check was confirmed to fail against
  a deliberately broken copy first — one that let the file write any field it liked, and one
  that created items the device did not have.

---

## v1.9.0 - 25 August 2026, 01:19

### Added
- **Import items now says what it is about to do, and asks first.** It shows how many are
  new, how many are already on this device, and how many share a name with something on the
  list, then waits. The numbers in the box are worked out from the same plan that gets
  applied, so what it says is what happens.
- **An import carries the website fields across** — *sells on the website*, and the quantity
  and price the website is showing. Items brought in from the shop window now arrive already
  knowing they are listed, so the website list stays quiet instead of filling with dozens of
  *Put it on the website* jobs for things that have been on it for months.

### Changed
- **Photos in an import file must be a `data:image/...` or `https://` image.** Anything else
  is dropped and the item comes in without a photo, and the confirm box says how many. An
  import file comes from outside the app and every one of those strings ends up in an image
  tag.

### Worth knowing
- Import has always added only, and still does: a barcode already on the device is left
  exactly as it is, never overwritten and never merged into. Running the same file twice does
  nothing the second time. This is the opposite of **Restore**, which replaces everything —
  use Import to add, Restore only to put a whole device back.
- Covered by `tests/import-items.js`, which runs the real code out of `index.html`. Each
  check was confirmed to fail against a deliberately broken copy before being kept.

---

## v1.8.0 - 24 August 2026, 23:05

### Added
- **The till now keeps track of what the website has been told.** Tick **This one sells on
  the website too** on an item, and from then on the app knows the difference between what
  the website is showing and what is actually on the shelf.
- **A website list at the top of the Stock tab**, whenever something needs changing over
  there. Selling the last one at the counter puts it straight on that list as *Sold out —
  take it down*, which until now was the one thing nobody was told about.
- Each line says exactly what to go and do: *2 → 1 in stock*, *£35.00 → £40.00*, *Put it on
  the website — 3 in stock at £25.00*, *Take it off the website*. Sold-out items sort to the
  top, because those are the ones the website can still take an order for.
- **Tick a line off once the change is made there.** That is all ticking does — it records
  that the website now matches. Nothing in the app can reach the website.
- **A 🌐 on items that sell online** in the stock list, filled in when that one is waiting
  for a change.
- **A description for the website** on each item, longer than the shop label. Nothing uses
  it yet; it is there so it can be written up as stock is handled rather than all at once.
- **Sells on the website is in the bulk editor**, so a whole folder can be marked in one go.
  For marking up stock that is *already* listed correctly: mark them, open the website list
  and use **Tick everything off**.
- Deleting an item that is on the website now says so, because once it is deleted the
  website list can no longer remind you it is up there.

### Notes
- **This still does not talk to the website.** It cannot — SumUp's online store has no way
  in for us. What it does is make sure nobody has to remember, and that what is left to do
  is written down rather than carried in someone's head.
- The list is worked out fresh every time from the stock itself, so it cannot drift out of
  step the way a to-do list would. There is nothing to tidy up and nothing to go stale.
- Web sales rung through the **🌐 Web** button take stock off the shelf like any sale, so
  they land on this list too — the website's own count still needs changing by hand.

---

## v1.7.1 - 24 August 2026, 22:47

### Fixed
- **A backup can no longer be saved without the photos in it.** Photos are held separately
  from the rest of the stock list and load a moment later. Tapping **Save backup** in that
  moment produced a file that named every item, looked the right size, and contained not one
  photo. The backup now waits for the photos, and if any genuinely cannot be read it refuses
  to write the file at all rather than hand you something that is not a backup.
- **Restoring a backup no longer deletes photos.** Restoring one of those photo-less files
  wiped every photo on the device for good — the app read "this item has no photo" as
  "delete this item's photo". The same thing could happen when a record arrived from the
  other device without its photo attached. An item turning up with no photo now means
  *nothing was said about a photo*, and the one already here is kept and put back.
- **The only things that delete a photo now** are deleting the item, and pressing
  **Remove photo** and saving. That press is recorded on the item, so it still travels to
  the other device properly.
- **The edit form waits for an item's photo** before it opens the photo box empty. Saving
  an item whose photo had not loaded yet used to read as removing it.

### Added
- **Photo counts wherever backups are mentioned.** Saving one says *Backup saved — 494
  photos*, and restoring says how many photos the file holds beside the item and sale
  counts. A file with no photos in it is now obvious before it is restored, not after.
- If a backup carries fewer photos than the device already has, the restore box says so and
  says the ones already here are kept.

### Notes
- Backups now record the photo count in the file. Older backups are still restorable exactly
  as before, and are now *safe* to restore — with this build, restoring the photo-less backup
  that caused this no longer loses anything.

---

## v1.7.0 - 24 August 2026, 16:40

### Added
- **A Web button at the till, next to Cash and Card.** Something sold on the website gets
  rung through exactly like a sale at the counter — scan or tap the item, tap **🌐 Web**,
  and the stock comes off the shelf, the sale is recorded and a receipt number is issued.
  It is the only way stock stays honest when the same shelf is being sold from twice.
- **A box for the website's order number**, optional, on that same screen. It prints on the
  receipt as "Order no." and lands in the sales CSV in a column of its own, so a sale in
  the app can be matched back to the order in the SumUp store without guessing from times
  and amounts.
- **Website money is counted on its own.** The report shows a 🌐 Website figure beside
  Cash and Card, and the report CSV carries it. It is deliberately not folded in with
  ✨ Other: that money is not notes in the till, and it did not come off the reader either.

### Notes
- **Payouts take the website's own fee, not the reader's.** Settings → Supplier payouts now
  has a second percentage for website sales, starting at 2.5%. **Check what yours actually
  is on the SumUp dashboard** — the online rate is not the in-person one, and paying a
  maker at the reader's rate would hand them money the shop never received.
- Website money settles into the bank, so it appears on the payout sheet under
  **from the bank**, on its own line beside card. Nothing about it comes out of the till.
- Same rule as card: the fee is taken on website **sales**, not sales net of refunds.
- A refund of a website sale stays a website sale, so it comes off that column rather than
  off the till.
- The four payment buttons now sit two by two instead of in one cramped row.
- **The website is not told anything.** Selling the last one at the counter does not reduce
  the website's stock, and the site could still take an order for it. That side is still
  done by hand.

---

## v1.6.0 - 24 August 2026, 16:05

### Added
- **Set prices.** Two items that cost less bought together than bought apart. Scan or tap
  both and the till spots the pair on its own, drops to the set price and shows a
  **🎁 Set price** line so it is obvious it happened. Take one half back out and the
  saving comes off again — nothing is remembered from the scan, the basket is re-checked
  every time it changes.
- **Set up on the item, under "Sold as a set."** Open one of the two items, pick the item
  it is sold with, and give the price for the pair. The box shows what the two cost apart
  and what the customer saves before you save it. Open the other half and it tells you
  which item the set is defined on rather than offering a second box that could disagree
  with the first.
- Items in a set carry a **🎁 SET** badge in the stock list and in Quick Sell, so it is
  visible before you get to the basket.
- Receipts print the set saving as **set price** on its own line, separate from any
  discount keyed in by hand.

### Notes
- **Payouts split the saving.** Where the two halves are by different makers, each one
  carries its own share of the saving, in proportion to its price, instead of one of them
  absorbing the lot. Sold, Z and the payout sheet all read the line net, so they agree to
  the penny.
- **Stock comes off both items**, one each, exactly as if they had been sold separately.
  There is no third "set" product to count.
- Buying two of each is two sets. Two of one and one of the other is one set plus one at
  full price.
- A line you have already discounted by hand sits out of set matching. Stacking a set
  price on top of a keyed-in discount gives a total nobody at the counter can explain.
- The set price applies before a whole-basket discount or a promo code, so a percentage
  comes off the set price rather than off the higher separate prices.
- If one half is refunded on its own, the customer gets back that half's share of the set
  price, not the full shelf price.
- A set price that is not actually a saving is refused when you save it, and ignored at
  the till if prices later change to make it one.
- Deleting an item clears any set it was part of.

---

## v1.5.8 - 24 August 2026, 03:38

### Added
- **A refund receipt now says when the original sale was taken**, on the line under
  "Refund of #VQ-0042". The refund's own date and time were already at the top, but it is
  the *sale's* time that finds the payment again on the card reader, because the reader
  lists payments by when they were taken rather than when they were given back.
- **A refund now names who processed it.** The printed receipt called this "Served by",
  which is the wrong word for handing money back — on a refund it now reads **Refunded
  by**.
- The same detail is on the on-screen note that tells you what to do at the reader, so
  the sale can be found whether or not there is a card reference to search for.

### Fixed
- **The shared receipt never named the staff member at all.** The printed one always has.
  Both now carry it, with the same wording.

### Notes
- Only shows where a name was recorded on the sale. If nobody was signed in at the till,
  the line is left off rather than printed empty.

---

## v1.5.7 - 24 August 2026, 03:12

### Added
- **A refund receipt now names the sale it refunds.** A refund is given its own receipt
  number, so on paper it was a stranger to the sale it reversed — the customer held two
  slips with nothing linking them. It now prints **Refund of #VQ-0042** under its own
  number.
- **A card sale receipt now prints the card reference.** The card slip has always carried
  our receipt number, so the slip could find the sale. This makes it work the other way
  too, which is the direction that matters when a customer arrives holding the till
  receipt and the payment has to be found on the reader.

### Notes
- Both appear on the printed receipt and the shared text one.
- **The card reference only exists for card sales taken through the app** from v1.5.5
  onwards, once the payment service has been redeployed. Sales without one simply omit
  the line rather than printing a blank.
- **The refund cross-reference works on any refund** that recorded which sale it came
  from, so it applies to existing refunds too, not only new ones.

---

## v1.5.6 - 24 August 2026, 02:41

### Added
- **The app now tells you when a card refund still has to be sent back.** Refunding a card
  sale records it and puts the stock back, but the app cannot move money — that part is
  done on the card reader. Until now nothing said so, and a refund done at closing time
  could quietly never reach the customer.
- A **banner at the top of Sales** shows the total still owed and how many refunds it
  covers. Each one is also marked **card refund due** in the list.
- Opening the refund's receipt says what to do: the amount, and where to find it on the
  reader — **Menu → Sales history → Refund**. If the original sale was taken through the
  app it names the card slip code, so it can be searched for rather than scrolled to.
- **✓ Mark card refund as sent** clears it, after a confirmation that says plainly this
  changes nothing at SumUp.

### Notes
- **Cash refunds are not flagged**, because the money leaves the drawer as you hand it
  over. Only card refunds leave something outstanding.
- **Refunds recorded before this build are not flagged either.** They were settled long
  ago, and raising them now would be noise rather than a reminder.
- **Nothing here contacts SumUp.** The flag is the app's own note to itself, so ticking it
  is a statement that you have done the refund on the reader, not an instruction to do it.
- On the reader itself: refunds are possible for **90 days**, can be partial, go back to
  the card that paid, and need enough un-withdrawn takings to cover them.

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
