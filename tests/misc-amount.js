// Misc amounts: a manual sum charged for something that was never stock -
// a reading, a deposit, postage - typed in with a description and taken the
// same way as anything else in the basket.
//
// Same trick as the other tests: slice the shipped source out of index.html by
// its comment markers and run it in a vm, so what is checked is what ships.
//
// Four blocks are pulled out, because the feature has to hold in four places
// that know nothing about each other:
//   1. the basket line itself - what goes in, and what is refused
//   2. set pricing and the basket total - a misc amount must not be swept into
//      a set rule, and must still be paid for. Two guards keep it out of a set
//      and either would do on its own, so the broken-copy run has to remove
//      both at once to prove the pair works
//   3. the end-of-day report - it is money taken, but it is NOT an item sold,
//      and the description has to survive as far as the report or the whole
//      thing is pointless
//   4. completing the sale - the record that is written and, above all, the
//      stock that must NOT move
//   5. the supplier payouts - a misc amount is never owed to anybody, and
//      "total to pay out" is a figure somebody acts on with real money
const fs = require('fs');
const vm = require('vm');

const HTML = fs.readFileSync(process.argv[2], 'utf8');

function slice(start, end, what) {
  const a = HTML.indexOf(start), b = HTML.indexOf(end);
  if (a < 0 || b < 0 || b < a) { console.error('could not locate ' + what); process.exit(2); }
  return HTML.slice(a, b);
}

const MISC = slice(
  '  /* ===================== Misc amounts =====================',
  '  /* =================== end misc amounts =================== */',
  'the misc amounts block');
const PRICING = slice(
  '  // ---- Set pricing ----',
  '  function renderTill(){',
  'the set pricing and basket totals');
const REPORT = slice(
  '  // ---- End-of-day (Z) report ----',
  '  /* ---- Supplier payouts',
  'the end-of-day report figures');
const SALE = slice(
  '  function completeSale(pay, tendered, change, card, webRef){',
  '  // ---- Transactions (grouped view of sale lines) ----',
  'completeSale');
const PAYOUTS = slice(
  '  /* ---- Supplier payouts',
  '  function payoutBodyHtml(',
  'the supplier payout figures');

// The page's own bits those blocks lean on, in the shape the app really
// stores them. saveCart and renderTill are the browser doing its job and have
// nothing to say here.
const ctx = {
  console,
  items: {},
  sales: [],
  cart: { lines: [], disc: null, promo: null },
  saveCart() {},
  renderTill() {},
  round2: n => Math.round((Number(n) || 0) * 100) / 100,
  promoExpired: () => false,
  lineQty: s => (s.qty != null) ? (Number(s.qty) || 0) : 1,
  lineNet: s => (s.net != null) ? (Number(s.net) || 0) : (Number(s.price) || 0),
  lineTxn: s => s.txn || ('legacy|' + String(s.barcode || '') + '|' + String(s.at || '')),
  // the payout rates are settings, and an empty one falls back to SumUp's
  localStorage: { getItem: () => null },
  // completing a sale writes a record and then tells the page to redraw. Only
  // the record and the stock matter here.
  uid: p => (p || 'x') + Math.random().toString(36).slice(2, 10),
  nextReceiptNo: () => 'K7-0001',
  currentStaff: () => null,
  saveItems() {}, saveSales() {}, renderList() {}, renderSold() {},
  initAudio() {}, beep() {}, buzz() {},
  document: { getElementById: () => ({ value: '' }) },
};
vm.createContext(ctx);
vm.runInContext(MISC + PRICING + SALE + REPORT + PAYOUTS + `
this.addMiscToCart = addMiscToCart; this.MISC_BARCODE = MISC_BARCODE;
this.cartFigures = cartFigures; this.setMatches = setMatches;
this.zFigures = zFigures; this.localDateStr = localDateStr;
this.makerFigures = makerFigures; this.completeSale = completeSale;
`, ctx);

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}
function emptyCart() { ctx.cart = { lines: [], disc: null, promo: null }; }

/* ---------- 1. what goes in the basket, and what is refused ---------- */

console.log('\nWhat the till will accept');
{
  emptyCart();
  check('nothing is refused with a sentence, not silently',
        typeof ctx.addMiscToCart('', 'Tarot reading') === 'string');
  check('zero is refused', typeof ctx.addMiscToCart('0', 'Tarot reading') === 'string');
  check('a negative amount is refused', typeof ctx.addMiscToCart('-5', 'Tarot reading') === 'string');
  check('something that is not a number is refused',
        typeof ctx.addMiscToCart('abc', 'Tarot reading') === 'string');
  // The description is the point. Without it the report has a sum of money on
  // it that nobody can account for, which is worse than not taking it here.
  check('no description is refused', typeof ctx.addMiscToCart('30', '') === 'string');
  check('a description of only spaces is refused', typeof ctx.addMiscToCart('30', '   ') === 'string');
  check('nothing landed in the basket from any of that', ctx.cart.lines.length === 0,
        JSON.stringify(ctx.cart.lines));
}

