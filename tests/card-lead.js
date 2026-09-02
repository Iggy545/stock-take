// Runs the REAL "which picture fronts this card" code out of index.html.
//
//   node tests/card-lead.js index.html
//
// WHAT THIS IS FOR. On the website's browsing list a card is a GROUP of items
// sharing a name, and until v1.40.0 the picture on it was whichever member
// sorted first alphabetically. That is the alphabet choosing the shop window:
// the Crochet card is six items and three sets, and it fronted itself with a
// black bracelet because "Black" comes before "Tan" and "White".
//
// So one member can be marked to lead the card - `lead` is 'item' for that
// member's own photograph, or 'set' for the photograph of the set it owns.
//
// TWO WAYS IT GOES WRONG, and both are quiet:
//
//   - two members of one card both claiming it, and the website silently
//     picking whichever it reached first. Then the tick looks broken rather
//     than contested, and nobody can tell which one is winning. Ticking has to
//     untick, which is what clearGroupLead is for.
//   - the group being read differently here from the way the website reads it.
//     The card is worked out from the name, so if the till and shop.js disagree
//     about where a group ends, a tick lands on a card the customer never sees.
//     variantSplit is the shared answer, and tests/variant-names.js pins it.
const fs = require('fs');
const vm = require('vm');

const HTML = fs.readFileSync(process.argv[2], 'utf8');

function slice(start, end, what) {
  const a = HTML.indexOf(start), b = HTML.indexOf(end);
  if (a < 0 || b < 0 || b < a) { console.error('could not locate ' + what); process.exit(2); }
  return HTML.slice(a, b);
}

// The real name-splitting, not a stand-in: a group read differently from the
// website is the whole failure this file is here to catch.
const NAMES = slice('  // ---- variant names ----', '  // ---- end variant names ----',
  'the variant names block');
const LEAD = slice('  // WHICH PICTURE FRONTS A CARD', "  // Keep every item's key agreeing",
  'the card-lead block');

const ctx = { console, items: {} };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(NAMES + '\n' + LEAD, ctx);

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

const DASH = '—';
// The shop's real Crochet card: six items, three sets, one name.
function crochet() {
  return {
    'KA-048': { name: 'Crochet Bracelet and Pendant Set ' + DASH + ' Black Bracelet' },
    'KA-049': { name: 'Crochet Bracelet and Pendant Set ' + DASH + ' Black Necklace' },
    'KA-051': { name: 'Crochet Bracelet and Pendant Set ' + DASH + ' Tan Bracelet' },
    'KA-052': { name: 'Crochet Bracelet and Pendant Set ' + DASH + ' Tan Necklace' },
    'KA-054': { name: 'Crochet Bracelet and Pendant Set ' + DASH + ' White Bracelet' },
    'KA-055': { name: 'Crochet Bracelet and Pendant Set ' + DASH + ' White Necklace' },
    'CA-999': { name: 'Mookaite Bracelet' },
  };
}
const leads = () => Object.keys(ctx.items)
  .filter((bc) => ctx.items[bc].lead)
  .map((bc) => bc + '=' + ctx.items[bc].lead).sort().join(' ');

console.log('\nWhich items share a card');
{
  ctx.items = crochet();
  check('every variant of one name is in the group',
    ctx.itemsInGroupOf('KA-048').sort().join(',')
      === 'KA-048,KA-049,KA-051,KA-052,KA-054,KA-055',
    ctx.itemsInGroupOf('KA-048').sort().join(','));
  check('and it is the same group asked from any member of it',
    ctx.itemsInGroupOf('KA-055').sort().join(',')
      === ctx.itemsInGroupOf('KA-048').sort().join(','));
  // A lone item is its own card, so the tick is never offered on one.
  check('an item with no dash in its name is a group of itself',
    ctx.itemsInGroupOf('CA-999').join(',') === 'CA-999',
    ctx.itemsInGroupOf('CA-999').join(','));
  check('a barcode that is not there is a group of nothing',
    ctx.itemsInGroupOf('NOPE').length === 0);
}

console.log('\nAnother card is another card');
{
  ctx.items = crochet();
  ctx.items['KA-057'] = { name: 'Jasper Beads Bracelet and Necklace Set ' + DASH + ' Bracelet' };
  ctx.items['KA-058'] = { name: 'Jasper Beads Bracelet and Necklace Set ' + DASH + ' Necklace' };
  check('the Jasper card holds only its own two',
    ctx.itemsInGroupOf('KA-057').sort().join(',') === 'KA-057,KA-058',
    ctx.itemsInGroupOf('KA-057').sort().join(','));
  check('and the Crochet card is untouched by it',
    ctx.itemsInGroupOf('KA-048').length === 6);
}

console.log('\nOnly one member can lead a card');
{
  ctx.items = crochet();
  ctx.items['KA-048'].lead = 'item';
  ctx.items['KA-051'].lead = 'set';
  ctx.items['KA-055'].lead = 'item';
  ctx.clearGroupLead('KA-051', 'KA-051');
  check('the one doing the ticking keeps it', ctx.items['KA-051'].lead === 'set');
  check('and every other member of the card gives it up', leads() === 'KA-051=set', leads());
}

console.log('\nBut a different card is left alone');
{
  ctx.items = crochet();
  ctx.items['KA-057'] = {
    name: 'Jasper Beads Bracelet and Necklace Set ' + DASH + ' Bracelet', lead: 'item' };
  ctx.items['KA-048'].lead = 'item';
  ctx.clearGroupLead('KA-048', 'KA-048');
  check('the Jasper card keeps its own choice',
    ctx.items['KA-057'].lead === 'item', leads());
  check('while the Crochet card settles on one', leads() === 'KA-048=item KA-057=item', leads());
}

console.log('\nClearing without an exception clears the whole card');
{
  // What Save does when the tick has been taken off: nobody leads.
  ctx.items = crochet();
  ctx.items['KA-048'].lead = 'item';
  ctx.clearGroupLead('KA-048', null);
  check('no member is left leading', leads() === '', leads());
}

console.log('\nA lone item cannot take anyone else down with it');
{
  ctx.items = crochet();
  ctx.items['KA-048'].lead = 'item';
  ctx.items['CA-999'].lead = 'item';
  ctx.clearGroupLead('CA-999', 'CA-999');
  check('the item with no group clears only itself',
    leads() === 'CA-999=item KA-048=item', leads());
}

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
