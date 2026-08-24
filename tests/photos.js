// Runs the REAL photo-storage block out of index.html against the two bugs.
// Nothing here is mocked except the browser: PhotoDB is an in-memory stand-in
// with the same shape, everything else is the shipped source.
const fs = require('fs');
const vm = require('vm');

const HTML = fs.readFileSync(process.argv[2], 'utf8');
const START = '  var photoStoreOK = false;';
const END = '  // Rough estimate of how much space the photos are using.';
const a = HTML.indexOf(START), b = HTML.indexOf(END);
if (a < 0 || b < 0) { console.error('could not locate the photo block'); process.exit(2); }
const SRC = HTML.slice(a, b);

function makeEnv() {
  const db = new Map();
  const store = new Map();
  const ctx = {
    items: {},
    PhotoDB: {
      supported: () => true,
      get: k => Promise.resolve(db.has(k) ? db.get(k) : null),
      set: (k, v) => { db.set(k, v); return Promise.resolve(true); },
      del: k => { db.delete(k); return Promise.resolve(true); },
      keys: () => Promise.resolve([...db.keys()])
    },
    STORAGE_KEY: 'stock',
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, v)
    },
    showToast() {}, renderList() {}, renderSold() {}, maybeAutoConnectSync() {},
    document: { getElementById: () => null },
    console
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return { ctx, db };
}

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

(async () => {

  console.log('\nBug 2 — restoring a backup that carries no photos');
  {
    const { ctx, db } = makeEnv();
    ctx.items = { A: { name: 'Angel', photo: 'PHOTO-A' }, B: { name: 'Bell', photo: 'PHOTO-B' } };
    await ctx.initPhotos();
    check('photos are in the store to begin with', db.get('A') === 'PHOTO-A' && db.get('B') === 'PHOTO-B');

    // The lossy restore: same items, every photo missing.
    ctx.items = { A: { name: 'Angel' }, B: { name: 'Bell' } };
    ctx.saveItems();

    check('photo A survives in IndexedDB', db.get('A') === 'PHOTO-A', 'got ' + db.get('A'));
    check('photo B survives in IndexedDB', db.get('B') === 'PHOTO-B', 'got ' + db.get('B'));
    check('photo A is put back on the item', ctx.items.A.photo === 'PHOTO-A', 'got ' + ctx.items.A.photo);
  }

  console.log('\nA synced record arriving without a photo');
  {
    const { ctx, db } = makeEnv();
    ctx.items = { A: { name: 'Angel', photo: 'PHOTO-A' } };
    await ctx.initPhotos();
    ctx.items.A = { name: 'Angel', qty: 3 };   // remote record, no photo field at all
    ctx.saveItems();
    check('photo is not destroyed', db.get('A') === 'PHOTO-A', 'got ' + db.get('A'));
  }

  console.log('\nRemove photo must still remove the photo');
  {
    const { ctx, db } = makeEnv();
    ctx.items = { A: { name: 'Angel', photo: 'PHOTO-A' } };
    await ctx.initPhotos();
    ctx.items.A.photo = '';
    ctx.items.A.photoCleared = 1;             // what the edit form now sets
    ctx.saveItems();
    check('photo is gone from IndexedDB', db.get('A') === undefined, 'got ' + db.get('A'));
    check('photo is not resurrected on the item', !ctx.items.A.photo);
  }

  console.log('\nRemoving a photo must not leave a marker that blocks future backups');
  {
    const { ctx } = makeEnv();
    ctx.items = { A: { name: 'Angel', photo: 'PHOTO-A' } };
    await ctx.initPhotos();
    ctx.items.A.photo = '';
    ctx.items.A.photoCleared = 1;
    ctx.saveItems();
    const written = JSON.parse(ctx.localStorage.getItem('stock'));
    check('hasPhoto marker cleared in storage', !written.A.hasPhoto, JSON.stringify(written.A));
    check('hasPhoto marker cleared in memory', !ctx.items.A.hasPhoto);
    const missing = await ctx.ensurePhotosHydrated();
    check('backup would still be allowed', missing === 0, 'missing=' + missing);
  }

  console.log('\nA new photo clears the removal marker');
  {
    const { ctx, db } = makeEnv();
    ctx.items = { A: { name: 'Angel', photo: '', photoCleared: 1 } };
    await ctx.initPhotos();
    ctx.items.A.photo = 'PHOTO-NEW';
    ctx.saveItems();
    check('new photo stored', db.get('A') === 'PHOTO-NEW');
    check('photoCleared marker removed', ctx.items.A.photoCleared === undefined);
  }

  console.log('\nDeleting the item still deletes its photo');
  {
    const { ctx, db } = makeEnv();
    ctx.items = { A: { name: 'Angel', photo: 'PHOTO-A' } };
    await ctx.initPhotos();
    delete ctx.items.A;
    ctx.saveItems();
    check('photo removed with the item', db.get('A') === undefined);
  }

  console.log('\nBug 1 — a backup taken before the photos have hydrated');
  {
    const { ctx, db } = makeEnv();
    // What loadItems() returns from localStorage a moment after startup:
    // the marker is there, the photo is not.
    db.set('A', 'PHOTO-A');
    db.set('B', 'PHOTO-B');
    ctx.items = { A: { name: 'Angel', hasPhoto: 1 }, B: { name: 'Bell', hasPhoto: 1 } };
    check('starts with no photos in memory', ctx.photoCount() === 0);

    const readyBefore = ctx.photoCount();
    await ctx.initPhotos();
    const missing = await ctx.ensurePhotosHydrated();

    check('nothing reported missing', missing === 0, 'got ' + missing);
    check('both photos are back in memory', ctx.photoCount() === 2, 'got ' + ctx.photoCount());
    check('a backup taken now would carry them', ctx.items.A.photo === 'PHOTO-A' && ctx.items.B.photo === 'PHOTO-B');
    void readyBefore;
  }

  console.log('\nA photo that genuinely cannot be read is reported, not ignored');
  {
    const { ctx } = makeEnv();
    ctx.items = { A: { name: 'Angel', hasPhoto: 1 } };   // marker set, store empty
    await ctx.initPhotos();
    const missing = await ctx.ensurePhotosHydrated();
    check('missing photo counted so the backup is refused', missing === 1, 'got ' + missing);
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
  process.exit(fail ? 1 : 0);
})();
