import { calculateIndicators } from "./indicators";
import type {
  AnalysisContext,
  Candle,
  CandleInput,
  Detection,
  NumericSeries,
} from "./types";

export function createAnalysisContext(inputs: readonly CandleInput[]): AnalysisContext {
  const candles: Candle[] = [];
  for (const input of inputs) {
    if (
      !input.time
      || input.open === null
      || input.close === null
      || input.high === null
      || input.low === null
      || input.volumeLots === null
      || !Number.isFinite(input.open)
      || !Number.isFinite(input.close)
      || !Number.isFinite(input.high)
      || !Number.isFinite(input.low)
      || !Number.isFinite(input.volumeLots)
      || input.high < input.low
    ) {
      continue;
    }

    candles.push({
      time: input.time,
      open: input.open,
      close: input.close,
      high: input.high,
      low: input.low,
      volume: input.volumeLots,
      amount: input.amount ?? null,
      changePct: input.changePct ?? null,
      turnoverRatePct: input.turnoverRatePct ?? null,
    });
  }

  const closes = candles.map((candle) => candle.close);
  const highs = candles.map((candle) => candle.high);
  const lows = candles.map((candle) => candle.low);
  const volumes = candles.map((candle) => candle.volume);
  return {
    candles,
    closes,
    highs,
    lows,
    volumes,
    indicators: calculateIndicators(closes, highs, lows, volumes),
  };
}

export function candleAt(context: AnalysisContext, offset = 0): Candle | undefined {
  return context.candles[context.candles.length - 1 - offset];
}

export function numberAt(values: readonly number[], offset = 0): number | null {
  const value = values[values.length - 1 - offset];
  return value === undefined ? null : value;
}

export function seriesAt(values: NumericSeries, offset = 0): number | null {
  return values[values.length - 1 - offset] ?? null;
}

export function candleRange(candle: Candle): number {
  return Math.max(candle.high - candle.low, Math.abs(candle.close) * 0.000001);
}

export function candleBody(candle: Candle): number {
  return Math.abs(candle.close - candle.open);
}

export function bodyRatio(candle: Candle): number {
  return candleBody(candle) / candleRange(candle);
}

export function upperShadow(candle: Candle): number {
  return candle.high - Math.max(candle.open, candle.close);
}

export function lowerShadow(candle: Candle): number {
  return Math.min(candle.open, candle.close) - candle.low;
}

export function upperShadowRatio(candle: Candle): number {
  return upperShadow(candle) / candleRange(candle);
}

export function lowerShadowRatio(candle: Candle): number {
  return lowerShadow(candle) / candleRange(candle);
}

export function isBullish(candle: Candle): boolean {
  return candle.close > candle.open;
}

export function isBearish(candle: Candle): boolean {
  return candle.close < candle.open;
}

export function changePct(from: number, to: number): number {
  return from === 0 ? 0 : ((to - from) / Math.abs(from)) * 100;
}

export function nearlyEqual(left: number, right: number, tolerancePct = 0.5): boolean {
  const base = Math.max(Math.abs(left), Math.abs(right), 0.000001);
  return (Math.abs(left - right) / base) * 100 <= tolerancePct;
}

