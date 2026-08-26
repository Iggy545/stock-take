// Runs the REAL reconcile() out of index.html against a fake Firestore.
//
// tests/read-policy.js proves the DECISION is right. This proves the wiring
// around it, which is where the risk actually lives: reconcile() builds the
// shadow - "what the server already has" - and every push is a diff against
// it. Build it from the wrong documents and the till either uploads the whole
// stock list or silently stops uploading at all. Both have happened here.
//
// So the property that matters is not "the cache path is cheap", it is that
// THE CACHE PATH AND THE SERVER PATH END IN IDENTICAL STATE. Everything else
// is an optimisation; this is the safety.
//
// Slices two blocks and stitches them, since the policy and the reconcile sit
// apart in the file:
//   function planReconcile(ws, mark, memo, canCache){  ->  // ---- status display
//   // The one cheap question, and the only new read   ->  async function connect(
const fs = require('fs');
const vm = require('vm');

const HTML = fs.readFileSync(process.argv[2], 'utf8');
function slice(startMark, endMark, what) {
  const a = HTML.indexOf(startMark), b = HTML.indexOf(endMark);
  if (a < 0 || b < 0 || b < a) { console.error('could not locate ' + what); process.exit(2); }
  return HTML.slice(a, b);
}
const SRC =
  slice('    function planReconcile(ws, mark, memo, canCache){',
        '    // ---- status display ----', 'the read policy') +
  '\n' +
  slice('    // The one cheap question, and the only new read this file makes.',
        '    async function connect(opts){', 'reconcile');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

// ---- the fake ----
//
// Item and sale documents are the real shape pushItems() writes:
// { data, updatedAt, by, deleted, key }.
function doc(key, data, updatedAt, deleted) {
  return { id: key, data: { data: data, updatedAt: updatedAt, by: 'other', deleted: !!deleted, key: key } };
}
function snap(docs) {
  return {
    size: docs.length, empty: docs.length === 0,
    docs: docs.map(d => ({ id: d.id, data: () => d.data })),
    forEach(fn) { this.docs.forEach(fn); }
  };
}
// orderBy/limit is the watermark question and must be distinguishable from a
// plain get(), because telling those apart IS the measurement.
function collection(name, server, cache, log, mark) {
  return {
    orderBy() {
      return { limit() { return { get: async () => { log.push(name + ':watermark'); return snap(mark); } }; } };
    },
    async get(opts) {
      const src = (opts && opts.source) ? opts.source : 'server';
      log.push(name + ':' + src);
      return snap(src === 'cache' ? cache : server);
    }
  };
}

function harness(opts) {
  opts = opts || {};
  const log = [];
  const store = Object.assign({}, opts.storage || {});
  const items = opts.items || [doc('CA-1', { name: 'Amethyst', price: 4 }, 1000),
                               doc('CA-2', { name: 'Quartz', price: 6 }, 2000),
                               doc('CA-3', { name: 'gone', price: 1 }, 1500, true)];
  const sales = opts.sales || [doc('s1', { barcode: 'CA-1', at: 900 }, 900)];
  const markDocs = opts.markDocs === undefined
    ? [{ id: 'CA-2', data: { updatedAt: 2000 } }] : opts.markDocs;

  const ctx = {
    console: { warn() {}, log() {} },
    // state reconcile() assigns into
    shadowItems: {}, shadowSales: {}, shadowMeta: 'stale', connected: false,
    persistenceOK: opts.persistenceOK === undefined ? true : opts.persistenceOK,
    MARK_KEY: 'stockTakeSyncMark',
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; }
    },
    workspacePath: () => opts.ws || 'shop',
    serialize: v => { try { return JSON.stringify(v); } catch (e) { return ''; } },
    // record what was merged, without pulling in the whole app
    appliedItems: {}, appliedSales: {}, appliedMeta: 0,
    _origSaveItems() {}, _origSaveSales() {}, saveTimes() {},
    pushItems() {}, pushSales() {},
    renderSession() {}, renderList() {}, renderSold() {},
    JSON, String, Number, Object, Date,
    readLog: log, store
  };
  ctx.applyRemoteItem = (k, d) => { ctx.appliedItems[k] = d; return true; };
  ctx.applyRemoteSale = (k, d) => { ctx.appliedSales[k] = d; return true; };
  ctx.applyRemoteMeta = () => { ctx.appliedMeta++; return true; };
  ctx.itemsCol = collection('items', items, opts.itemCache || items, log, markDocs);
  ctx.salesCol = collection('sales', sales, opts.saleCache || sales, log, markDocs);
  ctx.metaDoc = {
    get: async () => { log.push('meta:get'); return { exists: true, data: () => ({ sessionDate: '2026-08-26' }) }; }
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return ctx;
}

