// Runs the REAL supplier payout maths out of index.html. Same trick as the
// others: slice the shipped source out by its comment markers and run it in a
// vm, so what is tested is what ships rather than a copy that can drift.
//
// This one is worth more than most: somebody hands real money to real people
// off the back of these numbers, and a payout that is quietly 20% wrong is not
// the kind of bug anybody notices from the screen.
const fs = require('fs');
const vm = require('vm');

const HTML = fs.readFileSync(process.argv[2], 'utf8');

// Two slices, because the line helpers sit well away from the payout block.
const A_START = '  function lineQty(s){';
const A_END = '\n\n  function getShopName(){';
const B_START = '  function localDateStr(d){';
const B_END = '  function payoutBodyHtml(';

function slice(start, end, what) {
  const a = HTML.indexOf(start), b = HTML.indexOf(end, a);
  if (a < 0 || b < 0) { console.error('could not locate ' + what); process.exit(2); }
  return HTML.slice(a, b);
}
const SRC = slice(A_START, A_END, 'the line helpers') + '\n'
          + slice(B_START, B_END, 'the payout block');

// A fresh copy with whatever sales, makers and settings a case needs.
function build(opts) {
  const o = opts || {};
  const store = {};
  if (o.cardPct !== undefined) store['posCardFeePct'] = String(o.cardPct);
  if (o.webPct !== undefined) store['posWebFeePct'] = String(o.webPct);
  if (o.commPct !== undefined) store['posShopCommissionPct'] = String(o.commPct);
  const ctx = {
    console,
    sales: o.sales || [],
    makers: o.makers || [],
    localStorage: {
      getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem(k, v) { store[k] = String(v); },
    },
  };
  vm.createContext(ctx);
  vm.runInContext(
    SRC + '\nthis.makerFigures = makerFigures;'
        + '\nthis.makerCommissionPct = makerCommissionPct;'
        + '\nthis.shopCommissionPct = shopCommissionPct;',
    ctx
  );
  return ctx;
}

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

const DAY = '2026-08-29';
const AT = '2026-08-29T12:00:00';   // local time, which is what localDateStr reads

function sale(over) {
  return Object.assign({
    id: 'L1', txn: 'T1', barcode: 'KA-003', name: 'Thing', maker: 'Kay',
    price: 10, qty: 1, net: 10, pay: 'cash', kind: 'sale', misc: null, at: AT,
  }, over || {});
}
// Everything in one day, so the range never has to be thought about.
function figures(opts) {
  return build(opts).makerFigures(DAY, DAY).rows;
}
function row(rows, name) { return rows.filter(r => r.name === name)[0]; }

console.log('\nWith no commission set, nothing changes');
{
  const rows = figures({ sales: [sale({ net: 50, price: 50 })] });
  const kay = row(rows, 'Kay');
  check('the default rate is nothing at all', build({}).shopCommissionPct() === 0);
  check('cash still pays out in full', kay.owed === 50, 'owed=' + kay.owed);
  check('and no commission is taken', kay.commission === 0);
}

console.log('\nThe shop takes its cut on top of the payment fee');
{
  // The worked example the user was shown before agreeing to this.
  const rows = figures({
    commPct: 20, cardPct: 1.69,
    sales: [sale({ pay: 'card', price: 100, net: 100 })],
  });
  const kay = row(rows, 'Kay');
  check('the card fee is still taken first', kay.fee === 1.69, 'fee=' + kay.fee);
  check('the money in from card is the sale less the fee', kay.fromCard === 98.31);
  check('commission is 20% of the SALE price, not of what is left',
    kay.commission === 20, 'commission=' + kay.commission);
  check('the supplier is paid £78.31', kay.owed === 78.31, 'owed=' + kay.owed);
}
{
  const rows = figures({ commPct: 20, sales: [sale({ price: 50, net: 50 })] });
  check('cash: full price less commission', row(rows, 'Kay').owed === 40);
}
{
  const rows = figures({
    commPct: 20, webPct: 2.5,
    sales: [sale({ pay: 'web', price: 100, net: 100 })],
  });
  const kay = row(rows, 'Kay');
  check('website: its own fee, then commission',
    kay.webFee === 2.5 && kay.fromWeb === 97.5 && kay.owed === 77.5, 'owed=' + kay.owed);
}
{
  const rows = figures({ commPct: 20, sales: [sale({ pay: 'other', price: 50, net: 50 })] });
  check('"other" carries no fee but does carry commission',
    row(rows, 'Kay').owed === 40);
}

