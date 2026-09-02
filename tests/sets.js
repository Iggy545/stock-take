// Set prices with more than two items in them.
//
// The rule was always stored as a LIST of partners - it.set = { with:[...] } -
// and the matcher was written against that list, but until v1.38.0 the editor
// could only ever put one barcode in it. Now it can put three, so a set runs to
// four items, and everything downstream has to hold at three and four the way
// it has been holding at two.
//
// Same trick as the other tests: slice the shipped source out of index.html by
// its comment markers and run it in a vm, so what is checked is what ships.
//
// What is worth checking, in the order it can go wrong:
//   1. a rule of three or four is recognised at all, and a broken one is not
//   2. the basket has to hold EVERY member before the price applies, and lets
//      go the moment any one of them leaves
//   3. the saving is split across all the members in proportion to price -
//      that split is what each maker's payout is worked out from, so a set
//      that dumped the whole saving on one of them would take real money off
//      the wrong person
//   4. an item can only be in one set at a time, and two rules that overlap
//      resolve the same way every time
const fs = require('fs');
const vm = require('vm');

const HTML = fs.readFileSync(process.argv[2], 'utf8');

function slice(start, end, what) {
  const a = HTML.indexOf(start), b = HTML.indexOf(end);
  if (a < 0 || b < 0 || b < a) { console.error('could not locate ' + what); process.exit(2); }
  return HTML.slice(a, b);
}

const PRICING = slice(
  '  // ---- Set pricing ----',
  '  function renderTill(){',
  'the set pricing and basket totals');

const ctx = {
  console,
  items: {},
  cart: { lines: [], disc: null, promo: null },
  round2: n => Math.round((Number(n) || 0) * 100) / 100,
  promoExpired: () => false,
};
vm.createContext(ctx);
vm.runInContext(PRICING + `
this.setMembers = setMembers; this.setRules = setRules; this.setRuleFor = setRuleFor;
this.setRuleName = setRuleName; this.setMatches = setMatches; this.cartFigures = cartFigures;
`, ctx);

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

// The shop's own shape: three makers, so a saving split wrongly shows up as
// money moving between people rather than as a rounding wobble.
function stock() {
  ctx.items = {
    A: { name: 'Bracelet',  price: 20, maker: 'Claire', qty: 5 },
    B: { name: 'Earrings',  price: 30, maker: 'Marie',  qty: 5 },
    C: { name: 'Necklace',  price: 50, maker: 'Kay',    qty: 5 },
    D: { name: 'Ring',      price: 40, maker: 'Claire', qty: 5 },
    E: { name: 'Pendant',   price: 10, maker: 'Marie',  qty: 5 },
  };
}
function line(bc, qty, disc) {
  const it = ctx.items[bc];
  return { barcode: bc, name: it.name, price: it.price, maker: it.maker,
           qty: qty == null ? 1 : qty, disc: disc || null };
}
function basket(lines) { ctx.cart = { lines: lines, disc: null, promo: null }; }

/* ---------- 1. a rule of three and four is recognised ---------- */

console.log('\nWhat counts as a set');
{
  stock();
  ctx.items.A.set = { with: ['B', 'C'], price: 85 };
  const m = ctx.setMembers('A');
  check('three members come back, the owner first', JSON.stringify(m) === '["A","B","C"]', JSON.stringify(m));
  check('the rule is found from the owner', (ctx.setRuleFor('A') || {}).owner === 'A');
  check('and from a partner, which is not where it is stored',
        (ctx.setRuleFor('C') || {}).owner === 'A');
  check('it is named in full, not as a pair',
        ctx.setRuleName(ctx.setRuleFor('B')) === 'Bracelet + Earrings + Necklace',
        ctx.setRuleName(ctx.setRuleFor('B')));

  stock();
  ctx.items.A.set = { with: ['B', 'C', 'D'], price: 120 };
  check('four members come back', JSON.stringify(ctx.setMembers('A')) === '["A","B","C","D"]');
  check('there is exactly one rule for the four', ctx.setRules().length === 1);
}

