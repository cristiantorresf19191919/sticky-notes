import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import App, { api } from "../App";
import { renderCounts } from "../dev/renderCounts";
import { SAVE_DELAY_MS } from "../hooks/useDebouncedSave";
import { STORAGE_KEY } from "../model/persistence";

/** jsdom has no PointerEvent; a MouseEvent with a pointer type works the same. */
function pointer(type: string, opts: { clientX: number; clientY: number }) {
  return new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    // Real drags report a pressed button on every pointermove; the engine
    // treats buttons: 0 mid-move as a lost pointerup and aborts the gesture.
    buttons: type === "pointermove" ? 1 : 0,
    ...opts,
  });
}

const stubRect = (
  el: Element,
  r: { left: number; top: number; right: number; bottom: number },
) => {
  (el as HTMLElement).getBoundingClientRect = () =>
    ({
      ...r,
      width: r.right - r.left,
      height: r.bottom - r.top,
      x: r.left,
      y: r.top,
      toJSON: () => "",
    }) as DOMRect;
};

const noteIds = () =>
  screen
    .queryAllByTestId(/^note-/)
    .map((el) => el.getAttribute("data-testid")!.replace("note-", ""));

const drag = (
  el: Element,
  from: { x: number; y: number },
  to: { x: number; y: number },
) => {
  fireEvent(el, pointer("pointerdown", { clientX: from.x, clientY: from.y }));
  fireEvent(window, pointer("pointermove", { clientX: to.x, clientY: to.y }));
  fireEvent(window, pointer("pointerup", { clientX: to.x, clientY: to.y }));
};

describe("create", () => {
  it("drawing on empty board creates a note with the normalized rect (any direction)", () => {
    render(<App />);
    const board = screen.getByTestId("board");
    const before = noteIds();

    // Up-left drag — the imprecise direction — must normalize.
    fireEvent(board, pointer("pointerdown", { clientX: 500, clientY: 400 }));
    fireEvent(window, pointer("pointermove", { clientX: 340, clientY: 260 }));
    const ghost = screen.getByTestId("ghost");
    expect(ghost.style.left).toBe("340px");
    expect(ghost.style.top).toBe("260px");
    expect(ghost.style.width).toBe("160px");
    fireEvent(window, pointer("pointerup", { clientX: 340, clientY: 260 }));

    expect(screen.queryByTestId("ghost")).toBeNull();
    const created = noteIds().filter((id) => !before.includes(id));
    expect(created).toHaveLength(1);
    const el = screen.getByTestId(`note-${created[0]}`);
    expect(el.style.left).toBe("340px");
    expect(el.style.top).toBe("260px");
    expect(el.style.width).toBe("160px");
    expect(el.style.height).toBe("140px");
  });

  it("a tiny click-gesture creates a default-size note at the press point", () => {
    render(<App />);
    const before = noteIds();
    drag(screen.getByTestId("board"), { x: 600, y: 300 }, { x: 601, y: 301 });
    const created = noteIds().filter((id) => !before.includes(id));
    expect(created).toHaveLength(1);
    const el = screen.getByTestId(`note-${created[0]}`);
    expect(el.style.left).toBe("600px");
    expect(el.style.width).toBe("160px");
    expect(el.style.height).toBe("120px");
  });

  it("a press that starts on a note never creates", () => {
    render(<App />);
    const before = noteIds();
    drag(screen.getByTestId("note-a"), { x: 60, y: 60 }, { x: 300, y: 300 });
    expect(noteIds()).toHaveLength(before.length);
  });

  it("a board press while an editor is open dismisses instead of creating", () => {
    render(<App />);
    fireEvent.dblClick(screen.getByTestId("note-a"));
    expect(screen.queryByTestId("edit-a")).not.toBeNull();
    const before = noteIds();
    drag(screen.getByTestId("board"), { x: 600, y: 300 }, { x: 601, y: 301 });
    expect(noteIds()).toHaveLength(before.length);
  });
});

