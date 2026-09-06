// What Computer Use is allowed to touch.
//
// Two independent gates:
//   1. Tier - a property of the app itself. `blocked` apps are never readable
//      or actable, at any grant level, and no configuration lifts that.
//   2. Grant - per app, per session, and only for acting. Reading a window's
//      tree never implies permission to click in it.

import path from 'node:path';

// Never readable, never actable. Reading is blocked too, not only acting: a
// password manager's accessibility tree contains the secrets in plain text, so
// "just looking" is the leak.
const BLOCKED = [
  // Credential and secret stores
  'keepass', 'keepassxc', '1password', 'onepassword', 'bitwarden', 'lastpass',
  'dashlane', 'keeper', 'nordpass', 'enpass', 'roboform', 'passwordsafe',
  // Windows credential and elevation surfaces. An agent must never be able to
  // answer a UAC prompt or a login screen on the user's behalf.
  'consent', 'logonui', 'credentialuibroker', 'lsass', 'winlogon',
  'systemsettingsadminflows', 'useraccountcontrolsettings',
  // Security tooling, and the Windows Security app itself (SecurityHealthUI),
  // which Codex refuses too: an agent must never turn protection off.
  'mmc', 'secpol', 'gpedit', 'certmgr', 'bitlockerwizard', 'securityhealth',
  // The lock screen. A locked desktop is the user's, full stop; Codex stops
  // and asks them to unlock, and so does this.
  'lockapp',
  // AI assistants' own desktop apps. Codex refuses to drive the ChatGPT app
  // and its own UI; reading a Claude window is the loop-back the session
  // exclusion exists to prevent, so the desktop apps are out too.
  'claude', 'chatgpt', 'codex',
  // Authenticators and wallets: one-time codes and seed phrases, in plain text.
  'authenticator', 'authy', 'winauth', 'ledger', 'exodus', 'electrum', 'trezor',
];

// The lock screen and the logon UI, when either owns a visible window, mean the
// desktop is not the user's to lend right now.
export function desktopLocked(windows) {
  for (const w of windows || []) {
    if (w.minimized) continue;
    const p = normalise(w.process);
    if (p === 'lockapp' || p === 'logonui') return w;
  }
  return null;
}

// Actable only after a grant that spells out what it covers. These reach far
// past their own window: a browser holds every logged-in session, a file
// manager can move or delete anything, Settings changes the machine.
const SENSITIVE = {
  'explorer':        'File Explorer can move, rename, and delete any file you can.',
  'systemsettings':  'Windows Settings changes machine-wide configuration.',
  'control':         'Control Panel changes machine-wide configuration.',
  'regedit':         'Registry Editor can change or break system configuration.',
  'taskmgr':         'Task Manager can end processes and discard their unsaved work.',
  'chrome':          'A browser carries every session you are signed in to.',
  'msedge':          'A browser carries every session you are signed in to.',
  'firefox':         'A browser carries every session you are signed in to.',
  'opera':           'A browser carries every session you are signed in to.',
  'brave':           'A browser carries every session you are signed in to.',
  'vivaldi':         'A browser carries every session you are signed in to.',
  'arc':             'A browser carries every session you are signed in to.',
  'outlook':         'An email client can read and send mail as you.',
  'thunderbird':     'An email client can read and send mail as you.',
  'slack':           'A messaging app can post as you in shared channels.',
  'teams':           'A messaging app can post as you in shared channels.',
  'discord':         'A messaging app can post as you in shared channels.',
  // Remote desktop clients relay every click and keystroke to another machine,
  // whose apps, tiers and grants this plugin cannot see.
  'mstsc':           'A remote desktop client relays every click and keystroke to another machine.',
  'msrdc':           'A remote desktop client relays every click and keystroke to another machine.',
  'anydesk':         'A remote desktop client relays every click and keystroke to another machine.',
  'teamviewer':      'A remote desktop client relays every click and keystroke to another machine.',
  'rustdesk':        'A remote desktop client relays every click and keystroke to another machine.',
  'parsec':          'A remote desktop client relays every click and keystroke to another machine.',
  'vncviewer':       'A remote desktop client relays every click and keystroke to another machine.',
  'tvnviewer':       'A remote desktop client relays every click and keystroke to another machine.',
};

// Shell-equivalent surfaces. Anything typed into these runs as you, so Computer Use
// reads them but never sends input.

