// Mix-and-match deals: "any 2 of these 12 for £20".
//
// A deal is not a set. A set names its members and applies when ALL of them are
// in the basket; a deal names a group and applies to any `pick` of them, so the
// basket has to CHOOSE. That choice is the whole risk in this feature: it
// decides which maker's item is discounted, and therefore whose payout carries
// the saving. Left to stock-list order it would be arbitrary and unrepeatable.
// The rule is dearest-first, and most of what follows is there to hold it.
//
// Same trick as the other tests: slice the shipped source out of index.html by
// its comment markers and run it in a vm, so what is checked is what ships.
//
// What is worth checking, in the order it can go wrong:
//   1. what counts as a deal at all, and what is quietly not one
//   2. DEAREST FIRST, including the ties, so the same basket always resolves
//      the same way and the same maker is charged for it
//   3. the remainder: three eligible items is one deal and one full price
//   4. the split across the members, to the penny - that split is what each
//      maker's payout is worked out from
//   5. a set and a deal reaching for the same item: exactly one may have it
//   6. the things that sit out - hand discounts, misc amounts, expiry
//   7. a deal whose members disagree REFUSING, and saying so
//   8. the nudge, which is the only reason staff can offer a deal at all
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
  'the set pricing, deal pricing and basket totals');

// The stock-list badge sits with the other badges, well away from the pricing.
const BADGE = slice(
  '  // The DEAL badge, beside SET.',
  '  function webTodos(){',
  'the DEAL badge');

// promoExpired is deliberately settable: expiry is one of the things being
// checked, and the real one lives outside this block.
let EXPIRED = false;
const ctx = {
  console,
  items: {},
  cart: { lines: [], disc: null, promo: null },
  round2: n => Math.round((Number(n) || 0) * 100) / 100,
  promoExpired: () => EXPIRED,
  money: n => '£' + (Math.round((Number(n) || 0) * 100) / 100).toFixed(2),
  escapeAttr: v => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
                            .replace(/</g, '&lt;').replace(/>/g, '&gt;'),
};
vm.createContext(ctx);
vm.runInContext(PRICING + BADGE + `
this.dealBadgeHtml = dealBadgeHtml;
this.dealKey = dealKey; this.dealRules = dealRules; this.dealRuleFor = dealRuleFor;
this.dealRuleName = dealRuleName; this.basketOffers = basketOffers;
this.setMatches = setMatches; this.cartFigures = cartFigures;
`, ctx);

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

// Three makers, and prices deliberately not round, so a saving split wrongly
// shows up as money moving between people rather than as a rounding wobble.
function stock() {
  EXPIRED = false;
  ctx.items = {
    A: { name: 'Pendant',  price: 14, maker: 'Claire' },
    B: { name: 'Cluster',  price: 12, maker: 'Marie'  },
    C: { name: 'Necklace', price: 30, maker: 'Kay'    },
    D: { name: 'Charm',    price: 9,  maker: 'Claire' },
    E: { name: 'Ring',     price: 40, maker: 'Marie'  },
    F: { name: 'Bangle',   price: 25, maker: 'Kay'    },
  };
}
// Put the named barcodes into one deal. Written across every member in one go,
// exactly the way the bulk editor does it.
function deal(bcs, tag, pick, price, expires) {
  bcs.forEach(bc => {
    ctx.items[bc].dealTag = tag;
    ctx.items[bc].dealPick = pick;
    ctx.items[bc].dealPrice = price;
    if (expires) ctx.items[bc].dealExpires = expires;
  });
}
function line(bc, qty, disc) {
  const it = ctx.items[bc];
  return { barcode: bc, name: it.name, price: it.price, maker: it.maker,
           qty: qty == null ? 1 : qty, disc: disc || null };
}
function basket(lines) { ctx.cart = { lines: lines, disc: null, promo: null }; }
function sum(a) { return ctx.round2(a.reduce((t, n) => t + n, 0)); }
// Read the first deal / first nudge through these, never off the array. A copy
// that fires nothing must FAIL the check it is asked about, not throw and take
// every check after it down as well - which is how a broken build can come out
// looking quieter than a working one.
function deal0(o) { return (o.deals && o.deals[0]) || {}; }
function nudge0(o) { return (o.nudges && o.nudges[0]) || {}; }