describe("move", () => {
  it("drags with zero re-renders, commits once on pointerup, sibling untouched", () => {
    render(<App />);
    const a = screen.getByTestId("note-a");
    fireEvent(a, pointer("pointerdown", { clientX: 60, clientY: 60 }));
    const base = { ...renderCounts };

    fireEvent(window, pointer("pointermove", { clientX: 120, clientY: 130 }));
    fireEvent(window, pointer("pointermove", { clientX: 180, clientY: 200 }));
    expect(a.style.transform).toBe("translate(120px, 140px)");
    expect(renderCounts.a).toBe(base.a);
    expect(renderCounts.b).toBe(base.b);

    fireEvent(window, pointer("pointerup", { clientX: 180, clientY: 200 }));
    expect(a.style.transform).toBe("");
    expect(a.style.left).toBe("160px");
    expect(a.style.top).toBe("180px");
    expect(renderCounts.a).toBe((base.a ?? 0) + 1);
    expect(renderCounts.b).toBe(base.b);
  });

  it("a plain click raises the note (zIndex) without moving it", () => {
    render(<App />);
    const a = screen.getByTestId("note-a");
    drag(a, { x: 60, y: 60 }, { x: 61, y: 60 });
    expect(a.style.left).toBe("40px");
    expect(a.style.top).toBe("40px");
    expect(a.style.zIndex).toBe("3");
  });

  it("a fast flick in one event is fully tracked (window listeners)", () => {
    render(<App />);
    const a = screen.getByTestId("note-a");
    drag(a, { x: 60, y: 60 }, { x: 560, y: 460 });
    expect(a.style.left).toBe("540px");
    expect(a.style.top).toBe("440px");
  });

  it("Escape aborts the drag: transform rolls back, nothing commits", () => {
    render(<App />);
    const a = screen.getByTestId("note-a");
    fireEvent(a, pointer("pointerdown", { clientX: 60, clientY: 60 }));
    fireEvent(window, pointer("pointermove", { clientX: 200, clientY: 200 }));
    expect(a.style.transform).not.toBe("");
    fireEvent(window, new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(a.style.transform).toBe("");
    expect(a.style.left).toBe("40px");
    fireEvent(window, pointer("pointerup", { clientX: 200, clientY: 200 }));
    expect(a.style.left).toBe("40px");
  });
});

describe("resize", () => {
  it("the handle resizes without moving; the body moves without resizing", () => {
    render(<App />);
    const a = screen.getByTestId("note-a");
    drag(screen.getByTestId("resize-a"), { x: 200, y: 160 }, { x: 260, y: 200 });
    expect(a.style.width).toBe("220px");
    expect(a.style.height).toBe("160px");
    expect(a.style.left).toBe("40px");
    expect(a.style.top).toBe("40px");

    drag(a, { x: 60, y: 60 }, { x: 100, y: 100 });
    expect(a.style.left).toBe("80px");
    expect(a.style.width).toBe("220px");
  });

  it("growth is capped at the measured board edge so the handle stays reachable", () => {
    render(<App />);
    stubRect(screen.getByTestId("board"), { left: 0, top: 0, right: 1024, bottom: 768 });
    const a = screen.getByTestId("note-a"); // at (40, 40)
    fireEvent(screen.getByTestId("resize-a"), pointer("pointerdown", { clientX: 200, clientY: 160 }));
    fireEvent(window, pointer("pointermove", { clientX: 2200, clientY: 2160 }));
    expect(a.style.width).toBe("984px"); // 1024 - 40
    expect(a.style.height).toBe("728px"); // 768 - 40
    fireEvent(window, pointer("pointerup", { clientX: 2200, clientY: 2160 }));
    expect(a.style.width).toBe("984px");
    expect(a.style.height).toBe("728px");
  });

  it("a wild negative drag clamps to the minimum, mid-gesture and at commit", () => {
    render(<App />);
    const a = screen.getByTestId("note-a");
    fireEvent(screen.getByTestId("resize-a"), pointer("pointerdown", { clientX: 200, clientY: 160 }));
    fireEvent(window, pointer("pointermove", { clientX: -300, clientY: -340 }));
    expect(a.style.width).toBe("120px");
    expect(a.style.height).toBe("90px");
    fireEvent(window, pointer("pointerup", { clientX: -300, clientY: -340 }));
    expect(a.style.width).toBe("120px");
    expect(a.style.height).toBe("90px");
  });
});

describe("trash", () => {
  it("arms with feedback mid-drag, deletes on drop inside, never on pass-through", () => {
    render(<App />);
    stubRect(screen.getByTestId("trash"), { left: 400, top: 500, right: 480, bottom: 560 });
    const a = screen.getByTestId("note-a");
    const trash = screen.getByTestId("trash");

    // Pass over the trash, drop outside: armed then disarmed, note survives.
    fireEvent(a, pointer("pointerdown", { clientX: 60, clientY: 60 }));
    const base = { ...renderCounts };
    fireEvent(window, pointer("pointermove", { clientX: 440, clientY: 530 }));
    expect(a.dataset.overTrash).toBe("true");
    expect(trash.dataset.armed).toBe("true");
    expect(renderCounts.a).toBe(base.a);
    fireEvent(window, pointer("pointermove", { clientX: 700, clientY: 200 }));
    expect(a.dataset.overTrash).toBeUndefined();
    expect(trash.dataset.armed).toBeUndefined();
    fireEvent(window, pointer("pointerup", { clientX: 700, clientY: 200 }));
    expect(screen.queryByTestId("note-a")).not.toBeNull();

    // Drop inside: deleted; sibling untouched.
    drag(a, { x: 700, y: 200 }, { x: 440, y: 530 });
    expect(screen.queryByTestId("note-a")).toBeNull();
    expect(screen.queryByTestId("note-b")).not.toBeNull();
    expect(trash.dataset.armed).toBeUndefined();
  });

  it("a plain click on a note resting over the trash raises it — never deletes", () => {
    render(<App />);
    stubRect(screen.getByTestId("trash"), { left: 400, top: 500, right: 480, bottom: 560 });
    const a = screen.getByTestId("note-a");
    const trash = screen.getByTestId("trash");

    // Press/release inside the trash rect with only sub-threshold jitter:
    // no arming, no fade, no deletion — just the usual bring-to-front.
    fireEvent(a, pointer("pointerdown", { clientX: 440, clientY: 530 }));
    fireEvent(window, pointer("pointermove", { clientX: 441, clientY: 530 }));
    expect(trash.dataset.armed).toBeUndefined();
    expect(a.dataset.overTrash).toBeUndefined();
    fireEvent(window, pointer("pointerup", { clientX: 441, clientY: 530 }));
    expect(screen.queryByTestId("note-a")).not.toBeNull();
    expect(a.style.zIndex).toBe("3");
  });

  it("a resize gesture over the trash area never arms or deletes", () => {
    render(<App />);
    stubRect(screen.getByTestId("trash"), { left: 400, top: 500, right: 480, bottom: 560 });
    drag(screen.getByTestId("resize-a"), { x: 200, y: 160 }, { x: 440, y: 530 });
    expect(screen.getByTestId("trash").dataset.armed).toBeUndefined();
    expect(screen.queryByTestId("note-a")).not.toBeNull();
  });
});

describe("editing & colors", () => {
  it("double-click edits; blur commits the draft", () => {
    render(<App />);
    fireEvent.dblClick(screen.getByTestId("note-a"));
    const editor = screen.getByTestId("edit-a") as HTMLTextAreaElement;
    expect(editor.value).toBe("Drag me around");
    fireEvent.change(editor, { target: { value: "Buy milk" } });
    fireEvent.blur(editor);
    expect(screen.queryByTestId("edit-a")).toBeNull();
    expect(screen.getByTestId("text-a").textContent).toBe("Buy milk");
  });

  it("Escape cancels the draft; dragging the open editor never moves the note", () => {
    render(<App />);
    fireEvent.dblClick(screen.getByTestId("note-a"));
    const editor = screen.getByTestId("edit-a") as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: "discard me" } });

    drag(editor, { x: 60, y: 60 }, { x: 300, y: 300 });
    expect(screen.getByTestId("note-a").style.left).toBe("40px");

    fireEvent.keyDown(editor, { key: "Escape" });
    expect(screen.queryByTestId("edit-a")).toBeNull();
    expect(screen.getByTestId("text-a").textContent).toBe("Drag me around");
  });

  it("a commit works again after an earlier Escape-cancel of the same note", () => {
    render(<App />);
    fireEvent.dblClick(screen.getByTestId("note-a"));
    let editor = screen.getByTestId("edit-a") as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: "discard me" } });
    fireEvent.keyDown(editor, { key: "Escape" });
    expect(screen.queryByTestId("edit-a")).toBeNull();

    fireEvent.dblClick(screen.getByTestId("note-a"));
    editor = screen.getByTestId("edit-a") as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: "second attempt" } });
    fireEvent.blur(editor);
    expect(screen.queryByTestId("edit-a")).toBeNull();
    expect(screen.getByTestId("text-a").textContent).toBe("second attempt");
  });

  it("the color button cycles the palette without starting a drag", () => {
    render(<App />);
    const a = screen.getByTestId("note-a");
    const button = screen.getByTestId("color-a");
    fireEvent(button, pointer("pointerdown", { clientX: 190, clientY: 50 }));
    fireEvent.click(button);
    expect(a.dataset.color).toBe("mint");
    fireEvent.click(button);
    expect(a.dataset.color).toBe("sky");
    expect(a.style.left).toBe("40px");
  });
});