// Dedicated terminals and IDEs: always shell, whatever they are showing.
const SHELL_APPS = [
  'windowsterminal', 'wt', 'conhost', 'mintty', 'conemu', 'conemu64', 'hyper',
  'alacritty', 'wezterm-gui', 'wezterm', 'kitty', 'kitty_portable', 'putty', 'tabby',
  'code', 'code - insiders', 'codium', 'devenv', 'idea64', 'pycharm64',
  'webstorm64', 'rider64', 'clion64', 'goland64', 'phpstorm64', 'rubymine64',
  'sublime_text', 'atom', 'cursor', 'windsurf', 'zed',
];

// Interpreters, which host both consoles and ordinary GUI windows. Process
// name alone would misjudge these: a WinForms dialog launched from a script is
// not a command prompt, and treating it as one would lock Computer Use out of every
// tool that happens to be script-hosted. Decide on the window class instead.
const INTERPRETERS = ['cmd', 'powershell', 'pwsh', 'bash', 'sh', 'zsh', 'git-bash', 'python', 'pythonw', 'node', 'wscript', 'cscript'];

const CONSOLE_CLASSES = [
  'ConsoleWindowClass', 'CASCADIA_HOSTING_WINDOW_CLASS', 'VirtualConsoleClass',
  'mintty', 'PuTTY', 'ConsoleWindowClass_0',
];

export const TIER = {
  BLOCKED: 'blocked',
  SHELL: 'shell',
  SENSITIVE: 'sensitive',
  STANDARD: 'standard',
};

function normalise(name) {
  if (!name) return '';
  let n = String(name).toLowerCase();
  if (n.endsWith('.exe')) n = n.slice(0, -4);
  return n;
}

// Apps the user added via the plugin's blocked_apps setting. Additive only:
// this can extend the blocklist, never shrink it.
const USER_BLOCKED = String(process.env.CU_BLOCKED_APPS || '')
  .split(',')
  .map((s) => normalise(s.trim()))
  // An unset plugin setting can arrive as the literal placeholder text rather
  // than an empty string, which would otherwise become a bogus blocklist entry.
  .filter((s) => s && !s.includes('${'));

// Apps the user has said Computer Use may always drive - Codex's
// always_allowed_app_ids. A grant for one of these is taken on first use
// instead of refused, and the result says so. Blocked and shell tiers are not
// grantable at all, so listing one here changes nothing.
const USER_ALLOWED = String(process.env.CU_ALLOWED_APPS || '')
  .split(',')
  .map((s) => normalise(s.trim()))
  .filter((s) => s && !s.includes('${'));

export function isAlwaysAllowed(win) {
  const proc = normalise(win && win.process);
  const exe = normalise(win && win.path ? path.basename(win.path) : '');
  return USER_ALLOWED.includes(proc) || (!!exe && USER_ALLOWED.includes(exe));
}

export function classify(win) {
  const proc = normalise(win && win.process);
  const exe = normalise(win && win.path ? path.basename(win.path) : '');
  const candidates = [proc, exe].filter(Boolean);

  for (const c of candidates) {
    if (USER_BLOCKED.includes(c)) {
      return { tier: TIER.BLOCKED, reason: `"${c}" is on your blocked_apps list.` };
    }
  }
  for (const c of candidates) {
    if (BLOCKED.some((b) => c === b || c.startsWith(b))) {
      return { tier: TIER.BLOCKED, reason: 'This is a credential, elevation, or security surface. Computer Use never reads or drives these.' };
    }
  }
  const shellReason = 'Typing here runs commands as you. Computer Use reads this window but never sends input to it.';
  for (const c of candidates) {
    if (SHELL_APPS.includes(c)) return { tier: TIER.SHELL, reason: shellReason };
  }
  // The Run dialog is a command line with a friendlier face.
  if (candidates.includes('explorer') && /^run$/i.test(String(win && win.title || '').trim())) {
    return { tier: TIER.SHELL, reason: shellReason };
  }
  const cls = win && win.class ? String(win.class) : '';
  if (CONSOLE_CLASSES.some((k) => cls === k || cls.startsWith(k))) {
    return { tier: TIER.SHELL, reason: shellReason };
  }
  // An interpreter showing a console is a shell; an interpreter showing a
  // normal window is just an app that happens to be script-hosted.
  for (const c of candidates) {
    if (INTERPRETERS.includes(c) && CONSOLE_CLASSES.some((k) => cls.startsWith(k))) {
      return { tier: TIER.SHELL, reason: shellReason };
    }
  }
  for (const c of candidates) {
    if (Object.prototype.hasOwnProperty.call(SENSITIVE, c)) {
      return { tier: TIER.SENSITIVE, reason: SENSITIVE[c] };
    }
  }
  return { tier: TIER.STANDARD, reason: null };
}


