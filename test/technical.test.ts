import { describe, expect, it } from "vitest";
import {
  analyzeTechnicalPatterns,
  PATTERN_CATALOG,
  PATTERN_COUNT,
  resolvePatternTerms,
  type CandleInput,
} from "../src/technical";

function candle(
  index: number,
  close: number,
  overrides: Partial<CandleInput> = {},
): CandleInput {
  return {
    time: `2026-01-${String(index + 1).padStart(2, "0")}`,
    open: close - 0.1,
    close,
    high: close + 0.2,
    low: close - 0.2,
    volumeLots: 100,
    amount: 1_000_000,
    changePct: null,
    turnoverRatePct: 1,
    ...overrides,
  };
}

function matchedIds(inputs: readonly CandleInput[], patternIds: readonly string[]): string[] {
  return analyzeTechnicalPatterns(inputs, patternIds).matches.map((match) => match.id);
}

describe("technical pattern catalog", () => {
  it("contains 101 implemented and uniquely identified patterns", () => {
    expect(PATTERN_COUNT).toBe(101);
    expect(PATTERN_CATALOG).toHaveLength(101);
    expect(new Set(PATTERN_CATALOG.map((item) => item.id)).size).toBe(101);
    expect(PATTERN_CATALOG.every((item) => item.aliases.length > 0)).toBe(true);
  });

  it("resolves natural Chinese commands and broad aliases", () => {
    const fairy = resolvePatternTerms(["今天出现仙人指路形态的股票"]);
    expect(fairy.patternIds).toContain("fairy_guide");
    expect(fairy.unresolvedTerms).toEqual([]);

    const crosses = resolvePatternTerms(["金叉"]);
    expect(crosses.patternIds).toEqual(expect.arrayContaining([
      "ma_golden_cross",
      "macd_golden_cross",
      "kdj_golden_cross",
    ]));

    const specificCross = resolvePatternTerms(["筛选今天MACD金叉的股票"]);
    expect(specificCross.patternIds).toEqual(["macd_golden_cross"]);

    const all = resolvePatternTerms(["分析 600519 的全部技术形态"]);
    expect(all.selectedAll).toBe(true);
    expect(all.patternIds).toHaveLength(101);
  });
});

describe("technical pattern detection", () => {
  it("detects bullish engulfing", () => {
    const inputs = [
      candle(0, 9.2, { open: 10, high: 10.1, low: 9.1 }),
      candle(1, 10.3, { open: 9, high: 10.4, low: 8.9 }),
    ];
    expect(matchedIds(inputs, ["bullish_engulfing"])).toContain("bullish_engulfing");
  });

  it("detects a morning star", () => {
    const inputs = [
      candle(0, 9, { open: 10, high: 10.1, low: 8.9 }),
      candle(1, 8.85, { open: 8.9, high: 9, low: 8.7 }),
      candle(2, 9.8, { open: 8.9, high: 9.9, low: 8.85 }),
    ];
    expect(matchedIds(inputs, ["morning_star"])).toContain("morning_star");
  });

  it("detects a 5/10-day moving-average golden cross", () => {
    const closes = [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 9, 12];
    const inputs = closes.map((close, index) => candle(index, close));
    expect(matchedIds(inputs, ["ma_golden_cross"])).toContain("ma_golden_cross");
  });

  it("detects a 20-day high breakout", () => {
    const inputs = Array.from({ length: 20 }, (_, index) => candle(index, 10, {
      high: 10.5,
      low: 9.5,
    }));
    inputs.push(candle(20, 11, { open: 10.4, high: 11.2, low: 10.3 }));
    expect(matchedIds(inputs, ["breakout_20d_high"])).toContain("breakout_20d_high");
  });

  it("detects the A-share fairy-guide heuristic and returns evidence", () => {
    const inputs = Array.from({ length: 24 }, (_, index) => candle(
      index,
      10 + (index * 0.1),
      { volumeLots: 100 },
    ));
    inputs.push(candle(24, 12.95, {
      open: 12.6,
      high: 13.55,
      low: 12.55,
      volumeLots: 100,
    }));

    const analysis = analyzeTechnicalPatterns(inputs, ["fairy_guide"]);
    expect(analysis.matches).toHaveLength(1);
    expect(analysis.matches[0]).toMatchObject({
      id: "fairy_guide",
      name: "仙人指路",
      signalTime: "2026-01-25",
    });
    expect(analysis.matches[0]?.evidence.length).toBeGreaterThanOrEqual(3);
  });

  it("evaluates the entire catalog on a full history without detector errors", () => {
    const inputs = Array.from({ length: 250 }, (_, index) => {
      const wave = Math.sin(index / 8) * 1.5;
      const close = 20 + (index * 0.015) + wave;
      return candle(index, close, {
        time: `bar-${index}`,
        open: close - (Math.sin(index) * 0.25),
        high: close + 0.6,
        low: close - 0.6,
        volumeLots: 1000 + ((index % 17) * 35),
      });
    });
    const analysis = analyzeTechnicalPatterns(inputs);
    expect(analysis.evaluatedCount).toBe(101);
    expect(analysis.insufficientData).toEqual([]);
    expect(analysis.indicators?.rsi14).not.toBeNull();
  });
});