console.log('\nWhat does not count');
{
  stock();
  ctx.items.A.set = { with: ['B', 'B'], price: 40 };
  check('the same item twice is not a set', ctx.setMembers('A') === null);

  stock();
  ctx.items.A.set = { with: ['B', 'A'], price: 40 };
  // The owner naming itself leaves a real pair behind, not a set of three.
  check('an owner listed among its own partners is dropped, not counted twice',
        JSON.stringify(ctx.setMembers('A')) === '["A","B"]', JSON.stringify(ctx.setMembers('A')));

  stock();
  ctx.items.A.set = { with: ['B', 'ZZZ'], price: 40 };
  check('a set with a deleted item in it is no set at all', ctx.setMembers('A') === null);

  stock();
  ctx.items.A.set = { with: ['B', 'C'], price: 0 };
  check('a set with no price is not a usable rule', ctx.setRules().length === 0);

  stock();
  ctx.items.A.set = { with: [], price: 40 };
  check('a set of one is just a price', ctx.setMembers('A') === null);
}

/* ---------- 2. all of it, or none of it ---------- */

console.log('\nThe basket has to hold every member');
{
  stock();
  ctx.items.A.set = { with: ['B', 'C'], price: 85 };   // apart 100, saving 15

  basket([line('A'), line('B')]);
  check('two of the three is not the set', ctx.cartFigures().setDisc === 0);

  basket([line('A'), line('B'), line('C')]);
  const f = ctx.cartFigures();
  check('all three is', f.setDisc === 15, String(f.setDisc));
  check('the total is the set price', f.total === 85, String(f.total));
  check('the till is told which set matched', f.sets.length === 1 &&
        f.sets[0].name === 'Bracelet + Earrings + Necklace', JSON.stringify(f.sets));

  basket([line('A'), line('B'), line('C'), line('E')]);
  check('an unrelated item alongside it changes nothing about the set',
        ctx.cartFigures().setDisc === 15);
  check('and is still charged for', ctx.cartFigures().total === 95,
        String(ctx.cartFigures().total));

  // Taking the middle one out has to give the saving back. This is the whole
  // reason the basket is re-matched from scratch on every change.
  basket([line('A'), line('C')]);
  check('losing one member takes the whole saving back off', ctx.cartFigures().setDisc === 0);
}

console.log('\nMore than one of the set in the basket');
{
  stock();
  ctx.items.A.set = { with: ['B', 'C'], price: 85 };
  basket([line('A', 2), line('B', 2), line('C', 2)]);
  const f = ctx.cartFigures();
  check('two of each is the set twice', f.setDisc === 30, String(f.setDisc));
  check('and it says so', f.sets[0].count === 2, JSON.stringify(f.sets[0]));

  basket([line('A', 3), line('B', 2), line('C', 2)]);
  check('the shortest member is what limits it', ctx.cartFigures().setDisc === 30,
        String(ctx.cartFigures().setDisc));
  check('the spare one is charged at full price',
        ctx.cartFigures().total === (3 * 20 + 2 * 30 + 2 * 50) - 30,
        String(ctx.cartFigures().total));
}

console.log('\nA line somebody has already discounted by hand sits out');
{
  stock();
  ctx.items.A.set = { with: ['B', 'C'], price: 85 };
  basket([line('A'), line('B', 1, { type: 'amt', value: 5 }), line('C')]);
  check('a keyed-in discount on any member stops the set',
        ctx.cartFigures().setDisc === 0, String(ctx.cartFigures().setDisc));
}

/* ---------- 3. the saving is split across all the members ---------- */

