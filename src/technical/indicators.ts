import type { IndicatorSeries } from "./types";

function emptySeries(length: number): (number | null)[] {
  return Array.from({ length }, () => null);
}

export function smaSeries(values: readonly number[], period: number): (number | null)[] {
  const result = emptySeries(values.length);
  let sum = 0;

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === undefined) {
      continue;
    }

    sum += value;
    if (index >= period) {
      sum -= values[index - period] ?? 0;
    }
    if (index >= period - 1) {
      result[index] = sum / period;
    }
  }

  return result;
}

export function emaSeries(values: readonly number[], period: number): (number | null)[] {
  const result = emptySeries(values.length);
  if (values.length === 0) {
    return result;
  }

  const multiplier = 2 / (period + 1);
  let previous = values[0] ?? 0;
  result[0] = previous;

  for (let index = 1; index < values.length; index += 1) {
    const value = values[index];
    if (value === undefined) {
      continue;
    }
    previous = ((value - previous) * multiplier) + previous;
    result[index] = previous;
  }

  return result;
}

function rsiSeries(values: readonly number[], period: number): (number | null)[] {
  const result = emptySeries(values.length);
  if (values.length <= period) {
    return result;
  }

  let gains = 0;
  let losses = 0;
  for (let index = 1; index <= period; index += 1) {
    const current = values[index];
    const previous = values[index - 1];
    if (current === undefined || previous === undefined) {
      continue;
    }
    const change = current - previous;
    gains += Math.max(change, 0);
    losses += Math.max(-change, 0);
  }

  let averageGain = gains / period;
  let averageLoss = losses / period;
  const rsiValue = (gain: number, loss: number): number => {
    if (loss === 0) return gain === 0 ? 50 : 100;
    return 100 - (100 / (1 + (gain / loss)));
  };
  result[period] = rsiValue(averageGain, averageLoss);

  for (let index = period + 1; index < values.length; index += 1) {
    const current = values[index];
    const previous = values[index - 1];
    if (current === undefined || previous === undefined) {
      continue;
    }
    const change = current - previous;
    averageGain = ((averageGain * (period - 1)) + Math.max(change, 0)) / period;
    averageLoss = ((averageLoss * (period - 1)) + Math.max(-change, 0)) / period;
    result[index] = rsiValue(averageGain, averageLoss);
  }

  return result;
}

function kdjSeries(
  highs: readonly number[],
  lows: readonly number[],
  closes: readonly number[],
  period = 9,
): { k: (number | null)[]; d: (number | null)[]; j: (number | null)[] } {
  const k = emptySeries(closes.length);
  const d = emptySeries(closes.length);
  const j = emptySeries(closes.length);
  let previousK = 50;
  let previousD = 50;

  for (let index = period - 1; index < closes.length; index += 1) {
    const windowHighs = highs.slice(index - period + 1, index + 1);
    const windowLows = lows.slice(index - period + 1, index + 1);
    const close = closes[index];
    if (windowHighs.length !== period || windowLows.length !== period || close === undefined) {
      continue;
    }

    const highest = Math.max(...windowHighs);
    const lowest = Math.min(...windowLows);
    const rsv = highest === lowest ? 50 : ((close - lowest) / (highest - lowest)) * 100;
    previousK = ((2 * previousK) + rsv) / 3;
    previousD = ((2 * previousD) + previousK) / 3;
    k[index] = previousK;
    d[index] = previousD;
    j[index] = (3 * previousK) - (2 * previousD);
  }

  return { k, d, j };
}

function bollingerSeries(values: readonly number[], period = 20, deviations = 2) {
  const middle = smaSeries(values, period);
  const upper = emptySeries(values.length);
  const lower = emptySeries(values.length);
  const width = emptySeries(values.length);

  for (let index = period - 1; index < values.length; index += 1) {
    const window = values.slice(index - period + 1, index + 1);
    const mean = middle[index];
    if (window.length !== period || mean === null || mean === undefined) {
      continue;
    }
    const variance = window.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / period;
    const standardDeviation = Math.sqrt(variance);
    upper[index] = mean + (deviations * standardDeviation);
    lower[index] = mean - (deviations * standardDeviation);
    width[index] = mean === 0 ? null : ((upper[index] ?? mean) - (lower[index] ?? mean)) / mean;
  }

  return { middle, upper, lower, width };
}

function atrSeries(
  highs: readonly number[],
  lows: readonly number[],
  closes: readonly number[],
  period = 14,
): (number | null)[] {
  const trueRanges: number[] = [];
  for (let index = 0; index < closes.length; index += 1) {
    const high = highs[index];
    const low = lows[index];
    if (high === undefined || low === undefined) {
      trueRanges.push(0);
      continue;
    }
    const previousClose = closes[index - 1];
    trueRanges.push(previousClose === undefined
      ? high - low
      : Math.max(high - low, Math.abs(high - previousClose), Math.abs(low - previousClose)));
  }

  const result = emptySeries(closes.length);
  if (trueRanges.length < period) {
    return result;
  }

  let currentAtr = trueRanges.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  result[period - 1] = currentAtr;
  for (let index = period; index < trueRanges.length; index += 1) {
    currentAtr = ((currentAtr * (period - 1)) + (trueRanges[index] ?? 0)) / period;
    result[index] = currentAtr;
  }
  return result;
}

export function calculateIndicators(
  closes: readonly number[],
  highs: readonly number[],
  lows: readonly number[],
  volumes: readonly number[],
): IndicatorSeries {
  const ema12 = emaSeries(closes, 12);
  const ema26 = emaSeries(closes, 26);
  const macdDif = closes.map((_, index) => {
    const fast = ema12[index];
    const slow = ema26[index];
    return fast === null || fast === undefined || slow === null || slow === undefined
      ? null
      : fast - slow;
  });
  const difValues = macdDif.map((value) => value ?? 0);
  const macdDea = emaSeries(difValues, 9);
  const macdHistogram = macdDif.map((value, index) => {
    const signal = macdDea[index];
    return value === null || signal === null || signal === undefined
      ? null
      : (value - signal) * 2;
  });
  const kdj = kdjSeries(highs, lows, closes);
  const bollinger = bollingerSeries(closes);

  return {
    ma5: smaSeries(closes, 5),
    ma10: smaSeries(closes, 10),
    ma20: smaSeries(closes, 20),
    ma30: smaSeries(closes, 30),
    ma60: smaSeries(closes, 60),
    ma120: smaSeries(closes, 120),
    volumeMa5: smaSeries(volumes, 5),
    volumeMa20: smaSeries(volumes, 20),
    macdDif,
    macdDea,
    macdHistogram,
    rsi14: rsiSeries(closes, 14),
    k: kdj.k,
    d: kdj.d,
    j: kdj.j,
    bollMiddle: bollinger.middle,
    bollUpper: bollinger.upper,
    bollLower: bollinger.lower,
    bollWidth: bollinger.width,
    atr14: atrSeries(highs, lows, closes),
  };
}
