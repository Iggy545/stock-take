// Runs the REAL extra-photographs block out of index.html, against an
// in-memory stand-in for IndexedDB.
//
//   node tests/extras.js index.html
//
// WHAT THIS PROTECTS. The second and later photographs of an item live ONLY on
// the device that took them until somebody exports them. There is no sync
// carrying them, no copy in Firestore and none in a backup, so every way this
// can go wrong loses a picture that cannot be got back:
//
//   1. THE KEY. It is barcode + fingerprint, not the fingerprint on its own.
//      Content addressing stores one copy of identical bytes, which is right
//      for files and wrong here: the record has to say which ITEM a picture
//      belongs to, and two items cannot share one answer. Keyed by fingerprint
//      alone, photographing two items with the same picture would silently move
//      the first item's photograph onto the second.
//   2. THE ORDER. The index is rebuilt from the store at every startup, so the
//      order the shop chose has to be written on each record. If it is not,
//      reordering appears to work and quietly forgets itself on the next load.
//   3. THE UN-EXPORTED COUNT. It is the only warning that this device holds the
//      only copy. With no stamp it must count EVERYTHING, because over-warning
//      costs one needless export and under-warning costs an afternoon's work.
//
// Nothing here is mocked except the browser.
const fs = require('fs');
const vm = require('vm');

const HTML = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');

function slice(startMark, endMark, what) {
  const a = HTML.indexOf(startMark), b = HTML.indexOf(endMark);
  if (a < 0 || b < 0 || b < a) { console.error('could not locate ' + what); process.exit(2); }
  return HTML.slice(a, b);
}

// photoFingerprint lives in the photo-key block; the extras block uses it.
const KEYS = slice('  // ---- the photo key: what the picture IS, without the picture ----',
                   '  // A copy of items with photos removed, for localStorage', 'the photo-key block');
const EXTRAS = slice('  // ---- the extra photographs: 2 to 6 an item, on this device only ----',
                     '  // ---- end of the extra photographs ----', 'the extras block');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}
function same(name, got, want) {
  check(name, JSON.stringify(got) === JSON.stringify(want),
    'got ' + JSON.stringify(got) + ', wanted ' + JSON.stringify(want));
}

