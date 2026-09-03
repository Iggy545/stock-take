// Runs the REAL staff-role code out of index.html. Same trick as the others:
// slice the shipped source out by its comment markers and run it in a vm, so
// what is tested is what ships rather than a copy that can drift.
//
// What makes this worth testing is not the hiding - it is the two ways the
// feature could lock the shop out of its own till:
//
//   1. an old staff list (bare names) coming back as anything but administrator
//   2. the gate switching itself on before anybody can reach Settings
//
// Both would need a cleared browser to undo, on a device holding the only copy
// of that day's sales. The hiding itself is cosmetic by comparison; note that
// none of it is a security boundary, because the data behind a hidden tab is
// still in localStorage and still comes out in a backup.
const fs = require('fs');
const vm = require('vm');

const HTML = fs.readFileSync(process.argv[2], 'utf8');

const START = "  const STAFF_KEY = 'stockTakeStaff';";
const END = '  /* ---- PIN prompt ---- */';

function slice(start, end, what) {
  const a = HTML.indexOf(start), b = HTML.indexOf(end, a);
  if (a < 0 || b < 0) { console.error('could not locate ' + what); process.exit(2); }
  return HTML.slice(a, b);
}
const SRC = slice(START, END, 'the staff role block');
// let/const at the top of a vm script are lexical and never land on the context
// object, so the block is asked for its own bindings rather than reached into.
const TAIL = '\nvar __get = function(){ return { staff: staff, ROLES: ROLES, '
           + 'ROLE_ORDER: ROLE_ORDER, DEFAULT_ROLE: DEFAULT_ROLE }; };';

const TABS = ['list', 'till', 'sold', 'add', 'settings'];

// A fresh copy with whatever staff list, PIN and current name a case needs.
function build(opts) {
  const o = opts || {};
  const store = {};
  if (o.staff !== undefined) store['stockTakeStaff'] = JSON.stringify(o.staff);
  if (o.pin !== undefined) store['stockTakeStaffPin'] = String(o.pin);
  if (o.current !== undefined) store['stockTakeStaffCurrent'] = String(o.current);

  // Just enough DOM for applyRole: the five tabs, the report button, and a
  // till tab whose click() does what the real handler does to activeTab.
  const tabs = TABS.map(t => ({ dataset: { tab: t }, style: {} }));
  const zBtn = { style: {} };
  const clicks = [];
  const ctx = {
    console,
    activeTab: o.activeTab || 'list',
    renderStaffUi() {},
    localStorage: {
      getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem(k, v) { store[k] = String(v); },
      removeItem(k) { delete store[k]; },
    },
    document: {
      querySelectorAll(sel) { return sel === '.tab' ? tabs : []; },
      querySelector(sel) {
        if (sel !== '.tab[data-tab="till"]') return null;
        return { click() { clicks.push('till'); ctx.activeTab = 'till'; } };
      },
      getElementById(id) { return id === 'zReportBtn' ? zBtn : null; },
    },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC + TAIL, ctx);
  ctx.S = () => ctx.__get().staff;
  ctx.__tabs = tabs;
  ctx.__zBtn = zBtn;
  ctx.__clicks = clicks;
  ctx.__store = store;
  // Which tabs are on screen after applyRole, as a plain sorted list.
  ctx.__visible = () => tabs.filter(t => t.style.display !== 'none')
    .map(t => t.dataset.tab).sort().join(',');
  return ctx;
}

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

// ---- migrating the old shape ------------------------------------------------
// This is the one that matters most. Every name already on a real till is a
// bare string, and every one of those people is trusted today.
{
  const c = build({ staff: ['Kay', 'Iggy'] });
  check('an old bare-name list still has both people',
    c.S().length === 2 && c.S()[0].name === 'Kay' && c.S()[1].name === 'Iggy',
    JSON.stringify(c.S()));
  check('and EVERY one of them becomes an administrator',
    c.S().every(s => s.role === 'admin'),
    JSON.stringify(c.S()));
}
{
  const c = build({ staff: [{ name: 'Kay', role: 'till' }, { name: 'Bea', role: 'supplier' }] });
  check('a role already saved is kept', c.S()[0].role === 'till' && c.S()[1].role === 'supplier');
}
{
  const c = build({ staff: [{ name: 'Kay', role: 'wizard' }] });
  check('a role nobody recognises falls back to administrator, never to less',
    c.S()[0].role === 'admin', c.S()[0].role);
}
{
  const c = build({ staff: ['Kay', null, 42, { role: 'till' }, { name: 'Bea', role: 'till' }] });
  check('junk in the list is dropped rather than crashing the app',
    c.S().length === 2 && c.S()[0].name === 'Kay' && c.S()[1].name === 'Bea',
    JSON.stringify(c.S()));
}
{
  const c = build({});
  check('no staff at all is an empty list, not a throw', Array.isArray(c.S()) && c.S().length === 0);
}

// ---- the gate is off until it is deliberately turned on ----------------------
{
  const c = build({ staff: [{ name: 'Kay', role: 'till' }], current: 'Kay' });
  check('with no PIN the gate is off', c.rolesActive() === false);
  check('and a till operator still sees everything, exactly as before',
    c.currentRole() === 'admin', c.currentRole());
}
{
  const c = build({ pin: '1234' });
  check('a PIN with nobody on the list does not switch the gate on',
    c.rolesActive() === false);
}
{
  const c = build({ staff: [{ name: 'Kay', role: 'till' }], pin: '1234', current: 'Kay' });
  check('a PIN plus staff switches it on', c.rolesActive() === true);
  check('and the till operator is now a till operator', c.currentRole() === 'till');
}

