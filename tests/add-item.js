// Runs the REAL newItemRecord out of index.html. Same trick as the others:
// slice the shipped source out by its comment markers and run it in a vm, so
// what is tested is what ships rather than a copy that can drift.
const fs = require('fs');
const vm = require('vm');

const HTML = fs.readFileSync(process.argv[2], 'utf8');
const START = '  function newItemRecord(f){';
const END = "  document.getElementById('manualWebOn')";
const a = HTML.indexOf(START), b = HTML.indexOf(END);
if (a < 0 || b < 0) { console.error('could not locate newItemRecord'); process.exit(2); }
const SRC = HTML.slice(a, b);

const ctx = { console };
vm.createContext(ctx);
vm.runInContext(SRC + '\nthis.newItemRecord = newItemRecord;', ctx);
const newItemRecord = ctx.newItemRecord;

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

const base = {
  name: 'Rose Quartz Bracelet',
  qty: '3',
  maker: 'Kay',
  price: '12.50',
  folder: 'Kay/Jewellery',
  photo: 'https://images.sumup.com/img_X/image.png',
};

console.log('\nThe starting count');
{
  const it = newItemRecord({ ...base, qty: '3' });
  check('counted matches the starting quantity', it.counted === 3, 'counted=' + it.counted);
  check('qty is kept as well', it.qty === 3, 'qty=' + it.qty);
  // This is the whole point of the change. counted 0 meant the website showed
  // every brand new product as sold out the moment it was added.
  check('a new item is NOT born sold out', it.counted > 0);
}
{
  const it = newItemRecord({ ...base, qty: '' });
  check('no quantity given means zero, not NaN', it.counted === 0 && it.qty === 0);
}
{
  const it = newItemRecord({ ...base, qty: '-4' });
  check('a negative quantity is floored at zero', it.counted === 0 && it.qty === 0);
}
{
  const it = newItemRecord({ ...base, qty: '2.9' });
  check('a fractional quantity is whole', it.counted === 2 && it.qty === 2);
}

console.log('\nThe website flag');
{
  const it = newItemRecord({ ...base, web: true });
  check('ticked sets web to 1', it.web === 1);
  // Absent means "never listed", which is what puts it on the website list as
  // one to add to the SumUp store. Setting these would silently claim the
  // store already has it.
  check('webQty is left absent', !('webQty' in it));
  check('webPrice is left absent', !('webPrice' in it));
}
{
  const it = newItemRecord({ ...base, web: false });
  check('unticked leaves no web field at all', !('web' in it));
  check('unticked writes no description either', !('webDesc' in it));
}
{
  const it = newItemRecord({ ...base, web: true, webDesc: '  A hand-knotted bracelet.  ' });
  check('the description is trimmed', it.webDesc === 'A hand-knotted bracelet.');
}
{
  const it = newItemRecord({ ...base, web: true, webDesc: '   ' });
  check('a blank description is not stored', !('webDesc' in it));
}

console.log('\nThe rest of the record');
{
  const it = newItemRecord(base);
  check('name is trimmed', newItemRecord({ ...base, name: '  X  ' }).name === 'X');
  check('maker is trimmed', newItemRecord({ ...base, maker: ' Kay ' }).maker === 'Kay');
  check('price becomes a number', it.price === 12.5, 'price=' + it.price);
  check('a missing price is 0, not NaN', newItemRecord({ ...base, price: '' }).price === 0);
  check('folder is carried', it.folder === 'Kay/Jewellery');
  check('photo is carried', it.photo === base.photo);
  check('addedAt is set', typeof it.addedAt === 'string' && it.addedAt.length > 10);
}

console.log('\nThe label the shop needs to print');
{
  const it = newItemRecord({ ...base, label: ' Small swing tag ' });
  check('the label is carried and trimmed', it.label === 'Small swing tag', 'label=' + it.label);
  // Absent, not empty: this is a note the shop may never write, and an empty
  // string would show up as a real value in the stock export.
  check('no label means no field at all', !('label' in newItemRecord(base)));
  check('a blank label is not stored', !('label' in newItemRecord({ ...base, label: '   ' })));
  // It is shop business. The website publishes by naming fields, so this could
  // only ever leak by someone adding it to that list - see SHARED.md and
  // shop-worker/test/sets.test.js.
  check('the label is nothing to do with the website fields',
    newItemRecord({ ...base, web: true, label: 'Small swing tag' }).webDesc === undefined);
}

{
  // The record must not sprout fields nobody asked for - the website publishes
  // by naming fields, but the till's own reports do not, so a stray key here
  // travels further than you would think.
  const it = newItemRecord({ ...base, web: true, webDesc: 'x', nonsense: 'should not appear' });
  const expected = ['name', 'qty', 'maker', 'price', 'folder', 'photo', 'counted', 'addedAt', 'web', 'webDesc', 'label'];
  check('no unexpected fields', Object.keys(it).every(k => expected.includes(k)),
    Object.keys(it).filter(k => !expected.includes(k)).join(', '));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
