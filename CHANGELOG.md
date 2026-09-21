# Changelog

Every released version, newest first, on the tag of the same name. Dates are the
release commit's own. Anything marked UNVERIFIED was not exercised on real
hardware at the time it shipped.

## 0.9.5 - 2026-09-21

- A Stop hook reads the reply about to be handed back and, when it lists a job
  on this computer that the plugin can do - read a settings panel, close a
  window, open an app, click a thing - blocks the turn once with the rule: do
  it now and report, a completed action is not a follow-up, leave a step to
  the user only when it needs their credentials or consent or has no GUI or
  CLI path. Once per session, never twice in a row, nothing on turns that do
  not match. Two such items were handed back at the end of a long task today.
- The skill description names the cases that were missed - a settings panel
  read to confirm a path, a stray window on another virtual desktop - and the
  words a user actually types, per Anthropic guidance that skills undertrigger
  and descriptions should push. The three-line rule is in the skill body.
- close_window waits up to three seconds before calling a window still open.
  The research: docs/research/2026-09-21-dr-when-to-use-computer-use.md.

## 0.9.4 - 2026-09-21

- A blind tree is not a dead end: when a snapshot comes back blind and the
  caller did not say with_image: false, the picture of the window is attached
  in the same read, the way Astra one read always carries a screenshot beside
  a tree that may be null. A browser task in a field test had stalled exactly
  there.
- docs/TODO-astra.md: what the Astra comparison settled (keep the overlay,
  banner, coexistence, appshot, journal and recap; none has an Astra
  equivalent and all are settings) and the six open items, ranked. The full
  research is in docs/research.

## 0.9.3 - 2026-09-21

From a live field test by another session on this machine, with the verbatim
replies in hand:

- `computer_launch` names the launched app's own window, not the first window
  to appear. A Start-menu name is not a process name ("Opera Browser" runs as
  opera), so nothing matched and the reply named Explorer's desktop-switch
  preview and the user's editor as the launch while the real window turned up
  on the next listing. Every word of the name is now a candidate, Explorer's
  transient surfaces are never mistaken for the app, a session that restored
  onto another virtual desktop is found in the hidden listing, and when only
  unrelated windows appeared the reply says so instead of claiming a launch.
- Concurrent `computer_apps { installed }` calls share one Start-menu listing
  instead of each spawning a cold PowerShell; the ceiling is 25 seconds, and a
  timeout is reported as a timeout rather than as "0 installed".
- The skill says plainly that "work on a separate virtual desktop" cannot be
  done from here on Windows and what to offer instead, rather than implying
  the flow works and switching the user's screen.

## 0.9.2 - 2026-09-21

- The file name box is found by automation id 1148 first and then by what it
  is: an enabled, writable field named for the file name, so a localised,
  packaged or reskinned picker is still driveable instead of being rejected as
  "not the Windows common dialog". The focus proof compares the box that was
  actually found rather than the id alone.
- The MCP test waits 60 seconds for its throwaway target, configurable, and
  prints the wait when the machine is slow. The old 15-second ceiling failed
  the suite whenever anything else was running, which read as a defect in the
  plugin and was not; the target takes 4.3 seconds on an idle machine here.
- `test-all` tells a broken suite from one that cannot run here: the two suites
  that drive real windows are reported as needing an idle desktop when the
  plugin refuses to take focus from someone who is using the machine, rather
  than as failures.
- One token ceiling, not two. The copy in the batch test now tracks the one in
  astra-test, where the reason for every raise is written down; it moved to
  3425 for the two document tools, after both their descriptions were cut.
- This file, and the five releases between 0.6.0 and 0.9.0 that were never
  tagged now carry their tags.

## 0.9.1 - 2026-09-21

- `computer_open` resolves the file's handler through the shell association and
  runs that application's name through the same classifier `computer_launch`
  uses, so a document whose handler is an editor, an interpreter or a shell is
  refused before anything starts. Store-app associations answer with no handler
  at all; that case proceeds and the reply says Windows named none.
- The file dialog's confirm button goes through the consequence gate: a picker
  whose button reads Upload, Send, Post or Share is refused once and needs
  `confirmed: true`, exactly as a click on that button would be.
- The macOS host answers `open`, `file_dialog`, `paste` and `paste_files` with
  `unsupported_on_macos` instead of an unknown-op error. UNVERIFIED: no Mac was
  available, so the Swift host has not been compiled with this change.
- `as_text` decodes UTF-16 and UTF-8 byte-order marks, refuses a file holding
  NUL bytes, refuses a directory, and strips carriage returns the way
  `computer_type` already did.
- Marketplace entry and manifest versions agree, and a build test keeps them
  agreeing. README's tool and token numbers are the measured ones: 23 tools,
  schema about 3398 tokens on first use, names and server note about 482
  always on.

## 0.9.0 - 2026-09-20

- Three tools for documents, the things a browser extension cannot reach:
  `computer_open` opens a document or folder in its own application and waits
  for the window, `computer_file_dialog` drives the Windows Open/Save dialog by
  its own controls, and `computer_paste` gained `files` (a real file drop on the
  clipboard) and `{ file, as_text }`.
- The skill carries a hand-off table for Claude in Chrome: the extension owns
  the page and its own uploads, this plugin owns the OS picker, a pasted file, a
  document on disk and every window that is not a Chrome page.
- `docs/research/2026-09-20-chrome-and-file-dialogs.md`: the extension's tool
  surface, its documented failures, and the common-dialog automation ids with
  their sources.

## 0.8.2 - 2026-09-14

- The server reads its version from the manifest rather than a second copy.

## 0.8.1 - 2026-09-08

- The first real review of the blind-tree note and the restoring paste.

## 0.8.0 - 2026-09-08

- A blind tree says why it is blind: an Electron renderer with accessibility
  off, a canvas surface, or a cause nothing can name.
- `computer_paste` saves every clipboard format before it types and puts them
  all back afterwards, so a copied image, file or formatted cells survive.

## 0.7.0 - 2026-09-08

- The September audit fixes, and the research on what better computer use means
  measured against ChatGPT's and Anthropic's own.

## 0.6.0 - 2026-09-06

- What ChatGPT's computer use gained with Astra, on Windows and macOS: appshots
  on both Ctrl keys, popups and menus in the listing, PrintWindow capture of
  covered windows, drag, Start-menu launch, and a rewritten macOS host.

## 0.5.0 - 2026-09-05

- The journal and recap, the Stop-hook turn end, steering, the safety monitor,
  and the `background_at_turn_end` setting.

## Before 0.5.0

Released as Axon. `git log` carries the detail; the plugin was renamed to Better
Computer Use when it went to the marketplace.
