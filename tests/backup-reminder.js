// Runs the REAL weekly-backup decision out of index.html. Same trick as the
// others: slice the shipped source out by its comment markers and run it in a
// vm, so what is tested is what ships.
//
// This one decides how often the shop is interrupted, and that cuts both ways.
// A banner that appears too often is dismissed without being read, and then the
// week it matters it is dismissed too. A banner that never appears leaves the
// backup to somebody remembering, which is the thing it exists to replace.
//
// The case with teeth is the photographs. Extra photographs never sync and are
// NOT in the backup file - the device that took them is the only copy - and iOS
// clears the storage of an app it has not seen for about a week. So an extra
// that has sat un-exported that long is the only thing in this app that can
// actually be lost, and it has to get the banner to itself once the backup is
// done rather than being folded into a message about something else.
const fs = require('fs');
const vm = require('vm');

const HTML = fs.readFileSync(process.argv[2], 'utf8');
const START = '  function backupPlan(now, last, snooze, itemCount, extrasCount, oldestExtraAge){';
const END = '  function refreshBackupBanner(){';
const a = HTML.indexOf(START), b = HTML.indexOf(END);
if (a < 0 || b < 0) { console.error('could not locate backupPlan'); process.exit(2); }
const SRC = HTML.slice(a, b);

const ctx = { console };
vm.createContext(ctx);
vm.runInContext(SRC + '\nthis.backupPlan = backupPlan;', ctx);
const backupPlan = ctx.backupPlan;

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}
const msg = (p) => (p && p.message) || '';

const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;
const NOW = Date.UTC(2026, 8, 10, 9, 0);

// now, last backup, snooze until, items, un-exported extras, age of the oldest
function plan(o) {
  const d = Object.assign({ last: NOW - DAY, snooze: 0, items: 477, extras: 0, age: 0 }, o || {});
  return backupPlan(NOW, d.last, d.snooze, d.items, d.extras, d.age);
}

console.log('\nA quiet till is left alone');
check('backed up yesterday', plan().due === false, msg(plan()));
check('backed up exactly a week ago is not yet due',
      plan({ last: NOW - WEEK }).due === false, 'the week has to be over, not reached');
check('an empty device never nags', plan({ items: 0, last: NOW - 4 * WEEK }).due === false);

console.log('\nThe first run starts the clock instead of nagging');
const first = plan({ last: 0 });
check('does not shout at somebody who just opened the app', first.due === false, first.message);
check('but records that the clock has started', first.start === true, String(first.start));
check('an empty device does not even start it', plan({ items: 0, last: 0 }).start === false);

console.log('\nOverdue');
const due = plan({ last: NOW - WEEK - DAY });
check('asks for a backup', due.due === true, String(due.due));
check('the button saves the file', due.action === 'backup', due.action);
check('and says which week it means', /weekly backup/i.test(msg(due)), msg(due));

console.log('\nSnoozed until tomorrow');
check('stays quiet while snoozed',
      plan({ last: NOW - 4 * WEEK, snooze: NOW + DAY }).due === false);
check('comes back once the snooze has passed',
      plan({ last: NOW - 4 * WEEK, snooze: NOW - 60 * 1000 }).due === true);

console.log('\nThe photographs, which have no second copy anywhere');
const pics = plan({ last: NOW - DAY, extras: 3, age: WEEK + DAY });
check('raised even though the backup is not due', pics.due === true, String(pics.due));
check('because the backup would not have carried them anyway',
      pics.action === 'photos', pics.action);
check('the button goes where the export is', pics.action === 'photos');
check('it counts them', msg(pics).indexOf('3 extra photographs') >= 0, msg(pics));
check('it says where they are', /only on this device/i.test(msg(pics)), msg(pics));

const fresh = plan({ last: NOW - DAY, extras: 3, age: 2 * DAY });
check('a picture taken this week is not nagged about', fresh.due === false, msg(fresh));
check('nor is a count of zero with an old stamp',
      plan({ last: NOW - DAY, extras: 0, age: 3 * WEEK }).due === false);

console.log('\nOne outstanding photograph reads properly');
const one = plan({ last: NOW - DAY, extras: 1, age: WEEK + DAY });
check('singular, not "1 extra photographs"',
      msg(one).indexOf('1 extra photograph is') >= 0, msg(one));
check('no stray plural anywhere', !/photographs/.test(msg(one)), msg(one));

console.log('\nBoth at once: the data goes first');
const both = plan({ last: NOW - 2 * WEEK, extras: 2, age: 2 * WEEK });
check('the button still saves the backup', both.action === 'backup', both.action);
check('but the message names the photographs too',
      /extra photographs are only on this device/i.test(msg(both)), msg(both));
check('and still names the backup', /weekly backup/i.test(msg(both)), msg(both));
// Doing the backup re-runs this with a fresh stamp, and the photographs are
// then the only thing left - which is how they get a banner of their own.
const after = plan({ last: NOW, extras: 2, age: 2 * WEEK });
check('after backing up, the photographs get the banner to themselves',
      after.due === true && after.action === 'photos', after.action);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
