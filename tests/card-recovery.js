// Runs the REAL decision about an unfinished card payment out of index.html.
// Same trick as the others: slice the shipped source out by its comment
// markers and run it in a vm, so what is tested is what ships.
//
// What this guards is the narrowest and most expensive thing in the app. A
// card payment lives in a closure variable, and a refresh, a crash or iOS
// killing a backgrounded Home Screen app takes it with it. The customer is
// charged; the sale is never written down. The id is therefore also written to
// localStorage, and on the next load the till goes and asks what happened.
//
// Three of these cases cost real money if they are decided wrongly:
//
//   * A payment still open at SumUp must be KEPT. Forgetting it is how a taken
//     payment becomes a payment nobody ever asks about again.
//   * A payment that was taken while the basket has since changed must NOT be
//     recorded automatically -- that writes the wrong lines against real money.
//   * A payment that can no longer be asked about must be REPORTED, not
//     guessed at. Inventing a sale and hiding one are both wrong; only the
//     SumUp app knows.
const fs = require('fs');
const vm = require('vm');

const HTML = fs.readFileSync(process.argv[2], 'utf8');
const START = '    function recoveryPlan(rec, now, basketMinor){';
const END = '    // Asks the service what happened, then hands the plan to the page.';
const a = HTML.indexOf(START), b = HTML.indexOf(END);
if (a < 0 || b < 0) { console.error('could not locate recoveryPlan'); process.exit(2); }
const SRC = HTML.slice(a, b);

// recover() is sliced too. It is not pure - it talks to the payment service -
// but what it decides to do with the answer is the whole point: an id dropped
// when it should have been kept is a payment nobody will ever ask about again,
// and no amount of testing the pure part would catch that.
const R_START = '    // Asks the service what happened, then hands the plan to the page.';
const R_END = '    return { isSet:isSet, get:get, set:set, start:start, cancel:cancel,';
const ra = HTML.indexOf(R_START), rb = HTML.indexOf(R_END);
if (ra < 0 || rb < 0) { console.error('could not locate recover'); process.exit(2); }
const R_SRC = HTML.slice(ra, rb);

// The one page helper recoveryPlan leans on, in the format the app really uses.
const ctx = { console, money: (n) => '£' + Number(n).toFixed(2) };
vm.createContext(ctx);
vm.runInContext(SRC + '\nthis.recoveryPlan = recoveryPlan;', ctx);
const recoveryPlan = ctx.recoveryPlan;

// A plan that has no message at all is a FAIL, not a crash. A broken copy that
// takes the run down with it stops the rest of the checks ever being seen, and
// the whole point of running these against broken copies is to watch each one
// fail on its own terms.
const msg = (plan) => (plan && plan.message) || '';

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

// What start() wrote down: 3 September 2026, receipt K7-0042, £12.50.
const AT = Date.UTC(2026, 8, 3, 10, 30);
function pending(over) {
  return Object.assign({ id: 'a'.repeat(32), amountMinor: 1250, ref: 'K7-0042', at: AT }, over || {});
}
function paid(over) {
  return Object.assign({ status: 'paid', sumupTransactionId: 'tx_9f3c',
                         sumupTransactionCode: 'TCJK4Q' }, over || {});
}

console.log('\nNothing to settle');
check('no record at all', recoveryPlan(null, null, 0).mode === 'none');
check('a record with no id', recoveryPlan({ amountMinor: 1250 }, null, 0).mode === 'none');

console.log('\nSettled without taking money');
const failed = recoveryPlan(pending(), { status: 'failed' }, 1250);
check('a failed payment says nothing', failed.mode === 'none', failed.mode);
check('and is forgotten', failed.keep === false, String(failed.keep));

console.log('\nStill open at SumUp');
const open = recoveryPlan(pending(), { status: 'pending' }, 1250);
check('says nothing yet', open.mode === 'none', open.mode);
check('but is KEPT to ask again', open.keep === true, String(open.keep));

console.log('\nPaid, and the basket still matches');
const rec = recoveryPlan(pending(), paid(), 1250);
check('offers to record the sale', rec.mode === 'record', rec.mode);
check('the button says what it will do', rec.okLabel === 'Record the sale', rec.okLabel);
check('it carries the service answer through', rec.result && rec.result.sumupTransactionId === 'tx_9f3c');
check('it is kept until the sale is actually written', rec.keep === true, String(rec.keep));
check('it names the amount', msg(rec).indexOf('£12.50') >= 0, msg(rec));
check('it names the code on the card slip', msg(rec).indexOf('TCJK4Q') >= 0, msg(rec));
check('it says the money was taken', /taken but never recorded/i.test(msg(rec)), msg(rec));

console.log('\nPaid, but the basket has moved on');
const orphan = recoveryPlan(pending(), paid(), 1795);
check('does NOT offer to record it', orphan.mode === 'orphan', orphan.mode);
check('there is no sale to complete', !orphan.result);
check('it is not kept - nothing more can be done here', orphan.keep === false, String(orphan.keep));
check('it names the code so it can be found', msg(orphan).indexOf('TCJK4Q') >= 0, msg(orphan));
check('it says to ring it up or refund it', /ring the sale up|refund it/i.test(msg(orphan)), msg(orphan));
check('it dates it', /3 September/.test(msg(orphan)), msg(orphan));

