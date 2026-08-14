import {
  bodyRatio,
  candleAt,
  changePct,
  crossedAbove,
  crossedBelow,
  detection,
  formatNumber,
  isBearish,
  isBullish,
  latestCrossOffset,
  numberAt,
  priorExtreme,
  seriesAt,
  trendIsDown,
  trendIsUp,
  volumeRatio,
} from "./helpers";
import type {
  AnalysisContext,
  Detection,
  NumericSeries,
  PatternDirection,
  PatternRule,
} from "./types";

function trendRule(
  id: string,
  name: string,
  aliases: readonly string[],
  direction: PatternDirection,
  requiredBars: number,
  description: string,
  detect: (context: AnalysisContext) => Detection | null,
): PatternRule {
  return { id, name, aliases, category: "trend", direction, requiredBars, description, detect };
}

function valuesAt(series: readonly NumericSeries[], offset = 0): number[] | null {
  const values = series.map((item) => seriesAt(item, offset));
  return values.some((value) => value === null) ? null : values as number[];
}

function spreadPct(values: readonly number[]): number {
  const minimum = Math.min(...values);
  return minimum === 0 ? Number.POSITIVE_INFINITY : ((Math.max(...values) - minimum) / Math.abs(minimum)) * 100;
}

function allRising(series: readonly NumericSeries[], bars = 3): boolean {
  return series.every((item) => {
    const current = seriesAt(item);
    const previous = seriesAt(item, bars);
    return current !== null && previous !== null && current > previous;
  });
}

function allFalling(series: readonly NumericSeries[], bars = 3): boolean {
  return series.every((item) => {
    const current = seriesAt(item);
    const previous = seriesAt(item, bars);
    return current !== null && previous !== null && current < previous;
  });
}

function crossedCluster(
  context: AnalysisContext,
  direction: "above" | "below",
  lookback: number,
): number[] | null {
  const { ma5, ma10, ma20 } = context.indicators;
  const pairs: readonly [NumericSeries, NumericSeries][] = [
    [ma5, ma10],
    [ma5, ma20],
    [ma10, ma20],
  ];
  const offsets = pairs.map(([fast, slow]) => latestCrossOffset(fast, slow, direction, lookback));
  return offsets.some((offset) => offset === null) ? null : offsets as number[];
}

