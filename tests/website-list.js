// Runs the REAL website-list block out of index.html. Same trick as the photo
// tests: slice the shipped source out by its comment markers, run it in a vm.
const fs = require('fs');
const vm = require('vm');

const HTML = fs.readFileSync(process.argv[2], 'utf8');
const START = '  function webListed(it){';
const END = '  function renderWebTodo(){';
const a = HTML.indexOf(START), b = HTML.indexOf(END);
if (a < 0 || b < 0) { console.error('could not locate the website block'); process.exit(2); }
// renderWebBanner touches the DOM; keep it, the stub document handles it.
const SRC = HTML.slice(a, b);

function env(items) {
  const ctx = {
    items,
    money: n => '£' + (Number(n) || 0).toFixed(2),
    document: { getElementById: () => null },
    console
  };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return ctx;
}

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}
const kinds = ts => ts.map(t => t.bc + ':' + t.kind).join(', ');

console.log('\nWhat lands on the list');
{
  const ctx = env({
    SHOPONLY: { name: 'Shop only candle', counted: 4, price: 6 },
    NEWWEB:   { name: 'New pendant', counted: 2, price: 25, web: 1 },
    MATCHES:  { name: 'Matching deck', counted: 3, price: 18, web: 1, webQty: 3, webPrice: 18 },
    QTYDRIFT: { name: 'Sold one', counted: 1, price: 12, web: 1, webQty: 2, webPrice: 12 },
    SOLDOUT:  { name: 'Last angel', counted: 0, price: 30, web: 1, webQty: 1, webPrice: 30 },
    PRICEUP:  { name: 'Repriced ring', counted: 2, price: 40, web: 1, webQty: 2, webPrice: 35 },
    DELIST:   { name: 'Pulled bracelet', counted: 5, price: 9, webQty: 5, webPrice: 9 }
  });
  const t = ctx.webTodos();
  check('shop-only item is never on the list', !t.some(x => x.bc === 'SHOPONLY'));
  check('a matching item is not on the list', !t.some(x => x.bc === 'MATCHES'));
  check('newly marked item asks to be added', t.some(x => x.bc === 'NEWWEB' && x.kind === 'add'));
  check('quantity drift asks for an update', t.some(x => x.bc === 'QTYDRIFT' && x.kind === 'update'));
  check('price change alone asks for an update', t.some(x => x.bc === 'PRICEUP' && x.kind === 'update'));
  check('sold out is its own kind', t.some(x => x.bc === 'SOLDOUT' && x.kind === 'gone'));
  check('unmarked but still listed asks to come down', t.some(x => x.bc === 'DELIST' && x.kind === 'remove'));
  check('five things to do — the other two are settled', t.length === 5, kinds(t));
  check('sold out sorts first', t[0].bc === 'SOLDOUT', kinds(t));
}

console.log('\nThe wording a person actually reads');
{
  const ctx = env({
    A: { name: 'Last angel', counted: 0, price: 30, web: 1, webQty: 1, webPrice: 30 },
    B: { name: 'Sold one', counted: 1, price: 12, web: 1, webQty: 3, webPrice: 12 },
    C: { name: 'Repriced', counted: 2, price: 40, web: 1, webQty: 2, webPrice: 35 },
    D: { name: 'Both changed', counted: 1, price: 40, web: 1, webQty: 2, webPrice: 35 },
    E: { name: 'New one', counted: 2, price: 25, web: 1, photo: 'x' },
    F: { name: 'No photo yet', counted: 1, price: 5, web: 1 }
  });
  const by = {};
  ctx.webTodos().forEach(t => { by[t.bc] = ctx.webTodoText(t); });
  check('sold out says take it down', /take it down/i.test(by.A), by.A);
  check('sold out quotes what the site still says', /still says 1/.test(by.A), by.A);
  check('quantity change shows both numbers', /3 → 1 in stock/.test(by.B), by.B);
  check('price-only change does not mention stock', !/in stock/.test(by.C) && /£35\.00 → £40\.00/.test(by.C), by.C);
  check('both changes are shown together', /2 → 1 in stock · £35\.00 → £40\.00/.test(by.D), by.D);
  check('a new listing quotes stock and price', /Put it on the website — 2 in stock at £25\.00/.test(by.E), by.E);
  check('a new listing flags a missing photo', /no photo yet/.test(by.F), by.F);
}

console.log('\nTicking off');
{
  const ctx = env({
    A: { name: 'Sold one', counted: 1, price: 12, web: 1, webQty: 3, webPrice: 12 },
    B: { name: 'Pulled', counted: 5, price: 9, webQty: 5, webPrice: 9 }
  });
  check('two things to do', ctx.webTodos().length === 2);
  ctx.webMarkDone('A');
  check('ticking off records what the site now shows', ctx.items.A.webQty === 1 && ctx.items.A.webPrice === 12);
  ctx.webMarkDone('B');
  check('ticking off a removal forgets the listing', ctx.items.B.webQty === undefined && ctx.items.B.webPrice === undefined);
  check('nothing left to do', ctx.webTodos().length === 0, kinds(ctx.webTodos()));
}

console.log('\nA sale puts the item straight back on the list');
{
  const ctx = env({ A: { name: 'Angel', counted: 2, price: 30, web: 1, webQty: 2, webPrice: 30 } });
  check('quiet to begin with', ctx.webTodos().length === 0);
  ctx.items.A.counted = 1;                       // sold one at the counter
  check('one thing to do now', ctx.webTodos().length === 1);
  ctx.items.A.counted = 0;                       // sold the last one
  check('and it becomes the urgent kind', ctx.webTodos()[0].kind === 'gone');
}

console.log('\nA webQty of 0 is a real listing, not a missing one');
{
  // The trap: 0 is falsy. An item the website is showing as sold out must not
  // read as "never listed", or it would ask to be added all over again.
  const ctx = env({ A: { name: 'Angel', counted: 0, price: 30, web: 1, webQty: 0, webPrice: 30 } });
  check('showing 0 and having 0 is a match, not an add', ctx.webTodos().length === 0, kinds(ctx.webTodos()));
  const ctx2 = env({ A: { name: 'Angel', counted: 2, price: 30, web: 1, webQty: 0, webPrice: 30 } });
  check('restocked from 0 asks for an update, not an add', ctx2.webTodos()[0].kind === 'update', kinds(ctx2.webTodos()));
}

console.log('\nThe badge map');
{
  const ctx = env({
    A: { name: 'Due', counted: 1, price: 5, web: 1, webQty: 2, webPrice: 5 },
    B: { name: 'Fine', counted: 1, price: 5, web: 1, webQty: 1, webPrice: 5 },
    C: { name: 'Shop only', counted: 1, price: 5 }
  });
  ctx.refreshWebDue();
  check('badge on a web item that is up to date', /web-badge"/.test(ctx.webBadgeHtml('B')), ctx.webBadgeHtml('B'));
  check('solid badge on one that needs doing', /web-badge due"/.test(ctx.webBadgeHtml('A')), ctx.webBadgeHtml('A'));
  check('no badge on a shop-only item', ctx.webBadgeHtml('C') === '');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
