import { describe, expect, it } from "vitest";
import type { Note } from "../model/model";
import {
  DEFAULT_H,
  DEFAULT_W,
  initialBoard,
  MIN_H,
  MIN_W,
  notesReducer,
} from "../model/model";
import { normalizeRect, pointInRect } from "../model/geometry";

const findNote = (notes: readonly Note[], id: string): Note => {
  const n = notes.find((note) => note.id === id);
  if (!n) throw new Error(`missing note ${id}`);
  return n;
};

describe("notesReducer", () => {
  it("CREATE stamps z from nextZ, bumps the counter, and keeps existing notes reference-equal", () => {
    const note: Note = {
      id: "c",
      x: 500,
      y: 300,
      w: DEFAULT_W,
      h: DEFAULT_H,
      z: 0,
      color: "sky",
      text: "",
    };
    const next = notesReducer(initialBoard, { type: "CREATE", note });
    expect(next.notes).toHaveLength(3);
    expect(next.notes[2]?.z).toBe(3);
    expect(next.nextZ).toBe(4);
    expect(next.notes[0]).toBe(initialBoard.notes[0]);
    expect(next.notes[1]).toBe(initialBoard.notes[1]);
  });

  it("MOVE updates only the target — untouched notes keep identity (memo currency)", () => {
    const next = notesReducer(initialBoard, { type: "MOVE", id: "a", x: 300, y: 220 });
    expect(findNote(next.notes, "a").x).toBe(300);
    expect(findNote(next.notes, "b")).toBe(initialBoard.notes[1]);
  });

  it("RESIZE clamps to MIN_W × MIN_H", () => {
    const next = notesReducer(initialBoard, { type: "RESIZE", id: "a", w: 10, h: -35 });
    expect(findNote(next.notes, "a").w).toBe(MIN_W);
    expect(findNote(next.notes, "a").h).toBe(MIN_H);
  });

  it("BRING_TO_FRONT assigns nextZ; a second call is a same-reference no-op", () => {
    const raised = notesReducer(initialBoard, { type: "BRING_TO_FRONT", id: "a" });
    expect(findNote(raised.notes, "a").z).toBe(3);
    expect(raised.nextZ).toBe(4);
    expect(notesReducer(raised, { type: "BRING_TO_FRONT", id: "a" })).toBe(raised);
  });

  it("REMOVE / EDIT_TEXT / SET_COLOR update immutably", () => {
    const removed = notesReducer(initialBoard, { type: "REMOVE", id: "a" });
    expect(removed.notes).toHaveLength(1);
    const edited = notesReducer(initialBoard, { type: "EDIT_TEXT", id: "b", text: "hi" });
    expect(findNote(edited.notes, "b").text).toBe("hi");
    const colored = notesReducer(initialBoard, { type: "SET_COLOR", id: "b", color: "rose" });
    expect(findNote(colored.notes, "b").color).toBe("rose");
    expect(initialBoard.notes).toHaveLength(2);
  });
});

describe("geometry", () => {
  it("normalizeRect handles all four drag directions and the zero gesture", () => {
    expect(normalizeRect(10, 20, 110, 90)).toEqual({ left: 10, top: 20, width: 100, height: 70 });
    expect(normalizeRect(110, 90, 10, 20)).toEqual({ left: 10, top: 20, width: 100, height: 70 });
    expect(normalizeRect(110, 20, 10, 90)).toEqual({ left: 10, top: 20, width: 100, height: 70 });
    expect(normalizeRect(10, 90, 110, 20)).toEqual({ left: 10, top: 20, width: 100, height: 70 });
    expect(normalizeRect(5, 5, 5, 5)).toEqual({ left: 5, top: 5, width: 0, height: 0 });
  });

  it("pointInRect is edge-inclusive", () => {
    const r = { left: 10, top: 10, width: 30, height: 20 };
    expect(pointInRect(10, 10, r)).toBe(true);
    expect(pointInRect(40, 30, r)).toBe(true);
    expect(pointInRect(41, 30, r)).toBe(false);
    expect(pointInRect(25, 9, r)).toBe(false);
  });
});
