// Runs the REAL variant-name helpers out of index.html. Same trick as the
// others: slice the shipped source out by its comment markers and run it in a
// vm, so what is tested is what ships rather than a copy that can drift.
//
// What these guard is one character. The till and shop-site/shop.js have to
// agree on it exactly, and nothing about a disagreement looks like an error:
// items simply stop grouping, or worse, two unrelated products quietly become
// one card with a dropdown.
const fs = require('fs');
const vm = require('vm');

const HTML = fs.readFileSync(process.argv[2], 'utf8');
const START = '  // ---- variant names ----';
const END = '  // ---- end variant names ----';
const a = HTML.indexOf(START), b = HTML.indexOf(END);
if (a < 0 || b < 0) { console.error('could not locate the variant names block'); process.exit(2); }
const SRC = HTML.slice(a, b);

const ctx = { console };
vm.createContext(ctx);
vm.runInContext(SRC + '\nthis.T = { VARIANT_DASH, variantSplit, variantGroupsFrom, variantDashFix, variantJoin, variantGroupDesc, variantDescFollowers };', ctx);
const T = ctx.T;

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

const EM = '—';

console.log('\nThe dash itself');
{
  // If this is ever an en dash or a hyphen the website stops grouping and
  // nothing anywhere says so.
  check('is U+2014, the em dash', T.VARIANT_DASH === EM, JSON.stringify(T.VARIANT_DASH));
  check('is one character', T.VARIANT_DASH.length === 1);
}

console.log('\nSplitting a name');
{
  const r = T.variantSplit('Wind Spinner ' + EM + ' Blue');
  check('group is the part in front', r.group === 'Wind Spinner', r.group);
  check('label is the part after', r.label === 'Blue', r.label);
}
{
  const r = T.variantSplit('Wind Spinner' + EM + 'Blue');
  check('spaces round the dash are optional', r.group === 'Wind Spinner' && r.label === 'Blue');
}
{
  const r = T.variantSplit('Wind  Spinner  ' + EM + '   Blue  ');
  check('both halves are trimmed', r.group === 'Wind  Spinner' && r.label === 'Blue', r.group + '|' + r.label);
}
{
  const r = T.variantSplit('Rose Quartz Bracelet');
  check('no dash means no group', r.group === '' && r.label === '');
}
{
  // A hyphen is not an em dash. This is the whole reason the tap exists.
  const r = T.variantSplit('Chakra Key Chain - Eye');
  check('a plain hyphen does NOT make a group', r.group === '', r.group);
  const r2 = T.variantSplit('Wind Spinner – Blue');
  check('an en dash does NOT make a group either', r2.group === '', r2.group);
}
{
  // shop.js takes the FIRST dash, so this must too or the two disagree about
  // which card an item lands on.
  const r = T.variantSplit('Oil ' + EM + ' Calm ' + EM + ' 10ml');
  check('the first dash wins', r.group === 'Oil' && r.label === 'Calm ' + EM + ' 10ml', r.group + '|' + r.label);
}
{
  check('an empty name is safe', T.variantSplit('').group === '');
  check('a missing name is safe', T.variantSplit(undefined).group === '' && T.variantSplit(null).group === '');
}

console.log('\nThe groups already in the shop');
{
  const g = T.variantGroupsFrom([
    'Wind Spinner ' + EM + ' Blue',
    'Wind Spinner ' + EM + ' Red',
    'Wind Spinner ' + EM + ' Green',
    'Oil ' + EM + ' Calm',
    'Rose Quartz Bracelet',
    'Chakra Key Chain - Eye',
  ]);
  check('only real groups are counted', g.length === 2, JSON.stringify(g));
  check('the biggest comes first', g[0].name === 'Wind Spinner' && g[0].n === 3, JSON.stringify(g[0]));
  // A group of one is exactly the item you are about to join, so it has to be
  // offered - otherwise the second wind spinner is as hard as the first.
  check('a group of one is still offered', g[1].name === 'Oil' && g[1].n === 1);
}
{
  const g = T.variantGroupsFrom([
    'wind spinner ' + EM + ' Blue',
    'Wind Spinner ' + EM + ' Red',
  ]);
  check('case does not split one group in two', g.length === 1 && g[0].n === 2, JSON.stringify(g));
}
{
  const g = T.variantGroupsFrom([
    'Bracelet ' + EM + ' S', 'Bracelet ' + EM + ' M',
    'Anklet ' + EM + ' S',   'Anklet ' + EM + ' M',
  ]);
  check('a tie is broken alphabetically', g[0].name === 'Anklet' && g[1].name === 'Bracelet');
}
{
  check('no items at all is safe', T.variantGroupsFrom([]).length === 0);
  check('no list at all is safe', T.variantGroupsFrom(undefined).length === 0);
}

