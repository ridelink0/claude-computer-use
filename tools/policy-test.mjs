// Direct tests of the safety model. No windows, no host - just classification
// and grant logic against synthetic window records, so every tier and every
// refusal path is covered deterministically.

import { Policy, classify, isConsequential, TIER, looksLikeShellName, shellKeyReason } from '../server/policy.mjs';

let pass = 0, fail = 0; const failures = [];
const check = (n, c, d) => {
  if (c) { pass++; console.log('  ok   ' + n); }
  else { fail++; failures.push(n); console.log(`  FAIL ${n}${d ? ' :: ' + d : ''}`); }
};

const win = (process, extra = {}) => ({ hwnd: 1, pid: 99, process, title: 't', class: 'X', path: `C:\\a\\${process}.exe`, ...extra });

console.log('\n-- blocked: never readable, never actable --');
for (const p of ['keepass', 'KeePassXC', '1password', 'bitwarden', 'lastpass', 'dashlane', 'keeper']) {
  check(`${p} is blocked`, classify(win(p)).tier === TIER.BLOCKED, classify(win(p)).tier);
}
for (const p of ['consent', 'LogonUI', 'CredentialUIBroker', 'lsass', 'winlogon']) {
  check(`${p} (elevation/login) is blocked`, classify(win(p)).tier === TIER.BLOCKED, classify(win(p)).tier);
}
check('blocked apps are not readable either', new Policy().checkRead(win('keepass')).ok === false);
check('blocked read names the reason', /credential|elevation|security/i.test(new Policy().checkRead(win('keepass')).message));

console.log('\n-- shell: readable, never typeable --');
for (const p of ['WindowsTerminal', 'conhost', 'Code', 'devenv', 'idea64', 'cursor', 'alacritty']) {
  check(`${p} is shell tier`, classify(win(p)).tier === TIER.SHELL, classify(win(p)).tier);
}
{
  const p = new Policy();
  check('shell apps are readable', p.checkRead(win('Code')).ok === true);
  check('shell apps refuse input', p.checkAct(win('Code')).ok === false);
  check('shell refusal has its own code', p.checkAct(win('Code')).code === 'app_input_blocked');
  check('granting a shell app fails', p.grant(win('Code')).ok === false);
  check('a failed grant is not recorded', p.granted(win('Code')) === false);
}

console.log('\n-- interpreters are judged by window class, not process name --');
check('powershell console is shell',
  classify(win('powershell', { class: 'ConsoleWindowClass' })).tier === TIER.SHELL);
check('powershell hosting a GUI window is not shell',
  classify(win('powershell', { class: 'WindowsForms10.Window.8.app.0.141b42a_r6_ad1' })).tier === TIER.STANDARD,
  classify(win('powershell', { class: 'WindowsForms10.Window' })).tier);
check('cascadia-hosted console is shell',
  classify(win('powershell', { class: 'CASCADIA_HOSTING_WINDOW_CLASS' })).tier === TIER.SHELL);
check('node hosting a GUI window is not shell',
  classify(win('node', { class: 'Chrome_WidgetWin_1' })).tier === TIER.STANDARD);

console.log('\n-- sensitive: grantable, but warned --');
for (const p of ['explorer', 'chrome', 'msedge', 'firefox', 'outlook', 'slack', 'regedit', 'taskmgr']) {
  check(`${p} is sensitive`, classify(win(p)).tier === TIER.SENSITIVE, classify(win(p)).tier);
}
{
  const p = new Policy();
  const r = p.grant(win('chrome'));
  check('sensitive apps can be granted', r.ok === true);
  check('sensitive grant explains the reach', typeof r.reason === 'string' && r.reason.length > 20, r.reason);
  check('granted sensitive app can act', p.checkAct(win('chrome')).ok === true);
}

console.log('\n-- standard flow --');
{
  const p = new Policy();
  const w = win('myapp');
  check('unknown apps are standard', classify(w).tier === TIER.STANDARD);
  check('reading needs no grant', p.checkRead(w).ok === true);
  check('acting without a grant is refused', p.checkAct(w).ok === false);
  check('refusal code is not_granted', p.checkAct(w).code === 'not_granted');
  check('refusal names the tool to call', /computer_grant/.test(p.checkAct(w).hint));
  p.grant(w);
  check('acting after a grant is allowed', p.checkAct(w).ok === true);
  check('revoke re-locks', p.revoke('myapp') === true && p.checkAct(w).ok === false);
}

console.log('\n-- grants key on the app, not the window --');
{
  const p = new Policy();
  p.grant(win('myapp', { hwnd: 1 }));
  check('a second window of a granted app is covered', p.checkAct(win('myapp', { hwnd: 2 })).ok === true);
  check('a different app is not covered', p.checkAct(win('otherapp')).ok === false);
}

console.log('\n-- own session is excluded --');
{
  const p = new Policy();
  p.markSelf([4242]);
  const self = win('node', { pid: 4242 });
  check('self window is flagged', p.isSelf(self) === true);
  check('self window is unreadable', p.checkRead(self).ok === false);
  check('self refusal has its own code', p.checkRead(self).code === 'self_window');
}

console.log('\n-- revokeAll --');
{
  const p = new Policy();
  p.grant(win('a')); p.grant(win('b')); p.grant(win('c'));
  check('revokeAll reports the count', p.revokeAll() === 3);
  check('nothing is granted afterwards', p.listGrants().length === 0);
}