console.log('\nThe line it puts in the basket');
{
  emptyCart();
  check('a good one returns nothing to complain about',
        ctx.addMiscToCart('30', '  Tarot reading  ') === null);
  const l = ctx.cart.lines[0];
  check('one line went in', ctx.cart.lines.length === 1);
  check('it is marked as misc', l.misc === true);
  check('the description is the name, trimmed', l.name === 'Tarot reading', l.name);
  check('the amount is the price', l.price === 30);
  check('it is one of', l.qty === 1);
  check('it carries no maker, so the shop keeps it', l.maker === '');
  check('it has no discount on it', l.disc === null);
  check('the barcode says what it is', l.barcode === ctx.MISC_BARCODE && l.barcode === 'MISC');

  // Money typed at a counter arrives with more decimal places than money has.
  ctx.addMiscToCart('12.345', 'Postage');
  check('the amount is rounded to the penny', ctx.cart.lines[1].price === 12.35,
        String(ctx.cart.lines[1].price));
}

console.log('\nTwo misc amounts in one sale');
{
  emptyCart();
  ctx.addMiscToCart('30', 'Tarot reading');
  ctx.addMiscToCart('10', 'Workshop deposit');
  // A scanned item merges with its own line. These must not: they are two
  // different things and merging would throw one description away.
  check('they stay two lines', ctx.cart.lines.length === 2);
  check('each keeps its own description',
        ctx.cart.lines[0].name === 'Tarot reading' && ctx.cart.lines[1].name === 'Workshop deposit');
  check('neither has been rolled into the other',
        ctx.cart.lines[0].qty === 1 && ctx.cart.lines[1].qty === 1);
}

/* ---------- 2. the basket total, and set prices ---------- */


console.log('\nThe basket total');
{
  ctx.items = {};
  emptyCart();
  ctx.cart.lines.push({ barcode: 'CA-001', name: 'Bracelet', maker: 'Kay', price: 20, qty: 1, disc: null });
  ctx.addMiscToCart('30', 'Tarot reading');
  const f = ctx.cartFigures();
  check('a misc amount is in the subtotal', f.subtotal === 50, String(f.subtotal));
  check('and in the total that goes to the card reader', f.total === 50, String(f.total));
  check('it is not a discount', f.discounts === 0);
}

console.log('\nA whole-basket discount over a misc amount');
{
  emptyCart();
  ctx.cart.lines.push({ barcode: 'CA-001', name: 'Bracelet', maker: 'Kay', price: 20, qty: 1, disc: null });
  ctx.addMiscToCart('30', 'Tarot reading');
  ctx.cart.disc = { type: 'pct', value: 10 };
  const f = ctx.cartFigures();
  // Taking 10% off the basket takes it off everything in the basket. Carving
  // the misc line out would leave a total nobody at the counter can explain.
  check('it comes off the whole basket, misc included', f.total === 45, String(f.total));
}

console.log('\nSet prices leave misc amounts alone');
{
  // Two real items sold as a pair for less, and an item somebody has coded
  // MISC by hand - which is the one way a misc line could be mistaken for
  // stock, so it is worth proving it cannot.
  ctx.items = {
    'CA-001': { name: 'Bracelet', price: 20, counted: 5, set: { with: ['CA-002'], price: 30 } },
    'CA-002': { name: 'Pendant', price: 15, counted: 5 },
    'MISC':   { name: 'Mystery box', price: 9, counted: 5, set: { with: ['CA-002'], price: 12 } },
  };
  emptyCart();
  ctx.cart.lines.push({ barcode: 'CA-001', name: 'Bracelet', price: 20, qty: 1, disc: null });
  ctx.cart.lines.push({ barcode: 'CA-002', name: 'Pendant', price: 15, qty: 1, disc: null });
  ctx.addMiscToCart('30', 'Tarot reading');
  const f = ctx.cartFigures();
  check('the set between the two real items still applies', f.setDisc === 5, String(f.setDisc));
  check('the misc line is not given any of the saving', f.setLine[2] === 0, String(f.setLine[2]));
  check('the total is the set price plus the misc amount', f.total === 60, String(f.total));

  // Now the trap: the misc line's barcode matches an item that has a set rule
  // with something else in the basket. It must not pair with it.
  emptyCart();
  ctx.cart.lines.push({ barcode: 'CA-002', name: 'Pendant', price: 15, qty: 1, disc: null });
  ctx.addMiscToCart('30', 'Tarot reading');
  const g = ctx.cartFigures();
  check('a misc line never pairs with an item that happens to be coded MISC',
        g.setDisc === 0 && g.total === 45, JSON.stringify({ setDisc: g.setDisc, total: g.total }));
  ctx.items = {};
}

