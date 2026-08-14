import {
  bodyRatio,
  candleAt,
  candleBody,
  changePct,
  detection,
  formatNumber,
  isBearish,
  isBullish,
  lowerShadow,
  lowerShadowRatio,
  nearlyEqual,
  trendIsDown,
  trendIsUp,
  upperShadow,
  upperShadowRatio,
  volumeRatio,
} from "./helpers";
import type { AnalysisContext, Detection, PatternDirection, PatternRule } from "./types";

function candlestickRule(
  id: string,
  name: string,
  aliases: readonly string[],
  direction: PatternDirection,
  requiredBars: number,
  description: string,
  detect: (context: AnalysisContext) => Detection | null,
): PatternRule {
  return { id, name, aliases, category: "candlestick", direction, requiredBars, description, detect };
}

function isSmallBody(context: AnalysisContext, offset = 0, maximum = 0.35): boolean {
  const candle = candleAt(context, offset);
  return candle !== undefined && bodyRatio(candle) <= maximum;
}

function isStrongBullish(context: AnalysisContext, offset = 0): boolean {
  const candle = candleAt(context, offset);
  return candle !== undefined && isBullish(candle) && bodyRatio(candle) >= 0.6;
}

function isStrongBearish(context: AnalysisContext, offset = 0): boolean {
  const candle = candleAt(context, offset);
  return candle !== undefined && isBearish(candle) && bodyRatio(candle) >= 0.6;
}