export const TREND_RULES: readonly PatternRule[] = [
  trendRule(
    "ma_bullish_alignment",
    "均线多头排列",
    ["多头排列", "均线向上发散", "bullish moving average alignment"],
    "bullish",
    65,
    "收盘位于均线上方，5、10、20、60 日均线由上到下排列且整体向上。",
    (context) => {
      const close = numberAt(context.closes);
      const values = valuesAt([context.indicators.ma5, context.indicators.ma10, context.indicators.ma20, context.indicators.ma60]);
      if (close === null || !values || !(close > values[0]! && values[0]! > values[1]! && values[1]! > values[2]! && values[2]! > values[3]!) || !allRising([context.indicators.ma5, context.indicators.ma10, context.indicators.ma20, context.indicators.ma60], 3)) return null;
      return detection(91, "收盘 > MA5 > MA10 > MA20 > MA60", "四条均线较三日前同步上行");
    },
  ),
  trendRule(
    "ma_bearish_alignment",
    "均线空头排列",
    ["空头排列", "均线向下发散", "bearish moving average alignment"],
    "bearish",
    65,
    "收盘位于均线下方，5、10、20、60 日均线由下到上排列且整体向下。",
    (context) => {
      const close = numberAt(context.closes);
      const values = valuesAt([context.indicators.ma5, context.indicators.ma10, context.indicators.ma20, context.indicators.ma60]);
      if (close === null || !values || !(close < values[0]! && values[0]! < values[1]! && values[1]! < values[2]! && values[2]! < values[3]!) || !allFalling([context.indicators.ma5, context.indicators.ma10, context.indicators.ma20, context.indicators.ma60], 3)) return null;
      return detection(91, "收盘 < MA5 < MA10 < MA20 < MA60", "四条均线较三日前同步下行");
    },
  ),
  trendRule(
    "ma_golden_cross",
    "均线金叉",
    ["MA金叉", "5日10日金叉", "均线向上交叉", "金叉", "moving average golden cross"],
    "bullish",
    12,
    "5 日均线由下向上穿越 10 日均线。",
    (context) => crossedAbove(context.indicators.ma5, context.indicators.ma10)
      ? detection(86, "MA5 今日由下向上穿越 MA10", "短期平均成本转强")
      : null,
  ),
  trendRule(
    "ma_death_cross",
    "均线死叉",
    ["MA死叉", "5日10日死叉", "均线向下交叉", "死叉", "moving average death cross"],
    "bearish",
    12,
    "5 日均线由上向下穿越 10 日均线。",
    (context) => crossedBelow(context.indicators.ma5, context.indicators.ma10)
      ? detection(86, "MA5 今日由上向下穿越 MA10", "短期平均成本转弱")
      : null,
  ),
  trendRule(
    "one_bull_cross_three_ma",
    "一阳穿三线",
    ["一阳穿三均线", "一阳穿多线", "one bullish candle crosses three moving averages"],
    "bullish",
    25,
    "一根较强阳线的实体同时穿越 5、10、20 日均线并收于其上。",
    (context) => {
      const current = candleAt(context);
      const averages = valuesAt([context.indicators.ma5, context.indicators.ma10, context.indicators.ma20]);
      if (!current || !averages || !isBullish(current) || bodyRatio(current) < 0.55 || current.open >= Math.min(...averages) || current.close <= Math.max(...averages)) return null;
      return detection(91, "阳线实体同时穿越 MA5、MA10、MA20", `实体涨幅 ${formatNumber(changePct(current.open, current.close))}%`);
    },
  ),
  trendRule(
    "lotus_above_water",
    "出水芙蓉",
    ["芙蓉出水", "一阳上穿中期均线", "lotus above water"],
    "bullish",
    65,
    "均线粘合区出现强阳线，一举站上 20、30、60 日均线。",
    (context) => {
      const current = candleAt(context);
      const averages = valuesAt([context.indicators.ma20, context.indicators.ma30, context.indicators.ma60]);
      const ratio = volumeRatio(context, 20);
      if (!current || !averages || !isBullish(current) || bodyRatio(current) < 0.6 || spreadPct(averages) > 5 || current.open >= Math.min(...averages) || current.close <= Math.max(...averages)) return null;
      return detection(90 + (ratio !== null && ratio >= 1.3 ? 4 : 0), `MA20/30/60 粘合度 ${formatNumber(spreadPct(averages))}%`, "强阳线由均线下方收至全部均线上方", ratio === null ? "成交量数据不足" : `量比近 20 日均量 ${formatNumber(ratio)} 倍`);
    },
  ),
  trendRule(
    "dragon_out_of_sea",
    "蛟龙出海",
    ["巨阳穿年线", "长阳突破长期均线", "dragon out of sea"],
    "bullish",
    125,
    "放量强阳线从长期均线下方穿越 60、120 日均线。",
    (context) => {
      const current = candleAt(context);
      const averages = valuesAt([context.indicators.ma60, context.indicators.ma120]);
      const ratio = volumeRatio(context, 20);
      if (!current || !averages || ratio === null || !isBullish(current) || bodyRatio(current) < 0.65 || current.open >= Math.min(...averages) || current.close <= Math.max(...averages) || ratio < 1.5) return null;
      return detection(93, "强阳线突破 MA60 与 MA120", `成交量为近 20 日均量 ${formatNumber(ratio)} 倍`);
    },
  ),
  trendRule(
    "guillotine",
    "断头铡刀",
    ["一阴破三线", "长阴断均线", "guillotine pattern"],
    "bearish",
    25,
    "一根强阴线实体同时跌破 5、10、20 日均线。",
    (context) => {
      const current = candleAt(context);
      const averages = valuesAt([context.indicators.ma5, context.indicators.ma10, context.indicators.ma20]);
      if (!current || !averages || !isBearish(current) || bodyRatio(current) < 0.6 || current.open <= Math.max(...averages) || current.close >= Math.min(...averages)) return null;
      return detection(92, "强阴线实体同时跌破 MA5、MA10、MA20", `实体跌幅 ${formatNumber(-changePct(current.open, current.close))}%`);
    },
  ),
  trendRule(
    "golden_spider",
    "金蜘蛛",
    ["均线金蜘蛛", "三线金叉粘合", "golden spider"],
    "bullish",
    25,
    "5、10、20 日均线在很近的时间和价位内集中向上交叉。",
    (context) => {
      const offsets = crossedCluster(context, "above", 3);
      const averages = valuesAt([context.indicators.ma5, context.indicators.ma10, context.indicators.ma20]);
      if (!offsets || !averages || spreadPct(averages) > 3) return null;
      return detection(92, `三组均线金叉集中在最近 ${Math.max(...offsets) + 1} 个交易日`, `当前均线粘合度 ${formatNumber(spreadPct(averages))}%`);
    },
  ),
  trendRule(
    "price_support",
    "价托",
    ["均线托", "三角托", "季价托", "moving average support triangle"],
    "bullish",
    25,
    "短中期均线在一段时间内依次向上交叉，形成封闭或接近封闭的三角支撑区。",
    (context) => {
      const offsets = crossedCluster(context, "above", 8);
      const close = numberAt(context.closes);
      const ma20 = seriesAt(context.indicators.ma20);
      if (!offsets || close === null || ma20 === null || close <= ma20) return null;
      return detection(87, `MA5、MA10、MA20 的向上交叉集中在最近 ${Math.max(...offsets) + 1} 日`, "收盘位于 MA20 上方");
    },
  ),
  trendRule(
    "price_pressure",
    "价压",
    ["均线压", "三角压", "季价压", "moving average pressure triangle"],
    "bearish",
    25,
    "短中期均线在一段时间内依次向下交叉，形成三角压力区。",
    (context) => {
      const offsets = crossedCluster(context, "below", 8);
      const close = numberAt(context.closes);
      const ma20 = seriesAt(context.indicators.ma20);
      if (!offsets || close === null || ma20 === null || close >= ma20) return null;
      return detection(87, `MA5、MA10、MA20 的向下交叉集中在最近 ${Math.max(...offsets) + 1} 日`, "收盘位于 MA20 下方");
    },
  ),
  trendRule(
    "silver_valley",
    "银山谷",
    ["第一均线谷", "首次价托", "silver valley"],
    "bullish",
    60,
    "下跌后 5、10、20 日均线首次形成集中向上交叉，属于早期转强信号。",
    (context) => {
      const offsets = crossedCluster(context, "above", 12);
      if (!offsets) return null;
      const bearishBefore = [15, 20, 25, 30].some((offset) => {
        const ma5 = seriesAt(context.indicators.ma5, offset);
        const ma10 = seriesAt(context.indicators.ma10, offset);
        const ma20 = seriesAt(context.indicators.ma20, offset);
        return ma5 !== null && ma10 !== null && ma20 !== null && ma5 < ma10 && ma10 < ma20;
      });
      if (!bearishBefore) return null;
      return detection(86, "最近 12 日形成首次集中均线金叉", "此前 15—30 日存在空头排列");
    },
  ),
  trendRule(
    "golden_valley",
    "金山谷",
    ["第二均线谷", "二次价托", "golden valley"],
    "bullish",
    100,
    "首次均线谷之后经过回踩，再形成位置更高的第二次集中向上交叉。",
    (context) => {
      const recent = crossedCluster(context, "above", 12);
      if (!recent) return null;
      const { ma5, ma10, ma20 } = context.indicators;
      let previousClusterOffset: number | null = null;
      for (let start = 25; start <= 70; start += 1) {
        const offsets = [
          latestCrossOffset(ma5.slice(0, ma5.length - start), ma10.slice(0, ma10.length - start), "above", 8),
          latestCrossOffset(ma5.slice(0, ma5.length - start), ma20.slice(0, ma20.length - start), "above", 8),
          latestCrossOffset(ma10.slice(0, ma10.length - start), ma20.slice(0, ma20.length - start), "above", 8),
        ];
        if (offsets.every((offset) => offset !== null)) {
          previousClusterOffset = start;
          break;
        }
      }
      const currentMa20 = seriesAt(ma20);
      const priorMa20 = previousClusterOffset === null ? null : seriesAt(ma20, previousClusterOffset);
      if (previousClusterOffset === null || currentMa20 === null || priorMa20 === null || currentMa20 <= priorMa20) return null;
      return detection(88, "当前形成第二次集中均线金叉", `前一均线谷约在 ${previousClusterOffset} 个交易日前`, "第二个谷的 MA20 位置更高");
    },
  ),
  trendRule(
    "old_duck_head",
    "老鸭头",
    ["鸭头形态", "老鸭头突破", "old duck head"],
    "bullish",
    90,
    "5、10 日均线上穿 60 日均线后缩量回踩但不有效跌破，随后重新放量突破。",
    (context) => {
      const current = candleAt(context);
      const ma5 = seriesAt(context.indicators.ma5);
      const ma10 = seriesAt(context.indicators.ma10);
      const ma60 = seriesAt(context.indicators.ma60);
      const cross5 = latestCrossOffset(context.indicators.ma5, context.indicators.ma60, "above", 45);
      const cross10 = latestCrossOffset(context.indicators.ma10, context.indicators.ma60, "above", 45);
      const ratio = volumeRatio(context, 20);
      const priorHigh = priorExtreme(context.highs, 10, "high");
      const pullbackLow = Math.min(...context.lows.slice(-15, -1));
      if (!current || ma5 === null || ma10 === null || ma60 === null || cross5 === null || cross10 === null || cross5 < 8 || cross10 < 8 || !(ma5 > ma10 && ma10 > ma60) || pullbackLow < ma60 * 0.97 || priorHigh === null || current.close <= priorHigh || ratio === null || ratio < 1.2) return null;
      return detection(90, "MA5、MA10 已上穿 MA60 并保持多头结构", "近 15 日回踩未有效跌破 MA60", `今日放量 ${formatNumber(ratio)} 倍并突破近 10 日高点`);
    },
  ),
  trendRule(
    "triple_ma_bloom",
    "三线开花",
    ["均线三线开花", "三均线向上发散", "triple moving average bloom"],
    "bullish",
    65,
    "5、10、20 日均线同步上行，多头间距连续扩大。",
    (context) => {
      const series = [context.indicators.ma5, context.indicators.ma10, context.indicators.ma20];
      const current = valuesAt(series);
      const previous = valuesAt(series, 3);
      if (!current || !previous || !(current[0]! > current[1]! && current[1]! > current[2]!) || !allRising(series, 3) || spreadPct(current) <= spreadPct(previous)) return null;
      return detection(88, "MA5 > MA10 > MA20 且三线同步上行", `均线间距由 ${formatNumber(spreadPct(previous))}% 扩至 ${formatNumber(spreadPct(current))}%`);
    },
  ),
  trendRule(
    "support_rebound",
    "均线支撑反弹",
    ["回踩均线反弹", "MA20支撑", "support rebound"],
    "bullish",
    25,
    "上升趋势中回踩 20 日均线附近后收阳并重新站稳。",
    (context) => {
      const current = candleAt(context);
      const ma20 = seriesAt(context.indicators.ma20);
      if (!current || ma20 === null || !trendIsUp(context) || !isBullish(current) || current.low > ma20 * 1.015 || current.low < ma20 * 0.97 || current.close <= ma20) return null;
      return detection(83, `日内最低价触及 MA20 附近（${formatNumber(ma20)}）`, "收阳并收于 MA20 上方");
    },
  ),
  trendRule(
    "resistance_rejection",
    "均线压力回落",
    ["反抽均线受阻", "MA20压力", "resistance rejection"],
    "bearish",
    25,
    "下降趋势中反抽 20 日均线附近后收阴并重新回落。",
    (context) => {
      const current = candleAt(context);
      const ma20 = seriesAt(context.indicators.ma20);
      if (!current || ma20 === null || !trendIsDown(context) || !isBearish(current) || current.high < ma20 * 0.985 || current.high > ma20 * 1.03 || current.close >= ma20) return null;
      return detection(83, `日内最高价触及 MA20 附近（${formatNumber(ma20)}）`, "收阴并收于 MA20 下方");
    },
  ),
];
