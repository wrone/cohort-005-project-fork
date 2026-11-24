import { describe, it, expect } from "vitest";
import { noteDraftStatus } from "../index";

describe("noteDraftStatus", () => {
  it("cannot save an empty box when there is no note yet", () => {
    expect(noteDraftStatus("", null, 10)).toEqual({
      length: 0,
      tooLong: false,
      empty: true,
      unsaved: false,
      canSave: false,
    });
  });

  it("can save new text for a Student with no note", () => {
    expect(noteDraftStatus("hello", null, 10)).toEqual({
      length: 5,
      tooLong: false,
      empty: false,
      unsaved: true,
      canSave: true,
    });
  });

  it("has nothing to save when the draft matches the saved note", () => {
    const status = noteDraftStatus("hello", "hello", 10);
    expect(status.unsaved).toBe(false);
    expect(status.canSave).toBe(false);
  });

  it("can save an edit to an existing note", () => {
    const status = noteDraftStatus("hello there", "hello", 20);
    expect(status.unsaved).toBe(true);
    expect(status.canSave).toBe(true);
  });

  it("ignores surrounding whitespace, which the save trims anyway", () => {
    const status = noteDraftStatus("hello \n", "hello", 10);
    expect(status.unsaved).toBe(false);
    expect(status.canSave).toBe(false);
  });

  it("compares against the saved note without its surrounding whitespace", () => {
    expect(noteDraftStatus("hello", " hello ", 10).unsaved).toBe(false);
  });

  it("treats whitespace only as empty, so it cannot be saved", () => {
    const status = noteDraftStatus("   \n ", "hello", 10);
    expect(status.empty).toBe(true);
    expect(status.unsaved).toBe(true);
    expect(status.canSave).toBe(false);
  });

  it("allows a draft exactly at the limit", () => {
    const status = noteDraftStatus("x".repeat(10), null, 10);
    expect(status.tooLong).toBe(false);
    expect(status.canSave).toBe(true);
  });

  it("blocks a draft one character over the limit", () => {
    const status = noteDraftStatus("x".repeat(11), null, 10);
    expect(status.length).toBe(11);
    expect(status.tooLong).toBe(true);
    expect(status.canSave).toBe(false);
  });
});
