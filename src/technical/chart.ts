import {
  average,
  candleAt,
  changePct,
  detection,
  formatNumber,
  isBearish,
  isBullish,
  numberAt,
  pivotIndices,
  priorExtreme,
  regressionSlope,
  seriesAt,
  volumeRatio,
} from "./helpers";
import type { AnalysisContext, Detection, PatternDirection, PatternRule } from "./types";

function chartRule(
  id: string,
  name: string,
  aliases: readonly string[],
  direction: PatternDirection,
  requiredBars: number,
  description: string,
  detect: (context: AnalysisContext) => Detection | null,
): PatternRule {
  return { id, name, aliases, category: "chart", direction, requiredBars, description, detect };
}

function breakoutRule(
  id: string,
  name: string,
  aliases: readonly string[],
  direction: "bullish" | "bearish",
  lookback: number,
): PatternRule {
  const upward = direction === "bullish";
  return chartRule(
    id,
    name,
    aliases,
    direction,
    lookback + 1,
    `${upward ? "收盘突破" : "收盘跌破"}此前 ${lookback} 个交易日的价格极值。`,
    (context) => {
      const close = numberAt(context.closes);
      const extreme = priorExtreme(upward ? context.highs : context.lows, lookback, upward ? "high" : "low");
      if (close === null || extreme === null || (upward ? close <= extreme : close >= extreme)) return null;
      const distance = upward ? changePct(extreme, close) : -changePct(extreme, close);
      return detection(88 + Math.min(distance * 2, 7), `${upward ? "收盘" : "收盘"} ${formatNumber(close)} ${upward ? "突破" : "跌破"}前 ${lookback} 日极值 ${formatNumber(extreme)}`, `突破幅度 ${formatNumber(distance)}%`);
    },
  );
}

function lastTwoSeparated(indices: readonly number[], minimumGap = 5): readonly [number, number] | null {
  for (let rightIndex = indices.length - 1; rightIndex > 0; rightIndex -= 1) {
    const right = indices[rightIndex];
    if (right === undefined) continue;
    for (let leftIndex = rightIndex - 1; leftIndex >= 0; leftIndex -= 1) {
      const left = indices[leftIndex];
      if (left !== undefined && right - left >= minimumGap) return [left, right];
    }
  }
  return null;
}

function relativeDifference(left: number, right: number): number {
  const base = Math.max(Math.abs(left), Math.abs(right), 0.000001);
  return (Math.abs(left - right) / base) * 100;
}

function rangeContraction(highs: readonly number[], lows: readonly number[]): number | null {
  if (highs.length < 12 || lows.length !== highs.length) return null;
  const midpoint = Math.floor(highs.length / 2);
  const firstRange = Math.max(...highs.slice(0, midpoint)) - Math.min(...lows.slice(0, midpoint));
  const secondRange = Math.max(...highs.slice(midpoint)) - Math.min(...lows.slice(midpoint));
  return firstRange <= 0 ? null : secondRange / firstRange;
}