// ---- nobody picked is the MOST restricted -----------------------------------
// Otherwise tapping the name away at the top of the screen is the way round the
// whole feature.
{
  const c = build({ staff: [{ name: 'Kay', role: 'admin' }], pin: '1234' });
  check('nobody picked, with the gate on, is a till operator',
    c.currentRole() === 'till', c.currentRole());
}
{
  const c = build({ staff: [{ name: 'Kay', role: 'admin' }], pin: '1234', current: 'Ghost' });
  check('a name that is no longer on the list is treated as nobody',
    c.currentStaff() === '' && c.currentRole() === 'till');
}

// ---- the policy table -------------------------------------------------------
{
  const c = build({ staff: [{ name: 'Kay', role: 'admin' }] });
  check('an administrator may stand on every tab',
    TABS.every(t => c.roleAllows('admin', t)));
  check('a supplier gets till, sales and stock',
    c.roleAllows('supplier', 'till') && c.roleAllows('supplier', 'sold') && c.roleAllows('supplier', 'list'));
  check('and a supplier is kept out of Add and Settings',
    !c.roleAllows('supplier', 'add') && !c.roleAllows('supplier', 'settings'));
  check('a till operator gets till and sales',
    c.roleAllows('till', 'till') && c.roleAllows('till', 'sold'));
  check('and a till operator is kept out of stock, Add and Settings',
    !c.roleAllows('till', 'list') && !c.roleAllows('till', 'add') && !c.roleAllows('till', 'settings'));
  check('an unknown role is treated as the most restricted, not the least',
    !c.roleAllows('wizard', 'settings') && c.roleAllows('wizard', 'till'));
}

// ---- what applyRole actually puts on screen ---------------------------------
{
  const c = build({ staff: [{ name: 'Kay', role: 'admin' }], pin: '1234', current: 'Kay', activeTab: 'settings' });
  c.applyRole();
  check('an administrator sees all five tabs', c.__visible() === 'add,list,settings,sold,till', c.__visible());
  check('and the report button is there', c.__zBtn.style.display === '');
  check('and is left standing where they were', c.__clicks.length === 0);
}
{
  const c = build({ staff: [{ name: 'Bea', role: 'supplier' }], pin: '1234', current: 'Bea', activeTab: 'list' });
  c.applyRole();
  check('a supplier sees three tabs', c.__visible() === 'list,sold,till', c.__visible());
  check('the report button is hidden from a supplier', c.__zBtn.style.display === 'none');
  check('and standing on the stock list is fine for them', c.__clicks.length === 0);
}
{
  const c = build({ staff: [{ name: 'Kay', role: 'till' }], pin: '1234', current: 'Kay', activeTab: 'sold' });
  c.applyRole();
  check('a till operator sees two tabs', c.__visible() === 'sold,till', c.__visible());
  check('the report button is hidden from a till operator', c.__zBtn.style.display === 'none');
  check('and Sales is still theirs to stand on', c.__clicks.length === 0);
}

// ---- being moved off a tab that just disappeared ----------------------------
// The app opens on the stock list, so this is what happens on every load.
{
  const c = build({ staff: [{ name: 'Kay', role: 'till' }], pin: '1234', current: 'Kay', activeTab: 'list' });
  c.applyRole();
  check('a till operator standing on the stock list is moved to the till',
    c.__clicks.length === 1 && c.activeTab === 'till');
}
{
  const c = build({ staff: [{ name: 'Bea', role: 'supplier' }], pin: '1234', current: 'Bea', activeTab: 'settings' });
  c.applyRole();
  check('a supplier standing in Settings is moved to the till',
    c.__clicks.length === 1 && c.activeTab === 'till');
}
{
  const c = build({ staff: [{ name: 'Kay', role: 'till' }], current: 'Kay', activeTab: 'settings' });
  c.applyRole();
  check('with the gate off nobody is moved anywhere', c.__clicks.length === 0);
  check('and every tab stays on screen', c.__visible() === 'add,list,settings,sold,till');
}

// ---- who is actually asked for the PIN --------------------------------------
// v1.41.0 guarded the supplier as well, and that was wrong: a supplier needed
// the PIN to pick their OWN name, so they held it, and the same PIN then let
// them pick an administrator. One shared secret cannot separate two groups when
// both have to hold it. Only the top level is guarded now.
{
  const c = build({ staff: [{ name: 'Kay', role: 'admin' }] });
  const R = c.__get().ROLES;
  check('an administrator is asked for the PIN', R.admin.guarded === true);
  check('a supplier is NOT asked - holding the PIN is what broke it',
    R.supplier.guarded === false);
  check('a till operator is not asked either', R.till.guarded === false);
  check('exactly one level is guarded',
    c.__get().ROLE_ORDER.filter(r => R[r].guarded).length === 1);
}

// ---- counting administrators, which is what guards the lockouts -------------
{
  const c = build({ staff: [{ name: 'Kay', role: 'admin' }, { name: 'Bea', role: 'till' }] });
  check('administrators are counted', c.adminCount() === 1);
}
{
  const c = build({ staff: [{ name: 'Kay', role: 'till' }, { name: 'Bea', role: 'supplier' }] });
  check('a list with no administrator counts none', c.adminCount() === 0);
}

// ---- picking somebody keeps the two in step ---------------------------------
{
  const c = build({ staff: [{ name: 'Kay', role: 'admin' }, { name: 'Bea', role: 'till' }], pin: '1234', current: 'Kay' });
  check('the administrator is on', c.currentRole() === 'admin');
  c.setCurrentStaff('Bea');
  check('handing over to a till operator changes the role', c.currentRole() === 'till');
  check('and it is remembered', c.__store['stockTakeStaffCurrent'] === 'Bea');
  c.applyRole();
  check('and the tabs follow', c.__visible() === 'sold,till', c.__visible());
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