/* ---------- 3. what completing the sale writes down ---------- */

console.log('\nRinging the sale up');
{
  // The second item is there on purpose: somebody has coded a real thing MISC,
  // which is the one way a misc line could empty a shelf it never came off.
  ctx.items = {
    'CA-001': { name: 'Bracelet', price: 20, counted: 5, maker: 'Kay' },
    'MISC':   { name: 'Mystery box', price: 9, counted: 3, maker: 'Jo' },
  };
  ctx.sales = [];
  emptyCart();
  ctx.cart.lines.push({ barcode: 'CA-001', name: 'Bracelet', maker: 'Kay', price: 20, qty: 1, disc: null });
  ctx.addMiscToCart('30', 'Tarot reading');
  ctx.completeSale('cash', 50, 0);

  const item = ctx.sales.find(s => s.barcode === 'CA-001');
  const misc = ctx.sales.find(s => s.barcode === 'MISC');
  check('both lines are recorded', ctx.sales.length === 2);
  check('they are one sale, on one receipt',
        item.txn === misc.txn && item.receiptNo === misc.receiptNo);

  // The one that would do real damage: a shelf being emptied by a reading.
  check('the item comes off the shelf', ctx.items['CA-001'].counted === 4,
        String(ctx.items['CA-001'].counted));
  check('the item coded MISC is untouched by a misc line',
        ctx.items['MISC'].counted === 3, String(ctx.items['MISC'].counted));

  check('the misc line is flagged as misc', misc.misc === true);
  check('and carries the description as its name', misc.name === 'Tarot reading');
  check('and its amount', misc.net === 30 && misc.price === 30);
  // Firestore refuses undefined, so an ordinary line has to say null out loud
  // rather than leave the field off - this whole record syncs between tills.
  check('an ordinary line says misc is null, not undefined',
        item.misc === null && 'misc' in item);
  check('the basket is emptied either way', ctx.cart.lines.length === 0);
}

console.log('\nA sale of nothing but a misc amount');
{
  ctx.items = {
    'CA-001': { name: 'Bracelet', price: 20, counted: 5, maker: 'Kay' },
    'MISC':   { name: 'Mystery box', price: 9, counted: 3, maker: 'Jo' },
  };
  ctx.sales = [];
  emptyCart();
  ctx.addMiscToCart('30', 'Tarot reading');
  ctx.completeSale('card', null, null, { txId: 'tx_1', code: 'ABCD' });
  check('it is recorded', ctx.sales.length === 1 && ctx.sales[0].net === 30);
  check('no stock was touched at all',
        ctx.items['CA-001'].counted === 5 && ctx.items['MISC'].counted === 3,
        JSON.stringify({ a: ctx.items['CA-001'].counted, b: ctx.items['MISC'].counted }));
  // The card reader does not care what is in the basket, so a misc-only sale
  // has to keep its transaction code like any other card sale.
  check("the card reader's reference is kept", ctx.sales[0].sumupCode === 'ABCD');
}

/* ---------- 4. the end-of-day report ---------- */

const DAY = '2026-08-20';
const at = (h, m) => new Date(2026, 7, 20, h, m, 0).toISOString();

console.log('\nWhat the report makes of it');
{
  ctx.sales = [
    // an ordinary item sold for cash
    { id: 'L1', txn: 'T1', receiptNo: 'K7-0001', barcode: 'CA-001', name: 'Bracelet', maker: 'Kay',
      price: 20, qty: 1, disc: 0, net: 20, pay: 'cash', kind: 'sale', at: at(10, 0) },
    // a misc amount on the same sale
    { id: 'L2', txn: 'T1', receiptNo: 'K7-0001', barcode: 'MISC', name: 'Tarot reading', maker: '',
      price: 30, qty: 1, disc: 0, net: 30, pay: 'cash', misc: true, kind: 'sale', at: at(10, 0) },
    // a sale that is nothing but a misc amount, taken on the card reader
    { id: 'L3', txn: 'T2', receiptNo: 'K7-0002', barcode: 'MISC', name: 'Workshop deposit', maker: '',
      price: 10, qty: 1, disc: 0, net: 10, pay: 'card', misc: true, kind: 'sale', at: at(11, 0) },
  ];
  const f = ctx.zFigures(DAY, DAY);

  check('the money is in the takings', f.net === 60, String(f.net));
  check('cash carries the misc amount taken in cash', f.pay.cash === 50, String(f.pay.cash));
  check('card carries the one taken on the reader', f.pay.card === 10, String(f.pay.card));
  // This is the whole reason misc is a flag and not just another item.
  check('a misc amount is not counted as an item sold', f.units === 1, String(f.units));
  check('and is not in what sold best', Object.keys(f.sellers).length === 1,
        JSON.stringify(Object.keys(f.sellers)));
  check('a sale of nothing but a misc amount is still a sale', f.txns === 2, String(f.txns));
  check('the misc total is named on its own', f.misc === 40, String(f.misc));
  check('both are listed', f.miscLines.length === 2);
  check('with their descriptions',
        f.miscLines[0].name === 'Tarot reading' && f.miscLines[1].name === 'Workshop deposit');
  check('in the order they were taken',
        f.miscLines[0].at < f.miscLines[1].at);
  check('and with how each was paid for',
        f.miscLines[0].pay === 'cash' && f.miscLines[1].pay === 'card');
}

