// Runs the REAL item-import block out of index.html. Same trick as the photo
// and website-list tests: slice the shipped source out by its comment markers
// and run it in a vm, so what is tested is what ships.
//
// The two things this has to prove are that an import cannot destroy anything
// already on the device, and that it carries the website fields across —
// without those, importing the shop window puts dozens of false "put it on the
// website" jobs on the website list.
const fs = require('fs');
const vm = require('vm');

const HTML = fs.readFileSync(process.argv[2], 'utf8');
const START = '  function safeImportPhoto(v){';
const END = "  document.getElementById('importItemsBtn')";
const a = HTML.indexOf(START), b = HTML.indexOf(END);
if (a < 0 || b < 0) { console.error('could not locate the import block'); process.exit(2); }
const SRC = HTML.slice(a, b);

function env() {
  const ctx = {
    // The real normFolder, copied in shape only — the import block is what is
    // under test, not folder tidying.
    normFolder: s => String(s || '').split('/').map(p => p.trim()).filter(Boolean).join('/'),
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

const ctx = env();
const { planItemImport, safeImportPhoto, planWebTextUpdate } = ctx;

console.log('\nAdd-only: nothing already here is touched');
{
  const existing = {
    'CA-001': { name: 'Amethyst Wrap Ring', price: 12, counted: 3, photo: 'https://images.sumup.com/a' }
  };
  const plan = planItemImport({
    'CA-001': { name: 'SOMETHING ELSE ENTIRELY', price: 999, counted: 0 },
    'CA-002': { name: 'New pendant', price: 15, counted: 2 }
  }, existing);

  check('the colliding barcode is not in the add set', !plan.add['CA-001']);
  check('it is counted as skipped', plan.skipped === 1, 'skipped=' + plan.skipped);
  check('only the genuinely new one is added', plan.addCount === 1 && !!plan.add['CA-002']);
  check('the existing record is untouched by planning',
    existing['CA-001'].price === 12 && existing['CA-001'].counted === 3);
}

console.log('\nRunning the same file twice does nothing the second time');
{
  const file = { 'CA-002': { name: 'New pendant', price: 15, counted: 2 } };
  const existing = {};
  const first = planItemImport(file, existing);
  Object.keys(first.add).forEach(bc => { existing[bc] = first.add[bc]; });
  const second = planItemImport(file, existing);
  check('first run adds it', first.addCount === 1);
  check('second run adds nothing', second.addCount === 0, 'addCount=' + second.addCount);
  check('second run reports it as already here', second.skipped === 1);
}

console.log('\nWebsite fields travel');
{
  const plan = planItemImport({
    'CA-010': { name: 'Listed thing', price: 10, counted: 2, web: 1, webQty: 2, webPrice: 10, webDesc: 'A longer blurb' },
    'CA-011': { name: 'Sold out online', price: 8, counted: 0, web: 1, webQty: 0, webPrice: 8 },
    'CA-012': { name: 'Shop only', price: 5, counted: 1 }
  }, {});
  const a = plan.add['CA-010'], b = plan.add['CA-011'], c = plan.add['CA-012'];
  check('web flag carried', a.web === 1);
  check('webQty carried', a.webQty === 2);
  check('webPrice carried', a.webPrice === 10);
  check('webDesc carried', a.webDesc === 'A longer blurb');
  // The trap SHARED.md warns about: 0 is a real listing, not an absent one.
  check('webQty of 0 survives as 0, not dropped', b.webQty === 0, 'got ' + JSON.stringify(b.webQty));
  check('a shop-only item gets no web flag', c.web === undefined);
  check('a shop-only item gets no webQty', c.webQty === undefined);
}

console.log('\nPhotos: only data:image and https survive');
{
  check('https kept', safeImportPhoto('https://images.sumup.com/img_x/image.png') !== '');
  check('data:image kept', safeImportPhoto('data:image/jpeg;base64,AAA') !== '');
  check('javascript: dropped', safeImportPhoto('javascript:alert(1)') === '');
  check('data:text/html dropped', safeImportPhoto('data:text/html,<script>alert(1)</script>') === '');
  check('plain http dropped', safeImportPhoto('http://images.sumup.com/x') === '');
  check('non-string dropped', safeImportPhoto({ toString: () => 'https://x' }) === '');

  const plan = planItemImport({
    'CA-020': { name: 'Dodgy photo', price: 1, photo: 'javascript:alert(1)' }
  }, {});
  check('the item still imports, just without the photo', plan.add['CA-020'].photo === '');
  check('and it is reported', plan.droppedPhoto === 1);
}

console.log('\nRubbish in the file is counted, not crashed on');
{
  const plan = planItemImport({
    'CA-030': { name: 'Fine', price: 1 },
    'CA-031': { price: 5 },              // no name
    'CA-032': null,
    'CA-033': 'not an object',
    '': { name: 'No barcode' }
  }, {});
  check('only the good one is added', plan.addCount === 1, 'addCount=' + plan.addCount);
  check('the other four are counted as bad', plan.bad === 4, 'bad=' + plan.bad);
}

console.log('\nName clashes are flagged but not refused');
{
  const plan = planItemImport(
    { 'CA-041': { name: 'Macrame Bracelet', price: 15 } },
    { 'CA-040': { name: 'macrame bracelet', price: 10 } }
  );
  check('it still imports', plan.addCount === 1);
  check('the clash is reported', plan.sameName.length === 1, JSON.stringify(plan.sameName));
}

console.log('\nA whole backup file works as an import source');
{
  const plan = planItemImport({ 'KA-001': { name: 'From a backup', price: 3, counted: 1 } }, {});
  check('items map read straight through', plan.addCount === 1);
}

console.log('\nNot an item map at all');
{
  check('array refused', planItemImport([{ name: 'x' }], {}) === null);
  check('null refused', planItemImport(null, {}) === null);
  check('string refused', planItemImport('nope', {}) === null);
}

console.log('\nWebsite wording: writes only the wording, onto items that exist');
{
  const existing = {
    'CA-001': { name: 'Amethyst Wrap Ring', price: 12, counted: 3,
                photo: 'https://images.sumup.com/a', maker: 'Claire', folder: 'Claire/Jewellery' },
    'CA-002': { name: 'Already described', price: 5, counted: 1, webDesc: 'the same words' }
  };
  const before = JSON.stringify(existing);
  const up = planWebTextUpdate({
    'CA-001': { webDesc: 'Elegant and timeless, this handcrafted ring...' },
    'CA-002': { webDesc: 'the same words' },
    'CA-999': { webDesc: 'no such item here' }
  }, existing);

  check('the one with new wording is queued', up.changeCount === 1 && !!up.change['CA-001']);
  check('an identical description is not a change', up.unchanged === 1, 'unchanged=' + up.unchanged);
  check('a barcode not on the device is counted, not created',
    up.missing === 1 && !up.change['CA-999']);
  check('planning mutates nothing', JSON.stringify(existing) === before);
}

console.log('\nWebsite wording cannot reach anything that matters');
{
  const existing = {
    'CA-001': { name: 'Real name', price: 12, counted: 3, qty: 3,
                photo: 'https://images.sumup.com/a', maker: 'Claire', folder: 'Claire/Jewellery' }
  };
  // A file trying to smuggle in a price cut, a stock wipe and a new photo
  // alongside a legitimate description.
  const up = planWebTextUpdate({
    'CA-001': { webDesc: 'legitimate wording', name: 'HACKED', price: 0.01,
                counted: 0, qty: 0, photo: 'javascript:alert(1)', maker: 'Someone else',
                folder: 'Elsewhere', web: 1, webQty: 99 }
  }, existing);
  const changed = up.change['CA-001'];
  check('the description is taken', changed.webDesc === 'legitimate wording');
  check('only one field is ever written', Object.keys(changed).length === 1,
    JSON.stringify(Object.keys(changed)));
  ['name', 'price', 'counted', 'qty', 'photo', 'maker', 'folder', 'web', 'webQty']
    .forEach(f => check('  ' + f + ' is not writable this way', changed[f] === undefined));
}

console.log('\nNot a wording map at all');
{
  check('array refused', planWebTextUpdate([], {}) === null);
  check('null refused', planWebTextUpdate(null, {}) === null);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
