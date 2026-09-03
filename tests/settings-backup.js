// The Settings page inside a backup, and the line that tells the shop whether
// this device can clear itself. Same trick as the others: slice the shipped
// source out of index.html by its comment markers and run it in a vm, so what
// is tested is what ships.
//
// Two things are being protected here, and they fail in opposite directions.
//
// A setting that does NOT travel is quiet damage: before this, restoring a
// backup left the card fee, the website fee and the shop's commission at their
// defaults, and 0% commission reads as a working number rather than a missing
// one. Somebody hands out real money on that report.
//
// A setting that travels when it SHOULD NOT is louder but worse: the till id is
// the receipt-number prefix, so two devices sharing one issue duplicate receipt
// numbers; and the team-sync details landing on a working till would repoint it
// at another workspace, which is the hazard the team-code notes are about. So
// the table is checked from both ends -- what must be carried, and what must
// never be.
const fs = require('fs');
const vm = require('vm');

const HTML = fs.readFileSync(process.argv[2], 'utf8');

function slice(start, end, what) {
  const a = HTML.indexOf(start), b = HTML.indexOf(end);
  if (a < 0 || b < 0 || b < a) { console.error('could not locate ' + what); process.exit(2); }
  return HTML.slice(a, b);
}

const SETTINGS_SRC = slice(
  '  const BACKUP_SETTINGS = [',
  '  // On phones (iOS Safari, Chrome/Android) navigator.share can hand a file',
  'the settings table');

const DURABLE_SRC = slice(
  '  function durableNote(state, installed){',
  '  function refreshDurableNote(){',
  'durableNote');

const ctx = { console };
vm.createContext(ctx);
vm.runInContext(
  SETTINGS_SRC + '\n' + DURABLE_SRC + '\n' +
  'this.BACKUP_SETTINGS = BACKUP_SETTINGS;' +
  'this.collectSettings = collectSettings;' +
  'this.settingsToApply = settingsToApply;' +
  'this.durableNote = durableNote;', ctx);

const { BACKUP_SETTINGS, collectSettings, settingsToApply, durableNote } = ctx;

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

// A stand-in for one device's localStorage.
function device(o) {
  const store = Object.assign({}, o || {});
  return { read: (k) => (k in store ? store[k] : null), store };
}

const SHOP = {
  posCardFeePct: '1.69',
  posWebFeePct: '2.5',
  posShopCommissionPct: '15',
  stockTakeStaff: '[{"name":"Kay","role":"admin"}]',
  stockTakePromos: '{"SUMMER":{"pct":10}}',
  posCardReaderUrl: 'https://soulful-angels-pay.soulful-angels.workers.dev',
};
const SYNC = {
  stockTakeSyncCfg: '{"apiKey":"abc","projectId":"stock-take-5f4aa"}',
  stockTakeSyncTeam: 'soulful',
  stockTakeSyncPin: '4242',
  stockTakeSyncEmail: 'soulfulangelstech@gmail.com',
};
const FULL = Object.assign({}, SHOP, SYNC, { posTillId: 'K7' });

console.log('\nThe table itself');
check('every entry has a key and a known scope',
      BACKUP_SETTINGS.every(s => s.key && ['shop', 'device', 'sync'].includes(s.scope)),
      JSON.stringify(BACKUP_SETTINGS.filter(s => !['shop', 'device', 'sync'].includes(s.scope))));
check('no key is listed twice',
      new Set(BACKUP_SETTINGS.map(s => s.key)).size === BACKUP_SETTINGS.length);

// The two that must never be in the file at all, whatever else changes.
const keys = BACKUP_SETTINGS.map(s => s.key);
check('the administrator PIN is not carried', !keys.includes('stockTakeStaffPin'),
      'a PIN nobody can produce has already locked one iPad out of its own Settings');
check('the sync ON switch is not carried', !keys.includes('stockTakeSyncOn'),
      'a restore must never start a device syncing on its own');
check('mid-sale state is not carried',
      !keys.includes('posCart') && !keys.includes('posCardPending'));
check('this device\'s own sync bookkeeping is not carried',
      !keys.includes('stockTakeClientId') && !keys.includes('stockTakeSyncTimes'));

console.log('\nThe payout arithmetic travels — this is the one that costs money');
check('card fee is carried', keys.includes('posCardFeePct'));
check('website fee is carried', keys.includes('posWebFeePct'));
check('shop commission is carried', keys.includes('posShopCommissionPct'));

console.log('\nCollecting');
const collected = collectSettings(device(FULL).read);
check('picks up everything that is set', Object.keys(collected).length === BACKUP_SETTINGS.length,
      JSON.stringify(Object.keys(collected)));
check('values come back unchanged', collected.posShopCommissionPct === '15');
const partial = collectSettings(device({ posCardFeePct: '2' }).read);
check('a key never set is left out entirely, not stored as null',
      Object.keys(partial).length === 1 && !('posWebFeePct' in partial),
      JSON.stringify(partial));
check('an empty string is kept, because set-to-empty is a real answer',
      'posCardReaderUrl' in collectSettings(device({ posCardReaderUrl: '' }).read));