// Controls whose own label says the click leaves this machine or cannot be
// taken back: money moves, a message is sent, something is destroyed. OpenAI's
// agent stops and asks the person before exactly these, and that is the right
// behaviour for an agent holding someone's real accounts.
//
// Word boundaries throughout, so "Resend later" and "Deleted Items" are not
// caught by "send" and "delete". The list is deliberately about the point of no
// return, not about caution in general: a gate that fires on "Save" would teach
// everyone to ignore it. Bare "Submit" is out for the same reason - too many
// harmless forms - while "Submit payment" is in.
const CONSEQUENTIAL = new RegExp([
  // money
  String.raw`\b(buy|purchase|pay|place\s+(the\s+)?order|order\s+now|checkout|check\s+out`,
  String.raw`|complete\s+(order|purchase|booking)|confirm\s+(order|payment|purchase|booking|ride|trip)`,
  String.raw`|book\s+(now|ride|trip|flight|hotel)|request\s+(ride|trip|pickup)`,
  String.raw`|subscribe|donate|transfer|withdraw)\b`,
  // things that leave the machine
  String.raw`|\b(send|reply\s+all|post|publish|tweet|invite|upload|submit\s+(order|payment|application|form))\b`,
  // things that do not come back
  String.raw`|\b(delete|permanently\s+delete|empty\s+trash|empty\s+bin|erase|wipe|uninstall|revoke)\b`,
  // things Codex's confirmation policy names too: software, access, passwords,
  // and cancelling something that was booked or paid for
  String.raw`|\b(install|cancel\s+(order|subscription|appointment|reservation|booking|plan)`,
  String.raw`|(change|reset)\s+password|(grant|allow)\s+access)\b`,
  // The rest of Codex's "always confirm" list (its confirmations policy, Sep
  // 2026 build): accounts and persistent access, saved secrets, newly acquired
  // software, sharing and permissions, bookings, and forms that carry a
  // person's details.
  String.raw`|\b(sign\s+up|create\s+(my\s+|an?\s+|your\s+)?account|register\s+now|unsubscribe`,
  String.raw`|save\s+(password|passwords|card|payment|payment\s+method)|remember\s+(this\s+|my\s+)?(card|password)`,
  String.raw`|(create|generate|issue|new)\s+(api\s+|access\s+|personal\s+access\s+)?(key|token|secret)`,
  String.raw`|add\s+(to\s+)?(chrome|edge|firefox|brave|browser)|add\s+extension|install\s+extension`,
  String.raw`|(run|open|keep|allow|download)\s+anyway|make\s+public|change\s+permissions|manage\s+access|share\s+with`,
  String.raw`|book\s+(appointment|table|now)|reserve|schedule\s+(appointment|meeting|visit)`,
  String.raw`|apply\s+now|submit\s+(request|claim|return|review|rating)|accept\s+invitation)\b`,
].join(''), 'i');

// Social reactions and shares, which Codex confirms too. Anchored at the start
// of the name: a button is called "Like" or "Follow"; a heading that happens to
// contain the word is not a button. "Reply" is not here: it opens a draft, and
// the point of no return is the Send that follows.
const SOCIAL = /^\s*(like|unlike|follow|unfollow|react|retweet|repost|share|comment|post\s+comment|add\s+comment)\b/i;

// Things the user has to do themselves. Codex's hand-off mode, plus the two
// Anthropic rules that are never negotiable: no CAPTCHAs and no age
// verification. Not confirmable - confirmed:true does not lift these.
const HANDOFF = new RegExp([
  String.raw`\b(i\s*'?\s*a?m\s+(over|at\s+least)\s+(18|21)|confirm\s+(my\s+|your\s+)?age|verify\s+(my\s+|your\s+)?age|age\s+verification`,
  String.raw`|i\s*'?\s*m\s+not\s+a\s+robot|solve\s+(the\s+)?captcha|verify\s+you\s+are\s+human|human\s+verification`,
  String.raw`|proceed\s+anyway|accept\s+the\s+risk|continue\s+to\s+(the\s+)?(site|page|website)\s*\(unsafe\)|go\s+on\s+to\s+the\s+(web)?page|unsafe\s+to\s+continue`,
  String.raw`|bypass\s+paywall|disable\s+(protection|antivirus|firewall|defender)|turn\s+off\s+(real-?time\s+)?protection)\b`,
].join(''), 'i');

