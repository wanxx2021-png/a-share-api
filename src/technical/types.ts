export type PatternCategory =
  | "candlestick"
  | "trend"
  | "chart"
  | "indicator"
  | "volume";

export type PatternDirection = "bullish" | "bearish" | "neutral";

export interface CandleInput {
  readonly time: string | null;
  readonly open: number | null;
  readonly close: number | null;
  readonly high: number | null;
  readonly low: number | null;
  readonly volumeLots: number | null;
  readonly amount?: number | null;
  readonly changePct?: number | null;
  readonly turnoverRatePct?: number | null;
}

export interface Candle {
  readonly time: string;
  readonly open: number;
  readonly close: number;
  readonly high: number;
  readonly low: number;
  readonly volume: number;
  readonly amount: number | null;
  readonly changePct: number | null;
  readonly turnoverRatePct: number | null;
}

export type NumericSeries = readonly (number | null)[];

export interface IndicatorSeries {
  readonly ma5: NumericSeries;
  readonly ma10: NumericSeries;
  readonly ma20: NumericSeries;
  readonly ma30: NumericSeries;
  readonly ma60: NumericSeries;
  readonly ma120: NumericSeries;
  readonly volumeMa5: NumericSeries;
  readonly volumeMa20: NumericSeries;
  readonly macdDif: NumericSeries;
  readonly macdDea: NumericSeries;
  readonly macdHistogram: NumericSeries;
  readonly rsi14: NumericSeries;
  readonly k: NumericSeries;
  readonly d: NumericSeries;
  readonly j: NumericSeries;
  readonly bollMiddle: NumericSeries;
  readonly bollUpper: NumericSeries;
  readonly bollLower: NumericSeries;
  readonly bollWidth: NumericSeries;
  readonly atr14: NumericSeries;
}

export interface AnalysisContext {
  readonly candles: readonly Candle[];
  readonly closes: readonly number[];
  readonly highs: readonly number[];
  readonly lows: readonly number[];
  readonly volumes: readonly number[];
  readonly indicators: IndicatorSeries;
}

export interface PatternDefinition {
  readonly id: string;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly category: PatternCategory;
  readonly direction: PatternDirection;
  readonly requiredBars: number;
  readonly description: string;
}

export interface Detection {
  readonly confidence: number;
  readonly evidence: readonly string[];
}

export interface PatternRule extends PatternDefinition {
  readonly detect: (context: AnalysisContext) => Detection | null;
}

export interface PatternMatch extends PatternDefinition {
  readonly confidence: number;
  readonly signalTime: string;
  readonly evidence: readonly string[];
}

export interface IndicatorSnapshot {
  readonly close: number;
  readonly ma5: number | null;
  readonly ma10: number | null;
  readonly ma20: number | null;
  readonly ma30: number | null;
  readonly ma60: number | null;
  readonly ma120: number | null;
  readonly volumeRatio5: number | null;
  readonly macdDif: number | null;
  readonly macdDea: number | null;
  readonly macdHistogram: number | null;
  readonly rsi14: number | null;
  readonly k: number | null;
  readonly d: number | null;
  readonly j: number | null;
  readonly bollMiddle: number | null;
  readonly bollUpper: number | null;
  readonly bollLower: number | null;
  readonly bollWidthPct: number | null;
  readonly atr14: number | null;
}

export interface PatternAnalysis {
  readonly methodologyVersion: string;
  readonly latestTime: string | null;
  readonly barsUsed: number;
  readonly evaluatedCount: number;
  readonly insufficientData: readonly string[];
  readonly indicators: IndicatorSnapshot | null;
  readonly matches: readonly PatternMatch[];
}

export interface PatternResolution {
  readonly patternIds: readonly string[];
  readonly matchedTerms: readonly string[];
  readonly unresolvedTerms: readonly string[];
  readonly selectedAll: boolean;
}