console.log('\nRefunds');
{
  // The two rules pull in opposite directions on purpose, and this is the case
  // that proves both at once.
  const rows = figures({
    commPct: 20, cardPct: 1.69,
    sales: [
      sale({ id: 'a', pay: 'card', price: 100, net: 100 }),
      sale({ id: 'b', txn: 'T2', pay: 'card', price: 100, net: -40, qty: -1, kind: 'refund' }),
    ],
  });
  const kay = row(rows, 'Kay');
  // The card company keeps its fee on a refunded sale, so the shop has paid it.
  check('the card fee is still charged on the FULL sale', kay.fee === 1.69);
  // But the shop has no business keeping a cut of a sale it handed back.
  check('commission follows the refund down', kay.commission === 12,
    'commission=' + kay.commission + ' (20% of 60)');
  check('what is owed is the sale, less the refund, less fee, less commission',
    kay.owed === 46.31, 'owed=' + kay.owed);
}
{
  const rows = figures({
    commPct: 20,
    sales: [
      sale({ id: 'a', price: 50, net: 50 }),
      sale({ id: 'b', txn: 'T2', price: 50, net: -50, qty: -1, kind: 'refund' }),
    ],
  });
  // Nothing sold, nothing owed, nobody to pay - so the maker drops off the
  // sheet entirely rather than appearing as a £0.00 line to be puzzled over.
  check('a sale refunded in full leaves no payout row', rows.length === 0,
    'rows=' + rows.length);
}

console.log('\nA supplier on their own terms');
{
  const makers = [{ name: 'Kay', letter: 'K', commission: 30 },
                  { name: 'Meg', letter: 'M', commission: 0 },
                  { name: 'Pat', letter: 'P' }];
  const sales = [
    sale({ id: 'a', maker: 'Kay', price: 100, net: 100 }),
    sale({ id: 'b', maker: 'Meg', price: 100, net: 100 }),
    sale({ id: 'c', maker: 'Pat', price: 100, net: 100 }),
    sale({ id: 'd', maker: 'Sam', price: 100, net: 100 }),
  ];
  const rows = figures({ commPct: 20, makers: makers, sales: sales });
  check('their own figure is used', row(rows, 'Kay').commission === 30);
  // A zero has to survive, or "this one pays nothing" would silently become
  // "this one is on the shop rate" the moment the shop rate changed.
  check('a deliberate zero means zero, not "use the shop rate"',
    row(rows, 'Meg').commission === 0 && row(rows, 'Meg').owed === 100);
  check('no figure against their name falls back to the shop rate',
    row(rows, 'Pat').commission === 20);
  check('somebody not on the makers list falls back too',
    row(rows, 'Sam').commission === 20);
}
{
  const ctx = build({ commPct: 20, makers: [{ name: ' Kay ', letter: 'K', commission: 30 }] });
  check('the name is matched trimmed', ctx.makerCommissionPct('Kay') === 30);
  check('and case-insensitively', ctx.makerCommissionPct('KAY') === 30);
  check('somebody else still gets the shop rate', ctx.makerCommissionPct('Meg') === 20);
}
{
  const bad = [{ name: 'A', letter: 'A', commission: -5 },
               { name: 'B', letter: 'B', commission: 100 },
               { name: 'C', letter: 'C', commission: 'twenty' },
               { name: 'D', letter: 'D', commission: null }];
  const ctx = build({ commPct: 20, makers: bad });
  check('a negative figure is refused, not applied', ctx.makerCommissionPct('A') === 20);
  check('100% or more is refused', ctx.makerCommissionPct('B') === 20);
  check('nonsense text is refused', ctx.makerCommissionPct('C') === 20);
  check('an empty value is refused', ctx.makerCommissionPct('D') === 20);
}
{
  const ctx = build({ commPct: 20 });
  check('the no-maker bucket is on the shop rate', ctx.makerCommissionPct('—') === 20);
  check('so is a blank name', ctx.makerCommissionPct('') === 20);
}

console.log('\nWhat commission must never touch');
{
  // A reading or a deposit has no supplier behind it, so it never reaches the
  // payout table at all - and must not have a cut taken of it either.
  const rows = figures({
    commPct: 20,
    sales: [sale({ id: 'a', misc: true, maker: '', barcode: 'MISC',
                   name: 'Tarot reading', price: 25, net: 25 })],
  });
  check('a misc amount raises no payout row at all', rows.length === 0,
    'rows=' + rows.length);
}

console.log('\nThe money adds up');
{
  const rows = figures({
    commPct: 20, cardPct: 1.69, webPct: 2.5,
    sales: [
      sale({ id: 'a', price: 33.33, net: 33.33 }),
      sale({ id: 'b', pay: 'card', price: 33.33, net: 33.33 }),
      sale({ id: 'c', pay: 'web', price: 33.34, net: 33.34 }),
    ],
  });
  const k = row(rows, 'Kay');
  check('commission is rounded to the penny', k.commission === 20,
    'commission=' + k.commission + ' (20% of 100.00)');
  // Every part is displayed on the report, so every part has to agree with the
  // total or somebody checking the arithmetic by hand will find it wrong.
  const parts = Math.round((k.fromCash + k.fromCard + k.fromWeb + k.fromOther
                            - k.commission) * 100) / 100;
  check('owed is exactly the parts shown on the report', k.owed === parts,
    'owed=' + k.owed + ' parts=' + parts);
  check('the rate is reported so the sheet can name it', k.commissionPct === 20);
}
{
  const p = build({ commPct: 12.5, sales: [sale({ price: 10, net: 10 })] })
    .makerFigures(DAY, DAY);
  check('the shop rate is handed back for the heading', p.commPct === 12.5);
  check('a fractional rate works', p.rows[0].commission === 1.25);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
