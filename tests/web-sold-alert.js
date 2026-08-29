// Runs the REAL "sold on the website" decision out of index.html. Same trick as
// the others: slice the shipped source out by its comment markers and run it in
// a vm, so what is tested is what ships rather than a copy that can drift.
//
// The slice is deliberately the whole DOM-free half of the feature -- the
// storage load with its pruning, the known-transactions set, and the planner --
// because the traps live as much in "have I already been told this" as in
// "is this a web sale".
const fs = require('fs');
const vm = require('vm');

const HTML = fs.readFileSync(process.argv[2], 'utf8');
const START = "  const WEB_SOLD_KEY = 'posWebSoldPending';";
const END = '  // Called by the sync layer with whatever a snapshot just delivered.';
const a = HTML.indexOf(START), b = HTML.indexOf(END);
if (a < 0 || b < 0) { console.error('could not locate the web-sold block'); process.exit(2); }
const SRC = HTML.slice(a, b);

// A fresh copy of the module with whatever was already in localStorage, so the
// load and the pruning can be tested as well as the planner.
function build(stored) {
  const store = {};
  if (stored !== undefined) store[ 'posWebSoldPending' ] = JSON.stringify(stored);
  const ctx = {
    console,
    localStorage: {
      getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem(k, v) { store[k] = String(v); },
    },
  };
  vm.createContext(ctx);
  vm.runInContext(
    SRC + '\nthis.planWebSoldAlerts = planWebSoldAlerts;'
        + '\nthis.webSoldKnown = webSoldKnown;'
        + '\nthis.noteOwnWebSale = noteOwnWebSale;'
        + '\nthis.saveWebSold = saveWebSold;'
        + '\nthis.webSold = webSold;'
        + '\nthis.WINDOW = WEB_SOLD_WINDOW_MS;',
    ctx
  );
  ctx.store = store;
  return ctx;
}

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

const MINE = 'this-till';
const THEM = 'the-other-till';
const now = Date.now();
const justNow = new Date(now - 60 * 1000).toISOString();

// One sale line as it comes back off a Firestore document.
function line(over) {
  return Object.assign({
    id: 'L1', txn: 'T1', receiptNo: 'VQ-0042', barcode: 'KA-003',
    name: 'Rose Quartz Angel', maker: 'Kay', price: 12.5, qty: 1,
    pay: 'web', kind: 'sale', misc: null, webRef: '1042', at: justNow,
  }, over || {});
}
function doc(sale, over) {
  return Object.assign({ sale: sale, by: THEM, deleted: false }, over || {});
}
function plan(docs, opts) {
  const ctx = build();
  return ctx.planWebSoldAlerts(docs, Object.assign({ mine: MINE, now: now }, opts || {}));
}

console.log('\nWhat gets somebody sent to the shelves');
{
  const jobs = plan([doc(line())]);
  check('a web sale from another till raises one job', jobs.length === 1, 'got ' + jobs.length);
  check('the job is keyed by the transaction', jobs[0] && jobs[0].txn === 'T1');
  check('the order number comes through', jobs[0] && jobs[0].webRef === '1042');
  check('the receipt number comes through', jobs[0] && jobs[0].receiptNo === 'VQ-0042');
  const l = jobs[0].lines[0];
  check('the code is carried, so it can be found on the shelf', l.barcode === 'KA-003');
  check('the name is carried', l.name === 'Rose Quartz Angel');
  check('the maker is carried', l.maker === 'Kay');
  check('the quantity is a number', l.qty === 1);
}
{
  // A basket of three is one trip to the shelves, not three interruptions.
  const jobs = plan([
    doc(line({ id: 'L1', barcode: 'KA-003' })),
    doc(line({ id: 'L2', barcode: 'KA-107', name: 'Amethyst Cluster', webRef: null })),
    doc(line({ id: 'L3', barcode: 'KA-201', name: 'Selenite Wand', webRef: null, qty: 2 })),
  ]);
  check('three lines of one order are ONE job', jobs.length === 1, 'got ' + jobs.length);
  check('all three things are listed on it', jobs[0].lines.length === 3);
  check('a quantity above one survives', jobs[0].lines[2].qty === 2);
  // webRef rides on the first line only, like the card details do.
  check('the order number is found even though only line 1 carries it',
    jobs[0].webRef === '1042');
}
{
  const jobs = plan([
    doc(line({ id: 'L1', txn: 'T1' })),
    doc(line({ id: 'L2', txn: 'T2', barcode: 'KA-107', webRef: '1043' })),
  ]);
  check('two orders are two jobs', jobs.length === 2);
  check('they keep the order they arrived in',
    jobs[0].txn === 'T1' && jobs[1].txn === 'T2');
}
{
  // Legacy stock-take lines predate txn. Better a job of its own than silence.
  const jobs = plan([doc(line({ txn: null, id: 'L9' }))]);
  check('a line with no transaction falls back to its own id',
    jobs.length === 1 && jobs[0].txn === 'L9');
}