/* ---------- 1. what counts as a deal ---------- */

console.log('\nWhat counts as a deal');
{
  stock();
  deal(['A', 'B', 'C', 'D'], 'Autumn Table', 2, 20);
  const rules = ctx.dealRules();
  check('four items sharing a tag are one deal', rules.length === 1, JSON.stringify(rules.map(r => r.key)));
  check('and it knows all four members', !!rules[0] && rules[0].members.length === 4);
  check('with the terms off the items', rules[0] && rules[0].pick === 2 && rules[0].price === 20);
  check('an item in it can find it', ctx.dealRuleFor('C') && ctx.dealRuleFor('C').key === 'autumn table');
  check('an item outside it cannot', ctx.dealRuleFor('E') === null);
}
{
  stock();
  deal(['A'], 'Lonely', 2, 20);
  check('a deal with fewer members than it asks for never fires',
        ctx.dealRules().length === 0);
}
{
  stock();
  deal(['A', 'B'], 'Silly', 1, 20);
  check('"any 1 for £20" is not a deal', ctx.dealRules().length === 0);
}
{
  stock();
  deal(['A', 'B'], 'Free', 2, 0);
  check('a deal priced at nothing is not a deal', ctx.dealRules().length === 0);
}

/* ---------- the tag is FOLDED, never compared exactly ---------- */
// The website's category menu stopped publishing once already because the till
// re-typed "Crafted gifts" as "Crafted Gifts". A deal tag typed a second way
// would split one offer into two in exactly the same silent manner: both halves
// would look right in the stock list and neither would ever reach `pick`.
console.log('\nA tag typed two ways is still one deal');
{
  stock();
  ctx.items.A.dealTag = 'Autumn Table';
  ctx.items.B.dealTag = 'autumn table';
  ctx.items.C.dealTag = 'Autumn  Table ';
  ['A', 'B', 'C'].forEach(bc => { ctx.items[bc].dealPick = 2; ctx.items[bc].dealPrice = 20; });
  const rules = ctx.dealRules();
  check('three spellings make ONE deal', rules.length === 1, JSON.stringify(rules.map(r => r.key)));
  check('and it has all three members', rules[0] && rules[0].members.length === 3);
  check('folding is case and space insensitive',
        ctx.dealKey(' Autumn   TABLE ') === ctx.dealKey('autumn table'));
  check('the name shown is one of the real spellings',
        rules[0] && ['Autumn Table', 'autumn table', 'Autumn  Table'].indexOf(rules[0].name) > -1,
        rules[0] && rules[0].name);
}

/* ---------- 2. dearest first ---------- */
// The rule that decides whose money it is.
console.log('\nDearest first');
{
  stock();
  deal(['A', 'B', 'C', 'D'], 'Autumn Table', 2, 20);
  basket([line('A'), line('B'), line('C')]);       // 14, 12, 30
  const o = ctx.basketOffers(ctx.cart.lines);
  // C (30) + A (14) = 44 for 20, so 24 off. B is left at full price.
  check('one deal fires', o.deals.length === 1 && o.deals[0].count === 1);
  check('the saving is off the DEAREST two', ctx.round2(o.dealLine[2] + o.dealLine[0]) === 24,
        JSON.stringify(o.dealLine));
  check('and the cheapest is left alone', o.dealLine[1] === 0);
  check('total saving is right', sum(o.dealLine) === 24);
}
{
  // The same basket built in the other order must give the same answer, or the
  // maker who pays depends on the order things were scanned in.
  stock();
  deal(['A', 'B', 'C', 'D'], 'Autumn Table', 2, 20);
  basket([line('C'), line('B'), line('A')]);
  const o = ctx.basketOffers(ctx.cart.lines);
  check('scan order does not change who is charged',
        o.dealLine[1] === 0 && ctx.round2(o.dealLine[0] + o.dealLine[2]) === 24,
        JSON.stringify(o.dealLine));
}
{
  // Two items at the same price: the answer must still be the same every time.
  stock();
  ctx.items.B.price = 14;
  deal(['A', 'B', 'D'], 'Autumn Table', 2, 20);
  basket([line('A'), line('B'), line('D')]);       // 14, 14, 9
  const o = ctx.basketOffers(ctx.cart.lines);
  check('a tie falls to the earlier line', o.dealLine[0] > 0 && o.dealLine[1] > 0 && o.dealLine[2] === 0,
        JSON.stringify(o.dealLine));
}

