// Runs the REAL photo-key block out of index.html.
//
// WHAT THIS PROTECTS, and it is money rather than correctness. The website's
// catalogue is rebuilt out of Firestore about ten times a day. It used to ask
// for `data.photo` on every live item, and a photograph taken on the till is a
// data: URI of about 97KB sitting in the record -- so every rebuild carried
// every embedded picture again, for items not even on the website. A hundred
// photographed items would be roughly 2.9GB a month against a 10GiB allowance,
// and it only ever grows. The till now stores the picture's IDENTITY beside it
// and shop-worker asks for that instead.
//
// Two ways that goes wrong, and both are silent:
//
//   - the key disagreeing with the picture, which serves a stale photograph or
//     a 404 in place of a working one. The fingerprint values below are pinned
//     as literals for exactly that: shop-worker/src/catalogue.js and
//     tools/photo-archive.py compute the same numbers, and an embedded picture
//     is archived as <barcode>-<fingerprint>.webp.
//   - the key being CLEARED on an item whose photo has not come back out of
//     IndexedDB yet, which would take that item's photograph off the website
//     until somebody happened to edit it.
//
// Nothing is mocked except the browser.
const fs = require('fs');
const vm = require('vm');

const HTML = fs.readFileSync(process.argv[2], 'utf8');
const START = '  // ---- the photo key: what the picture IS, without the picture ----';
const END = '  // A copy of items with photos removed, for localStorage';
const a = HTML.indexOf(START), b = HTML.indexOf(END);
if (a < 0 || b < 0) { console.error('could not locate the photo-key block'); process.exit(2); }
const SRC = HTML.slice(a, b);

const ctx = { items: {}, console };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(SRC, ctx);

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

const SUMUP = 'https://images.sumup.com/img_5N01TEVRT793FTM2GRDNYYJAZ9/image.png';
const EMBEDDED = 'data:image/jpeg;base64,/9j/4AAQ';

console.log('\nthe fingerprint, which three languages have to agree about');
// These literals are the contract. shop-worker/test/photo-key.test.js asserts
// the Worker produces the same strings, and photo-files.test.js already pins
// tools/photo-archive.py to the Worker. If you have changed the hash on
// purpose, every archived embedded photograph has to be renamed with it.
check('a known picture hashes to a known value',
  ctx.photoFingerprint('data:image/jpeg;base64,/9j/4AAQ') === '1506cehv',
  ctx.photoFingerprint('data:image/jpeg;base64,/9j/4AAQ'));
check('and another one does too',
  ctx.photoFingerprint('data:image/jpeg;base64,AAAA') === '138b1kvr',
  ctx.photoFingerprint('data:image/jpeg;base64,AAAA'));
check('nothing hashes to nothing',
  ctx.photoFingerprint('') === '' && ctx.photoFingerprint(undefined) === '');
check('the length is on the end, so a longer picture cannot collide',
  ctx.photoFingerprint('data:image/jpeg;base64,AAAA')
    !== ctx.photoFingerprint('data:image/jpeg;base64,AAAAA'));
check('re-photographing an item changes the fingerprint',
  ctx.photoFingerprint('data:image/jpeg;base64,AAAA')
    !== ctx.photoFingerprint('data:image/jpeg;base64,BBBB'));

console.log('\nthe key itself');
check('a hosted photo is its own key -- it is only an address already',
  ctx.photoKeyFor(SUMUP) === SUMUP, ctx.photoKeyFor(SUMUP));
check('an embedded photo becomes data: and a fingerprint',
  ctx.photoKeyFor(EMBEDDED) === 'data:1506cehv', ctx.photoKeyFor(EMBEDDED));
check('THE POINT: the key is short whatever the picture weighs',
  ctx.photoKeyFor('data:image/jpeg;base64,' + 'Q'.repeat(97000)).length < 20,
  String(ctx.photoKeyFor('data:image/jpeg;base64,' + 'Q'.repeat(97000)).length));
check('no photo, no key',
  ctx.photoKeyFor('') === '' && ctx.photoKeyFor(undefined) === '');
check('anything that is not a photo gets no key, so it cannot become a link',
  ctx.photoKeyFor('javascript:alert(1)') === ''
  && ctx.photoKeyFor('http://insecure/x.png') === ''
  && ctx.photoKeyFor('data:text/html,<script>') === '');

console.log('\nkeeping the key and the photo agreeing');
function reconcile(map) { ctx.items = map; vm.runInContext('reconcilePhotoKeys()', ctx); return map; }

let it = reconcile({ 'CA-001': { photo: SUMUP } })['CA-001'];
check('an item with a photo gains a key', it.photoKey === SUMUP, it.photoKey);

it = reconcile({ 'CA-001': { photo: EMBEDDED, photoKey: 'data:staleaaa' } })['CA-001'];
check('a replaced photograph replaces the key',
  it.photoKey === 'data:1506cehv', it.photoKey);

it = reconcile({ 'CA-001': { name: 'no picture' } })['CA-001'];
check('an item with no photo at all carries no key', !('photoKey' in it));

it = reconcile({ 'CA-001': { name: 'x', photo: 'javascript:alert(1)', photoKey: 'data:aaa' } })['CA-001'];
check('a photo that is not a photo has its key taken away', !('photoKey' in it));

console.log('\nand NOT clearing a key just because the photo has not loaded');
// This is the one that would show up as pictures vanishing from the website:
// at startup every item is read back from localStorage WITHOUT its photo, and
// hasPhoto is the marker saying one is waiting in IndexedDB.
it = reconcile({ 'CA-001': { hasPhoto: 1, photoKey: SUMUP } })['CA-001'];
check('THE TRAP: an unhydrated photo keeps its key', it.photoKey === SUMUP, String(it.photoKey));

it = reconcile({ 'CA-001': { hasPhoto: 1 } })['CA-001'];
check('and an unhydrated item with no key yet is left alone, not given one',
  !('photoKey' in it));

it = reconcile({ 'CA-001': { hasPhoto: 1, photoCleared: 1, photoKey: SUMUP } })['CA-001'];
check('but Remove photo really does take the key off', !('photoKey' in it));

it = reconcile({ 'CA-001': { photo: SUMUP, hasPhoto: 1, photoKey: 'data:staleaaa' } })['CA-001'];
check('a photo that IS loaded wins over the marker', it.photoKey === SUMUP, it.photoKey);

console.log('\nthe whole stock list at once');
const many = reconcile({
  'CA-001': { photo: SUMUP },
  'CA-002': { photo: EMBEDDED },
  'CA-003': { hasPhoto: 1, photoKey: 'data:1506cehv' },
  'CA-004': { name: 'nothing' },
  'CA-005': null,
});
check('every item is visited and none of them throws',
  many['CA-001'].photoKey === SUMUP
  && many['CA-002'].photoKey === 'data:1506cehv'
  && many['CA-003'].photoKey === 'data:1506cehv'
  && !('photoKey' in many['CA-004']));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