// True when a control's name says pressing it has consequences the user should
// have been asked about first.
export function isConsequential(name) {
  if (!name) return false;
  const s = String(name);
  return CONSEQUENTIAL.test(s) || SOCIAL.test(s);
}

// True when a control's name says this step is the user's to take, not an
// agent's, whatever they have said so far.
export function isHandOff(name) {
  if (!name) return false;
  return HANDOFF.test(String(name));
}

// Do two window rectangles share any pixels? Unknown geometry counts as
// overlapping: a capture is refused on the safe side, never allowed on a guess.
export function rectsOverlap(a, b) {
  if (!a || !b) return true;
  return a[0] < b[0] + b[2] && b[0] < a[0] + a[2]
      && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
}

export class Policy {
  constructor() {
    // key: normalised process name -> { grantedAt, reason }
    this.grants = new Map();
    this.selfPids = new Set();
  }

  // Windows belonging to this Claude Code session are excluded from listings
  // and captures entirely, so on-screen text from the session can never feed
  // back into the model as if it were observed content.
  markSelf(pids) {
    for (const p of pids) if (p) this.selfPids.add(Number(p));
  }

  isSelf(win) {
    return win && this.selfPids.has(Number(win.pid));
  }

  key(win) {
    return normalise(win && win.process) || normalise(win && win.path ? path.basename(win.path) : '') || '?';
  }

  grant(win) {
    const { tier, reason } = classify(win);
    if (tier === TIER.BLOCKED) {
      return { ok: false, tier, reason };
    }
    if (tier === TIER.SHELL) {
      return { ok: false, tier, reason };
    }
    this.grants.set(this.key(win), { grantedAt: Date.now(), tier });
    return { ok: true, tier, reason };
  }

  revoke(key) {
    return this.grants.delete(normalise(key));
  }

  revokeAll() {
    const n = this.grants.size;
    this.grants.clear();
    return n;
  }

  granted(win) {
    return this.grants.has(this.key(win));
  }

  listGrants() {
    const out = [];
    for (const [k, v] of this.grants) out.push({ app: k, tier: v.tier, granted_at: new Date(v.grantedAt).toISOString() });
    return out;
  }

  // Pixels do not respect tiers. A capture shows whatever is drawn in the
  // region, so a password manager sitting over the target window would be
  // photographed even though its own tree is unreadable. Pass the target window
  // for a window-scoped capture, or null for the whole screen.
  blockedInFrame(windows, target) {
    for (const w of windows || []) {
      if (w.minimized || this.isSelf(w)) continue;
      if (classify(w).tier !== TIER.BLOCKED) continue;
      if (!target) return w;
      if (Number(w.hwnd) === Number(target.hwnd)) continue;
      if (rectsOverlap(w.rect, target.rect)) return w;
    }
    return null;
  }

  // Gate for read operations: snapshot, screenshot of a window.
  checkRead(win) {
    if (this.isSelf(win)) {
      return {
        ok: false,
        code: 'self_window',
        message: 'That window belongs to this Claude Code session.',
        hint: 'Computer Use excludes its own session so on-screen text cannot be fed back to the model as observed content.',
      };
    }
    const { tier, reason } = classify(win);
    if (tier === TIER.BLOCKED) {
      return { ok: false, code: 'app_blocked', message: reason, hint: 'This is not configurable.' };
    }
    return { ok: true, tier };
  }

  // Gate for anything that sends input or closes a window.
  checkAct(win) {
    const read = this.checkRead(win);
    if (!read.ok) return read;
    const { tier, reason } = classify(win);
    if (tier === TIER.SHELL) {
      return { ok: false, code: 'app_input_blocked', message: reason, hint: 'Use the Bash tool for shell work; it is sandboxed and auditable.' };
    }
    if (!this.granted(win) && isAlwaysAllowed(win)) {
      this.grants.set(this.key(win), { grantedAt: Date.now(), tier, auto: true });
      return { ok: true, tier, autoGranted: this.key(win) };
    }
    if (!this.granted(win)) {
      return {
        ok: false,
        code: 'not_granted',
        message: `No grant for "${this.key(win)}" in this session.`,
        hint: `Call computer_grant with app "${this.key(win)}" first. Grants last for this session only.`,
      };
    }
    return { ok: true, tier };
  }
}
