// Runs the REAL read-policy block out of index.html.
//
// What this protects. Every app load with sync on used to begin with an
// unqualified itemsCol.get(), which asks the SERVER, and Firestore bills one
// read per document returned — about five hundred here, whatever had changed.
// The free allowance is 50,000 a day and the shop Worker is budgeted 40,000 of
// it, so the till had roughly twenty loads before the shop went dark. It did,
// on 25 August 2026.
//
// The fix asks one cheap question first — the newest updatedAt, one read — and
// reads from the local cache when nothing has moved. Four ways that can go
// wrong, and every one of them is silent:
//
//   - reusing a mark across a TEAM CODE CHANGE, so the connect that should
//     discover a different shop is skipped entirely
//   - trusting a cache that site-data clearing has emptied, which builds an
//     empty shadow and pushes the whole stock list back up
//   - treating "could not ask" as "nothing has changed", which is the exact
//     shape of the bug that caused the outage on the Worker side
//   - deciding to use a cache that was never switched on
//
// Nothing is mocked: these two functions are pure.
const fs = require('fs');
const vm = require('vm');

const HTML = fs.readFileSync(process.argv[2], 'utf8');
const START = '    function planReconcile(ws, mark, memo, canCache){';
const END = '    // ---- status display ----';
const a = HTML.indexOf(START), b = HTML.indexOf(END);
if (a < 0 || b < 0) { console.error('could not locate the read-policy block'); process.exit(2); }
const SRC = HTML.slice(a, b);

const ctx = { console };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(SRC, ctx);

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

const answered = m => ({ ok: true, mark: m });
const refused  = { ok: false, mark: null };
const memoFor  = (ws, mark, items, sales) => ({ ws, mark, items, sales });

console.log('the cheap path, which is the whole point');
{
  const p = ctx.planReconcile('shop', answered('1724668800000'),
    memoFor('shop', '1724668800000', 500, 40), true);
  check('an unmoved watermark reads from the cache', p.source === 'cache', p.why);
}
{
  const p = ctx.planReconcile('shop', answered('1724668900000'),
    memoFor('shop', '1724668800000', 500, 40), true);
  check('a moved watermark goes to the server', p.source === 'server', p.why);
}
check('the mark is compared as text, not by identity',
  ctx.planReconcile('shop', answered(1724668800000),
    memoFor('shop', '1724668800000', 500, 40), true).source === 'cache');

console.log('\nthe team code switch, which must never reuse a mark');
{
  const p = ctx.planReconcile('other-shop', answered('1724668800000'),
    memoFor('shop', '1724668800000', 500, 40), true);
  check('THE HAZARD: a different workspace always reads the server',
    p.source === 'server', p.why);
}
check('a workspace with a pin is not the same workspace',
  ctx.planReconcile('shop~1234', answered('1'), memoFor('shop', '1', 5, 5), true)
    .source === 'server');

console.log('\nnot knowing is never a reason to skip the read');
check('a refused watermark goes to the server',
  ctx.planReconcile('shop', refused, memoFor('shop', '1724668800000', 500, 40), true)
    .source === 'server');
// The one above passes for the wrong reason if the ok check is dropped, because
// a refusal also carries a null mark and the next line catches that. THIS is the
// shape that separates them, and it is the exact bug the Worker had: a refusal
// read as "no idea, carry on" rather than "do not trust me".
check('THE WORKER BUG: a refusal still carrying a mark goes to the server',
  ctx.planReconcile('shop', { ok: false, mark: '1724668800000' },
    memoFor('shop', '1724668800000', 500, 40), true).source === 'server');
check('an empty workspace goes to the server',
  ctx.planReconcile('shop', answered(null), memoFor('shop', null, 0, 0), true)
    .source === 'server');
check('no memo at all goes to the server',
  ctx.planReconcile('shop', answered('1'), null, true).source === 'server');
check('no local cache goes to the server, whatever the mark says',
  ctx.planReconcile('shop', answered('1'), memoFor('shop', '1', 500, 40), false)
    .source === 'server');
check('every refusal explains itself',
  ['no local cache to read from', 'first connect to this workspace',
   'could not read the watermark', 'there is no watermark to compare',
   'something has changed'].includes(
    ctx.planReconcile('shop', refused, memoFor('shop', '1', 1, 1), true).why));

console.log('\nthe cache has to actually hold what the last server read held');
check('matching counts are complete',
  ctx.cacheLooksComplete(memoFor('shop', '1', 500, 40), 500, 40) === true);
check('THE TRAP: a cleared cache is refused',
  ctx.cacheLooksComplete(memoFor('shop', '1', 500, 40), 0, 0) === false);
check('a short item cache is refused',
  ctx.cacheLooksComplete(memoFor('shop', '1', 500, 40), 499, 40) === false);
check('a short sales cache is refused',
  ctx.cacheLooksComplete(memoFor('shop', '1', 500, 40), 500, 39) === false);
check('a cache holding MORE than was read is refused too',
  ctx.cacheLooksComplete(memoFor('shop', '1', 500, 40), 501, 40) === false);
check('no memo is never complete',
  ctx.cacheLooksComplete(null, 0, 0) === false);
check('an empty workspace still compares honestly',
  ctx.cacheLooksComplete(memoFor('shop', null, 0, 0), 0, 0) === true);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