console.log('\nWhat must never interrupt anybody');
{
  check('our own sale, echoed back to us',
    plan([doc(line(), { by: MINE })]).length === 0);
  check('a cash sale', plan([doc(line({ pay: 'cash' }))]).length === 0);
  check('a card sale', plan([doc(line({ pay: 'card' }))]).length === 0);
  check('an "other" sale', plan([doc(line({ pay: 'other' }))]).length === 0);
  // Stock coming BACK is not a job anyone has to be pulled off the counter for.
  check('a refund of a web sale',
    plan([doc(line({ kind: 'refund' }))]).length === 0);
  // A reading or a deposit was never on a shelf to be taken off one.
  check('a misc amount taken on the web method',
    plan([doc(line({ misc: true, barcode: 'MISC' }))]).length === 0);
  check('a tombstone (the sale was deleted)',
    plan([doc(line(), { deleted: true })]).length === 0);
  check('a line with no code at all',
    plan([doc(line({ barcode: '' }))]).length === 0);
  check('a document with no sale on it', plan([doc(null)]).length === 0);
  check('a null in the list', plan([null, undefined]).length === 0);
  check('an unreadable date', plan([doc(line({ at: 'not a date' }))]).length === 0);
  check('no date at all', plan([doc(line({ at: null }))]).length === 0);
}

console.log('\nThe Monday-morning trap');
{
  // Firestore's first snapshot after connecting delivers the WHOLE collection
  // as new documents. Without the window, opening a till would flash up every
  // web sale the shop has ever made.
  const old = new Date(now - 13 * 60 * 60 * 1000).toISOString();
  check('a sale older than the window is history, not news',
    plan([doc(line({ at: old }))]).length === 0);
  const elevenHours = new Date(now - 11 * 60 * 60 * 1000).toISOString();
  check('this morning’s order still gets told',
    plan([doc(line({ at: elevenHours }))]).length === 1);
  // A clock a little ahead must not read as "the far future" and be dropped.
  const slightlyAhead = new Date(now + 30 * 1000).toISOString();
  check('a sale a moment in the future is still news',
    plan([doc(line({ at: slightlyAhead }))]).length === 1);
}

console.log('\nBeing told the same thing twice');
{
  check('a transaction already waiting is not raised again',
    plan([doc(line())], { known: { T1: 1 } }).length === 0);
  const jobs = plan([doc(line({ txn: 'T1' })), doc(line({ txn: 'T2', id: 'L2' }))],
    { known: { T1: 1 } });
  check('only the one already known is skipped',
    jobs.length === 1 && jobs[0].txn === 'T2');
}
{
  const ctx = build({ pending: [{ txn: 'T7', lines: [] }], done: { T8: now } });
  const known = ctx.webSoldKnown();
  check('what is still waiting counts as known', known.T7 === 1);
  check('what has been dealt with counts as known', known.T8 === 1);
  check('nothing else does', Object.keys(known).length === 2);
}

console.log('\nWhat survives a reload');
{
  const ctx = build({ pending: [{ txn: 'T7', lines: [{ barcode: 'KA-003' }] }], done: {} });
  check('a job left over from before the reload is still there',
    ctx.webSold.pending.length === 1 && ctx.webSold.pending[0].txn === 'T7');
}
{
  // Anything older than the window cannot be raised again anyway, so the note
  // saying it was dealt with is dead weight.
  const stale = now - (25 * 60 * 60 * 1000);
  const ctx = build({ pending: [], done: { OLD: stale, FRESH: now - 1000 } });
  check('a stale note that it was dealt with is pruned',
    ctx.webSold.done.OLD === undefined);
  check('a recent one is kept', ctx.webSold.done.FRESH !== undefined);
}
{
  check('nothing stored loads as nothing waiting',
    build().webSold.pending.length === 0);
  const ctx = build();
  ctx.localStorage.setItem('posWebSoldPending', 'not json at all');
  const ctx2 = (function () {
    const c = build();
    return c;
  })();
  check('garbage in storage does not throw', ctx2.webSold.pending.length === 0);
  const wrong = build({ pending: 'nope', done: 42 });
  check('the wrong shape in storage is treated as empty',
    Array.isArray(wrong.webSold.pending) && wrong.webSold.pending.length === 0
    && typeof wrong.webSold.done === 'object');
}
{
  const ctx = build({ pending: [], done: {} });
  ctx.webSold.pending.push({ txn: 'T5', lines: [] });
  ctx.saveWebSold();
  const back = JSON.parse(ctx.store['posWebSoldPending']);
  check('saving writes it where the next load will find it',
    back.pending.length === 1 && back.pending[0].txn === 'T5');
}

