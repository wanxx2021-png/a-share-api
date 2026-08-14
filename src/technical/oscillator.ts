import {
  bodyRatio,
  candleAt,
  changePct,
  crossedAbove,
  crossedAboveValue,
  crossedBelow,
  crossedBelowValue,
  detection,
  formatNumber,
  isBullish,
  numberAt,
  pivotIndices,
  priorExtreme,
  seriesAt,
  trendIsDown,
  trendIsUp,
  upperShadowRatio,
  volumeRatio,
} from "./helpers";
import type {
  AnalysisContext,
  Detection,
  NumericSeries,
  PatternCategory,
  PatternDirection,
  PatternRule,
} from "./types";

function signalRule(
  id: string,
  name: string,
  aliases: readonly string[],
  category: PatternCategory,
  direction: PatternDirection,
  requiredBars: number,
  description: string,
  detect: (context: AnalysisContext) => Detection | null,
): PatternRule {
  return { id, name, aliases, category, direction, requiredBars, description, detect };
}

function divergence(
  context: AnalysisContext,
  indicator: NumericSeries,
  kind: "bullish" | "bearish",
): readonly [number, number, number, number] | null {
  const windowSize = Math.min(80, context.closes.length);
  const closes = context.closes.slice(-windowSize);
  const indicatorWindow = indicator.slice(-windowSize);
  const pivotKind = kind === "bullish" ? "low" : "high";
  const pivots = pivotIndices(closes, pivotKind, 2);
  for (let rightPosition = pivots.length - 1; rightPosition > 0; rightPosition -= 1) {
    const right = pivots[rightPosition];
    if (right === undefined || right < closes.length - 7) continue;
    for (let leftPosition = rightPosition - 1; leftPosition >= 0; leftPosition -= 1) {
      const left = pivots[leftPosition];
      if (left === undefined || right - left < 7) continue;
      const leftPrice = closes[left];
      const rightPrice = closes[right];
      const leftIndicator = indicatorWindow[left];
      const rightIndicator = indicatorWindow[right];
      if (leftPrice === undefined || rightPrice === undefined || leftIndicator === null || leftIndicator === undefined || rightIndicator === null || rightIndicator === undefined) continue;
      const matched = kind === "bullish"
        ? rightPrice < leftPrice * 0.99 && rightIndicator > leftIndicator
        : rightPrice > leftPrice * 1.01 && rightIndicator < leftIndicator;
      if (matched) return [leftPrice, rightPrice, leftIndicator, rightIndicator];
    }
  }
  return null;
}

