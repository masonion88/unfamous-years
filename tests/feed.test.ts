import { describe, expect, it } from "vitest";
import { mixFeed } from "@/lib/stories";

const others = (n: number) => Array.from({ length: n }, (_, i) => `o${i}`);
const famous = (n: number) => Array.from({ length: n }, (_, i) => `F${i}`);

describe("mixFeed", () => {
  it("never puts a famous story first", () => {
    expect(mixFeed(others(10), famous(5))[0]).toBe("o0");
  });

  it("puts one famous story after every four others", () => {
    expect(mixFeed(others(8), famous(5))).toEqual([
      "o0", "o1", "o2", "o3", "F0",
      "o4", "o5", "o6", "o7", "F1",
    ]);
  });

  it("has at most one famous story in any five consecutive cards", () => {
    const feed = mixFeed(others(37), famous(20));
    for (let i = 0; i + 5 <= feed.length; i++) {
      expect(feed.slice(i, i + 5).filter((s) => s.startsWith("F")).length).toBeLessThanOrEqual(1);
    }
  });

  it("drops famous stories rather than stacking them when others run out", () => {
    expect(mixFeed(others(3), famous(5))).toEqual(["o0", "o1", "o2"]);
  });
});
