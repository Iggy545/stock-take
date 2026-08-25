// Runs the REAL findTombstones and deleteTombstones out of index.html. Same
// trick as the others: slice the shipped source out by its markers and run it
// in a vm with the browser bits stood in for.
//
//   node tests/tombstones.js index.html
//
// What this is guarding is a destructive operation on the shared workspace.
// Two separate promises:
//
//   1. It can only ever reach a TOMBSTONE - a document flagged deleted and
//      carrying no record. A live item must be unreachable from here, whatever
//      shape the data turns up in.
//   2. It leaves recent tombstones alone. Those are the only thing that tells
//      a device which has not synced yet that an item went, and removing one
//      early puts the deleted item back for the whole shop.
const fs = require('fs');
const vm = require('vm');

const HTML = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');
const START = '    var TOMBSTONE_KEEP_DAYS = 30;';
const END = '    return {\n      connect:connect, disconnect:disconnect, syncNow:syncNow,';
const a = HTML.indexOf(START), b = HTML.indexOf(END);
if (a < 0 || b < 0) { console.error('could not locate the tombstone block'); process.exit(2); }
const SRC = HTML.slice(a, b);

const DAY = 86400000;

// A stand-in Firestore. Records what was asked for, so the test can assert the
// query is the cheap one: filtering server-side costs a read per tombstone,
// while fetching the collection would cost a read per document - which is the
// very bill this feature exists to stop.
function makeDb(itemDocs, saleDocs) {
  const asked = [];
  const deleted = [];
  const commits = [];

  const snap = (docs) => ({
    forEach(fn) {
      docs.forEach((d, i) => fn({
        data: () => d,
        ref: { id: (d && d.key) || 'doc' + i },
      }));
    },
  });

  const col = (docs, name) => ({
    where(field, op, value) {
      asked.push({ name, field, op, value });
      return { get: async () => snap(docs) };
    },
    get: async () => { asked.push({ name, field: null }); return snap(docs); },
  });

  return {
    asked, deleted, commits,
    itemsCol: col(itemDocs, 'items'),
    salesCol: col(saleDocs, 'sales'),
    db: {
      batch() {
        const staged = [];
        return {
          delete(ref) { staged.push(ref); },
          commit: async () => { commits.push(staged.length); staged.forEach(r => deleted.push(r)); },
        };
      },
    },
  };
}

function load({ itemDocs = [], saleDocs = [], connected = true } = {}) {
  const world = makeDb(itemDocs, saleDocs);
  const ctx = {
    console, Promise, Date, Number, Error,
    connected,
    itemsCol: world.itemsCol,
    salesCol: world.salesCol,
    db: world.db,
  };
  vm.createContext(ctx);
  vm.runInContext(SRC + '\nthis.findTombstones = findTombstones;'
    + '\nthis.deleteTombstones = deleteTombstones;'
    + '\nthis.KEEP = TOMBSTONE_KEEP_DAYS;', ctx);
  return { ctx, world };
}

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

const old = (extra = {}) => ({ deleted: true, updatedAt: Date.now() - 90 * DAY, key: 'OLD', ...extra });
const recent = (extra = {}) => ({ deleted: true, updatedAt: Date.now() - 2 * DAY, key: 'NEW', ...extra });
const live = (extra = {}) => ({ deleted: false, updatedAt: Date.now() - 90 * DAY, key: 'LIVE', data: { name: 'Rose Quartz Bracelet' }, ...extra });

(async () => {
  console.log('\nWhat it will and will not touch');
  {
    const { ctx } = load({ itemDocs: [old(), live(), recent()] });
    const found = await ctx.findTombstones();
    check('an old tombstone is collected', found.old.length === 1, 'got ' + found.old.length);
    check('a live item is never collected', !found.old.some(r => r.id === 'LIVE'));
    check('a recent tombstone is counted, not collected', found.recent === 1, 'recent=' + found.recent);
  }
  {
    // Defensive: a document flagged deleted that still carries a record is not
    // a tombstone, whatever it claims. Deleting it would destroy real data.
    const { ctx } = load({ itemDocs: [old({ data: { name: 'still here' } })] });
    const found = await ctx.findTombstones();
    check('deleted:true carrying a record is refused', found.old.length === 0,
      'collected ' + found.old.length);
  }
  {
    const { ctx } = load({ itemDocs: [old({ data: null })] });
    const found = await ctx.findTombstones();
    check('a null record still counts as a tombstone', found.old.length === 1);
  }
  {
    const { ctx } = load({ itemDocs: [{ key: 'NOFLAG', updatedAt: 0 }] });
    const found = await ctx.findTombstones();
    check('a document with no deleted flag is left alone', found.old.length === 0);
  }
  {
    const { ctx } = load({ itemDocs: [old({ updatedAt: undefined })] });
    const found = await ctx.findTombstones();
    check('a tombstone with no date is treated as old', found.old.length === 1);
  }

  console.log('\nItems and sales');
  {
    const { ctx } = load({ itemDocs: [old(), old()], saleDocs: [old()] });
    const found = await ctx.findTombstones();
    check('both collections are swept', found.old.length === 3, 'got ' + found.old.length);
    check('items are counted separately', found.items === 2, 'items=' + found.items);
    check('sales are counted separately', found.sales === 1, 'sales=' + found.sales);
  }

  console.log('\nThe query is the cheap one');
  {
    const { ctx, world } = load({ itemDocs: [old()] });
    await ctx.findTombstones();
    check('it filters server-side rather than reading everything',
      world.asked.length === 2 && world.asked.every(q => q.field === 'deleted' && q.op === '==' && q.value === true),
      JSON.stringify(world.asked));
  }

  console.log('\nWithout sync there is nothing to do');
  {
    const { ctx } = load({ itemDocs: [old()], connected: false });
    let threw = false;
    try { await ctx.findTombstones(); } catch (e) { threw = true; }
    check('it refuses when not connected', threw);
  }

  console.log('\nDeleting');
  {
    const { ctx, world } = load({});
    const refs = Array.from({ length: 1001 }, (_, i) => ({ id: 'r' + i }));
    const seen = [];
    const done = await ctx.deleteTombstones(refs, (d, t) => seen.push(d + '/' + t));
    check('every reference is deleted', done === 1001 && world.deleted.length === 1001,
      'done=' + done + ' deleted=' + world.deleted.length);
    check('batches stay under the Firestore limit of 500',
      world.commits.every(n => n <= 500), JSON.stringify(world.commits));
    check('progress is reported per batch', seen.length === world.commits.length,
      JSON.stringify(seen));
  }
  {
    const { ctx, world } = load({});
    const done = await ctx.deleteTombstones([]);
    check('nothing to delete commits nothing', done === 0 && world.commits.length === 0);
  }

  console.log('\nThe keep window');
  {
    const { ctx } = load({});
    check('recent deletions are kept long enough to reach the other till',
      ctx.KEEP >= 14, 'KEEP=' + ctx.KEEP);
  }

  console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
  process.exit(fail ? 1 : 0);
})();
