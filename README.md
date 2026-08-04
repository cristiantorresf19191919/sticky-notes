# Sticky Notes

A single-page sticky-notes application in TypeScript + React — no component
libraries, no drag-and-drop libraries, no state libraries. All four required
features are implemented (create at a position/size by drawing, move by
dragging, resize by dragging, delete by dropping on the trash zone) plus all
five bonus features (text editing, bring-to-front, localStorage restore,
colors, an async-mocked REST save).

## Build & run

Requires Node 20+.

```bash
npm install
npm run dev        # development server (http://localhost:5173)
npm run build      # typecheck + production build into dist/
npm run preview    # serve the production build
npm test           # vitest: 24 tests (unit + jsdom integration)
```

## Architecture

The application is layered so that state management, interaction logic and UI
never share a file. The core is `src/model/`: a pure, exhaustively-typed
reducer (`model.ts`) whose actions form a discriminated union — every board
transition (create, move, resize, raise, remove, edit, recolor) is a pure
function transition that can be unit-tested without a browser. The reducer
enforces the invariants (minimum note size, monotonic z-counter for stacking)
and preserves the object identity of untouched notes on every transition,
which is deliberate: referential stability is what the memoized view layer
trades in. Alongside it, `geometry.ts` supplies rect math (normalization of
drags in any direction, inclusive point/rect hit-testing) so no interaction
ever needs `querySelector` or `elementFromPoint` — the latter famously returns
the dragged note itself mid-drag.

All three gestures run through one interaction engine (`hooks/useDragEngine.ts`)
whose contract is: nothing touches React state while a pointer is down — with
one deliberate exception, the create-drag's ghost rectangle, a single cheap
div updated at most once per frame while every note skips via memo. A
session object lives in a ref; `pointermove`/`pointerup`/`pointercancel`/
`Escape` tracking is attached to `window` so fast or imprecise movements that
leave the note (or the viewport) keep working; transient visuals are direct
DOM writes (`transform` during moves, width/height during resizes, `data-*`
attributes for trash feedback) coalesced to one write per animation frame; and
the gesture ends in exactly one dispatch — or none for a sub-threshold click
or an Escape abort. Geometry needed during a drag (the trash rect, the board
rect for clamping) is measured once at gesture start, never per move. The view
layer (`components/`) is thin: `NoteView` is a `React.memo` component receiving
lifetime-stable callbacks, so moving one note re-renders exactly one note on
commit and zero notes per frame — an invariant the integration tests assert by
counting renders.

Persistence (`model/persistence.ts` + `hooks/useDebouncedSave.ts`) subscribes
to committed state only: because drag frames never exist as React state, "don't
persist every tiny movement" is a structural guarantee rather than a policy. A
burst of commits debounces into a single localStorage write plus one call to
the async mock REST API, a `pagehide` flush protects the final quarter-second,
and hydration goes through a typed parse of `unknown` with a versioned payload
(`v: 1`) so corrupt or future-format storage falls back to seeds instead of
crashing.

## Performance & memoization details

- **Zero re-renders during drag/resize** — session in a ref + direct DOM
  writes; React renders once, on commit. Tested, not hoped for
  (`src/__tests__/app.test.tsx` asserts render counts).
- **`React.memo` that actually works** — the reducer preserves untouched note
  identity and every callback prop has one identity for the app's lifetime
  (engine handlers are built once; App handlers are `useCallback([])` reading
  through a latest-ref).
- **rAF coalescing** — a 120 Hz mouse delivers more `pointermove`s than
  frames; writes are batched to one per frame (`framePending` flag, safe under
  synchronous rAF in tests).
- **Rect caching** — one `getBoundingClientRect` per gesture (trash + board),
  never in the move loop; hit-testing afterwards is pure math.
- **Uncontrolled editor** — the note textarea commits its draft on blur instead
  of re-rendering per keystroke; Escape discards.
- **No-op guard on raise** — `BRING_TO_FRONT` on the already-top note returns
  the same state reference, so the most common click in the app (pressing the
  front note) costs zero renders.
- **Dev HUD** — in dev builds a small overlay shows per-note render counts so
  the memoization claims are visible live (StrictMode doubles dev renders).

## What I would add with more time

Undo/redo as an action log over the reducer, keyboard accessibility (arrow-key
move/resize, Delete to remove), multi-select with marquee, server
reconciliation (ETags/last-write-wins) on the REST layer, and pointer-capture
based tracking as a progressive enhancement.