/* ---------- 3. remainders and repeats ---------- */
console.log('\nHow many times it fires');
{
  stock();
  deal(['A', 'B', 'C', 'D'], 'Autumn Table', 2, 20);
  basket([line('A'), line('B'), line('C'), line('D')]);   // 14, 12, 30, 9
  const o = ctx.basketOffers(ctx.cart.lines);
  // dearest first: C(30)+A(14)=44 -> 24 off. Then B(12)+D(9)=21 -> 1 off.
  check('four eligible items fire it twice', deal0(o).count === 2);
  check('and the whole saving is 25', sum(o.dealLine) === 25, String(sum(o.dealLine)));
  check('every line carries some of it', o.dealLine.every(v => v > 0), JSON.stringify(o.dealLine));
}
{
  stock();
  deal(['A', 'B', 'C', 'D'], 'Autumn Table', 2, 20);
  basket([line('A'), line('B'), line('C')]);
  const o = ctx.basketOffers(ctx.cart.lines);
  check('three eligible items fire it once', deal0(o).count === 1);
  check('and leave one at full price', o.dealLine.filter(v => v === 0).length === 1);
}
{
  // A line of three is three chances at the deal, not one.
  stock();
  deal(['A', 'B'], 'Autumn Table', 2, 20);
  basket([line('A', 3)]);                          // 14 each
  const o = ctx.basketOffers(ctx.cart.lines);
  check('a line of three fires a 2-for deal once', deal0(o).count === 1);
  check('and takes 8 off (28 for 20)', sum(o.dealLine) === 8, String(sum(o.dealLine)));
  check('with one unit left over, so it nudges', o.nudges.length === 1);
}
{
  stock();
  deal(['A', 'B'], 'Autumn Table', 2, 20);
  basket([line('A', 4)]);
  const o = ctx.basketOffers(ctx.cart.lines);
  check('a line of four fires it twice', deal0(o).count === 2);
  check('and nothing is left to nudge about', o.nudges.length === 0);
}
{
  // A deal that is not a saving must never charge MORE.
  stock();
  deal(['B', 'D'], 'Autumn Table', 2, 20);
  basket([line('B'), line('D')]);                  // 12 + 9 = 21... just saves 1
  let o = ctx.basketOffers(ctx.cart.lines);
  check('a deal worth £1 still applies', sum(o.dealLine) === 1);
  ctx.items.D.price = 5;
  basket([line('B'), line('D')]);                  // 12 + 5 = 17, under the deal price
  o = ctx.basketOffers(ctx.cart.lines);
  check('a deal that would cost the customer more is ignored', sum(o.dealLine) === 0);
  check('and nothing claims to have fired', o.deals.length === 0);
}

/* ---------- 4. the split, to the penny ---------- */
// This is the number each maker's payout is worked out from. A deal that
// dumped the whole saving on one member would take real money off one person
// and hand it to another, and nothing on the receipt would look wrong.
console.log('\nSplitting the saving between the makers');
{
  stock();
  deal(['A', 'C'], 'Autumn Table', 2, 20);
  basket([line('A'), line('C')]);                  // 14 + 30 = 44, save 24
  const o = ctx.basketOffers(ctx.cart.lines);
  check('the parts add up to the whole', sum(o.dealLine) === 24, JSON.stringify(o.dealLine));
  // 24 x 30/44 = 16.36 to the dearest, the remainder to the other.
  const dear = o.dealLine[1], cheap = o.dealLine[0];
  check('the dearer item carries the bigger share', dear > cheap, dear + ' vs ' + cheap);
  check('the share is proportional to price', dear === 16.36, String(dear));
  check('and the last one takes the remainder exactly', cheap === 7.64, String(cheap));
}
{
  // Three-for-a-price, so the remainder is not just "the other one".
  stock();
  deal(['A', 'B', 'C'], 'Autumn Table', 3, 50);
  basket([line('A'), line('B'), line('C')]);       // 14 + 12 + 30 = 56, save 6
  const o = ctx.basketOffers(ctx.cart.lines);
  check('a deal of three fires', o.deals.length === 1 && o.deals[0].count === 1);
  check('and the split still adds up', sum(o.dealLine) === 6, JSON.stringify(o.dealLine));
  check('every member carries a share', o.dealLine.every(v => v > 0));
}

