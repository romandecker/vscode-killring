import { describe, it, expect } from "vitest";
import { KillRing } from "../src/killRing";

describe("KillRing capture", () => {
  it("ignores empty captures", () => {
    const ring = new KillRing(60);
    expect(ring.push("")).toBe(false);
    expect(ring.isEmpty()).toBe(true);
  });

  it("adds new entries at the front, most-recent first", () => {
    const ring = new KillRing(60);
    ring.push("a");
    ring.push("b");
    ring.push("c");
    expect(ring.getEntries()).toEqual(["c", "b", "a"]);
  });

  it("dedups consecutive identical captures but resets the pointer", () => {
    const ring = new KillRing(60);
    ring.push("a");
    ring.push("b");
    ring.popBackward(); // pointer -> "a"
    expect(ring.current()).toBe("a");

    // Consecutive duplicate of the front ("b") -> no new entry, pointer resets.
    expect(ring.push("b")).toBe(false);
    expect(ring.getEntries()).toEqual(["b", "a"]);
    expect(ring.current()).toBe("b");
  });

  it("does not dedup non-consecutive duplicates", () => {
    const ring = new KillRing(60);
    ring.push("a");
    ring.push("b");
    expect(ring.push("a")).toBe(true);
    expect(ring.getEntries()).toEqual(["a", "b", "a"]);
  });

  it("evicts the oldest entry past maxSize", () => {
    const ring = new KillRing(3);
    ring.push("a");
    ring.push("b");
    ring.push("c");
    ring.push("d");
    expect(ring.getEntries()).toEqual(["d", "c", "b"]);
    expect(ring.size).toBe(3);
  });

  it("re-truncates when maxSize shrinks", () => {
    const ring = new KillRing(5);
    ["a", "b", "c", "d", "e"].forEach((t) => ring.push(t));
    ring.setMaxSize(2);
    expect(ring.getEntries()).toEqual(["e", "d"]);
  });
});

describe("KillRing yank-pointer semantics", () => {
  it("current() is the front after a fresh capture", () => {
    const ring = new KillRing(60);
    ring.push("a");
    ring.push("b");
    expect(ring.current()).toBe("b");
  });

  it("popBackward walks to older entries", () => {
    const ring = new KillRing(60);
    ring.push("a");
    ring.push("b");
    ring.push("c");
    expect(ring.popBackward()).toBe("b");
    expect(ring.popBackward()).toBe("a");
  });

  it("popBackward wraps around at the oldest entry", () => {
    const ring = new KillRing(60);
    ring.push("a");
    ring.push("b");
    expect(ring.popBackward()).toBe("a");
    expect(ring.popBackward()).toBe("b"); // wrapped back to front
  });

  it("popForward walks toward newer entries and wraps", () => {
    const ring = new KillRing(60);
    ring.push("a");
    ring.push("b");
    ring.push("c");
    expect(ring.popForward()).toBe("a"); // wrap: front -> oldest
    expect(ring.popForward()).toBe("b");
    expect(ring.popForward()).toBe("c");
  });

  it("a new capture after popping resets the pointer to the front", () => {
    const ring = new KillRing(60);
    ring.push("a");
    ring.push("b");
    ring.popBackward(); // -> "a"
    ring.push("c");
    expect(ring.current()).toBe("c");
  });

  it("without a new capture, current() stays where popping left it (emacs)", () => {
    const ring = new KillRing(60);
    ring.push("a");
    ring.push("b");
    ring.push("c");
    ring.popBackward(); // -> "b"
    ring.popBackward(); // -> "a"
    // A subsequent plain paste would read current(), which is still "a".
    expect(ring.current()).toBe("a");
  });
});

describe("KillRing selectIndex (picker)", () => {
  it("moves the chosen entry to the front and points at it", () => {
    const ring = new KillRing(60);
    ring.push("a");
    ring.push("b");
    ring.push("c"); // ["c","b","a"]
    expect(ring.selectIndex(2)).toBe("a");
    expect(ring.getEntries()).toEqual(["a", "c", "b"]);
    expect(ring.current()).toBe("a");
  });

  it("returns undefined for out-of-range indices", () => {
    const ring = new KillRing(60);
    ring.push("a");
    expect(ring.selectIndex(5)).toBeUndefined();
    expect(ring.selectIndex(-1)).toBeUndefined();
  });
});

describe("KillRing edge cases", () => {
  it("pop returns undefined on an empty ring", () => {
    const ring = new KillRing(60);
    expect(ring.popBackward()).toBeUndefined();
    expect(ring.popForward()).toBeUndefined();
    expect(ring.current()).toBeUndefined();
  });

  it("clear empties the ring and resets the pointer", () => {
    const ring = new KillRing(60);
    ring.push("a");
    ring.push("b");
    ring.popBackward();
    ring.clear();
    expect(ring.isEmpty()).toBe(true);
    expect(ring.getPointer()).toBe(0);
    expect(ring.current()).toBeUndefined();
  });
});