console.log('\nOffering to fix a typed hyphen');
{
  const groups = T.variantGroupsFrom(['Wind Spinner ' + EM + ' Blue']);
  check('offers the em dash when the group exists',
    T.variantDashFix('Wind Spinner - Red', groups) === 'Wind Spinner ' + EM + ' Red',
    T.variantDashFix('Wind Spinner - Red', groups));
  check('an en dash is offered the same fix',
    T.variantDashFix('Wind Spinner – Red', groups) === 'Wind Spinner ' + EM + ' Red');
  check('the group name is matched whatever the case',
    T.variantDashFix('wind spinner - Red', groups) === 'wind spinner ' + EM + ' Red');
}
{
  // The point of the guard. Two products that merely share a first word must
  // not be nudged into one card - that is a card the shop never asked for and
  // a wrong one looks exactly like a right one.
  const groups = T.variantGroupsFrom(['Wind Spinner ' + EM + ' Blue']);
  check('an unknown group is NOT offered', T.variantDashFix('Chakra Key Chain - Eye', groups) === '',
    T.variantDashFix('Chakra Key Chain - Eye', groups));
  check('nothing is offered when the shop has no groups yet',
    T.variantDashFix('Wind Spinner - Red', []) === '');
}
{
  const groups = T.variantGroupsFrom(['Wind Spinner ' + EM + ' Blue']);
  check('a name that already has the dash needs no fix',
    T.variantDashFix('Wind Spinner ' + EM + ' Red', groups) === '');
  check('a hyphen with no spaces is left alone',
    T.variantDashFix('Wind Spinner-Red', groups) === '');
  check('an ordinary name is left alone', T.variantDashFix('Rose Quartz Bracelet', groups) === '');
  check('an empty name is safe', T.variantDashFix('', groups) === '');
  check('a missing name is safe', T.variantDashFix(undefined, groups) === '');
}

console.log('\nJoining a name to a group');
{
  check('a plain name keeps what it says as the choice',
    T.variantJoin('Blue', 'Wind Spinner') === 'Wind Spinner ' + EM + ' Blue',
    T.variantJoin('Blue', 'Wind Spinner'));
  // Tapping the plus on "Wind Spinner" must not read "Wind Spinner - Wind
  // Spinner"; it should leave the cursor ready for the colour.
  check('a name tapped onto itself leaves the choice blank',
    T.variantJoin('Wind Spinner', 'Wind Spinner') === 'Wind Spinner ' + EM + ' ',
    JSON.stringify(T.variantJoin('Wind Spinner', 'Wind Spinner')));
  check('and it does so whatever the case',
    T.variantJoin('wind spinner', 'Wind Spinner') === 'Wind Spinner ' + EM + ' ');
}
{
  // A wrong tap has to be recoverable without retyping the colour.
  check('re-tapping swaps the group and keeps the choice',
    T.variantJoin('Wind Spinner ' + EM + ' Blue', 'Sun Catcher') === 'Sun Catcher ' + EM + ' Blue',
    T.variantJoin('Wind Spinner ' + EM + ' Blue', 'Sun Catcher'));
}
{
  check('a hyphen name is not treated as already grouped',
    T.variantJoin('Chakra Key Chain - Eye', 'Chakra Key Chain')
      === 'Chakra Key Chain ' + EM + ' Chakra Key Chain - Eye');
  check('whitespace round the group is dropped',
    T.variantJoin('Blue', '  Wind Spinner  ') === 'Wind Spinner ' + EM + ' Blue');
  check('an empty name is safe', T.variantJoin('', 'Wind Spinner') === 'Wind Spinner ' + EM + ' ');
  check('a missing name is safe', T.variantJoin(undefined, 'Wind Spinner') === 'Wind Spinner ' + EM + ' ');
}

console.log('\nWhat comes back out');
{
  // The round trip is the contract with the website: whatever these build,
  // shop.js has to be able to split back into the same two halves.
  ['Blue', 'Rose Gold', '10ml', 'Small / S'].forEach(colour => {
    const joined = T.variantJoin(colour, 'Wind Spinner');
    const back = T.variantSplit(joined);
    check('"' + colour + '" survives the round trip',
      back.group === 'Wind Spinner' && back.label === colour, joined);
  });
}
{
  const groups = T.variantGroupsFrom(['Wind Spinner ' + EM + ' Blue']);
  const fixed = T.variantDashFix('Wind Spinner - Red', groups);
  const back = T.variantSplit(fixed);
  check('a fixed name lands in the group it was offered',
    back.group === 'Wind Spinner' && back.label === 'Red', fixed);
  const after = T.variantGroupsFrom(['Wind Spinner ' + EM + ' Blue', fixed]);
  check('and the group now has two in it', after.length === 1 && after[0].n === 2);
}