console.log('\n-- the point of no return is asked about first --');
{
  // Both directions matter. Missing a real one lets Claude spend someone's
  // money on a guess; firing on an ordinary control teaches everyone to wave
  // the gate through, which is worse than not having it.
  const asks = [
    'Send', 'Send Payment', 'Send message', 'Reply all',
    'Place order', 'Place the order', 'Order now', 'Buy now', 'Buy', 'Purchase',
    'Pay', 'Pay $42.10', 'Checkout', 'Check out', 'Complete purchase',
    'Confirm order', 'Confirm payment', 'Book ride', 'Book now', 'Request ride',
    'Subscribe', 'Donate', 'Transfer', 'Withdraw', 'Submit payment',
    'Delete', 'Delete this file', 'Permanently delete', 'Empty Trash',
    'Erase', 'Uninstall', 'Revoke', 'Publish', 'Post', 'Tweet', 'Invite',
  ];
  const doesNot = [
    'Press Me', 'Save', 'Save as', 'Cancel', 'OK', 'Close', 'Open', 'Next',
    'Back', 'Search', 'Settings', 'Refresh', 'Copy', 'Paste', 'Select all',
    'Preview', 'Print', 'Zoom in', 'New folder', 'Sign in', 'Compose', 'Reply',
    'Draft', 'Bold', 'Format Painter', 'Formatting', 'Sender', 'Resend later',
    'Deleted Items', 'Undelete', 'Postcode', 'Payment methods', 'Reposition',
    'Submit', 'Bookmark', 'Booking history', 'Transferable',
  ];
  const missed = asks.filter((n) => !isConsequential(n));
  const wrong = doesNot.filter((n) => isConsequential(n));
  check(`all ${asks.length} point-of-no-return labels are caught`, missed.length === 0, missed.join(', '));
  check(`none of ${doesNot.length} ordinary labels are`, wrong.length === 0, wrong.join(', '));
  check('an unnamed control cannot be judged, so it is not gated', isConsequential(null) === false);
  check('matching ignores case', isConsequential('SEND') && isConsequential('delete'));
}

console.log('\n-- a blocked window in frame stops the camera too --');
{
  const p = new Policy();
  const at = (hwnd, process, rect, extra = {}) => ({ ...win(process, extra), hwnd, rect });
  const target = at(1, 'notepad', [0, 0, 400, 400]);
  const vault = at(2, 'keepass', [300, 300, 400, 400]);       // corner overlaps
  const elsewhere = at(3, 'keepass', [1000, 1000, 200, 200]); // nowhere near

  check('nothing blocked in frame is nothing to report',
    p.blockedInFrame([target], target) === null);
  check('a full-screen capture is refused while any blocked window is up',
    p.blockedInFrame([target, elsewhere], null) === elsewhere);
  check('a window capture is refused when a blocked window covers part of it',
    p.blockedInFrame([target, vault], target) === vault);
  check('a blocked window nowhere near the target does not block that capture',
    p.blockedInFrame([target, elsewhere], target) === null);
  check('a minimized blocked window is not in frame',
    p.blockedInFrame([target, { ...vault, minimized: true }], target) === null);
  check('a window with unknown geometry is treated as covering, not as clear',
    p.blockedInFrame([target, { ...vault, rect: null }], target) !== null);
  check('the target never blocks itself',
    p.blockedInFrame([target], { ...target }) === null);

  const p2 = new Policy();
  p2.markSelf([99]);
  check('our own session window is never the blocker',
    p2.blockedInFrame([target, { ...vault, pid: 99 }], target) === null);

  check('exact edge contact is not an overlap',
    p.blockedInFrame([target, at(4, 'keepass', [400, 0, 100, 100])], target) === null);
}

console.log('\n-- case and extension are normalised --');
check('.exe suffix ignored', classify({ process: 'KEEPASS.EXE', path: '' }).tier === TIER.BLOCKED);
check('path is used when process name is missing',
  classify({ process: null, path: 'C:\\x\\1password.exe' }).tier === TIER.BLOCKED);

console.log('\n-- Start-menu display names that are really a shell --');
{
  // These are the names Get-StartApps actually returns for a shell, wrapped
  // in ordinary words classify()'s exact match never sees before a process
  // exists to judge - computer_launch refuses them by name, before spawning.
  for (const n of ['Windows PowerShell', 'Windows PowerShell ISE', 'Command Prompt',
    'Git Bash', 'Terminal', 'Node.js command prompt', 'code', 'cmd']) {
    check(`"${n}" reads as a shell`, looksLikeShellName(n) === true);
  }
  for (const n of ['Spotify', 'Photoshop', 'Notepad', 'Microsoft Edge', 'Calculator', '']) {
    check(`"${n}" does not`, looksLikeShellName(n) === false);
  }
}

console.log('\n-- computer_key: which chords reach the shell is platform-specific --');
{
  // Windows: the Windows-key aliases open Start, Search, Run, Settings.
  for (const k of ['win+r', 'Meta+d', 'windows+s', 'super+e', 'os+l']) {
    check(`win32 refuses "${k}"`, shellKeyReason(k, 'win32') !== null, k);
  }
  for (const k of ['ctrl+s', 'alt+f4', 'ctrl+shift+t', 'f5', 'cmd+s']) {
    check(`win32 allows "${k}"`, shellKeyReason(k, 'win32') === null, k);
  }
  // macOS: Command is the ordinary modifier for every app shortcut and must
  // not be refused wholesale; only the chords that reach the shell itself are.
  for (const k of ['cmd+s', 'cmd+l', 'command+c', 'cmd+shift+t', 'cmd+z', 'cmd+shift+z']) {
    check(`darwin allows "${k}"`, shellKeyReason(k, 'darwin') === null, k);
  }
  for (const k of ['cmd+space', 'cmd+tab', 'shift+cmd+tab', 'cmd+option+esc', 'ctrl+cmd+q', 'cmd+shift+q']) {
    check(`darwin refuses "${k}"`, shellKeyReason(k, 'darwin') !== null, k);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { console.log('failures: ' + failures.join(', ')); process.exit(1); }