export function average(values: readonly number[]): number | null {
  return values.length === 0
    ? null
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function clampConfidence(value: number): number {
  return Math.max(1, Math.min(99, Math.round(value)));
}

export function detection(confidence: number, ...evidence: string[]): Detection {
  return { confidence: clampConfidence(confidence), evidence };
}

export function formatNumber(value: number, digits = 2): string {
  return Number.isFinite(value) ? value.toFixed(digits) : "--";
}

export function crossedAbove(
  fast: NumericSeries,
  slow: NumericSeries,
  offset = 0,
): boolean {
  const currentFast = seriesAt(fast, offset);
  const currentSlow = seriesAt(slow, offset);
  const previousFast = seriesAt(fast, offset + 1);
  const previousSlow = seriesAt(slow, offset + 1);
  return currentFast !== null
    && currentSlow !== null
    && previousFast !== null
    && previousSlow !== null
    && previousFast <= previousSlow
    && currentFast > currentSlow;
}

export function crossedBelow(
  fast: NumericSeries,
  slow: NumericSeries,
  offset = 0,
): boolean {
  const currentFast = seriesAt(fast, offset);
  const currentSlow = seriesAt(slow, offset);
  const previousFast = seriesAt(fast, offset + 1);
  const previousSlow = seriesAt(slow, offset + 1);
  return currentFast !== null
    && currentSlow !== null
    && previousFast !== null
    && previousSlow !== null
    && previousFast >= previousSlow
    && currentFast < currentSlow;
}

export function crossedAboveValue(values: NumericSeries, threshold: number): boolean {
  const current = seriesAt(values);
  const previous = seriesAt(values, 1);
  return current !== null && previous !== null && previous <= threshold && current > threshold;
}

export function crossedBelowValue(values: NumericSeries, threshold: number): boolean {
  const current = seriesAt(values);
  const previous = seriesAt(values, 1);
  return current !== null && previous !== null && previous >= threshold && current < threshold;
}

export function volumeRatio(context: AnalysisContext, period = 5): number | null {
  const current = numberAt(context.volumes);
  const history = context.volumes.slice(Math.max(0, context.volumes.length - period - 1), -1);
  const baseline = average(history);
  return current === null || baseline === null || baseline <= 0 ? null : current / baseline;
}

export function priorExtreme(
  values: readonly number[],
  lookback: number,
  kind: "high" | "low",
  excludeLatest = true,
): number | null {
  const end = excludeLatest ? values.length - 1 : values.length;
  const window = values.slice(Math.max(0, end - lookback), end);
  if (window.length === 0) {
    return null;
  }
  return kind === "high" ? Math.max(...window) : Math.min(...window);
}

export function trendIsUp(context: AnalysisContext, lookback = 20): boolean {
  const currentMa = seriesAt(context.indicators.ma20);
  const previousMa = seriesAt(context.indicators.ma20, Math.min(5, lookback - 1));
  const close = numberAt(context.closes);
  if (currentMa !== null && previousMa !== null && close !== null) {
    return close > currentMa && currentMa > previousMa;
  }
  const earlier = numberAt(context.closes, Math.min(lookback - 1, context.closes.length - 1));
  return close !== null && earlier !== null && close > earlier;
}

export function trendIsDown(context: AnalysisContext, lookback = 20): boolean {
  const currentMa = seriesAt(context.indicators.ma20);
  const previousMa = seriesAt(context.indicators.ma20, Math.min(5, lookback - 1));
  const close = numberAt(context.closes);
  if (currentMa !== null && previousMa !== null && close !== null) {
    return close < currentMa && currentMa < previousMa;
  }
  const earlier = numberAt(context.closes, Math.min(lookback - 1, context.closes.length - 1));
  return close !== null && earlier !== null && close < earlier;
}

export function regressionSlope(values: readonly number[]): number {
  if (values.length < 2) {
    return 0;
  }
  const xMean = (values.length - 1) / 2;
  const yMean = average(values) ?? 0;
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index] ?? yMean;
    numerator += (index - xMean) * (value - yMean);
    denominator += (index - xMean) ** 2;
  }
  return denominator === 0 || yMean === 0 ? 0 : (numerator / denominator) / Math.abs(yMean);
}

export function pivotIndices(
  values: readonly number[],
  kind: "high" | "low",
  radius = 2,
): number[] {
  const result: number[] = [];
  for (let index = radius; index < values.length - radius; index += 1) {
    const value = values[index];
    if (value === undefined) {
      continue;
    }
    const window = values.slice(index - radius, index + radius + 1);
    const extreme = kind === "high" ? Math.max(...window) : Math.min(...window);
    if (value === extreme) {
      result.push(index);
    }
  }
  return result;
}

export function latestCrossOffset(
  fast: NumericSeries,
  slow: NumericSeries,
  direction: "above" | "below",
  maxLookback: number,
): number | null {
  for (let offset = 0; offset <= maxLookback; offset += 1) {
    if (direction === "above" ? crossedAbove(fast, slow, offset) : crossedBelow(fast, slow, offset)) {
      return offset;
    }
  }
  return null;
}
