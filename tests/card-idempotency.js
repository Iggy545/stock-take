// Runs the REAL start-a-card-payment code out of index.html. Same trick as the
// others: slice the shipped source out by its comment markers and run it in a
// vm with the browser stood in for, so what is tested is what ships.
//
// This guards the one failure in the app that can take money twice. A double
// tap is already refused - `start()` will not run while a payment is open. The
// hole is narrower and worse: the request goes out, the reader is loaded, and
// the ANSWER never comes back. The iPad sleeps, the wifi drops, the browser is
// killed. All this till knows is that it could not reach the reader, so it
// offers "Try the card again" - and without a key, that press starts a second
// payment for a basket the customer may already have paid for.
//
// The key is written down BEFORE the request leaves and sent with it, so the
// payment service can hand the first payment back instead of starting another.
// Three of the checks below cost real money if they go the wrong way:
//
//   * An attempt that ended with no answer must KEEP its key. That is the
//     double charge.
//   * An attempt that was answered must DROP it. The payment has an id now,
//     and reusing the key would report a finished payment as this basket's.
//   * A key must never outlive the sale it belongs to. The same total half an
//     hour later is a different customer.
const fs = require('fs');
const vm = require('vm');

const HTML = fs.readFileSync(process.argv[2], 'utf8');

function slice(from, to, what) {
  const a = HTML.indexOf(from), b = HTML.indexOf(to);
  if (a < 0 || b < 0 || b < a) { console.error('could not locate ' + what); process.exit(2); }
  return HTML.slice(a, b);
}

// The module's own state and both things it writes down: the record of a
// payment that has an id, and the key for an attempt that does not yet.
const KEYS = slice(
  "    const URL_KEY = 'posCardReaderUrl';",
  "    function get(){ try{ return localStorage.getItem(URL_KEY)||''; }",
  'the attempt key helpers'
);
// start() itself. Not pure - it talks to the payment service - but what it
// sends, and what it keeps afterwards, is the whole point.
const START = slice(
  '    async function start(){',
  '    async function check(){',
  'start()'
);

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

// ---- the page, stood in for -----------------------------------------------
let NOW = Date.UTC(2026, 8, 3, 10, 30);
let sent, answer, retried, said, store;

function build(opts) {
  opts = opts || {};
  store = new Map();
  sent = [];
  retried = [];
  said = [];

  const ctx = {
    console,
    JSON, Math, Number, String, Array, RegExp, Uint8Array, Error, Promise,
    Date: { now: () => NOW },
    window: opts.noCrypto ? {} : { crypto: require('crypto').webcrypto },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => void store.set(k, String(v)),
      removeItem: (k) => void store.delete(k),
    },
    // What start() leans on, in the shapes the app really uses.
    cartFigures: () => ({ total: opts.total === undefined ? 12.5 : opts.total }),
    peekReceiptNo: () => 'K7-0042',
    show: () => {},
    state: (text) => said.push(text),
    hide: () => {},
    offerRetry: (m) => retried.push(m),
    showToast: (m) => retried.push('toast:' + m),
    call: async (path, o) => {
      sent.push({ path: path, body: JSON.parse((o && o.body) || 'null') });
      if (answer instanceof Error) throw answer;
      return answer;
    },
    check: () => {},
    setInterval: () => 1,
    setTimeout: () => 2,
    clearInterval: () => {},
    clearTimeout: () => {},
  };
  vm.createContext(ctx);
  vm.runInContext(
    KEYS + START +
      '\nthis.start = start; this.attemptKeyFor = attemptKeyFor;' +
      '\nthis.forgetAttemptKey = forgetAttemptKey; this.readPending = readPending;' +
      // What offerRetry() does to let the next press through, without dragging
      // the whole waiting screen in with it.
      '\nthis.release = function(){ active = null; };',
    ctx
  );
  return ctx;
}