describe("persistence", () => {
  it("hydrates from a valid stored board; falls back to seeds on corrupt or wrong-version data", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        v: 1,
        notes: [{ id: "p1", x: 10, y: 10, w: 160, h: 120, z: 1, color: "sky", text: "restored" }],
        nextZ: 2,
      }),
    );
    const first = render(<App />);
    expect(screen.getByTestId("text-p1").textContent).toBe("restored");
    expect(screen.queryByTestId("note-a")).toBeNull();
    first.unmount();

    localStorage.setItem(STORAGE_KEY, "not-json{{");
    const second = render(<App />);
    expect(screen.getByTestId("note-a")).not.toBeNull();
    second.unmount();

    localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 2, notes: [], nextZ: 1 }));
    render(<App />);
    expect(screen.getByTestId("note-a")).not.toBeNull();
  });

  it("rejects shape-valid payloads that break invariants; repairs a stale z-counter", () => {
    const note = (id: string, z: number) =>
      ({ id, x: 10, y: 10, w: 160, h: 120, z, color: "sky", text: id }) as const;

    // Duplicate ids would cross-wire React keys and the node registry.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ v: 1, notes: [note("dup", 1), note("dup", 2)], nextZ: 3 }),
    );
    const first = render(<App />);
    expect(screen.queryByTestId("note-dup")).toBeNull();
    expect(screen.getByTestId("note-a")).not.toBeNull();
    first.unmount();

    // "1e999" parses to Infinity — typeof number, but poison for drag math.
    localStorage.setItem(
      STORAGE_KEY,
      '{"v":1,"notes":[{"id":"p1","x":1e999,"y":10,"w":160,"h":120,"z":1,"color":"sky","text":"x"}],"nextZ":2}',
    );
    const second = render(<App />);
    expect(screen.queryByTestId("note-p1")).toBeNull();
    expect(screen.getByTestId("note-a")).not.toBeNull();
    second.unmount();

    // nextZ below the notes' max z would send a raised note to the BACK;
    // hydration must lift the counter above every stored z.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ v: 1, notes: [note("p1", 5), note("p2", 6)], nextZ: 1 }),
    );
    render(<App />);
    const p1 = screen.getByTestId("note-p1");
    drag(p1, { x: 20, y: 20 }, { x: 21, y: 20 });
    expect(p1.style.zIndex).toBe("7");
  });

  it("a burst of commits debounces into one save; idle mount saves nothing", () => {
    vi.useFakeTimers();
    try {
      render(<App />);
      const baseCalls = api.calls.length;

      // Idle past the delay: the hydrated state is already "persisted".
      vi.advanceTimersByTime(SAVE_DELAY_MS * 4);
      expect(api.calls.length).toBe(baseCalls);
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

      const a = screen.getByTestId("note-a");
      drag(a, { x: 60, y: 60 }, { x: 120, y: 120 });
      drag(a, { x: 120, y: 120 }, { x: 200, y: 220 });
      expect(api.calls.length).toBe(baseCalls);

      vi.advanceTimersByTime(SAVE_DELAY_MS + 20);
      expect(api.calls.length).toBe(baseCalls + 1);
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as {
        notes: Array<{ id: string; x: number }>;
      };
      expect(stored.notes.find((n) => n.id === "a")?.x).toBe(180);
    } finally {
      vi.useRealTimers();
    }
  });

  it("the mock API is genuinely asynchronous", async () => {
    const before = api.calls.length;
    const result = await api.putBoard({ notes: [], nextZ: 1 });
    expect(result.ok).toBe(true);
    expect(typeof result.savedAt).toBe("number");
    expect(api.calls.length).toBe(before + 1);
  });
});