console.log('\nRung through on this till, with no second till to tell');
// The single-iPad case. Same job list, but raised by the sale itself rather
// than by a document arriving, and banner-only -- so what is checked here is
// what lands on the list, not what interrupts anybody.
function cartLine(over) {
  return Object.assign({ barcode: 'KA-003', name: 'Rose Quartz Angel',
    maker: 'Kay', price: 12.5, qty: 1, misc: false }, over || {});
}
{
  const ctx = build();
  const job = ctx.noteOwnWebSale('T20', 'VQ-0200', '3001',
    [cartLine(), cartLine({ barcode: 'HG-014', name: 'Selenite Wand', qty: 2 })], justNow);
  check('ringing a web order through here puts it on the list', !!job);
  check('it is one job for the whole basket', job.lines.length === 2);
  check('the code is carried', job.lines[0].barcode === 'KA-003');
  check('the name is carried', job.lines[0].name === 'Rose Quartz Angel');
  check('the maker is carried', job.lines[0].maker === 'Kay');
  check('a quantity above one survives', job.lines[1].qty === 2);
  check('the order number is carried', job.webRef === '3001');
  check('the receipt number is carried', job.receiptNo === 'VQ-0200');
  check('it is now waiting on the banner', ctx.webSold.pending.length === 1);
  check('and it is written where a reload will find it',
    JSON.parse(ctx.store['posWebSoldPending']).pending.length === 1);
}
{
  // A reading or a deposit was never on a shelf to be fetched off one.
  const ctx = build();
  const job = ctx.noteOwnWebSale('T21', 'VQ-0201', null,
    [cartLine(), cartLine({ barcode: 'MISC', name: 'Tarot reading', misc: true })], justNow);
  check('a misc line is left off the job', job.lines.length === 1);
  check('and it is the real item that stays', job.lines[0].barcode === 'KA-003');
}
{
  const ctx = build();
  const job = ctx.noteOwnWebSale('T22', 'VQ-0202', null,
    [cartLine({ barcode: 'MISC', name: 'Deposit', misc: true })], justNow);
  check('an order that is only a misc amount raises nothing', job === null);
  check('and nothing is left waiting', ctx.webSold.pending.length === 0);
}
{
  const ctx = build();
  check('a line with no code is left out',
    ctx.noteOwnWebSale('T23', null, null, [cartLine({ barcode: '' })], justNow) === null);
  check('no lines at all raises nothing',
    ctx.noteOwnWebSale('T24', null, null, [], justNow) === null);
  check('no transaction raises nothing',
    ctx.noteOwnWebSale('', null, null, [cartLine()], justNow) === null);
}
{
  const ctx = build();
  ctx.noteOwnWebSale('T25', null, null, [cartLine()], justNow);
  const again = ctx.noteOwnWebSale('T25', null, null, [cartLine()], justNow);
  check('the same order cannot be raised twice', again === null);
  check('and it is still one job, not two', ctx.webSold.pending.length === 1);
}
{
  const ctx = build({ pending: [], done: { T26: Date.now() } });
  check('an order already ticked off is not raised again',
    ctx.noteOwnWebSale('T26', null, null, [cartLine()], justNow) === null);
}
{
  // The one that matters when a second till IS open: this till raises the job
  // as it rings the sale, then the same sale comes back round over sync. It
  // must not land a second time.
  const ctx = build();
  ctx.noteOwnWebSale('T27', 'VQ-0207', null, [cartLine()], justNow);
  const echoed = ctx.planWebSoldAlerts(
    [{ sale: line({ txn: 'T27' }), by: THEM, deleted: false }],
    { mine: MINE, now: now, known: ctx.webSoldKnown() }
  );
  check('the same order arriving over sync afterwards is ignored', echoed.length === 0);
}

console.log('\nWhen sync has not told us who we are');
{
  // clientId is always set in practice, but a missing one must not turn every
  // sale into somebody else's -- nor drop the lot.
  const jobs = plan([doc(line(), { by: THEM })], { mine: null });
  check('another till’s sale still raises a job', jobs.length === 1);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
