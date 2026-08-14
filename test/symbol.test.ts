import { describe, expect, it } from "vitest";
import { normalizeSymbol } from "../src/symbol";

describe("normalizeSymbol", () => {
  it.each([
    ["600519", "SH600519", "1.600519"],
    ["SH600519", "SH600519", "1.600519"],
    ["600519.SH", "SH600519", "1.600519"],
    ["000001", "SZ000001", "0.000001"],
    ["300750.SZ", "SZ300750", "0.300750"],
    ["BJ920001", "BJ920001", "0.920001"],
  ])("normalizes %s", (input, symbol, secid) => {
    expect(normalizeSymbol(input)).toMatchObject({ symbol, secid });
  });

  it.each(["", "60051", "6005190", "XX600519", "abc"])(
    "rejects %s",
    (input) => {
      expect(() => normalizeSymbol(input)).toThrow();
    },
  );
});