export const CHART_RULES: readonly PatternRule[] = [
  breakoutRule("breakout_20d_high", "突破20日新高", ["创20日新高", "20日突破", "20 day high breakout"], "bullish", 20),
  breakoutRule("breakout_60d_high", "突破60日新高", ["创60日新高", "季度新高", "60日突破", "60 day high breakout"], "bullish", 60),
  breakoutRule("breakdown_20d_low", "跌破20日新低", ["创20日新低", "20日破位", "20 day low breakdown"], "bearish", 20),
  breakoutRule("breakdown_60d_low", "跌破60日新低", ["创60日新低", "季度新低", "60日破位", "60 day low breakdown"], "bearish", 60),
  chartRule(
    "volume_breakout",
    "放量突破",
    ["放量过平台", "量价突破", "volume breakout"],
    "bullish",
    25,
    "收盘突破近 20 日高点，成交量至少达到近 20 日均量的 1.5 倍。",
    (context) => {
      const close = numberAt(context.closes);
      const high = priorExtreme(context.highs, 20, "high");
      const ratio = volumeRatio(context, 20);
      if (close === null || high === null || ratio === null || close <= high || ratio < 1.5) return null;
      return detection(94, `收盘突破近 20 日高点 ${formatNumber(high)}`, `成交量为近 20 日均量 ${formatNumber(ratio)} 倍`);
    },
  ),
  chartRule(
    "box_breakout",
    "箱体向上突破",
    ["平台突破", "横盘向上突破", "箱体突破", "box breakout"],
    "bullish",
    31,
    "此前 30 日价格区间相对收敛，最新收盘向上突破箱体上沿。",
    (context) => {
      const priorHighs = context.highs.slice(-31, -1);
      const priorLows = context.lows.slice(-31, -1);
      const close = numberAt(context.closes);
      if (priorHighs.length < 30 || close === null) return null;
      const top = Math.max(...priorHighs);
      const bottom = Math.min(...priorLows);
      const width = bottom === 0 ? 100 : ((top - bottom) / bottom) * 100;
      if (width > 15 || close <= top) return null;
      return detection(91, `30 日箱体宽度 ${formatNumber(width)}%`, `收盘突破箱顶 ${formatNumber(top)}`);
    },
  ),
  chartRule(
    "box_breakdown",
    "箱体向下破位",
    ["平台破位", "横盘向下破位", "箱体跌破", "box breakdown"],
    "bearish",
    31,
    "此前 30 日价格区间相对收敛，最新收盘向下跌破箱体下沿。",
    (context) => {
      const priorHighs = context.highs.slice(-31, -1);
      const priorLows = context.lows.slice(-31, -1);
      const close = numberAt(context.closes);
      if (priorLows.length < 30 || close === null) return null;
      const top = Math.max(...priorHighs);
      const bottom = Math.min(...priorLows);
      const width = bottom === 0 ? 100 : ((top - bottom) / bottom) * 100;
      if (width > 15 || close >= bottom) return null;
      return detection(91, `30 日箱体宽度 ${formatNumber(width)}%`, `收盘跌破箱底 ${formatNumber(bottom)}`);
    },
  ),
  chartRule(
    "double_bottom",
    "双底",
    ["W底", "W型底", "双重底", "double bottom"],
    "bullish",
    45,
    "两个相近且间隔充分的低点形成 W 结构，最新收盘突破两底之间的颈线。",
    (context) => {
      const lows = context.lows.slice(-80);
      const closes = context.closes.slice(-80);
      const pair = lastTwoSeparated(pivotIndices(lows, "low", 2), 7);
      const close = closes.at(-1);
      if (!pair || close === undefined) return null;
      const [left, right] = pair;
      const leftLow = lows[left];
      const rightLow = lows[right];
      if (leftLow === undefined || rightLow === undefined || relativeDifference(leftLow, rightLow) > 4) return null;
      const neckline = Math.max(...context.highs.slice(-80).slice(left, right + 1));
      if (close <= neckline) return null;
      return detection(91, `两底间隔 ${right - left} 个交易日且价差 ${formatNumber(relativeDifference(leftLow, rightLow))}%`, `收盘突破颈线 ${formatNumber(neckline)}`);
    },
  ),
  chartRule(
    "double_top",
    "双顶",
    ["M顶", "M型顶", "双重顶", "double top"],
    "bearish",
    45,
    "两个相近且间隔充分的高点形成 M 结构，最新收盘跌破两顶之间的颈线。",
    (context) => {
      const highs = context.highs.slice(-80);
      const closes = context.closes.slice(-80);
      const pair = lastTwoSeparated(pivotIndices(highs, "high", 2), 7);
      const close = closes.at(-1);
      if (!pair || close === undefined) return null;
      const [left, right] = pair;
      const leftHigh = highs[left];
      const rightHigh = highs[right];
      if (leftHigh === undefined || rightHigh === undefined || relativeDifference(leftHigh, rightHigh) > 4) return null;
      const neckline = Math.min(...context.lows.slice(-80).slice(left, right + 1));
      if (close >= neckline) return null;
      return detection(91, `两顶间隔 ${right - left} 个交易日且价差 ${formatNumber(relativeDifference(leftHigh, rightHigh))}%`, `收盘跌破颈线 ${formatNumber(neckline)}`);
    },
  ),
  chartRule(
    "head_shoulders_bottom",
    "头肩底",
    ["倒头肩", "头肩底反转", "inverse head and shoulders"],
    "bullish",
    60,
    "三个连续低点中，中间低点更低、两侧肩部接近，最新收盘突破颈线。",
    (context) => {
      const lows = context.lows.slice(-100);
      const highs = context.highs.slice(-100);
      const pivots = pivotIndices(lows, "low", 2).slice(-5);
      const close = context.closes.at(-1);
      if (pivots.length < 3 || close === undefined) return null;
      const shoulders = pivots.slice(-3);
      const left = shoulders[0];
      const head = shoulders[1];
      const right = shoulders[2];
      if (left === undefined || head === undefined || right === undefined || head - left < 5 || right - head < 5) return null;
      const leftLow = lows[left];
      const headLow = lows[head];
      const rightLow = lows[right];
      if (leftLow === undefined || headLow === undefined || rightLow === undefined || headLow > Math.min(leftLow, rightLow) * 0.96 || relativeDifference(leftLow, rightLow) > 6) return null;
      const neckline = average([Math.max(...highs.slice(left, head + 1)), Math.max(...highs.slice(head, right + 1))]);
      if (neckline === null || close <= neckline) return null;
      return detection(92, "中间头部低于两侧肩部至少约 4%", `左右肩价差 ${formatNumber(relativeDifference(leftLow, rightLow))}%`, `收盘突破颈线 ${formatNumber(neckline)}`);
    },
  ),
  chartRule(
    "head_shoulders_top",
    "头肩顶",
    ["正头肩", "头肩顶反转", "head and shoulders top"],
    "bearish",
    60,
    "三个连续高点中，中间高点更高、两侧肩部接近，最新收盘跌破颈线。",
    (context) => {
      const highs = context.highs.slice(-100);
      const lows = context.lows.slice(-100);
      const pivots = pivotIndices(highs, "high", 2).slice(-5);
      const close = context.closes.at(-1);
      if (pivots.length < 3 || close === undefined) return null;
      const shoulders = pivots.slice(-3);
      const left = shoulders[0];
      const head = shoulders[1];
      const right = shoulders[2];
      if (left === undefined || head === undefined || right === undefined || head - left < 5 || right - head < 5) return null;
      const leftHigh = highs[left];
      const headHigh = highs[head];
      const rightHigh = highs[right];
      if (leftHigh === undefined || headHigh === undefined || rightHigh === undefined || headHigh < Math.max(leftHigh, rightHigh) * 1.04 || relativeDifference(leftHigh, rightHigh) > 6) return null;
      const neckline = average([Math.min(...lows.slice(left, head + 1)), Math.min(...lows.slice(head, right + 1))]);
      if (neckline === null || close >= neckline) return null;
      return detection(92, "中间头部高于两侧肩部至少约 4%", `左右肩价差 ${formatNumber(relativeDifference(leftHigh, rightHigh))}%`, `收盘跌破颈线 ${formatNumber(neckline)}`);
    },
  ),
  chartRule(
    "v_bottom",
    "V形底",
    ["V型反转", "尖底", "V底", "v bottom"],
    "bullish",
    20,
    "价格快速下跌形成尖底后快速回升，最新价已收复大部分跌幅。",
    (context) => {
      const closes = context.closes.slice(-35);
      if (closes.length < 20) return null;
      const trough = Math.min(...closes);
      const troughIndex = closes.indexOf(trough);
      const left = closes[0];
      const current = closes.at(-1);
      if (left === undefined || current === undefined || troughIndex < 5 || troughIndex > closes.length - 5) return null;
      const decline = -changePct(left, trough);
      const rebound = changePct(trough, current);
      const recovery = left === trough ? 0 : (current - trough) / (left - trough);
      if (decline < 8 || rebound < 8 || recovery < 0.7) return null;
      return detection(86, `前段快速下跌 ${formatNumber(decline)}%`, `谷底后反弹 ${formatNumber(rebound)}%`, `已收复此前跌幅 ${formatNumber(recovery * 100)}%`);
    },
  ),
  chartRule(
    "inverted_v_top",
    "倒V形顶",
    ["倒V型反转", "尖顶", "倒V顶", "inverted v top"],
    "bearish",
    20,
    "价格快速上涨形成尖顶后快速回落，最新价已回吐大部分涨幅。",
    (context) => {
      const closes = context.closes.slice(-35);
      if (closes.length < 20) return null;
      const peak = Math.max(...closes);
      const peakIndex = closes.indexOf(peak);
      const left = closes[0];
      const current = closes.at(-1);
      if (left === undefined || current === undefined || peakIndex < 5 || peakIndex > closes.length - 5) return null;
      const advance = changePct(left, peak);
      const decline = -changePct(peak, current);
      const giveback = peak === left ? 0 : (peak - current) / (peak - left);
      if (advance < 8 || decline < 8 || giveback < 0.7) return null;
      return detection(86, `前段快速上涨 ${formatNumber(advance)}%`, `峰值后回落 ${formatNumber(decline)}%`, `已回吐此前涨幅 ${formatNumber(giveback * 100)}%`);
    },
  ),
  chartRule(
    "rounded_bottom",
    "圆弧底",
    ["碗形底", "圆底", "rounding bottom"],
    "bullish",
    45,
    "中期价格先缓慢下行、底部趋平、再缓慢抬升，右侧重新站上中期均线。",
    (context) => {
      const closes = context.closes.slice(-60);
      if (closes.length < 45) return null;
      const third = Math.floor(closes.length / 3);
      const left = average(closes.slice(0, third));
      const middle = average(closes.slice(third, third * 2));
      const right = average(closes.slice(third * 2));
      const close = closes.at(-1);
      const ma20 = seriesAt(context.indicators.ma20);
      if (left === null || middle === null || right === null || close === undefined || ma20 === null || middle >= Math.min(left, right) * 0.96 || right <= middle || close <= ma20) return null;
      return detection(79, "中段均价显著低于左右两段", "右侧均价回升且最新收盘站上 MA20");
    },
  ),
  chartRule(
    "rounded_top",
    "圆弧顶",
    ["穹顶", "圆顶", "rounding top"],
    "bearish",
    45,
    "中期价格先缓慢上行、顶部趋平、再缓慢回落，右侧跌破中期均线。",
    (context) => {
      const closes = context.closes.slice(-60);
      if (closes.length < 45) return null;
      const third = Math.floor(closes.length / 3);
      const left = average(closes.slice(0, third));
      const middle = average(closes.slice(third, third * 2));
      const right = average(closes.slice(third * 2));
      const close = closes.at(-1);
      const ma20 = seriesAt(context.indicators.ma20);
      if (left === null || middle === null || right === null || close === undefined || ma20 === null || middle <= Math.max(left, right) * 1.04 || right >= middle || close >= ma20) return null;
      return detection(79, "中段均价显著高于左右两段", "右侧均价回落且最新收盘跌破 MA20");
    },
  ),
  chartRule(
    "ascending_triangle",
    "上升三角形",
    ["看涨三角形", "平顶抬底", "ascending triangle"],
    "bullish",
    30,
    "高点大致持平、低点逐步抬高，波动区间收窄。",
    (context) => {
      const highs = context.highs.slice(-30);
      const lows = context.lows.slice(-30);
      const highSlope = regressionSlope(highs);
      const lowSlope = regressionSlope(lows);
      const contraction = rangeContraction(highs, lows);
      if (Math.abs(highSlope) > 0.001 || lowSlope < 0.001 || contraction === null || contraction > 0.8) return null;
      return detection(82, "高点连线近似水平", `低点趋势斜率向上（${formatNumber(lowSlope * 1000, 3)}）`, `后半段振幅为前半段 ${formatNumber(contraction * 100)}%`);
    },
  ),
  chartRule(
    "descending_triangle",
    "下降三角形",
    ["看跌三角形", "平底降顶", "descending triangle"],
    "bearish",
    30,
    "低点大致持平、高点逐步降低，波动区间收窄。",
    (context) => {
      const highs = context.highs.slice(-30);
      const lows = context.lows.slice(-30);
      const highSlope = regressionSlope(highs);
      const lowSlope = regressionSlope(lows);
      const contraction = rangeContraction(highs, lows);
      if (Math.abs(lowSlope) > 0.001 || highSlope > -0.001 || contraction === null || contraction > 0.8) return null;
      return detection(82, "低点连线近似水平", `高点趋势斜率向下（${formatNumber(highSlope * 1000, 3)}）`, `后半段振幅为前半段 ${formatNumber(contraction * 100)}%`);
    },
  ),
  chartRule(
    "symmetrical_triangle",
    "对称三角形",
    ["收敛三角形", "三角收敛", "symmetrical triangle"],
    "neutral",
    30,
    "高点逐步降低、低点逐步抬高，波动区间明显收敛。",
    (context) => {
      const highs = context.highs.slice(-30);
      const lows = context.lows.slice(-30);
      const highSlope = regressionSlope(highs);
      const lowSlope = regressionSlope(lows);
      const contraction = rangeContraction(highs, lows);
      if (highSlope > -0.0006 || lowSlope < 0.0006 || contraction === null || contraction > 0.75) return null;
      return detection(84, "高点连线向下、低点连线向上", `后半段振幅收窄至前半段 ${formatNumber(contraction * 100)}%`);
    },
  ),
  chartRule(
    "bullish_flag",
    "上升旗形",
    ["多头旗形", "牛旗", "bull flag"],
    "bullish",
    30,
    "快速上涨后进入轻微向下倾斜的窄幅整理，最新收盘向上突破旗面。",
    (context) => {
      const closes = context.closes.slice(-35);
      const impulseStart = closes[0];
      const impulseEnd = closes[12];
      const current = closes.at(-1);
      const consolidation = closes.slice(13, -1);
      if (impulseStart === undefined || impulseEnd === undefined || current === undefined || consolidation.length < 12 || changePct(impulseStart, impulseEnd) < 8 || regressionSlope(consolidation) >= 0 || regressionSlope(consolidation) < -0.004 || current <= Math.max(...consolidation)) return null;
      return detection(85, `旗杆阶段上涨 ${formatNumber(changePct(impulseStart, impulseEnd))}%`, "整理通道轻微向下", "最新收盘突破旗面高点");
    },
  ),
  chartRule(
    "bearish_flag",
    "下降旗形",
    ["空头旗形", "熊旗", "bear flag"],
    "bearish",
    30,
    "快速下跌后进入轻微向上倾斜的窄幅整理，最新收盘向下跌破旗面。",
    (context) => {
      const closes = context.closes.slice(-35);
      const impulseStart = closes[0];
      const impulseEnd = closes[12];
      const current = closes.at(-1);
      const consolidation = closes.slice(13, -1);
      if (impulseStart === undefined || impulseEnd === undefined || current === undefined || consolidation.length < 12 || changePct(impulseStart, impulseEnd) > -8 || regressionSlope(consolidation) <= 0 || regressionSlope(consolidation) > 0.004 || current >= Math.min(...consolidation)) return null;
      return detection(85, `旗杆阶段下跌 ${formatNumber(-changePct(impulseStart, impulseEnd))}%`, "整理通道轻微向上", "最新收盘跌破旗面低点");
    },
  ),
  chartRule(
    "falling_wedge",
    "下降楔形",
    ["下倾楔形", "看涨楔形", "falling wedge"],
    "bullish",
    30,
    "高点和低点都下移，但上沿下降更快、区间收窄，末端出现转强。",
    (context) => {
      const highs = context.highs.slice(-30);
      const lows = context.lows.slice(-30);
      const highSlope = regressionSlope(highs);
      const lowSlope = regressionSlope(lows);
      const contraction = rangeContraction(highs, lows);
      const current = candleAt(context);
      if (!current || !isBullish(current) || highSlope >= -0.0005 || lowSlope >= 0 || highSlope >= lowSlope || contraction === null || contraction > 0.8) return null;
      return detection(80, "上下边界均向下且上沿下降更快", `区间收窄至前半段 ${formatNumber(contraction * 100)}%`, "最新 K 线收阳");
    },
  ),
  chartRule(
    "rising_wedge",
    "上升楔形",
    ["上倾楔形", "看跌楔形", "rising wedge"],
    "bearish",
    30,
    "高点和低点都上移，但下沿上升更快、区间收窄，末端出现转弱。",
    (context) => {
      const highs = context.highs.slice(-30);
      const lows = context.lows.slice(-30);
      const highSlope = regressionSlope(highs);
      const lowSlope = regressionSlope(lows);
      const contraction = rangeContraction(highs, lows);
      const current = candleAt(context);
      if (!current || !isBearish(current) || highSlope <= 0 || lowSlope <= 0.0005 || lowSlope <= highSlope || contraction === null || contraction > 0.8) return null;
      return detection(80, "上下边界均向上且下沿上升更快", `区间收窄至前半段 ${formatNumber(contraction * 100)}%`, "最新 K 线收阴");
    },
  ),
  chartRule(
    "cup_with_handle",
    "杯柄形态",
    ["杯柄", "茶杯柄", "cup and handle"],
    "bullish",
    80,
    "价格形成圆弧杯体，右侧回到左侧高位后进行浅幅手柄整理并向上突破。",
    (context) => {
      const closes = context.closes.slice(-120);
      if (closes.length < 80) return null;
      const cupEnd = closes.length - 12;
      const cup = closes.slice(0, cupEnd);
      const handle = closes.slice(cupEnd, -1);
      const current = closes.at(-1);
      const leftHigh = Math.max(...cup.slice(0, Math.floor(cup.length / 3)));
      const bottom = Math.min(...cup);
      const rightHigh = Math.max(...cup.slice(Math.floor(cup.length * 0.65)));
      const depth = -changePct(leftHigh, bottom);
      const handleLow = Math.min(...handle);
      const handleDepth = -changePct(rightHigh, handleLow);
      if (current === undefined || depth < 10 || depth > 45 || relativeDifference(leftHigh, rightHigh) > 6 || handleDepth > 12 || current <= Math.max(...handle)) return null;
      return detection(84, `杯体回撤深度 ${formatNumber(depth)}%`, `左右杯沿价差 ${formatNumber(relativeDifference(leftHigh, rightHigh))}%`, `手柄回撤 ${formatNumber(handleDepth)}% 后向上突破`);
    },
  ),
];