console.log('\nHow the saving is split');
{
  stock();
  // 20 + 30 + 50 = 100, set price 85, saving 15 - split 3 : 4.5 : 7.5
  ctx.items.A.set = { with: ['B', 'C'], price: 85 };
  basket([line('A'), line('B'), line('C')]);
  const per = ctx.cartFigures().setLine;
  check("Claire's share is her item's share of the saving", per[0] === 3, String(per[0]));
  check("Marie's share", per[1] === 4.5, String(per[1]));
  check("Kay's share", per[2] === 7.5, String(per[2]));
  check('the shares add up to the saving',
        ctx.round2(per[0] + per[1] + per[2]) === 15, JSON.stringify(per));
  check('nobody carries the whole saving on their own',
        per.every(v => v > 0), JSON.stringify(per));

  // A saving that does not divide by three. The last member takes the
  // remainder, so the shares still add up to the penny.
  stock();
  ctx.items.A.price = 10; ctx.items.B.price = 10; ctx.items.C.price = 10;
  ctx.items.A.set = { with: ['B', 'C'], price: 29.99 };
  basket([line('A'), line('B'), line('C')]);
  const p2 = ctx.cartFigures().setLine;
  check('an awkward saving still adds up to the penny',
        ctx.round2(p2[0] + p2[1] + p2[2]) === 0.01, JSON.stringify(p2));
  check('and the basket total is exactly the set price',
        ctx.cartFigures().total === 29.99, String(ctx.cartFigures().total));

  // Four members, so the loop that walks them is exercised past three.
  stock();
  ctx.items.A.set = { with: ['B', 'C', 'D'], price: 120 };   // apart 140, saving 20
  basket([line('A'), line('B'), line('C'), line('D')]);
  const p4 = ctx.cartFigures().setLine;
  check('a set of four saves what it says', ctx.cartFigures().setDisc === 20);
  check('and splits four ways with nothing lost',
        ctx.round2(p4.reduce((t, v) => t + v, 0)) === 20 && p4.every(v => v > 0),
        JSON.stringify(p4));
  check('the four-item total is the set price', ctx.cartFigures().total === 120,
        String(ctx.cartFigures().total));
}

/* ---------- 4. sets that overlap ---------- */

console.log('\nTwo rules that want the same item');
{
  stock();
  // A+B+C at 85 saves 15. C+D at 80 saves 10. Both want C; the bigger saving
  // takes it, and it has to be the bigger one every time rather than whichever
  // rule the stock list happened to reach first.
  ctx.items.A.set = { with: ['B', 'C'], price: 85 };
  ctx.items.D.set = { with: ['C'], price: 80 };
  basket([line('A'), line('B'), line('C'), line('D')]);
  const f = ctx.cartFigures();
  check('only one of them applies', f.sets.length === 1, JSON.stringify(f.sets));
  check('and it is the one that saves the customer more', f.setDisc === 15, String(f.setDisc));
  check('the item left over is charged in full',
        f.total === (20 + 30 + 50 + 40) - 15, String(f.total));

  // Reversed in the stock list. Object key order is what setRules() walks, so
  // this is the run that would catch a sort that was not really sorting.
  ctx.items = {
    D: ctx.items.D, C: ctx.items.C, B: ctx.items.B, A: ctx.items.A, E: ctx.items.E,
  };
  basket([line('A'), line('B'), line('C'), line('D')]);
  check('the stock list order does not change the answer',
        ctx.cartFigures().setDisc === 15, String(ctx.cartFigures().setDisc));
}

console.log('\nA set price that is not a saving');
{
  stock();
  ctx.items.A.set = { with: ['B', 'C'], price: 100 };   // exactly what they cost apart
  basket([line('A'), line('B'), line('C')]);
  check('a set price equal to the parts is ignored', ctx.cartFigures().setDisc === 0);

  ctx.items.A.set = { with: ['B', 'C'], price: 120 };   // dearer than apart
  basket([line('A'), line('B'), line('C')]);
  check('a set price above the parts never charges more', ctx.cartFigures().setDisc === 0);
  check('and the customer pays the ordinary prices',
        ctx.cartFigures().total === 100, String(ctx.cartFigures().total));

  // The saving is worked out from the prices ON THE LINES, because a line
  // captures its price when it goes in the basket.
  stock();
  ctx.items.A.set = { with: ['B', 'C'], price: 85 };
  const l = [line('A'), line('B'), line('C')];
  l[2].price = 30;                       // was 50 when it was scanned
  basket(l);
  // On the lines they now come to 80, so a set price of 85 is no saving and
  // the rule stands down - even though the stock record still says 100.
  check('the saving follows the price on the line, not the stock record',
        ctx.cartFigures().setDisc === 0, String(ctx.cartFigures().setDisc));
  check('and the customer pays what the lines say', ctx.cartFigures().total === 80,
        String(ctx.cartFigures().total));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