(async () => {

  console.log('a first connect must read the server - there is nothing to trust yet');
  {
    const c = harness();
    await c.reconcile();
    check('items come from the server', c.readLog.includes('items:server'), c.readLog.join(','));
    check('nothing is read from the cache',
      !c.readLog.some(l => l.endsWith(':cache')), c.readLog.join(','));
    check('a memo is written for next time', !!c.store.stockTakeSyncMark, c.store.stockTakeSyncMark);
    const memo = JSON.parse(c.store.stockTakeSyncMark || '{}');
    check('the memo records the workspace, mark and both counts',
      memo.ws === 'shop' && memo.mark === '2000' && memo.items === 3 && memo.sales === 1,
      c.store.stockTakeSyncMark);
    check('the tombstone is kept out of the shadow',
      !('CA-3' in c.shadowItems) && 'CA-1' in c.shadowItems && 'CA-2' in c.shadowItems,
      Object.keys(c.shadowItems).join(','));
  }

  console.log('\nTHE WHOLE POINT: an unchanged second connect costs one read');
  {
    const first = harness();
    await first.reconcile();
    const second = harness({ storage: first.store });
    await second.reconcile();
    check('the watermark is asked', second.readLog.includes('items:watermark'), second.readLog.join(','));
    check('the items are NOT read from the server',
      !second.readLog.includes('items:server'), second.readLog.join(','));
    check('the sales are NOT read from the server',
      !second.readLog.includes('sales:server'), second.readLog.join(','));
    check('both come from the cache instead',
      second.readLog.includes('items:cache') && second.readLog.includes('sales:cache'),
      second.readLog.join(','));

    console.log('\n  ...and ends in exactly the same state as the server path');
    check('THE SAFETY: the shadow is identical either way',
      JSON.stringify(second.shadowItems) === JSON.stringify(first.shadowItems),
      JSON.stringify(second.shadowItems));
    check('the sales shadow is identical either way',
      JSON.stringify(second.shadowSales) === JSON.stringify(first.shadowSales));
    check('the same documents were merged into local state',
      JSON.stringify(second.appliedItems) === JSON.stringify(first.appliedItems));
    check('it still ends up connected', second.connected === true);
  }

  console.log('\na moved watermark goes back to the server');
  {
    const first = harness();
    await first.reconcile();
    const moved = harness({ storage: first.store, markDocs: [{ id: 'CA-2', data: { updatedAt: 9999 } }] });
    await moved.reconcile();
    check('the server is read again', moved.readLog.includes('items:server'), moved.readLog.join(','));
    check('the memo is updated to the new mark',
      JSON.parse(moved.store.stockTakeSyncMark).mark === '9999');
  }

  console.log('\nTHE TRAP: a cache the browser has emptied must not build the shadow');
  {
    const first = harness();
    await first.reconcile();
    // watermark unmoved, but site data was cleared so the cache answers empty
    const cleared = harness({ storage: first.store, itemCache: [], saleCache: [] });
    await cleared.reconcile();
    check('the short cache is noticed and the server read instead',
      cleared.readLog.includes('items:server'), cleared.readLog.join(','));
    check('the shadow is still complete, not empty',
      JSON.stringify(cleared.shadowItems) === JSON.stringify(first.shadowItems),
      JSON.stringify(cleared.shadowItems));
  }

  console.log('\nthe team code switch');
  {
    const first = harness();
    await first.reconcile();
    const other = harness({ storage: first.store, ws: 'other-shop' });
    await other.reconcile();
    check('THE HAZARD: a different workspace reads the server',
      other.readLog.includes('items:server'), other.readLog.join(','));
    check('the memo is re-keyed to the new workspace',
      JSON.parse(other.store.stockTakeSyncMark).ws === 'other-shop');
  }

  console.log('\nwithout a local cache nothing changes from how it always worked');
  {
    const first = harness();
    await first.reconcile();
    const noCache = harness({ storage: first.store, persistenceOK: false });
    await noCache.reconcile();
    check('the server is read every time',
      noCache.readLog.includes('items:server') && !noCache.readLog.includes('items:cache'),
      noCache.readLog.join(','));
  }

  console.log('\na watermark Firestore refuses is not "nothing has changed"');
  {
    const first = harness();
    await first.reconcile();
    const refused = harness({ storage: first.store });
    refused.itemsCol.orderBy = () => ({ limit: () => ({ get: async () => { throw new Error('429 quota'); } }) });
    await refused.reconcile();
    check('a refusal falls back to the server, as it always did',
      refused.readLog.includes('items:server'), refused.readLog.join(','));
    check('and no memo is written from a read it could not verify',
      refused.store.stockTakeSyncMark === first.store.stockTakeSyncMark);
  }

  console.log('\nan empty workspace is not mistaken for an unchanged one');
  {
    const c = harness({ items: [], sales: [], markDocs: [] });
    await c.reconcile();
    check('the server is read', c.readLog.includes('items:server'), c.readLog.join(','));
    const again = harness({ items: [], sales: [], markDocs: [], storage: c.store });
    await again.reconcile();
    check('and again next time, because there is no mark to compare',
      again.readLog.includes('items:server'), again.readLog.join(','));
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