// One description across a group. The website shows whichever variant the
// customer picked, so a group that disagrees with itself makes the words change
// under them - and the two functions here are what stops that: one offers the
// group's words on the way in, one offers to carry a change across on the way
// out.
console.log('\nThe description a group already uses');
{
  const others = [
    { name: 'Wind Spinner ' + EM + ' Blue',  webDesc: 'Hand made, spins in the lightest breeze.' },
    { name: 'Wind Spinner ' + EM + ' Red',   webDesc: 'Hand made, spins in the lightest breeze.' },
    { name: 'Rose Quartz Bracelet',          webDesc: 'Not a variant of anything.' }
  ];
  const r = T.variantGroupDesc('Wind Spinner ' + EM + ' Green', others);
  check('finds what the group already says', r.desc === 'Hand made, spins in the lightest breeze.', r.desc);
  check('counts only the ones that say it', r.same === 2, String(r.same));
  check('counts the group itself separately', r.n === 2, String(r.n));
  check('names the group', r.group === 'Wind Spinner', r.group);
}
{
  // An item with no dash in its name is its own card on the website, so it is
  // nobody's sibling however much of the name it shares.
  const r = T.variantGroupDesc('Rose Quartz Bracelet', [
    { name: 'Rose Quartz Bracelet ' + EM + ' Small', webDesc: 'Six inches.' }
  ]);
  check('a name with no dash is in no group', r.desc === '' && r.n === 0, r.desc);
}
{
  const r = T.variantGroupDesc('Wind Spinner ' + EM + ' Green', [
    { name: 'Wind Spinner ' + EM + ' Blue', webDesc: '' },
    { name: 'Wind Spinner ' + EM + ' Red' }
  ]);
  check('a group nobody has described offers nothing', r.desc === '' && r.same === 0);
  check('but the group is still seen', r.n === 2, String(r.n));
}
{
  // Storage hands items back in whatever order it likes. The answer must not.
  const a = { name: 'Oil ' + EM + ' 10ml', webDesc: 'Long one. Blended in the shop.' };
  const b = { name: 'Oil ' + EM + ' 30ml', webDesc: 'Short one.' };
  const c = { name: 'Oil ' + EM + ' 50ml', webDesc: 'Short one.' };
  const first  = T.variantGroupDesc('Oil ' + EM + ' 5ml', [a, b, c]).desc;
  const second = T.variantGroupDesc('Oil ' + EM + ' 5ml', [c, b, a]).desc;
  check('the commonest wins', first === 'Short one.', first);
  check('and the order items arrive in changes nothing', first === second, second);
}
{
  const two = [
    { name: 'Oil ' + EM + ' 10ml', webDesc: 'Longer of the two.' },
    { name: 'Oil ' + EM + ' 30ml', webDesc: 'Short.' }
  ];
  const r1 = T.variantGroupDesc('Oil ' + EM + ' 5ml', two);
  const r2 = T.variantGroupDesc('Oil ' + EM + ' 5ml', two.slice().reverse());
  check('a tie breaks the same way either way round', r1.desc === r2.desc, r1.desc + '|' + r2.desc);
  check('and a tie takes the longer one', r1.desc === 'Longer of the two.', r1.desc);
}
{
  // A description of "constructor" must not be read off Object.prototype and
  // counted as a function.
  const r = T.variantGroupDesc('Oil ' + EM + ' 5ml', [
    { name: 'Oil ' + EM + ' 10ml', webDesc: 'constructor' }
  ]);
  check('an awkward description is still just a string', r.desc === 'constructor' && r.same === 1);
}

console.log('\nCarrying a changed description across');
{
  const WAS = 'Hand made, spins in the lightest breeze.';
  const others = [
    { id: 'a', name: 'Wind Spinner ' + EM + ' Blue', webDesc: WAS },
    { id: 'b', name: 'Wind Spinner ' + EM + ' Red',  webDesc: '  ' + WAS + ' ' },
    { id: 'c', name: 'Wind Spinner ' + EM + ' Gold', webDesc: 'Gold one, written on its own.' },
    { id: 'd', name: 'Wind Spinner ' + EM + ' Pink' },
    { id: 'e', name: 'Wind Chime ' + EM + ' Blue',   webDesc: WAS }
  ];
  const got = T.variantDescFollowers('Wind Spinner ' + EM + ' Green', WAS, others).map(o => o.id).join('');
  check('reaches the ones still saying the old thing', got.indexOf('a') > -1 && got.indexOf('b') > -1, got);
  check('spacing round it is not a difference', got === 'ab', got);
  check('leaves one written separately alone', got.indexOf('c') < 0, got);
  check('leaves an empty one alone', got.indexOf('d') < 0, got);
  check('never leaves the group', got.indexOf('e') < 0, got);
}
{
  const others = [{ name: 'Wind Spinner ' + EM + ' Blue', webDesc: '' }];
  check('an item that never had a description carries nothing across',
    T.variantDescFollowers('Wind Spinner ' + EM + ' Green', '', others).length === 0);
  check('and neither does one with no group at all',
    T.variantDescFollowers('Rose Quartz Bracelet', 'Anything.', others).length === 0);
}
{
  // The two working together: what the tick copies in is exactly what the offer
  // would later recognise as the old wording.
  const WAS = 'Blended in the shop.';
  const others = [
    { name: 'Oil ' + EM + ' 10ml', webDesc: WAS },
    { name: 'Oil ' + EM + ' 30ml', webDesc: WAS }
  ];
  const copied = T.variantGroupDesc('Oil ' + EM + ' 5ml', others).desc;
  check('what the tick copies is what the offer later matches on',
    T.variantDescFollowers('Oil ' + EM + ' 5ml', copied, others).length === 2, copied);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