export const CANDLESTICK_RULES: readonly PatternRule[] = [
  candlestickRule(
    "long_bullish_candle",
    "大阳线",
    ["长阳线", "中大阳线", "long bullish candle"],
    "bullish",
    2,
    "实体占当日振幅较高，且收盘相对前收涨幅通常不低于 3%。",
    (context) => {
      const current = candleAt(context);
      const previous = candleAt(context, 1);
      if (!current || !previous || !isBullish(current)) return null;
      const gain = changePct(previous.close, current.close);
      if (bodyRatio(current) < 0.65 || gain < 3) return null;
      return detection(78 + Math.min(gain, 10), `阳线实体占振幅 ${formatNumber(bodyRatio(current) * 100)}%`, `较前收上涨 ${formatNumber(gain)}%`);
    },
  ),
  candlestickRule(
    "long_bearish_candle",
    "大阴线",
    ["长阴线", "中大阴线", "long bearish candle"],
    "bearish",
    2,
    "实体占当日振幅较高，且收盘相对前收跌幅通常不低于 3%。",
    (context) => {
      const current = candleAt(context);
      const previous = candleAt(context, 1);
      if (!current || !previous || !isBearish(current)) return null;
      const decline = -changePct(previous.close, current.close);
      if (bodyRatio(current) < 0.65 || decline < 3) return null;
      return detection(78 + Math.min(decline, 10), `阴线实体占振幅 ${formatNumber(bodyRatio(current) * 100)}%`, `较前收下跌 ${formatNumber(decline)}%`);
    },
  ),
  candlestickRule(
    "bullish_marubozu",
    "光头光脚阳线",
    ["阳线光头光脚", "阳线秃头秃脚", "bullish marubozu"],
    "bullish",
    1,
    "阳线实体覆盖绝大部分振幅，上下影线都很短。",
    (context) => {
      const current = candleAt(context);
      if (!current || !isBullish(current) || bodyRatio(current) < 0.9) return null;
      return detection(92, `实体占振幅 ${formatNumber(bodyRatio(current) * 100)}%`, "上下影线均很短");
    },
  ),
  candlestickRule(
    "bearish_marubozu",
    "光头光脚阴线",
    ["阴线光头光脚", "阴线秃头秃脚", "bearish marubozu"],
    "bearish",
    1,
    "阴线实体覆盖绝大部分振幅，上下影线都很短。",
    (context) => {
      const current = candleAt(context);
      if (!current || !isBearish(current) || bodyRatio(current) < 0.9) return null;
      return detection(92, `实体占振幅 ${formatNumber(bodyRatio(current) * 100)}%`, "上下影线均很短");
    },
  ),
  candlestickRule(
    "doji",
    "十字星",
    ["十字线", "doji"],
    "neutral",
    1,
    "开盘与收盘非常接近，实体不超过当日振幅的 10%。",
    (context) => {
      const current = candleAt(context);
      if (!current || bodyRatio(current) > 0.1) return null;
      return detection(88, `实体仅占振幅 ${formatNumber(bodyRatio(current) * 100)}%`, "多空收盘接近平衡");
    },
  ),
  candlestickRule(
    "dragonfly_doji",
    "蜻蜓十字星",
    ["T字线", "蜻蜓十字", "dragonfly doji"],
    "bullish",
    1,
    "实体很小、下影线很长且上影线很短。",
    (context) => {
      const current = candleAt(context);
      if (!current || bodyRatio(current) > 0.12 || lowerShadowRatio(current) < 0.65 || upperShadowRatio(current) > 0.15) return null;
      return detection(91, `下影线占振幅 ${formatNumber(lowerShadowRatio(current) * 100)}%`, "收盘回到日内高位附近");
    },
  ),
  candlestickRule(
    "gravestone_doji",
    "墓碑十字星",
    ["倒T字线", "墓碑十字", "gravestone doji"],
    "bearish",
    1,
    "实体很小、上影线很长且下影线很短。",
    (context) => {
      const current = candleAt(context);
      if (!current || bodyRatio(current) > 0.12 || upperShadowRatio(current) < 0.65 || lowerShadowRatio(current) > 0.15) return null;
      return detection(91, `上影线占振幅 ${formatNumber(upperShadowRatio(current) * 100)}%`, "收盘回落到日内低位附近");
    },
  ),
  candlestickRule(
    "spinning_top",
    "纺锤线",
    ["小实体长影线", "高浪线", "spinning top"],
    "neutral",
    1,
    "实体较小，同时存在明显上影线和下影线。",
    (context) => {
      const current = candleAt(context);
      if (!current || bodyRatio(current) < 0.1 || bodyRatio(current) > 0.35 || upperShadowRatio(current) < 0.2 || lowerShadowRatio(current) < 0.2) return null;
      return detection(82, `实体占振幅 ${formatNumber(bodyRatio(current) * 100)}%`, "上下影线均明显");
    },
  ),
  candlestickRule(
    "hammer",
    "锤头线",
    ["锤子线", "锤形线", "hammer"],
    "bullish",
    10,
    "下跌背景中出现小实体、长下影和短上影。",
    (context) => {
      const current = candleAt(context);
      if (!current || !trendIsDown(context) || lowerShadow(current) < Math.max(candleBody(current) * 2, 0.000001) || upperShadowRatio(current) > 0.2 || bodyRatio(current) > 0.4) return null;
      return detection(86, "此前处于回落趋势", `下影线约为实体 ${formatNumber(lowerShadow(current) / Math.max(candleBody(current), 0.000001))} 倍`);
    },
  ),
  candlestickRule(
    "hanging_man",
    "上吊线",
    ["吊颈线", "吊人线", "hanging man"],
    "bearish",
    10,
    "上涨背景中出现小实体、长下影和短上影。",
    (context) => {
      const current = candleAt(context);
      if (!current || !trendIsUp(context) || lowerShadow(current) < Math.max(candleBody(current) * 2, 0.000001) || upperShadowRatio(current) > 0.2 || bodyRatio(current) > 0.4) return null;
      return detection(84, "此前处于上升趋势", `下影线约为实体 ${formatNumber(lowerShadow(current) / Math.max(candleBody(current), 0.000001))} 倍`);
    },
  ),
  candlestickRule(
    "inverted_hammer",
    "倒锤头线",
    ["倒锤子线", "inverted hammer"],
    "bullish",
    10,
    "下跌背景中出现小实体、长上影和短下影。",
    (context) => {
      const current = candleAt(context);
      if (!current || !trendIsDown(context) || upperShadow(current) < Math.max(candleBody(current) * 2, 0.000001) || lowerShadowRatio(current) > 0.2 || bodyRatio(current) > 0.4) return null;
      return detection(83, "此前处于回落趋势", `上影线约为实体 ${formatNumber(upperShadow(current) / Math.max(candleBody(current), 0.000001))} 倍`);
    },
  ),
  candlestickRule(
    "shooting_star",
    "射击之星",
    ["流星线", "射击星", "shooting star"],
    "bearish",
    10,
    "上涨背景中出现小实体、长上影和短下影。",
    (context) => {
      const current = candleAt(context);
      if (!current || !trendIsUp(context) || upperShadow(current) < Math.max(candleBody(current) * 2, 0.000001) || lowerShadowRatio(current) > 0.2 || bodyRatio(current) > 0.4) return null;
      return detection(86, "此前处于上升趋势", `上影线约为实体 ${formatNumber(upperShadow(current) / Math.max(candleBody(current), 0.000001))} 倍`);
    },
  ),
  candlestickRule(
    "bullish_engulfing",
    "看涨吞没",
    ["阳包阴", "多头吞噬", "旭日东升", "bullish engulfing"],
    "bullish",
    2,
    "阳线实体完整包住前一根阴线实体。",
    (context) => {
      const current = candleAt(context);
      const previous = candleAt(context, 1);
      if (!current || !previous || !isBullish(current) || !isBearish(previous) || current.open > previous.close || current.close < previous.open) return null;
      return detection(91, "当日阳线实体覆盖前一日阴线实体", `实体放大至前一日的 ${formatNumber(candleBody(current) / Math.max(candleBody(previous), 0.000001))} 倍`);
    },
  ),
  candlestickRule(
    "bearish_engulfing",
    "看跌吞没",
    ["阴包阳", "空头吞噬", "倾盆大雨", "bearish engulfing"],
    "bearish",
    2,
    "阴线实体完整包住前一根阳线实体。",
    (context) => {
      const current = candleAt(context);
      const previous = candleAt(context, 1);
      if (!current || !previous || !isBearish(current) || !isBullish(previous) || current.open < previous.close || current.close > previous.open) return null;
      return detection(91, "当日阴线实体覆盖前一日阳线实体", `实体放大至前一日的 ${formatNumber(candleBody(current) / Math.max(candleBody(previous), 0.000001))} 倍`);
    },
  ),
  candlestickRule(
    "bullish_harami",
    "看涨孕线",
    ["阳孕线", "身怀六甲看涨", "bullish harami"],
    "bullish",
    2,
    "前一根为较大阴线，后一根小阳线实体位于其实体内部。",
    (context) => {
      const current = candleAt(context);
      const previous = candleAt(context, 1);
      if (!current || !previous || !isBullish(current) || !isBearish(previous) || candleBody(current) >= candleBody(previous) * 0.6 || current.open < previous.close || current.close > previous.open) return null;
      return detection(82, "小阳线实体位于前一阴线实体内部", "下跌动能收缩");
    },
  ),
  candlestickRule(
    "bearish_harami",
    "看跌孕线",
    ["阴孕线", "身怀六甲看跌", "bearish harami"],
    "bearish",
    2,
    "前一根为较大阳线，后一根小阴线实体位于其实体内部。",
    (context) => {
      const current = candleAt(context);
      const previous = candleAt(context, 1);
      if (!current || !previous || !isBearish(current) || !isBullish(previous) || candleBody(current) >= candleBody(previous) * 0.6 || current.open > previous.close || current.close < previous.open) return null;
      return detection(82, "小阴线实体位于前一阳线实体内部", "上涨动能收缩");
    },
  ),
  candlestickRule(
    "piercing_line",
    "曙光初现",
    ["刺透形态", "刺透线", "piercing line"],
    "bullish",
    2,
    "大阴线之后出现阳线，收盘深入前一阴线实体中点之上但未完全吞没。",
    (context) => {
      const current = candleAt(context);
      const previous = candleAt(context, 1);
      if (!current || !previous || !isStrongBullish(context) || !isStrongBearish(context, 1)) return null;
      const midpoint = (previous.open + previous.close) / 2;
      if (current.open > previous.close * 1.01 || current.close <= midpoint || current.close >= previous.open) return null;
      return detection(88, "阳线收盘越过前一阴线实体中点", "尚未构成完整阳包阴");
    },
  ),
  candlestickRule(
    "dark_cloud_cover",
    "乌云盖顶",
    ["乌云线", "dark cloud cover"],
    "bearish",
    2,
    "大阳线之后出现阴线，收盘深入前一阳线实体中点之下但未完全吞没。",
    (context) => {
      const current = candleAt(context);
      const previous = candleAt(context, 1);
      if (!current || !previous || !isStrongBearish(context) || !isStrongBullish(context, 1)) return null;
      const midpoint = (previous.open + previous.close) / 2;
      if (current.open < previous.close * 0.99 || current.close >= midpoint || current.close <= previous.open) return null;
      return detection(88, "阴线收盘跌破前一阳线实体中点", "尚未构成完整阴包阳");
    },
  ),
  candlestickRule(
    "tweezer_bottom",
    "平头底部",
    ["镊子底", "钳子底", "tweezer bottom"],
    "bullish",
    2,
    "相邻两根 K 线的最低价非常接近，后一根转强。",
    (context) => {
      const current = candleAt(context);
      const previous = candleAt(context, 1);
      if (!current || !previous || !isBullish(current) || !nearlyEqual(current.low, previous.low, 0.5)) return null;
      return detection(80, `两日低点误差小于 0.5%（${formatNumber(previous.low)} / ${formatNumber(current.low)}）`, "后一日收阳");
    },
  ),
  candlestickRule(
    "tweezer_top",
    "平头顶部",
    ["镊子顶", "钳子顶", "tweezer top"],
    "bearish",
    2,
    "相邻两根 K 线的最高价非常接近，后一根转弱。",
    (context) => {
      const current = candleAt(context);
      const previous = candleAt(context, 1);
      if (!current || !previous || !isBearish(current) || !nearlyEqual(current.high, previous.high, 0.5)) return null;
      return detection(80, `两日高点误差小于 0.5%（${formatNumber(previous.high)} / ${formatNumber(current.high)}）`, "后一日收阴");
    },
  ),
  candlestickRule(
    "morning_star",
    "早晨之星",
    ["启明星", "晨星", "morning star"],
    "bullish",
    3,
    "大阴线、小实体、强阳线三根组合，第三根收盘越过第一根实体中点。",
    (context) => {
      const first = candleAt(context, 2);
      const third = candleAt(context);
      if (!first || !third || !isStrongBearish(context, 2) || !isSmallBody(context, 1) || !isStrongBullish(context) || third.close <= (first.open + first.close) / 2) return null;
      return detection(91, "阴线—小实体—阳线三段结构", "第三根阳线收复第一根阴线实体中点");
    },
  ),
  candlestickRule(
    "evening_star",
    "黄昏之星",
    ["暮星", "晚星", "evening star"],
    "bearish",
    3,
    "大阳线、小实体、强阴线三根组合，第三根收盘跌破第一根实体中点。",
    (context) => {
      const first = candleAt(context, 2);
      const third = candleAt(context);
      if (!first || !third || !isStrongBullish(context, 2) || !isSmallBody(context, 1) || !isStrongBearish(context) || third.close >= (first.open + first.close) / 2) return null;
      return detection(91, "阳线—小实体—阴线三段结构", "第三根阴线跌破第一根阳线实体中点");
    },
  ),
  candlestickRule(
    "three_white_soldiers",
    "红三兵",
    ["三个白武士", "三阳开泰", "three white soldiers"],
    "bullish",
    3,
    "连续三根实体较强的阳线，收盘逐日抬高且上影线较短。",
    (context) => {
      const first = candleAt(context, 2);
      const second = candleAt(context, 1);
      const third = candleAt(context);
      if (!first || !second || !third || ![first, second, third].every((candle) => isBullish(candle) && bodyRatio(candle) >= 0.5 && upperShadowRatio(candle) <= 0.25) || !(first.close < second.close && second.close < third.close)) return null;
      return detection(91, "连续三根较强阳线", "三日收盘价依次抬高");
    },
  ),
  candlestickRule(
    "three_black_crows",
    "黑三鸦",
    ["三只乌鸦", "三黑鸦", "three black crows"],
    "bearish",
    3,
    "连续三根实体较强的阴线，收盘逐日降低且下影线较短。",
    (context) => {
      const first = candleAt(context, 2);
      const second = candleAt(context, 1);
      const third = candleAt(context);
      if (!first || !second || !third || ![first, second, third].every((candle) => isBearish(candle) && bodyRatio(candle) >= 0.5 && lowerShadowRatio(candle) <= 0.25) || !(first.close > second.close && second.close > third.close)) return null;
      return detection(91, "连续三根较强阴线", "三日收盘价依次降低");
    },
  ),
  candlestickRule(
    "bullish_counterattack",
    "好友反攻",
    ["看涨反攻线", "多头反攻", "bullish counterattack"],
    "bullish",
    2,
    "阴线后出现阳线，两日收盘价接近，表示下跌力量受到反击。",
    (context) => {
      const current = candleAt(context);
      const previous = candleAt(context, 1);
      if (!current || !previous || !isBearish(previous) || !isBullish(current) || !nearlyEqual(current.close, previous.close, 0.6)) return null;
      return detection(79, "前阴后阳", "两日收盘价接近");
    },
  ),
  candlestickRule(
    "bearish_counterattack",
    "淡友反攻",
    ["看跌反攻线", "空头反攻", "bearish counterattack"],
    "bearish",
    2,
    "阳线后出现阴线，两日收盘价接近，表示上涨力量受到反击。",
    (context) => {
      const current = candleAt(context);
      const previous = candleAt(context, 1);
      if (!current || !previous || !isBullish(previous) || !isBearish(current) || !nearlyEqual(current.close, previous.close, 0.6)) return null;
      return detection(79, "前阳后阴", "两日收盘价接近");
    },
  ),
  candlestickRule(
    "rising_three_methods",
    "上升三法",
    ["升势三鸦", "rising three methods"],
    "bullish",
    5,
    "强阳线后出现三根位于其区间内的小实体，最后再以强阳线向上突破。",
    (context) => {
      const first = candleAt(context, 4);
      const last = candleAt(context);
      const middle = [candleAt(context, 3), candleAt(context, 2), candleAt(context, 1)];
      if (!first || !last || middle.some((item) => !item) || !isStrongBullish(context, 4) || !isStrongBullish(context) || last.close <= first.close) return null;
      if (!middle.every((item) => item !== undefined && item.high <= first.high * 1.01 && item.low >= first.low * 0.99 && bodyRatio(item) <= 0.5)) return null;
      return detection(90, "首尾均为强阳线", "中间三根小实体收敛在首根区间内");
    },
  ),
  candlestickRule(
    "falling_three_methods",
    "下降三法",
    ["跌势三鹤", "falling three methods"],
    "bearish",
    5,
    "强阴线后出现三根位于其区间内的小实体，最后再以强阴线向下突破。",
    (context) => {
      const first = candleAt(context, 4);
      const last = candleAt(context);
      const middle = [candleAt(context, 3), candleAt(context, 2), candleAt(context, 1)];
      if (!first || !last || middle.some((item) => !item) || !isStrongBearish(context, 4) || !isStrongBearish(context) || last.close >= first.close) return null;
      if (!middle.every((item) => item !== undefined && item.high <= first.high * 1.01 && item.low >= first.low * 0.99 && bodyRatio(item) <= 0.5)) return null;
      return detection(90, "首尾均为强阴线", "中间三根小实体收敛在首根区间内");
    },
  ),
  candlestickRule(
    "three_inside_up",
    "三内升",
    ["看涨三内线", "three inside up"],
    "bullish",
    3,
    "看涨孕线后，第三根阳线收盘突破第一根 K 线高点。",
    (context) => {
      const first = candleAt(context, 2);
      const second = candleAt(context, 1);
      const third = candleAt(context);
      if (!first || !second || !third || !isBearish(first) || !isBullish(second) || second.open < first.close || second.close > first.open || !isBullish(third) || third.close <= first.high) return null;
      return detection(88, "前两根构成看涨孕线", "第三根阳线突破首根高点");
    },
  ),
  candlestickRule(
    "three_inside_down",
    "三内降",
    ["看跌三内线", "three inside down"],
    "bearish",
    3,
    "看跌孕线后，第三根阴线收盘跌破第一根 K 线低点。",
    (context) => {
      const first = candleAt(context, 2);
      const second = candleAt(context, 1);
      const third = candleAt(context);
      if (!first || !second || !third || !isBullish(first) || !isBearish(second) || second.open > first.close || second.close < first.open || !isBearish(third) || third.close >= first.low) return null;
      return detection(88, "前两根构成看跌孕线", "第三根阴线跌破首根低点");
    },
  ),
  candlestickRule(
    "gap_up",
    "向上跳空",
    ["跳空高开缺口", "高开缺口", "gap up"],
    "bullish",
    2,
    "当日最低价高于前一日最高价，形成未重叠的向上缺口。",
    (context) => {
      const current = candleAt(context);
      const previous = candleAt(context, 1);
      if (!current || !previous || current.low <= previous.high) return null;
      return detection(94, `缺口宽度 ${formatNumber(changePct(previous.high, current.low))}%`, "当日最低价高于前一日最高价");
    },
  ),
  candlestickRule(
    "gap_down",
    "向下跳空",
    ["跳空低开缺口", "低开缺口", "gap down"],
    "bearish",
    2,
    "当日最高价低于前一日最低价，形成未重叠的向下缺口。",
    (context) => {
      const current = candleAt(context);
      const previous = candleAt(context, 1);
      if (!current || !previous || current.high >= previous.low) return null;
      return detection(94, `缺口宽度 ${formatNumber(-changePct(previous.low, current.high))}%`, "当日最高价低于前一日最低价");
    },
  ),
  candlestickRule(
    "bullish_island_reversal",
    "向上岛形反转",
    ["底部岛形反转", "看涨岛形反转", "bullish island reversal"],
    "bullish",
    3,
    "中间 K 线与两侧都存在缺口，先向下跳空、再向上跳空。",
    (context) => {
      const first = candleAt(context, 2);
      const middle = candleAt(context, 1);
      const last = candleAt(context);
      if (!first || !middle || !last || middle.high >= first.low || last.low <= middle.high) return null;
      return detection(93, "先出现向下缺口", "随后向上缺口将中间交易区间孤立");
    },
  ),
  candlestickRule(
    "bearish_island_reversal",
    "向下岛形反转",
    ["顶部岛形反转", "看跌岛形反转", "bearish island reversal"],
    "bearish",
    3,
    "中间 K 线与两侧都存在缺口，先向上跳空、再向下跳空。",
    (context) => {
      const first = candleAt(context, 2);
      const middle = candleAt(context, 1);
      const last = candleAt(context);
      if (!first || !middle || !last || middle.low <= first.high || last.high >= middle.low) return null;
      return detection(93, "先出现向上缺口", "随后向下缺口将中间交易区间孤立");
    },
  ),
  candlestickRule(
    "fairy_guide",
    "仙人指路",
    ["仙人指路K线", "长上影试盘", "fairy guide"],
    "bullish",
    25,
    "上升趋势中的长上影试盘 K 线；要求收盘仍处于相对强势区，量能不过度失控。",
    (context) => {
      const current = candleAt(context);
      const ratio = volumeRatio(context, 20);
      if (!current || !trendIsUp(context) || upperShadowRatio(current) < 0.45 || bodyRatio(current) > 0.42 || lowerShadowRatio(current) > 0.2 || current.close < current.low + ((current.high - current.low) * 0.35) || ratio === null || ratio < 0.75 || ratio > 2.8) return null;
      return detection(87, "20 日均线方向向上且收盘位于其上", `上影线占振幅 ${formatNumber(upperShadowRatio(current) * 100)}%`, `成交量为近 20 日均量约 ${formatNumber(ratio)} 倍`);
    },
  ),
  candlestickRule(
    "rubbing_lines",
    "揉搓线",
    ["搓揉线", "揉搓K线", "rubbing lines"],
    "neutral",
    2,
    "相邻两根小实体 K 线，一根长上影、一根长下影，常见于震荡洗盘。",
    (context) => {
      const current = candleAt(context);
      const previous = candleAt(context, 1);
      if (!current || !previous || bodyRatio(current) > 0.4 || bodyRatio(previous) > 0.4) return null;
      const oppositeShadows = (upperShadowRatio(previous) >= 0.45 && lowerShadowRatio(current) >= 0.45)
        || (lowerShadowRatio(previous) >= 0.45 && upperShadowRatio(current) >= 0.45);
      if (!oppositeShadows || !nearlyEqual((current.high + current.low) / 2, (previous.high + previous.low) / 2, 3)) return null;
      return detection(84, "两根 K 线均为小实体", "长上影与长下影连续出现且价格区间接近");
    },
  ),
  candlestickRule(
    "bullish_sandwich",
    "多方炮",
    ["两阳夹一阴", "阳阴阳", "bullish sandwich"],
    "bullish",
    3,
    "阳线—小阴线—强阳线组合，第三根收盘突破前两根高位。",
    (context) => {
      const first = candleAt(context, 2);
      const middle = candleAt(context, 1);
      const last = candleAt(context);
      if (!first || !middle || !last || !isBullish(first) || !isBearish(middle) || !isBullish(last) || candleBody(middle) > candleBody(first) * 0.8 || last.close <= Math.max(first.high, middle.high)) return null;
      return detection(88, "两阳夹一阴", "第三根阳线收盘突破前两根高点");
    },
  ),
  candlestickRule(
    "bearish_sandwich",
    "空方炮",
    ["两阴夹一阳", "阴阳阴", "bearish sandwich"],
    "bearish",
    3,
    "阴线—小阳线—强阴线组合，第三根收盘跌破前两根低位。",
    (context) => {
      const first = candleAt(context, 2);
      const middle = candleAt(context, 1);
      const last = candleAt(context);
      if (!first || !middle || !last || !isBearish(first) || !isBullish(middle) || !isBearish(last) || candleBody(middle) > candleBody(first) * 0.8 || last.close >= Math.min(first.low, middle.low)) return null;
      return detection(88, "两阴夹一阳", "第三根阴线收盘跌破前两根低点");
    },
  ),
];