// A stand-in for the extras object store: a plain map, with the same four calls
// the real PhotoDB exposes. xall returns {key, val} pairs the way IndexedDB's
// getAllKeys/getAll pair up, because buildExtrasIndex reads both.
function freshWorld() {
  const db = new Map();
  const local = new Map();
  const ctx = {
    console,
    items: {},
    localStorage: {
      getItem: k => (local.has(k) ? local.get(k) : null),
      setItem: (k, v) => local.set(k, String(v)),
    },
    PhotoDB: {
      xget: k => Promise.resolve(db.has(k) ? JSON.parse(JSON.stringify(db.get(k))) : null),
      xset: (k, v) => { db.set(k, JSON.parse(JSON.stringify(v))); return Promise.resolve(true); },
      xdel: k => { db.delete(k); return Promise.resolve(true); },
      xall: () => Promise.resolve([...db.entries()].map(([key, val]) => ({ key, val }))),
    },
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(KEYS + '\n' + EXTRAS + '\nthis.T = {' +
    'extraKey, extrasFor, extrasTotal, extrasItems, buildExtrasIndex, addExtra, removeExtra,' +
    'moveExtra, buildExtrasExport, extrasUnexported, markExtrasExported, photoFingerprint,' +
    'EXTRA_MAX};', ctx);
  ctx.extrasStoreOK = true;
  return { ctx, T: ctx.T, db, local };
}

// Distinct pictures. The values do not have to be real images -- nothing here
// decodes them -- but they do have to be distinct, or the fingerprints collide
// and the test stops testing what it says it does.
const P = n => 'data:image/jpeg;base64,' + 'ABCDEFGH'.repeat(n) + n;

async function run() {
  console.log('\nThe key is the item AND the picture');
  {
    const { T } = freshWorld();
    check('a key names both', T.extraKey('KA-107', 'abc') === 'KA-107#abc');
    // THE ONE THAT MATTERS. Same picture, two items.
    check('the same picture on two items gives two different keys',
      T.extraKey('KA-107', 'abc') !== T.extraKey('KA-108', 'abc'));
  }

  console.log('\nAdding');
  {
    const { T, ctx, db } = freshWorld();
    const a = await T.addExtra('KA-107', P(1));
    await T.addExtra('KA-107', P(2));
    same('they land on the item in the order they were taken',
      T.extrasFor('KA-107'), [T.photoFingerprint(P(1)), T.photoFingerprint(P(2))]);
    check('the store holds one record per picture', db.size === 2, db.size + ' records');
    // Looked up through extraKey rather than a hand-written key, so a broken
    // key scheme reports the wrong record instead of crashing the suite. The
    // `|| {}` is the same idea: a missing record must be a FAIL, not an
    // exception that stops everything after it from running.
    const held = k => db.get(T.extraKey('KA-107', k)) || {};
    check('a record carries its own item code', held(a.fp).code === 'KA-107', held(a.fp).code);
    check('...and its position', held(a.fp).n === 0, String(held(a.fp).n));

    const again = await T.addExtra('KA-107', P(1));
    check('taking the same picture twice does not duplicate it', again.already === true);
    check('...and the item still has two', T.extrasFor('KA-107').length === 2);

    let refused = '';
    try { await T.addExtra('KA-107', 'https://example.com/x.jpg'); }
    catch (e) { refused = e.message; }
    check('an address is not a picture', refused !== '', 'it was accepted');

    // Two items, one picture. Keyed by fingerprint alone this would be one
    // record and the first item would lose its photograph.
    await T.addExtra('KA-108', P(1));
    check('two items can hold the same picture',
      T.extrasFor('KA-107').length === 2 && T.extrasFor('KA-108').length === 1);
    check('and the store kept both', db.size === 3, db.size + ' records');
    check('the totals count pictures and items separately',
      T.extrasTotal() === 3 && T.extrasItems() === 2,
      T.extrasTotal() + ' pictures, ' + T.extrasItems() + ' items');
  }

  console.log('\nReordering, and whether it survives a restart');
  {
    const w = freshWorld();
    await w.T.addExtra('KA-107', P(1));
    await w.T.addExtra('KA-107', P(2));
    await w.T.addExtra('KA-107', P(3));
    const [one, two, three] = w.T.extrasFor('KA-107');

    await w.T.moveExtra('KA-107', three, -1);
    same('a picture moves', w.T.extrasFor('KA-107'), [one, three, two]);

    check('the first cannot move further left', (await w.T.moveExtra('KA-107', one, -1)) === false);
    check('the last cannot move further right', (await w.T.moveExtra('KA-107', two, +1)) === false);
    same('and neither attempt disturbed the order', w.T.extrasFor('KA-107'), [one, three, two]);

    // THE ONE THAT MATTERS. Rebuild the index from the store the way startup
    // does. If positions were not written, this comes back in the old order and
    // reordering was a lie.
    const rebuilt = w.T.buildExtrasIndex(await w.ctx.PhotoDB.xall());
    same('the order comes back after a restart', rebuilt.index['KA-107'], [one, three, two]);
    check('and the times come back with it',
      Object.keys(rebuilt.at).length === 3, Object.keys(rebuilt.at).length + ' times');
  }

  console.log('\nRemoving');
  {
    const w = freshWorld();
    await w.T.addExtra('KA-107', P(1));
    await w.T.addExtra('KA-107', P(2));
    await w.T.addExtra('KA-107', P(3));
    const [one, two, three] = w.T.extrasFor('KA-107');

    check('removing says it did', (await w.T.removeExtra('KA-107', two)) === true);
    same('the rest close up', w.T.extrasFor('KA-107'), [one, three]);
    check('the record is gone from the store', !w.db.has(w.T.extraKey('KA-107', two)));
    // Positions have to be rewritten or the gap survives the next restart and
    // the order drifts every time something is deleted.
    const rebuilt = w.T.buildExtrasIndex(await w.ctx.PhotoDB.xall());
    same('and the closing up survives a restart', rebuilt.index['KA-107'], [one, three]);

    check('removing something that is not there is not an error',
      (await w.T.removeExtra('KA-107', 'nosuch')) === false);

    await w.T.removeExtra('KA-107', one);
    await w.T.removeExtra('KA-107', three);
    same('an item with none left is not left behind as an empty one',
      Object.keys(w.T.buildExtrasIndex(await w.ctx.PhotoDB.xall()).index), []);
    // Read the live index itself, not extrasItems(), which filters empties out
    // and so cannot tell an absent item from one left behind holding nothing.
    // An empty array here is what makes the edit form draw a gallery heading
    // for an item with no pictures in it.
    same('...and the live index dropped it rather than keeping an empty list',
      Object.keys(w.ctx.extrasIndex), []);
  }

  console.log('\nRubbish in the store does not break the rebuild');
  {
    const { T } = freshWorld();
    const built = T.buildExtrasIndex([
      { key: 'KA-1#a', val: { code: 'KA-1', fp: 'a', data: 'data:image/jpeg;base64,x', n: 1, at: 5 } },
      { key: 'KA-1#b', val: { code: 'KA-1', fp: 'b', data: 'data:image/jpeg;base64,y', n: 0, at: 9 } },
      { key: 'broken', val: { code: 'KA-1' } },                    // no picture
      { key: 'orphan', val: { data: 'data:image/jpeg;base64,z' } },// no item
      { key: 'nothing', val: null },
    ]);
    same('positions win over the order the store handed them back',
      built.index['KA-1'], ['b', 'a']);
    same('and nothing else got in', Object.keys(built.index), ['KA-1']);
  }

  console.log('\nThe export');
  {
    const { T } = freshWorld();
    await T.addExtra('KA-108', P(4));
    await T.addExtra('KA-107', P(1));
    await T.addExtra('KA-107', P(2));
    const out = await T.buildExtrasExport();
    same('one entry per item', Object.keys(out).sort(), ['KA-107', 'KA-108']);
    same('in the order the shop chose', out['KA-107'], [P(1), P(2)]);
    check('it carries the pictures themselves, not the keys',
      out['KA-108'][0].startsWith('data:image/'));
  }

  console.log('\nThe un-exported count, which is the whole safety net');
  {
    const { T } = freshWorld();
    check('nothing held, nothing to warn about', T.extrasUnexported() === 0);
    await T.addExtra('KA-107', P(1));
    await T.addExtra('KA-107', P(2));
    // No stamp yet: everything must count.
    check('with no export ever recorded, every picture counts',
      T.extrasUnexported() === 2, T.extrasUnexported() + ' counted');

    T.markExtrasExported();
    check('after exporting, nothing is outstanding',
      T.extrasUnexported() === 0, T.extrasUnexported() + ' counted');

    await new Promise(r => setTimeout(r, 5));
    await T.addExtra('KA-107', P(3));
    check('a picture taken afterwards is outstanding again',
      T.extrasUnexported() === 1, T.extrasUnexported() + ' counted');
  }

  console.log('\nThe ceiling the shop asked for');
  {
    const { T } = freshWorld();
    check('six', T.EXTRA_MAX === 6, String(T.EXTRA_MAX));
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

run().catch(err => { console.error('the suite itself fell over: ' + (err && err.message)); process.exit(2); });
