// Runs the REAL set-photograph block out of index.html.
//
//   node tests/set-photos.js index.html
//
// WHAT THIS PROTECTS. A set can now carry a photograph of the things together,
// which is the only picture that shows what the set price actually buys. It has
// to live under exactly the same two disciplines the item photographs live
// under, and both of them are silent when they break.
//
//   THE MONEY ONE. shop-worker projects `data.set` WHOLE on every catalogue
//   build, about ten times a day - it has to, because who the set pairs with
//   and for how much IS the feature. So the picture must never be inside the
//   rule. It goes in `setPhoto`, a field of its own that nothing projects, and
//   only the key - a fingerprint of about fifteen characters - goes in the
//   rule. Put the bytes in there instead and the website still looks right;
//   the egress bill simply grows, which is the whole lesson of photo-keys.js.
//
//   THE LOSING-A-PICTURE ONE. An item with no `setPhoto` in memory is usually
//   one whose picture has not come back out of IndexedDB yet, NOT one without a
//   picture. Treating those the same is what used to delete item photographs
//   for good - see the hasPhoto note in index.html. `hasSetPhoto` tells them
//   apart and `setPhotoCleared` is the one case where empty means removed.
//
// Nothing is mocked except the browser and IndexedDB.
const fs = require('fs');
const vm = require('vm');

const HTML = fs.readFileSync(process.argv[2], 'utf8');

function slice(start, end, what) {
  const a = HTML.indexOf(start), b = HTML.indexOf(end);
  if (a < 0 || b < 0 || b < a) { console.error('could not locate ' + what); process.exit(2); }
  return HTML.slice(a, b);
}

// The key machinery, so the fingerprints below are the real ones rather than a
// stand-in that could drift from what the Worker computes.
const KEYS = slice(
  '  // ---- the photo key: what the picture IS, without the picture ----',
  '  // A copy of items with photos removed, for localStorage',
  'the photo-key block');

// The set block, plus strippedForStorage which decides what reaches localStorage.
const SETS = slice(
  "  // The same job for a set's photograph, and it needs the same care",
  '  function loadItems(){',
  'the set-photograph block');