/* ---------- 5. a set and a deal reaching for the same item ---------- */
// One availability pool for both. Without it an item is discounted twice and
// the shop hands over stock for less than either offer promised.
console.log('\nA set and a deal wanting the same item');
{
  stock();
  ctx.items.A.set = { with: ['E'], price: 40 };    // A(14) + E(40) = 54 for 40, saves 14
  deal(['A', 'B', 'C'], 'Autumn Table', 2, 20);
  basket([line('A'), line('E'), line('B')]);
  const o = ctx.basketOffers(ctx.cart.lines);
  check('the set fires', o.sets.length === 1 && sum(o.setLine) === 14);
  check('and the deal cannot have A as well', o.dealLine[0] === 0, JSON.stringify(o.dealLine));
  check('so the deal does not fire at all', o.deals.length === 0);
  check('A is discounted once, not twice',
        ctx.round2(o.setLine[0] + o.dealLine[0]) === o.disc[0]);
}
{
  // Two of the deal's members, one of which is also in a set with an item that
  // is NOT in the basket - so the set cannot fire and must not block the deal.
  stock();
  ctx.items.A.set = { with: ['F'], price: 30 };
  deal(['A', 'B', 'C'], 'Autumn Table', 2, 20);
  basket([line('A'), line('C')]);
  const o = ctx.basketOffers(ctx.cart.lines);
  check('a set that cannot fire does not hold its item back',
        sum(o.dealLine) === 24, JSON.stringify(o.dealLine));
}

/* ---------- 6. what sits out ---------- */
console.log('\nWhat sits out of a deal');
{
  stock();
  deal(['A', 'B', 'C'], 'Autumn Table', 2, 20);
  basket([line('A'), line('C', 1, { type: 'amt', value: 5 })]);
  const o = ctx.basketOffers(ctx.cart.lines);
  check('a hand-discounted line is not swept into a deal', sum(o.dealLine) === 0);
  check('and the deal reports nothing applied', o.deals.length === 0);
}
{
  stock();
  deal(['A', 'B', 'C'], 'Autumn Table', 2, 20);
  const misc = { barcode: 'MISC', name: 'Reading', price: 30, qty: 1, disc: null, misc: true };
  basket([line('A'), misc]);
  const o = ctx.basketOffers(ctx.cart.lines);
  check('a misc amount can never be half of a deal', sum(o.dealLine) === 0);
}
{
  stock();
  deal(['A', 'B', 'C'], 'Autumn Table', 2, 20, '2026-01-01');
  basket([line('A'), line('C')]);
  EXPIRED = true;
  const o = ctx.basketOffers(ctx.cart.lines);
  check('an expired deal does not apply', sum(o.dealLine) === 0);
  check('and does not tag the lines either', o.tagLine.every(t => t === ''));
  check('nor nudge about itself', o.nudges.length === 0);
  EXPIRED = false;
}

/* ---------- 7. members that disagree ---------- */
// The numbers are repeated on every member, so an import or a half-finished
// sync can leave them disagreeing. Charging a price half the items have never
// heard of is worse than not discounting - but going QUIET about it is worse
// than both, because nobody at the counter would ever find out.
console.log('\nA deal whose items disagree');
{
  stock();
  deal(['A', 'B', 'C'], 'Autumn Table', 2, 20);
  ctx.items.C.dealPrice = 22;                      // one item out of step
  basket([line('A'), line('C')]);
  const o = ctx.basketOffers(ctx.cart.lines);
  check('it refuses to apply', sum(o.dealLine) === 0);
  check('and says so out loud', o.warnings.length === 1, JSON.stringify(o.warnings));
  check('naming the deal', o.warnings[0] && /Autumn/i.test(o.warnings[0].name));
  check('the lines are still marked as being in it', o.tagLine[0] !== '');
}
{
  stock();
  deal(['A', 'B', 'C'], 'Autumn Table', 2, 20);
  ctx.items.B.dealPick = 3;
  basket([line('A'), line('C')]);
  const o = ctx.basketOffers(ctx.cart.lines);
  check('disagreeing about HOW MANY also refuses', sum(o.dealLine) === 0);
  check('and is reported', o.warnings.length === 1);
}

