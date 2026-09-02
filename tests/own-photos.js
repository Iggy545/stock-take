// Runs the REAL photo-source block out of index.html.
//
// What this protects. Nearly every item's photo field is a link to
// images.sumup.com, and SumUp deletes the image when its listing is deleted.
// All 477 were archived and republished at our own domain, and the app now
// rewrites the stored address to ours when it draws a picture. Two ways that
// can go wrong, and both are silent:
//
//   - rewriting something we never archived, so a working SumUp picture is
//     swapped for a 404 of ours. Every rule below about being strict is that.
//   - the escaping being dropped while adding the rewrite. v1.5.3 had a hole
//     exactly here: a photo value of  x" onerror="...  breaking out of the src
//     attribute and running on every device showing the list.
//
// Nothing is mocked except the browser.
const fs = require('fs');
const vm = require('vm');

const HTML = fs.readFileSync(process.argv[2], 'utf8');
const START = '  function safePhotoSrc(v){';
const END = '  // One handler for every picture in the app, in the CAPTURE phase';
const a = HTML.indexOf(START), b = HTML.indexOf(END);
if (a < 0 || b < 0) { console.error('could not locate the photo-source block'); process.exit(2); }
const SRC = HTML.slice(a, b);

const ctx = {
  // The real escapeHtml uses the DOM. This is the same transformation.
  escapeHtml: str => String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
  console
};
ctx.escapeAttr = str => ctx.escapeHtml(str).replace(/"/g, '&quot;');
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(SRC, ctx);

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

const SUMUP = 'https://images.sumup.com/img_5N01TEVRT793FTM2GRDNYYJAZ9/image.png';
// The shop's own Cloudflare account. The old apex host still answers and still
// returns a picture, but from the old account's Pages project, which no longer
// receives deploys -- so it serves photographs that are months stale. Pinned
// here so repointing it is a deliberate act with a failing test, not a typo.
const OURS = 'https://soulful-angels.pages.dev/img/img_5N01TEVRT793FTM2GRDNYYJAZ9.webp';

console.log('\nour own copy is preferred');
check('a SumUp link becomes our copy',
  ctx.ownPhotoSrc(SUMUP) === OURS, ctx.ownPhotoSrc(SUMUP));
check('the name is SumUp\'s image id, which is what the archive saved',
  ctx.ownPhotoSrc(SUMUP).endsWith('/img_5N01TEVRT793FTM2GRDNYYJAZ9.webp'));

console.log('\nand nothing else is rewritten');
check('an embedded photo is left alone',
  ctx.ownPhotoSrc('data:image/jpeg;base64,/9j/4AAQ') === '');
check('some other host is left alone',
  ctx.ownPhotoSrc('https://example.com/img_ABC/image.png') === '');
check('http is left alone',
  ctx.ownPhotoSrc('http://images.sumup.com/img_ABC/image.png') === '');
check('a SumUp URL with no img_ id is left alone',
  ctx.ownPhotoSrc('https://images.sumup.com/other/image.png') === '');
check('an empty photo is left alone',
  ctx.ownPhotoSrc('') === '' && ctx.ownPhotoSrc(undefined) === '');
check('a lookalike host is NOT rewritten',
  ctx.ownPhotoSrc('https://images.sumup.com.evil.test/img_ABC/image.png') === '',
  ctx.ownPhotoSrc('https://images.sumup.com.evil.test/img_ABC/image.png'));

console.log('\nthumbnails');
const t = ctx.thumbHtml({ photo: SUMUP });
check('draws our copy', t.includes('src="' + OURS + '"'), t);
check('keeps the original as the fallback',
  t.includes('data-photo-fallback="' + SUMUP + '"'), t);
check('an embedded photo draws itself with no fallback',
  ctx.thumbHtml({ photo: 'data:image/png;base64,iVBOR' })
    === '<img class="thumb" src="data:image/png;base64,iVBOR" alt="">',
  ctx.thumbHtml({ photo: 'data:image/png;base64,iVBOR' }));
check('a photo we have no copy of still draws the original',
  ctx.thumbHtml({ photo: 'https://example.com/x.png' })
    === '<img class="thumb" src="https://example.com/x.png" alt="">');
check('no photo is still the box',
  ctx.thumbHtml({}) === '<div class="thumb-empty">📦</div>' &&
  ctx.thumbHtml(null) === '<div class="thumb-empty">📦</div>');

console.log('\nthe v1.5.3 hole stays shut');
const attack = 'https://images.sumup.com/img_A/x.png" onerror="alert(1)';
const th = ctx.thumbHtml({ photo: attack });
check('a quote in the photo cannot break out of src',
  !/onerror="alert/.test(th), th);
check('javascript: is refused outright',
  ctx.thumbHtml({ photo: 'javascript:alert(1)' }) === '<div class="thumb-empty">📦</div>');
check('the fallback attribute is escaped too',
  !th.includes('data-photo-fallback="' + attack + '"'));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