const wrote = [];   // every IndexedDB call the code makes, in order
const ctx = {
  console,
  items: {},
  photoStoreOK: true,
  setPhotoStoreOK: true,
  photoCache: {},
  setPhotoCache: {},
  PhotoDB: {
    set: function (k, v) { wrote.push('set ' + k); return Promise.resolve(true); },
    del: function (k) { wrote.push('del ' + k); return Promise.resolve(true); },
    sset: function (k, v) { wrote.push('sset ' + k); return Promise.resolve(true); },
    sdel: function (k) { wrote.push('sdel ' + k); return Promise.resolve(true); },
  },
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(KEYS + '\n' + SETS, ctx);

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

const PICTURE = 'data:image/jpeg;base64,/9j/4AAQ';
const KEY = 'data:1506cehv';                       // pinned in photo-keys.js
const HOSTED = 'https://soulful-angels.pages.dev/img/img_PAIR.webp';

function reset(state, cache) {
  ctx.items = state || {};
  ctx.setPhotoCache = cache || {};
  wrote.length = 0;
}
const owner = (extra) => Object.assign(
  { name: 'Willow — Bracelet', price: 12, set: { with: ['B'], price: 20 } }, extra || {});

// ---- what reaches localStorage ----

console.log('\nThe picture stays out of localStorage');
{
  reset({ A: owner({ setPhoto: PICTURE, photo: PICTURE }) });
  const out = ctx.strippedForStorage();
  check('the set photograph is not written to localStorage',
    !('setPhoto' in out.A), Object.keys(out.A).join(','));
  check('nor is the item photograph, as before', !('photo' in out.A));
  check('but a marker says one exists, so it is not read as absent',
    out.A.hasSetPhoto === 1);
  check('and the rest of the item is untouched',
    out.A.name === 'Willow — Bracelet' && out.A.set.price === 20);
}

console.log('\nAnd the marker goes when the picture does');
{
  reset({ A: owner() });
  const out = ctx.strippedForStorage();
  check('no picture, no marker', !('hasSetPhoto' in out.A), Object.keys(out.A).join(','));
}

// ---- keeping the picture ----

console.log('\nA picture that did not travel is put back, not thrown away');
{
  // The record has arrived over sync, or come back from a backup taken before
  // the pictures hydrated. Empty here does NOT mean removed.
  reset({ A: owner() }, { A: PICTURE });
  ctx.reconcileSetPhotos();
  check('the held picture goes back onto the record', ctx.items.A.setPhoto === PICTURE);
  check('and nothing was deleted from the store', wrote.join(',') === '', wrote.join(','));
}

console.log('\nBut a deliberate Remove really does remove it');
{
  reset({ A: owner({ setPhoto: '', setPhotoCleared: 1, hasSetPhoto: 1 }) }, { A: PICTURE });
  ctx.reconcileSetPhotos();
  check('the picture is dropped from the store', wrote.indexOf('sdel A') > -1, wrote.join(','));
  check('and from what is held in memory', !ctx.setPhotoCache.A);
  check('and the marker goes with it, or it reads as a lost picture',
    !('hasSetPhoto' in ctx.items.A));
}

console.log('\nA new picture is written down');
{
  reset({ A: owner({ setPhoto: PICTURE }) });
  ctx.reconcileSetPhotos();
  check('it goes into the store', wrote.join(',') === 'sset A', wrote.join(','));
  check('and is held for next time', ctx.setPhotoCache.A === PICTURE);
}

console.log('\nA set taken apart takes its photograph with it');
{
  // No rule left. A picture of two things together belongs to nothing now, and
  // leaving it would put it back on screen the next time a different set is made.
  reset({ A: { name: 'Willow — Bracelet', price: 12, setPhoto: PICTURE, hasSetPhoto: 1 } },
    { A: PICTURE });
  ctx.reconcileSetPhotos();
  check('the picture is deleted', wrote.indexOf('sdel A') > -1, wrote.join(','));
  check('and taken off the record', !ctx.items.A.setPhoto && !ctx.items.A.hasSetPhoto);
}

console.log('\nAnd so does an item that has gone');
{
  reset({}, { A: PICTURE });
  ctx.reconcileSetPhotos();
  check('nothing is left holding a picture for it', !ctx.setPhotoCache.A);
  check('and the store is told', wrote.indexOf('sdel A') > -1, wrote.join(','));
}

console.log('\nThe store being unavailable costs nothing');
{
  ctx.setPhotoStoreOK = false;
  reset({ A: owner({ setPhoto: PICTURE }) }, { A: PICTURE });
  ctx.reconcileSetPhotos();
  check('an old device with no set store writes nothing', wrote.join(',') === '', wrote.join(','));
  check('and the picture on the record is left exactly alone',
    ctx.items.A.setPhoto === PICTURE);
  ctx.setPhotoStoreOK = true;
}

// ---- the key, which is what the website reads ----

console.log('\nThe key inside the rule');
{
  reset({ A: owner({ setPhoto: PICTURE }) });
  ctx.reconcileSetPhotoKeys();
  check('an embedded picture becomes data: and a fingerprint',
    ctx.items.A.set.photoKey === KEY, ctx.items.A.set.photoKey);

  reset({ A: owner({ setPhoto: HOSTED }) });
  ctx.reconcileSetPhotoKeys();
  check('a hosted one is its own key, being an address already',
    ctx.items.A.set.photoKey === HOSTED, ctx.items.A.set.photoKey);
}

console.log('\nTHE BILL: the rule stays small whatever the picture weighs');
{
  reset({ A: owner({ setPhoto: 'data:image/jpeg;base64,' + 'Q'.repeat(97000) }) });
  ctx.reconcileSetPhotoKeys();
  check('the key is a few characters, not a hundred thousand',
    ctx.items.A.set.photoKey.length < 20, String(ctx.items.A.set.photoKey.length));
  // `data.set` is projected WHOLE on every catalogue build. This is the line
  // that keeps that cheap.
  check('and the picture itself is nowhere inside the rule',
    JSON.stringify(ctx.items.A.set).indexOf('data:image/') < 0,
    JSON.stringify(ctx.items.A.set).slice(0, 60));
}

console.log('\nA key is never cleared on a picture that simply has not loaded');
{
  // The hasPhoto lesson, in its set-shaped form: clearing here would take the
  // set's photograph off the website until somebody happened to edit the item.
  reset({ A: owner({ hasSetPhoto: 1 }) });
  ctx.items.A.set.photoKey = KEY;
  ctx.reconcileSetPhotoKeys();
  check('the key is left alone while the picture is still coming',
    ctx.items.A.set.photoKey === KEY, String(ctx.items.A.set.photoKey));

  // But a removal does clear it, because there really is no picture now.
  reset({ A: owner({ hasSetPhoto: 1, setPhotoCleared: 1 }) });
  ctx.items.A.set.photoKey = KEY;
  ctx.reconcileSetPhotoKeys();
  check('and a removed one does clear it', !('photoKey' in ctx.items.A.set));
}

console.log('\nAn item with no set has no key to keep');
{
  reset({ A: { name: 'Mookaite Bracelet', price: 10, setPhoto: PICTURE } });
  ctx.reconcileSetPhotoKeys();
  check('nothing is invented for it', !ctx.items.A.set);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