/* ---------- 8. the nudge ---------- */
// Twelve members scattered round the shop is more than anyone can hold in their
// head. Without this the deal only ever fires by accident.
console.log('\nOne item short');
{
  stock();
  deal(['A', 'B', 'C', 'D'], 'Autumn Table', 2, 20);
  basket([line('A')]);
  const o = ctx.basketOffers(ctx.cart.lines);
  check('one of a pair deal nudges', o.nudges.length === 1);
  check('asking for one more', nudge0(o).need === 1);
  check('and naming the terms, not a promised figure',
        nudge0(o).pick === 2 && nudge0(o).price === 20 && nudge0(o).saving === undefined);
  check('the line is tagged even though nothing fired', o.tagLine[0] === 'Autumn Table');
  check('but no money comes off', sum(o.dealLine) === 0);
}
{
  stock();
  deal(['A', 'B', 'C'], 'Autumn Table', 3, 50);
  basket([line('A')]);
  const o = ctx.basketOffers(ctx.cart.lines);
  check('a deal of three, one in the basket, asks for two more', nudge0(o).need === 2);
}
{
  stock();
  deal(['A', 'B', 'C'], 'Autumn Table', 2, 20);
  basket([line('A'), line('C')]);
  const o = ctx.basketOffers(ctx.cart.lines);
  check('a deal that fired does not also nudge', o.nudges.length === 0);
}
{
  stock();
  deal(['A', 'B', 'C'], 'Autumn Table', 2, 20);
  basket([line('E')]);                             // nothing to do with the deal
  const o = ctx.basketOffers(ctx.cart.lines);
  check('an unrelated basket is not nudged at', o.nudges.length === 0);
  check('and carries no tag', o.tagLine[0] === '');
}

/* ---------- 9. the basket totals ---------- */
console.log('\nWhat the customer pays');
{
  stock();
  deal(['A', 'B', 'C'], 'Autumn Table', 2, 20);
  basket([line('A'), line('C')]);                  // 44 -> 20
  const f = ctx.cartFigures();
  check('subtotal is the full prices', f.subtotal === 44);
  check('the deal is reported on its own', f.dealDisc === 24);
  check('separately from set prices', f.setDisc === 0);
  check('and the total is the deal price', f.total === 20);
  check('discounts add up to what came off', f.discounts === 24);
  check('the per-line figures agree with the total', sum(f.dealLine) === f.dealDisc);
}
{
  // A basket percentage comes off AFTER the deal, not instead of it.
  stock();
  deal(['A', 'B', 'C'], 'Autumn Table', 2, 20);
  basket([line('A'), line('C')]);
  ctx.cart.disc = { type: 'pct', value: 10 };
  const f = ctx.cartFigures();
  check('a basket discount works on the deal price', f.basketDisc === 2, String(f.basketDisc));
  check('so the customer pays £18', f.total === 18, String(f.total));
}
{
  // A set and a deal in one basket, both reported and both charged once.
  stock();
  ctx.items.E.set = { with: ['F'], price: 55 };    // 40 + 25 = 65 for 55, saves 10
  deal(['A', 'B', 'C'], 'Autumn Table', 2, 20);
  basket([line('E'), line('F'), line('A'), line('C')]);
  const f = ctx.cartFigures();
  check('the set is counted', f.setDisc === 10);
  check('the deal is counted', f.dealDisc === 24);
  check('they are kept apart', f.setDisc + f.dealDisc === f.discounts);
  check('and the total is right', f.total === ctx.round2(109 - 34), String(f.total));
}
{
  stock();
  basket([]);
  const o = ctx.basketOffers(ctx.cart.lines);
  check('an empty basket is safe', o.deals.length === 0 && o.nudges.length === 0);
}

