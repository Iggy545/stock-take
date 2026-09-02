// Runs the REAL "Undo last sale" decision out of index.html. Same trick as the
// others: slice the shipped source out by its comment markers and run it in a
// vm, so what is tested is what ships rather than a copy that can drift.
//
// The thing worth guarding is narrow and important: Undo deletes a transaction,
// and the app cannot move money. A card sale must therefore never be deletable
// -- the customer would be left charged, the card reference thrown away, and no
// "card refund due" reminder written, because that only ever lives on a refund
// line. A refund of a card sale, on the other hand, MUST stay undoable: it is
// the only way back from a refund given in error.
const fs = require('fs');
const vm = require('vm');

const HTML = fs.readFileSync(process.argv[2], 'utf8');
const START = '  function undoPlan(g){';
const END = '  // Undo removes the whole most-recent transaction';
const a = HTML.indexOf(START), b = HTML.indexOf(END);
if (a < 0 || b < 0) { console.error('could not locate undoPlan'); process.exit(2); }
const SRC = HTML.slice(a, b);

// The two page helpers undoPlan leans on, stood in for. money() only has to be
// recognisable in the message; txnTotal() is the real arithmetic.
const ctx = {
  console,
  money: (n) => '\u00a3' + Number(n).toFixed(2),
  txnTotal: (g) => Math.round(g.lines.reduce((s, l) => s + Number(l.net || 0), 0) * 100) / 100,
};
vm.createContext(ctx);
vm.runInContext(SRC + '\nthis.undoPlan = undoPlan;', ctx);
const undoPlan = ctx.undoPlan;

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

function line(over) {
  return Object.assign({ id: 'L1', name: 'Rose Quartz Angel', qty: 1, net: 12.5 }, over || {});
}
function sale(over) {
  return Object.assign({ id: 'T1', kind: 'sale', pay: 'cash', cardRefund: null,
                         lines: [line()] }, over || {});
}
function refund(over) {
  return Object.assign({ id: 'T2', kind: 'refund', pay: 'cash', cardRefund: null,
                         lines: [line({ id: 'L2', qty: -1, net: -12.5 })] }, over || {});
}

console.log('\nA card sale cannot be deleted');
const card = undoPlan(sale({ pay: 'card' }));
check('goes to the refund screen instead', card.mode === 'refund', card.mode);
check('the button says what it will do', card.okLabel === 'Refund it', card.okLabel);
check('the title names the reason', /card/i.test(card.title), card.title);
check('it says the app cannot send the money back', /cannot send it back/i.test(card.message));
check('it points at the reader', /reader/i.test(card.message));

console.log('\nEverything else still undoes');
const cash = undoPlan(sale());
check('a cash sale undoes', cash.mode === 'undo', cash.mode);
check('the button still says Undo', cash.okLabel === 'Undo', cash.okLabel);
check('it names the item', cash.message.indexOf('"Rose Quartz Angel"') === 0, cash.message);
check('it gives the amount', /\u00a312\.50/.test(cash.message), cash.message);
check('no card wording on a cash sale', !/reader|SumUp/i.test(cash.message), cash.message);

const two = undoPlan(sale({ lines: [line(), line({ id: 'L9', name: 'Selenite', net: 7.5 })] }));
check('two lines are counted, not named', two.message.indexOf('2 items') === 0, two.message);
check('and totalled', /\u00a320\.00/.test(two.message), two.message);

const other = undoPlan(sale({ pay: 'other' }));
check('"other" undoes with nothing added', other.mode === 'undo' && !/website|reader/i.test(other.message));

console.log('\nA web sale undoes, but says where the money is');
const web = undoPlan(sale({ pay: 'web' }));
check('it undoes', web.mode === 'undo', web.mode);
check('it says the money is not in the till', /online\s+account/i.test(web.message), web.message);

console.log('\nA refund is always undoable -- it is the only way back from one');
const dueRefund = undoPlan(refund({ pay: 'card', cardRefund: 'due' }));
check('a card refund not yet sent undoes', dueRefund.mode === 'undo', dueRefund.mode);
check('the card check is sale-only, never refund', dueRefund.okLabel === 'Undo', dueRefund.okLabel);
check('it says there is nothing to chase', /nothing has been sent/i.test(dueRefund.message), dueRefund.message);
check('the amount is positive, not minus', /\u00a312\.50/.test(dueRefund.message), dueRefund.message);

const sentRefund = undoPlan(refund({ pay: 'card', cardRefund: 'sent' }));
check('a sent card refund still undoes', sentRefund.mode === 'undo', sentRefund.mode);
check('but warns the money has gone', /customer keeps the money/i.test(sentRefund.message), sentRefund.message);
check('and that only the record goes', /record of it and nothing else/i.test(sentRefund.message));

const cashRefund = undoPlan(refund());
check('a cash refund gets neither sentence',
  cashRefund.mode === 'undo' && !/keeps the money|nothing has been sent/i.test(cashRefund.message),
  cashRefund.message);
check('refund titles say refund', cashRefund.title === 'Undo last refund?', cashRefund.title);
check('sale titles say sale', cash.title === 'Undo last sale?', cash.title);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