const held = () => { try { return JSON.parse(store.get('posCardAttempt') || 'null'); } catch (e) { return null; } };
const keyOf = (n) => (sent[n] && sent[n].body && sent[n].body.idempotencyKey) || null;
const ok = (over) => Object.assign({ id: 'f'.repeat(32), status: 'pending', amountMinor: 1250 }, over || {});
const ID = 'f'.repeat(32);

(async function () {

  console.log('\nEvery attempt carries a key');
  {
    const app = build();
    const k = app.attemptKeyFor(1250);
    check('the key is the shape the service accepts', /^[0-9a-f]{32}$/.test(k), k);
    check('a different basket gets a different key', app.attemptKeyFor(9999) !== k);

    const plain = build({ noCrypto: true });
    const f = plain.attemptKeyFor(1250);
    check('a browser with no crypto still gets one', /^[0-9a-f]{32}$/.test(f), f);
    check('and it is still not the same as the next', plain.attemptKeyFor(9999) !== f);
  }

  console.log('\nThe answer was lost: the key is KEPT');
  {
    const app = build();
    answer = new Error('Payment service error');
    await app.start();
    check('the till was told', retried.length === 1, JSON.stringify(retried));
    check('a key went out with the request', /^[0-9a-f]{32}$/.test(keyOf(0)), String(keyOf(0)));
    check('nothing is recorded as pending - there is no id', app.readPending() === null);
    check('the key is still written down', held() && held().key === keyOf(0), JSON.stringify(held()));

    // The press that would otherwise charge the customer a second time.
    answer = ok({ reused: true });
    await app.start();
    check('Try again presents the SAME key', keyOf(1) === keyOf(0), keyOf(1) + ' vs ' + keyOf(0));
    check('and the same amount', sent[1].body.amountMinor === 1250, JSON.stringify(sent[1].body));
    check('now there is an id, so it is recorded', app.readPending() && app.readPending().id === ID);
    check('and the key is dropped', held() === null, JSON.stringify(held()));
    check('the screen does not claim the customer has yet to tap',
      /already sent to the reader/.test(said[said.length - 1]), said[said.length - 1]);
  }

  console.log('\nThe attempt was answered: the key is DROPPED');
  // A payment with an id is handled by the id from then on. Keeping the key
  // would let a later press be answered with a payment that is already over.
  {
    const app = build();
    answer = ok();
    await app.start();
    check('the sale has its id', app.readPending() && app.readPending().id === ID);
    check('the key is gone the moment the service answers', held() === null, JSON.stringify(held()));

    app.release();                         // as offerRetry() does
    await app.start();
    check('the next attempt is a NEW payment', keyOf(1) !== keyOf(0), keyOf(1) + ' vs ' + keyOf(0));
  }

  console.log('\nA key belongs to one basket');
  {
    const app = build();
    answer = new Error('no answer');
    await app.start();
    check('the same total straight away reuses it', app.attemptKeyFor(1250) === keyOf(0));
    check('a different total does not', app.attemptKeyFor(1795) !== keyOf(0));
  }

  console.log('\nand only briefly');
  // Ringing the same amount through half an hour later is a different customer.
  // Handing that one the old key could answer it with the earlier payment - a
  // sale recorded against money taken from somebody else.
  {
    const app = build();
    answer = new Error('no answer');
    await app.start();
    const first = keyOf(0);
    NOW += 30 * 60 * 1000;
    check('the same total much later gets a key of its own', app.attemptKeyFor(1250) !== first);
    NOW -= 30 * 60 * 1000;
  }

  console.log('\nGiving up on the card clears it');
  // Both buttons under a failed payment lead here. The next card sale for the
  // same amount must be a payment of its own.
  {
    const app = build();
    answer = new Error('no answer');
    await app.start();
    check('the key survived the failure', held() !== null);
    app.forgetAttemptKey();
    check('and is cleared when the operator walks away', held() === null);
  }

  console.log('\nAn empty basket never reaches the reader');
  {
    const app = build({ total: 0 });
    answer = ok();
    await app.start();
    check('nothing was sent', sent.length === 0, JSON.stringify(sent));
    check('and no key was minted for it', held() === null, JSON.stringify(held()));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
})();