/* ---------- 10. the set half is untouched ---------- */
// setMatches() is now a view onto the same machinery. Everything downstream
// still calls it, so it has to keep behaving exactly as it did.
console.log('\nSet prices still work the old way');
{
  stock();
  ctx.items.A.set = { with: ['C'], price: 30 };    // 44 for 30, saves 14
  basket([line('A'), line('C')]);
  const sm = ctx.setMatches(ctx.cart.lines);
  check('setMatches still returns a per-line saving', sum(sm.disc) === 14);
  check('and what was applied', sm.applied.length === 1 && sm.applied[0].count === 1);
  check('with no deal fields anywhere near it', sm.dealLine === undefined);
}

/* ---------- 11. the stock-list badge ---------- */
// The operator's guide tells staff that if a deal does not come off they should
// tell the owner, "who can put the deal right in Stock". That promise is only
// worth anything if the Stock list actually SHOWS which deal is broken - so the
// badge has to have more than one thing it can say.
console.log('\nThe DEAL badge in the stock list');
{
  stock();
  deal(['A', 'B', 'C'], 'Autumn Table', 2, 20);
  const r = ctx.dealRuleFor('A');
  const html = ctx.dealBadgeHtml(r);
  check('an item in a deal gets a badge', html.indexOf('deal-badge') > -1, html);
  check('it says DEAL', html.indexOf('DEAL') > -1);
  check('a working one is not marked broken', html.indexOf('broken') === -1);
  check('nor ended', html.indexOf('ended') === -1);
  check('the tooltip names the offer', html.indexOf('Autumn Table') > -1);
  check('and its terms', html.indexOf('any 2 for') > -1, html);
  check('and how many items are in it', html.indexOf('(3 items)') > -1, html);
}
{
  stock();
  check('an item in no deal gets no badge', ctx.dealBadgeHtml(null) === '');
}
{
  // The one that matters: the case the counter is told to report.
  stock();
  deal(['A', 'B', 'C'], 'Autumn Table', 2, 20);
  ctx.items.C.dealPrice = 22;
  const html = ctx.dealBadgeHtml(ctx.dealRuleFor('A'));
  check('a deal whose items disagree is badged BROKEN', html.indexOf('broken') > -1, html);
  check('and says so in the tooltip', /NOT APPLYING/.test(html), html);
  check('and tells the owner how to fix it', /set the deal again/i.test(html), html);
}
{
  stock();
  deal(['A', 'B', 'C'], 'Autumn Table', 2, 20, '2020-01-01');
  EXPIRED = true;
  const html = ctx.dealBadgeHtml(ctx.dealRuleFor('A'));
  check('an expired deal is still badged, so it can be found and cleared',
        html.indexOf('deal-badge') > -1);
  check('but marked as ended', html.indexOf('ended') > -1, html);
  check('with the date it ended', html.indexOf('2020-01-01') > -1, html);
  EXPIRED = false;
}
{
  // A tag with a quote in it must not be able to break out of the attribute.
  stock();
  deal(['A', 'B'], 'Bob"s <b>Deal</b>', 2, 20);
  const html = ctx.dealBadgeHtml(ctx.dealRuleFor('A'));
  check('a tag cannot break out of the title attribute',
        html.indexOf('Bob"s') === -1 && html.indexOf('<b>') === -1, html);
  check('it is escaped instead', html.indexOf('&quot;') > -1 && html.indexOf('&lt;b&gt;') > -1);
}

/* ---------- 12. the Stock tab's offers filter ---------- */
// "Show me everything that is in a deal or a set." Both are rules that live ON
// items rather than anywhere listable, so without this the only way to audit an
// offer was to scroll the whole shop looking for badges - which is exactly the
// job somebody has when a red badge says a deal is broken and they need to find
// the rest of its members.
//
// renderList draws the DOM and cannot be sliced, so what is checked here is the
// decision inside it: which barcodes survive, in what order, and the guard. The
// check below holds the shipped source against these copies, so if renderList
// changes its mind and this file does not, something fails.
console.log('\nThe offers filter in the Stock tab');