export const OSCILLATOR_RULES: readonly PatternRule[] = [
  signalRule(
    "macd_golden_cross",
    "MACD金叉",
    ["MACD向上交叉", "DIF上穿DEA", "金叉", "macd golden cross"],
    "indicator",
    "bullish",
    35,
    "MACD 的 DIF 线由下向上穿越 DEA 线。",
    (context) => crossedAbove(context.indicators.macdDif, context.indicators.macdDea)
      ? detection(89, "DIF 今日由下向上穿越 DEA", `MACD 柱值 ${formatNumber(seriesAt(context.indicators.macdHistogram) ?? 0, 4)}`)
      : null,
  ),
  signalRule(
    "macd_death_cross",
    "MACD死叉",
    ["MACD向下交叉", "DIF下穿DEA", "死叉", "macd death cross"],
    "indicator",
    "bearish",
    35,
    "MACD 的 DIF 线由上向下穿越 DEA 线。",
    (context) => crossedBelow(context.indicators.macdDif, context.indicators.macdDea)
      ? detection(89, "DIF 今日由上向下穿越 DEA", `MACD 柱值 ${formatNumber(seriesAt(context.indicators.macdHistogram) ?? 0, 4)}`)
      : null,
  ),
  signalRule(
    "macd_zero_axis_up",
    "MACD上穿零轴",
    ["DIF上零轴", "MACD零轴上方", "macd zero line bullish cross"],
    "indicator",
    "bullish",
    35,
    "DIF 由零轴下方向上穿越零轴。",
    (context) => crossedAboveValue(context.indicators.macdDif, 0)
      ? detection(88, "DIF 今日由负转正并上穿零轴", "中期动能转强")
      : null,
  ),
  signalRule(
    "macd_zero_axis_down",
    "MACD下穿零轴",
    ["DIF下零轴", "MACD零轴下方", "macd zero line bearish cross"],
    "indicator",
    "bearish",
    35,
    "DIF 由零轴上方向下穿越零轴。",
    (context) => crossedBelowValue(context.indicators.macdDif, 0)
      ? detection(88, "DIF 今日由正转负并下穿零轴", "中期动能转弱")
      : null,
  ),
  signalRule(
    "macd_bullish_divergence",
    "MACD底背离",
    ["MACD看涨背离", "DIF底背离", "底背离", "macd bullish divergence"],
    "indicator",
    "bullish",
    45,
    "价格形成更低低点，但同期 DIF 低点抬高。",
    (context) => {
      const match = divergence(context, context.indicators.macdDif, "bullish");
      if (!match) return null;
      return detection(83, `价格低点由 ${formatNumber(match[0])} 降至 ${formatNumber(match[1])}`, `DIF 低点由 ${formatNumber(match[2], 4)} 抬升至 ${formatNumber(match[3], 4)}`);
    },
  ),
  signalRule(
    "macd_bearish_divergence",
    "MACD顶背离",
    ["MACD看跌背离", "DIF顶背离", "顶背离", "macd bearish divergence"],
    "indicator",
    "bearish",
    45,
    "价格形成更高高点，但同期 DIF 高点降低。",
    (context) => {
      const match = divergence(context, context.indicators.macdDif, "bearish");
      if (!match) return null;
      return detection(83, `价格高点由 ${formatNumber(match[0])} 升至 ${formatNumber(match[1])}`, `DIF 高点由 ${formatNumber(match[2], 4)} 降至 ${formatNumber(match[3], 4)}`);
    },
  ),
  signalRule(
    "kdj_golden_cross",
    "KDJ金叉",
    ["K线上穿D线", "随机指标金叉", "金叉", "kdj golden cross"],
    "indicator",
    "bullish",
    12,
    "K 线由下向上穿越 D 线。",
    (context) => crossedAbove(context.indicators.k, context.indicators.d)
      ? detection(85, `K 值 ${formatNumber(seriesAt(context.indicators.k) ?? 0)}`, `D 值 ${formatNumber(seriesAt(context.indicators.d) ?? 0)}`)
      : null,
  ),
  signalRule(
    "kdj_death_cross",
    "KDJ死叉",
    ["K线下穿D线", "随机指标死叉", "死叉", "kdj death cross"],
    "indicator",
    "bearish",
    12,
    "K 线由上向下穿越 D 线。",
    (context) => crossedBelow(context.indicators.k, context.indicators.d)
      ? detection(85, `K 值 ${formatNumber(seriesAt(context.indicators.k) ?? 0)}`, `D 值 ${formatNumber(seriesAt(context.indicators.d) ?? 0)}`)
      : null,
  ),
  signalRule(
    "kdj_oversold_cross",
    "KDJ低位金叉",
    ["KDJ超卖金叉", "低位KDJ金叉", "kdj oversold cross"],
    "indicator",
    "bullish",
    12,
    "K、D 位于相对低位时 K 线上穿 D 线。",
    (context) => {
      const k = seriesAt(context.indicators.k);
      const d = seriesAt(context.indicators.d);
      if (k === null || d === null || k > 35 || d > 35 || !crossedAbove(context.indicators.k, context.indicators.d)) return null;
      return detection(91, `K/D 位于低位（${formatNumber(k)} / ${formatNumber(d)}）`, "K 线向上穿越 D 线");
    },
  ),
  signalRule(
    "kdj_overbought_cross",
    "KDJ高位死叉",
    ["KDJ超买死叉", "高位KDJ死叉", "kdj overbought cross"],
    "indicator",
    "bearish",
    12,
    "K、D 位于相对高位时 K 线下穿 D 线。",
    (context) => {
      const k = seriesAt(context.indicators.k);
      const d = seriesAt(context.indicators.d);
      if (k === null || d === null || k < 65 || d < 65 || !crossedBelow(context.indicators.k, context.indicators.d)) return null;
      return detection(91, `K/D 位于高位（${formatNumber(k)} / ${formatNumber(d)}）`, "K 线向下穿越 D 线");
    },
  ),
  signalRule(
    "rsi_oversold_rebound",
    "RSI超卖反弹",
    ["RSI上穿30", "RSI低位转强", "rsi oversold rebound"],
    "indicator",
    "bullish",
    17,
    "RSI(14) 从 30 下方向上穿越 30。",
    (context) => crossedAboveValue(context.indicators.rsi14, 30)
      ? detection(88, `RSI(14) 回升至 ${formatNumber(seriesAt(context.indicators.rsi14) ?? 0)}`, "由传统超卖区重新站上 30")
      : null,
  ),
  signalRule(
    "rsi_overbought_fall",
    "RSI超买回落",
    ["RSI下穿70", "RSI高位转弱", "rsi overbought fall"],
    "indicator",
    "bearish",
    17,
    "RSI(14) 从 70 上方向下穿越 70。",
    (context) => crossedBelowValue(context.indicators.rsi14, 70)
      ? detection(88, `RSI(14) 回落至 ${formatNumber(seriesAt(context.indicators.rsi14) ?? 0)}`, "由传统超买区跌回 70 下方")
      : null,
  ),
  signalRule(
    "rsi_bullish_divergence",
    "RSI底背离",
    ["RSI看涨背离", "RSI低点背离", "底背离", "rsi bullish divergence"],
    "indicator",
    "bullish",
    45,
    "价格形成更低低点，但同期 RSI 低点抬高。",
    (context) => {
      const match = divergence(context, context.indicators.rsi14, "bullish");
      if (!match) return null;
      return detection(83, `价格低点由 ${formatNumber(match[0])} 降至 ${formatNumber(match[1])}`, `RSI 低点由 ${formatNumber(match[2])} 抬升至 ${formatNumber(match[3])}`);
    },
  ),
  signalRule(
    "rsi_bearish_divergence",
    "RSI顶背离",
    ["RSI看跌背离", "RSI高点背离", "顶背离", "rsi bearish divergence"],
    "indicator",
    "bearish",
    45,
    "价格形成更高高点，但同期 RSI 高点降低。",
    (context) => {
      const match = divergence(context, context.indicators.rsi14, "bearish");
      if (!match) return null;
      return detection(83, `价格高点由 ${formatNumber(match[0])} 升至 ${formatNumber(match[1])}`, `RSI 高点由 ${formatNumber(match[2])} 降至 ${formatNumber(match[3])}`);
    },
  ),
  signalRule(
    "boll_upper_breakout",
    "突破布林上轨",
    ["BOLL上轨突破", "布林带向上突破", "bollinger upper band breakout"],
    "indicator",
    "bullish",
    22,
    "收盘由布林上轨下方穿越至上轨上方。",
    (context) => {
      const close = numberAt(context.closes);
      const previousClose = numberAt(context.closes, 1);
      const upper = seriesAt(context.indicators.bollUpper);
      const previousUpper = seriesAt(context.indicators.bollUpper, 1);
      if (close === null || previousClose === null || upper === null || previousUpper === null || previousClose > previousUpper || close <= upper) return null;
      return detection(88, `收盘 ${formatNumber(close)} 突破布林上轨 ${formatNumber(upper)}`, "前一交易日仍位于上轨内");
    },
  ),
  signalRule(
    "boll_lower_breakdown",
    "跌破布林下轨",
    ["BOLL下轨跌破", "布林带向下破位", "bollinger lower band breakdown"],
    "indicator",
    "bearish",
    22,
    "收盘由布林下轨上方穿越至下轨下方。",
    (context) => {
      const close = numberAt(context.closes);
      const previousClose = numberAt(context.closes, 1);
      const lower = seriesAt(context.indicators.bollLower);
      const previousLower = seriesAt(context.indicators.bollLower, 1);
      if (close === null || previousClose === null || lower === null || previousLower === null || previousClose < previousLower || close >= lower) return null;
      return detection(88, `收盘 ${formatNumber(close)} 跌破布林下轨 ${formatNumber(lower)}`, "前一交易日仍位于下轨内");
    },
  ),
  signalRule(
    "boll_squeeze",
    "布林带收口",
    ["BOLL收口", "布林带挤压", "低波动收敛", "bollinger squeeze"],
    "indicator",
    "neutral",
    45,
    "布林带宽度降至近期低位，表示波动率收缩。",
    (context) => {
      const current = seriesAt(context.indicators.bollWidth);
      const widths = context.indicators.bollWidth.slice(-40).filter((value): value is number => value !== null);
      if (current === null || widths.length < 20) return null;
      const sorted = [...widths].sort((left, right) => left - right);
      const threshold = sorted[Math.floor(sorted.length * 0.2)];
      if (threshold === undefined || current > threshold || current > 0.1) return null;
      return detection(86, `当前带宽 ${formatNumber(current * 100)}%`, "处于近 40 日带宽的最低 20% 区间");
    },
  ),
  signalRule(
    "volume_price_up",
    "量价齐升",
    ["价涨量增", "量价配合", "volume and price rise"],
    "volume",
    "bullish",
    22,
    "价格上涨并接近阶段高位，同时成交量高于近期均量。",
    (context) => {
      const current = candleAt(context);
      const close5 = numberAt(context.closes, 5);
      const ratio = volumeRatio(context, 20);
      const high20 = priorExtreme(context.highs, 20, "high");
      if (!current || close5 === null || ratio === null || high20 === null || changePct(close5, current.close) < 3 || ratio < 1.2 || current.close < high20 * 0.97) return null;
      return detection(86, `近 5 日上涨 ${formatNumber(changePct(close5, current.close))}%`, `成交量为近 20 日均量 ${formatNumber(ratio)} 倍`, "收盘接近阶段高位");
    },
  ),
  signalRule(
    "price_up_volume_down",
    "价涨量缩背离",
    ["上涨缩量", "量价顶背离", "价升量减", "price up volume down"],
    "volume",
    "bearish",
    22,
    "价格处于阶段高位，但成交量明显低于近期均量。",
    (context) => {
      const close = numberAt(context.closes);
      const close5 = numberAt(context.closes, 5);
      const high20 = priorExtreme(context.highs, 20, "high");
      const ratio = volumeRatio(context, 20);
      if (close === null || close5 === null || high20 === null || ratio === null || changePct(close5, close) < 2 || close < high20 * 0.98 || ratio > 0.75) return null;
      return detection(80, `价格近 5 日上涨 ${formatNumber(changePct(close5, close))}% 并接近阶段高位`, `成交量仅为近 20 日均量 ${formatNumber(ratio)} 倍`);
    },
  ),
  signalRule(
    "low_volume_pullback",
    "缩量回踩",
    ["缩量调整", "缩量回调", "低量回踩均线", "low volume pullback"],
    "volume",
    "bullish",
    25,
    "上升趋势中的温和回调，成交量明显缩小且尚未跌破 20 日均线。",
    (context) => {
      const current = candleAt(context);
      const previous = candleAt(context, 1);
      const ma20 = seriesAt(context.indicators.ma20);
      const ratio = volumeRatio(context, 20);
      if (!current || !previous || ma20 === null || ratio === null || !trendIsUp(context) || current.close >= previous.close || changePct(previous.close, current.close) < -3.5 || current.close < ma20 * 0.98 || ratio > 0.7) return null;
      return detection(84, "中期趋势仍向上且收盘守住 MA20", `单日回调 ${formatNumber(-changePct(previous.close, current.close))}%`, `成交量缩至近 20 日均量 ${formatNumber(ratio)} 倍`);
    },
  ),
  signalRule(
    "high_volume_stall",
    "高位放量滞涨",
    ["放量滞涨", "高位巨量小K线", "高位量价背离", "high volume stall"],
    "volume",
    "bearish",
    25,
    "上涨趋势中成交量明显放大，但实体和涨幅很小，且常伴随上影线。",
    (context) => {
      const current = candleAt(context);
      const previous = candleAt(context, 1);
      const ratio = volumeRatio(context, 20);
      if (!current || !previous || ratio === null || !trendIsUp(context) || ratio < 2 || Math.abs(changePct(previous.close, current.close)) > 1.5 || bodyRatio(current) > 0.4 || upperShadowRatio(current) < 0.25) return null;
      return detection(86, `成交量放大至近 20 日均量 ${formatNumber(ratio)} 倍`, `涨跌幅仅 ${formatNumber(changePct(previous.close, current.close))}%`, "实体较小且上影线明显");
    },
  ),
  signalRule(
    "bottom_volume_surge",
    "底部放量转强",
    ["低位放量", "底部放量阳线", "bottom volume surge"],
    "volume",
    "bullish",
    65,
    "下跌或低位背景中出现放量阳线，价格开始转强。",
    (context) => {
      const current = candleAt(context);
      const previous = candleAt(context, 1);
      const ma60 = seriesAt(context.indicators.ma60);
      const ratio = volumeRatio(context, 20);
      if (!current || !previous || ma60 === null || ratio === null || (!trendIsDown(context) && previous.close > ma60) || !isBullish(current) || changePct(previous.close, current.close) < 2 || ratio < 1.8) return null;
      return detection(84, "此前处于下降趋势或 MA60 下方", `阳线上涨 ${formatNumber(changePct(previous.close, current.close))}%`, `成交量为近 20 日均量 ${formatNumber(ratio)} 倍`);
    },
  ),
  signalRule(
    "volume_dry_up",
    "地量",
    ["极度缩量", "成交量枯竭", "最低量", "volume dry up"],
    "volume",
    "neutral",
    22,
    "最新成交量低于近 20 日均量的一半，并接近阶段最低水平。",
    (context) => {
      const ratio = volumeRatio(context, 20);
      const current = numberAt(context.volumes);
      const priorLow = priorExtreme(context.volumes, 20, "low");
      if (ratio === null || current === null || priorLow === null || ratio > 0.5 || current > priorLow * 1.15) return null;
      return detection(83, `成交量仅为近 20 日均量 ${formatNumber(ratio)} 倍`, "接近近 20 日最低成交量");
    },
  ),
];