check('a reader that throws does not take the whole backup down',
      Object.keys(collectSettings(() => { throw new Error('denied'); })).length === 0);

console.log('\nRestoring onto a blank device — the cleared-browser case');
const blank = settingsToApply(collected, device({}).read);
check('the shop settings are written back', blank.writes.posShopCommissionPct === '15');
check('the staff list is written back', blank.writes.stockTakeStaff === SHOP.stockTakeStaff);
check('the sync details are written back, so the device can find its way home',
      blank.writes.stockTakeSyncCfg === SYNC.stockTakeSyncCfg
      && blank.writes.stockTakeSyncTeam === 'soulful');
check('the till id is NOT written back', blank.writes.posTillId === undefined,
      'two tills on one prefix issue duplicate receipt numbers');
check('and the till id is explained rather than dropped silently',
      blank.skipped.some(s => s.key === 'posTillId' && /device/.test(s.why)),
      JSON.stringify(blank.skipped));
check('the count is what was actually written',
      blank.count === Object.keys(blank.writes).length && blank.count === 10,
      String(blank.count));

console.log('\nRestoring onto a till that is already set up for sync');
const working = settingsToApply(collected, device(Object.assign({}, SYNC)).read);
check('the shop settings still land', working.writes.posCardFeePct === '1.69');
check('the sync details do NOT', working.writes.stockTakeSyncTeam === undefined,
      'restoring these would repoint a working till at another workspace');
check('all four sync keys are held back together, never half of them',
      ['stockTakeSyncCfg', 'stockTakeSyncTeam', 'stockTakeSyncPin', 'stockTakeSyncEmail']
        .every(k => working.writes[k] === undefined),
      JSON.stringify(Object.keys(working.writes)));
check('and the reason is recorded',
      working.skipped.some(s => s.key === 'stockTakeSyncTeam' && /already set up/.test(s.why)));

// A device with a team code but no config, or the other way round, is still
// "set up" — half a workspace address is worse than none.
check('a team code alone counts as set up',
      settingsToApply(collected, device({ stockTakeSyncTeam: 'soulful' }).read)
        .writes.stockTakeSyncCfg === undefined);
check('a config alone counts as set up',
      settingsToApply(collected, device({ stockTakeSyncCfg: '{}' }).read)
        .writes.stockTakeSyncTeam === undefined);
check('an EMPTY team code does not count as set up',
      settingsToApply(collected, device({ stockTakeSyncTeam: '' }).read)
        .writes.stockTakeSyncTeam === 'soulful',
      'a blank string is not a workspace');

console.log('\nA file that is old, empty or has been meddled with');
check('a v1 backup with no settings block writes nothing',
      settingsToApply(undefined, device({}).read).count === 0);
check('null is handled the same way',
      settingsToApply(null, device({}).read).count === 0);
check('a settings block that is not an object writes nothing',
      settingsToApply('nope', device({}).read).count === 0);
check('a number where a string belongs is refused',
      settingsToApply({ posCardFeePct: 1.69 }, device({}).read).count === 0,
      'hand-edited files are the reason this is typed rather than trusted');
check('an object where a string belongs is refused',
      settingsToApply({ stockTakeStaff: [{ name: 'Kay' }] }, device({}).read).count === 0);
check('a key nobody has heard of is ignored',
      settingsToApply({ somethingElse: 'x' }, device({}).read).count === 0);
check('good keys still land alongside a bad one',
      settingsToApply({ posCardFeePct: '2', posWebFeePct: 3 }, device({}).read).count === 1);

console.log('\nThe round trip');
const roundTrip = settingsToApply(collectSettings(device(FULL).read), device({}).read).writes;
check('every shop setting survives being written out and read back',
      Object.keys(SHOP).every(k => roundTrip[k] === SHOP[k]),
      JSON.stringify(roundTrip));

console.log('\nWhat the Settings page says about this device clearing itself');
check('granted says so plainly', /will not clear it/.test(durableNote('granted', true)));
check('granted reads the same in a tab as installed',
      durableNote('granted', true) === durableNote('granted', false));
check('an installed app on Safari is reassured, not warned',
      durableNote('unsupported', true).indexOf('⚠️') !== 0,
      durableNote('unsupported', true));
check('a browser TAB on Safari is warned and told what to do',
      durableNote('unsupported', false).indexOf('⚠️') === 0
      && /Home Screen/.test(durableNote('unsupported', false)),
      durableNote('unsupported', false));
check('a refusal is a warning even when installed',
      durableNote('refused', true).indexOf('⚠️') === 0);
check('a refusal in a tab says both things',
      /Install it/.test(durableNote('refused', false))
      && /weekly backup/.test(durableNote('refused', false)));
check('before the browser has answered, nothing is claimed',
      durableNote('unknown', true) === '' && durableNote('unknown', false) === '');
check('no wording ever promises the data cannot be lost',
      ['granted', 'refused', 'unsupported', 'unknown'].every(s =>
        [true, false].every(i => !/safe|never lose|cannot be lost/i.test(durableNote(s, i)))),
      'a person deliberately clearing site data beats all of this');

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