function offerMaps() {
  const setOf = {}, dealOf = {};
  ctx.setRules().forEach(r => r.members.forEach(m => { if (!setOf[m]) setOf[m] = r; }));
  ctx.dealRules().forEach(r => r.members.forEach(m => { if (!dealOf[m]) dealOf[m] = r; }));
  return { setOf, dealOf };
}
// The same two expressions renderList uses.
function inAnOffer(bc, m) { return !!(m.setOf[bc] || m.dealOf[bc]); }
function anyOffers(m) { return Object.keys(m.setOf).length > 0 || Object.keys(m.dealOf).length > 0; }
function groupSorted(bcs, m) {
  const groupOf = bc => (m.setOf[bc] ? 's:' + ctx.setRuleName(m.setOf[bc])
                                     : (m.dealOf[bc] ? 'd:' + m.dealOf[bc].key : ''));
  return bcs.slice().sort((a, b) =>
    groupOf(a).localeCompare(groupOf(b)) ||
    ctx.items[a].name.localeCompare(ctx.items[b].name));
}

{
  stock();
  deal(['A', 'B', 'C'], 'Autumn Table', 2, 20);
  ctx.items.E.set = { with: ['F'], price: 55 };
  const m = offerMaps();
  const kept = Object.keys(ctx.items).filter(bc => inAnOffer(bc, m));
  check('it keeps the deal members', ['A', 'B', 'C'].every(bc => kept.indexOf(bc) > -1));
  check('and both halves of a set', kept.indexOf('E') > -1 && kept.indexOf('F') > -1);
  check('and nothing else', kept.length === 5, JSON.stringify(kept));
  check('an item in neither is left out', kept.indexOf('D') === -1);
}
{
  // A set and a deal in one shop must not interleave: the point of the list is
  // to be able to say "these three are the autumn offer".
  stock();
  deal(['A', 'C'], 'Autumn Table', 2, 20);
  ctx.items.B.set = { with: ['D'], price: 30 };
  const m = offerMaps();
  const kept = groupSorted(Object.keys(ctx.items).filter(bc => inAnOffer(bc, m)), m);
  const groups = kept.map(bc => (m.setOf[bc] ? 'set' : 'deal'));
  const firstDeal = groups.indexOf('deal'), lastDeal = groups.lastIndexOf('deal');
  const firstSet = groups.indexOf('set'), lastSet = groups.lastIndexOf('set');
  check('the members of one offer land together',
        lastDeal - firstDeal === 1 && lastSet - firstSet === 1, JSON.stringify(groups));
  check('sorted by name inside an offer',
        ctx.items[kept[firstDeal]].name < ctx.items[kept[lastDeal]].name);
}
{
  // The guard. A filter that outlives the last offer empties the shop for
  // somebody who can no longer see the control that emptied it.
  stock();
  check('with no offers at all the button does not belong on screen',
        anyOffers(offerMaps()) === false);
  deal(['A', 'B'], 'Autumn Table', 2, 20);
  check('one deal is enough to earn it', anyOffers(offerMaps()) === true);
  stock();
  ctx.items.A.set = { with: ['B'], price: 25 };
  check('so is one set', anyOffers(offerMaps()) === true);
}
{
  // A broken deal still counts as an offer - finding its members is the whole
  // reason somebody reaches for this filter.
  stock();
  deal(['A', 'B', 'C'], 'Autumn Table', 2, 20);
  ctx.items.C.dealPrice = 22;
  const m = offerMaps();
  check('a deal that refuses to apply is still findable',
        ['A', 'B', 'C'].every(bc => inAnOffer(bc, m)));
}
{
  // An expired deal too, or its items keep a dead tag nobody can locate.
  stock();
  deal(['A', 'B'], 'Autumn Table', 2, 20, '2020-01-01');
  EXPIRED = true;
  const m = offerMaps();
  check('an expired deal is still findable', inAnOffer('A', m) && inAnOffer('B', m));
  EXPIRED = false;
}

// The copies above are only worth anything if they are still what ships.
{
  const src = HTML;
  check('renderList still filters on setOf/dealOf the way this test does',
        src.indexOf('const inAnOffer = bc => !!(setOf[bc] || dealOf[bc]);') > -1);
  check('and still decides the button on the same test',
        src.indexOf('const anyOffers = Object.keys(setOf).length > 0 || Object.keys(dealOf).length > 0;') > -1);
  check('and still turns the filter off when the last offer goes',
        src.indexOf('if(!anyOffers) offersOnly = false;') > -1);
  check('and still lists a filtered shop flat',
        src.indexOf('if(q || offersOnly){') > -1);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