console.log('\nAn empty basket is not a match');
// Both zero would compare equal, and "record the sale" on an empty basket
// would write a transaction with no lines against a real card payment.
const zero = recoveryPlan(pending({ amountMinor: 0 }), paid(), 0);
check('a zero payment never reaches record', zero.mode !== 'record', zero.mode);
const emptied = recoveryPlan(pending(), paid(), 0);
check('a cleared basket is an orphan, not a match', emptied.mode === 'orphan', emptied.mode);

console.log('\nNo longer askable - the service keeps a record for two days');
const lost = recoveryPlan(pending(), null, 1250);
check('it is reported, not guessed at', lost.mode === 'unknown', lost.mode);
check('it does not claim a sale happened', !/went through|was taken/i.test(msg(lost)) && lost.mode === 'unknown', msg(lost));
check('it does not claim one did not', !/no payment|nothing was charged/i.test(msg(lost)) && lost.mode === 'unknown', msg(lost));
check('it points at the SumUp app', /SumUp app/.test(msg(lost)), msg(lost));
check('it names the receipt to look for', msg(lost).indexOf('K7-0042') >= 0, msg(lost));
check('it is cleared - asking again cannot help', lost.keep === false, String(lost.keep));

console.log('\nA record with no receipt number still reads properly');
const noRef = recoveryPlan(pending({ ref: null }), null, 1250);
check('no dangling "under receipt"', !/under receipt\s*\./.test(msg(noRef)), msg(noRef));
check('still points at the SumUp app', /SumUp app\./.test(msg(noRef)), msg(noRef));

// ---------------------------------------------------------------------------
// recover(): what survives, and what is thrown away.
//
// Everything round it is stood in for, so each run is one scripted
// conversation with the payment service and the question is only ever "is the
// record still there afterwards".
function runRecover(opts) {
  const calls = [];
  let store = opts.pending === undefined ? pending() : opts.pending;
  const answers = (opts.answers || []).slice();
  const rctx = {
    console,
    money: (n) => '£' + Number(n).toFixed(2),
    RECOVER_TRIES: 6,
    RECOVER_GAP_MS: 0,                        // no real waiting in a test
    setTimeout: (fn) => fn(),
    isSet: () => opts.readerSet !== false,
    readPending: () => store,
    forgetPending: () => { store = null; },
    cartFigures: () => ({ total: (opts.basketMinor === undefined ? 1250 : opts.basketMinor) / 100 }),
    call: async (path) => {
      calls.push(path);
      const a = answers.shift();
      if (!a) throw new Error('offline');                  // no status: try again
      if (a.throwStatus) throw Object.assign(new Error('nope'), { status: a.throwStatus });
      if (a.throwPlain) throw new Error('Sign in to team sync first');
      return a;
    },
  };
  vm.createContext(rctx);
  vm.runInContext(SRC + '\n' + R_SRC + '\nthis.recover = recover;', rctx);
  return rctx.recover().then((plan) => ({ plan, calls, left: store }));
}

(async () => {
  console.log('\nrecover(): a till with no reader set up');
  let r = await runRecover({ readerSet: false, answers: [paid()] });
  check('never asks', r.calls.length === 0, String(r.calls.length));
  check('and leaves the record alone', !!r.left);

  console.log('\nrecover(): nothing was left pending');
  r = await runRecover({ pending: null, answers: [paid()] });
  check('never asks', r.calls.length === 0, String(r.calls.length));
  check('says nothing', r.plan === null, JSON.stringify(r.plan));

  console.log('\nrecover(): it had been paid');
  r = await runRecover({ answers: [paid()] });
  check('asks about the right payment', r.calls[0] === '/checkout/' + 'a'.repeat(32), r.calls[0]);
  check('offers to record it', r.plan && r.plan.mode === 'record', r.plan && r.plan.mode);
  check('the record SURVIVES until the sale is written', !!r.left);

  console.log('\nrecover(): the service no longer has it (404)');
  r = await runRecover({ answers: [{ throwStatus: 404 }] });
  check('stops asking at once', r.calls.length === 1, String(r.calls.length));
  check('reports it rather than guessing', r.plan && r.plan.mode === 'unknown', r.plan && r.plan.mode);
  check('and clears it - asking again cannot help', r.left === null);

  console.log('\nrecover(): the sign-in token was not ready yet');
  r = await runRecover({ answers: [{ throwPlain: true }, { throwPlain: true }, paid()] });
  check('keeps trying', r.calls.length === 3, String(r.calls.length));
  check('and settles once it can ask', r.plan && r.plan.mode === 'record', r.plan && r.plan.mode);

  console.log('\nrecover(): the shop is offline');
  r = await runRecover({ answers: [] });
  check('tries and stops', r.calls.length === 6, String(r.calls.length));
  check('says nothing rather than guessing', r.plan === null, JSON.stringify(r.plan));
  check('the record is KEPT for the next load', !!r.left,
        'a dropped record is a payment nobody ever asks about again');

  console.log('\nrecover(): it had failed after all');
  r = await runRecover({ answers: [{ status: 'failed' }] });
  check('says nothing', r.plan && r.plan.mode === 'none', r.plan && r.plan.mode);
  check('and clears it', r.left === null);

  console.log('\nrecover(): still open at the reader');
  r = await runRecover({ answers: [{ status: 'pending' }] });
  check('says nothing yet', r.plan && r.plan.mode === 'none', r.plan && r.plan.mode);
  check('but KEEPS it to ask again', !!r.left);

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