console.log('\nA misc amount given back');
{
  ctx.sales = [
    { id: 'L1', txn: 'T1', receiptNo: 'K7-0001', barcode: 'MISC', name: 'Tarot reading', maker: '',
      price: 30, qty: 1, disc: 0, net: 30, pay: 'card', misc: true, kind: 'sale', at: at(10, 0) },
    { id: 'L2', txn: 'T2', receiptNo: 'K7-0002', barcode: 'MISC', name: 'Tarot reading', maker: '',
      price: 30, qty: -1, disc: 0, net: -30, pay: 'card', misc: true, kind: 'refund',
      refundOfLine: 'L1', at: at(12, 0) },
  ];
  const f = ctx.zFigures(DAY, DAY);
  check('the takings come back to nothing', f.net === 0, String(f.net));
  check('the misc total is what was actually kept', f.misc === 0, String(f.misc));
  check('it is counted as a refund like anything else', f.refunds === 30, String(f.refunds));
  check('both sides are listed, so the pair can be seen', f.miscLines.length === 2);
  check('the refund is marked as one', f.miscLines[1].kind === 'refund');
  check('a refund was never an item sold either', f.units === 0, String(f.units));
}

console.log('\nWhat the payout sheet makes of it');
{
  ctx.sales = [
    // Kay's bracelet, sold on the card: she is owed it less the card fee
    { id: 'L1', txn: 'T1', receiptNo: 'K7-0001', barcode: 'CA-001', name: 'Bracelet', maker: 'Kay',
      price: 20, qty: 1, disc: 0, net: 20, pay: 'card', kind: 'sale', at: at(10, 0) },
    // and a reading, which is the shop's own and is owed to nobody
    { id: 'L2', txn: 'T1', receiptNo: 'K7-0001', barcode: 'MISC', name: 'Tarot reading', maker: '',
      price: 30, qty: 1, disc: 0, net: 30, pay: 'card', misc: true, kind: 'sale', at: at(10, 0) },
  ];
  const p = ctx.makerFigures(DAY, DAY);
  check('only the maker who actually supplied something is on the sheet',
        p.rows.length === 1 && p.rows[0].name === 'Kay', JSON.stringify(p.rows.map(r => r.name)));
  check('the misc amount is not sitting in a no-maker row',
        p.rows.every(r => r.name !== '\u2014'));
  // 20 less SumUp's 1.69% is 19.66. If the misc money had leaked in, this would
  // be a great deal larger, and somebody would have paid it out.
  check('what is owed is the item only, less the card fee',
        p.rows[0].owed === 19.66, String(p.rows[0].owed));
  check('and the fee is charged on the item only, not on the reading',
        p.rows[0].cardSales === 20 && p.rows[0].fee === 0.34,
        JSON.stringify({ cardSales: p.rows[0].cardSales, fee: p.rows[0].fee }));
  check('the item is still counted', p.rows[0].units === 1, String(p.rows[0].units));
}

console.log('\nA day with no misc amounts at all');
{
  ctx.sales = [
    { id: 'L1', txn: 'T1', receiptNo: 'K7-0001', barcode: 'CA-001', name: 'Bracelet', maker: 'Kay',
      price: 20, qty: 1, disc: 0, net: 20, pay: 'cash', kind: 'sale', at: at(10, 0) },
  ];
  const f = ctx.zFigures(DAY, DAY);
  // Nothing about the report may change for a shop that never uses this.
  check('the misc total is zero', f.misc === 0);
  check('there is nothing to list', f.miscLines.length === 0);
  check('items sold is untouched', f.units === 1);
  check('and so is the takings', f.net === 20);
  const p = ctx.makerFigures(DAY, DAY);
  check('the payout sheet is exactly what it always was',
        p.rows.length === 1 && p.rows[0].name === 'Kay' && p.rows[0].owed === 20,
        JSON.stringify(p.rows));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
