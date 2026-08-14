import { CANDLESTICK_RULES } from "./candlestick";
import { CHART_RULES } from "./chart";
import { createAnalysisContext, numberAt, seriesAt } from "./helpers";
import { OSCILLATOR_RULES } from "./oscillator";
import { TREND_RULES } from "./trend";
import type {
  CandleInput,
  IndicatorSnapshot,
  PatternAnalysis,
  PatternDefinition,
  PatternMatch,
  PatternResolution,
  PatternRule,
} from "./types";

export type {
  CandleInput,
  IndicatorSnapshot,
  PatternAnalysis,
  PatternCategory,
  PatternDefinition,
  PatternDirection,
  PatternMatch,
  PatternResolution,
} from "./types";

export const METHODOLOGY_VERSION = "1.0.0";

const PATTERN_RULES: readonly PatternRule[] = [
  ...CANDLESTICK_RULES,
  ...TREND_RULES,
  ...CHART_RULES,
  ...OSCILLATOR_RULES,
];

const ruleById = new Map<string, PatternRule>();
for (const rule of PATTERN_RULES) {
  if (ruleById.has(rule.id)) {
    throw new Error(`Duplicate technical pattern id: ${rule.id}`);
  }
  ruleById.set(rule.id, rule);
}

function publicDefinition(rule: PatternRule): PatternDefinition {
  return {
    id: rule.id,
    name: rule.name,
    aliases: rule.aliases,
    category: rule.category,
    direction: rule.direction,
    requiredBars: rule.requiredBars,
    description: rule.description,
  };
}

export const PATTERN_CATALOG: readonly PatternDefinition[] = PATTERN_RULES.map(publicDefinition);
export const PATTERN_COUNT = PATTERN_CATALOG.length;

function normalizeTerm(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[\s\-_/，,、。.!！?？;；:："'“”‘’()[\]（）]+/g, "");
}

const allTerms = new Set([
  "all",
  "全部",
  "所有",
  "全部形态",
  "所有形态",
  "全部技术形态",
  "所有技术形态",
].map(normalizeTerm));

const idsByAlias = new Map<string, string[]>();
const searchableAliases: Array<{ normalized: string; display: string; id: string }> = [];
for (const definition of PATTERN_CATALOG) {
  const terms = [definition.id, definition.name, ...definition.aliases];
  for (const term of terms) {
    const normalized = normalizeTerm(term);
    if (!normalized) continue;
    const existing = idsByAlias.get(normalized) ?? [];
    if (!existing.includes(definition.id)) {
      existing.push(definition.id);
      idsByAlias.set(normalized, existing);
    }
    searchableAliases.push({ normalized, display: term, id: definition.id });
  }
}
searchableAliases.sort((left, right) => right.normalized.length - left.normalized.length);

function splitTerms(value: string): string[] {
  return value
    .split(/[，,、|;；\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function resolvePatternTerms(values: readonly string[]): PatternResolution {
  const requested = values.flatMap(splitTerms);
  if (requested.length === 0) {
    return {
      patternIds: PATTERN_CATALOG.map((definition) => definition.id),
      matchedTerms: ["全部技术形态"],
      unresolvedTerms: [],
      selectedAll: true,
    };
  }

  const ids = new Set<string>();
  const matchedTerms = new Set<string>();
  const unresolvedTerms: string[] = [];
  let selectedAll = false;

  for (const requestedTerm of requested) {
    const normalized = normalizeTerm(requestedTerm);
    if (
      allTerms.has(normalized)
      || [...allTerms].some((term) => term.length >= 4 && normalized.includes(term))
    ) {
      selectedAll = true;
      matchedTerms.add(requestedTerm);
      for (const definition of PATTERN_CATALOG) ids.add(definition.id);
      continue;
    }

    const exactIds = idsByAlias.get(normalized);
    if (exactIds && exactIds.length > 0) {
      for (const id of exactIds) ids.add(id);
      matchedTerms.add(requestedTerm);
      continue;
    }

    let found = false;
    const aliasesSeen = new Set<string>();
    const matchingAliases: Array<{ normalized: string; display: string; id: string }> = [];
    for (const alias of searchableAliases) {
      if (alias.normalized.length < 2 || aliasesSeen.has(`${alias.id}:${alias.normalized}`)) continue;
      aliasesSeen.add(`${alias.id}:${alias.normalized}`);
      if (normalized.includes(alias.normalized)) {
        matchingAliases.push(alias);
      }
    }
    const specificAliases = matchingAliases.filter((candidate) => !matchingAliases.some(
      (other) => other.normalized.length > candidate.normalized.length
        && other.normalized.includes(candidate.normalized),
    ));
    for (const alias of specificAliases) {
      ids.add(alias.id);
      matchedTerms.add(alias.display);
      found = true;
    }

    if (!found && /(技术形态|形态分析)/u.test(normalized)) {
      selectedAll = true;
      matchedTerms.add("全部技术形态");
      for (const definition of PATTERN_CATALOG) ids.add(definition.id);
      found = true;
    }

    if (!found) unresolvedTerms.push(requestedTerm);
  }

  return {
    patternIds: [...ids],
    matchedTerms: [...matchedTerms],
    unresolvedTerms,
    selectedAll,
  };
}

function snapshot(context: ReturnType<typeof createAnalysisContext>): IndicatorSnapshot | null {
  const close = numberAt(context.closes);
  if (close === null) return null;
  const volume = numberAt(context.volumes);
  const volumeMa5 = seriesAt(context.indicators.volumeMa5);
  const bollWidth = seriesAt(context.indicators.bollWidth);
  return {
    close,
    ma5: seriesAt(context.indicators.ma5),
    ma10: seriesAt(context.indicators.ma10),
    ma20: seriesAt(context.indicators.ma20),
    ma30: seriesAt(context.indicators.ma30),
    ma60: seriesAt(context.indicators.ma60),
    ma120: seriesAt(context.indicators.ma120),
    volumeRatio5: volume === null || volumeMa5 === null || volumeMa5 <= 0 ? null : volume / volumeMa5,
    macdDif: seriesAt(context.indicators.macdDif),
    macdDea: seriesAt(context.indicators.macdDea),
    macdHistogram: seriesAt(context.indicators.macdHistogram),
    rsi14: seriesAt(context.indicators.rsi14),
    k: seriesAt(context.indicators.k),
    d: seriesAt(context.indicators.d),
    j: seriesAt(context.indicators.j),
    bollMiddle: seriesAt(context.indicators.bollMiddle),
    bollUpper: seriesAt(context.indicators.bollUpper),
    bollLower: seriesAt(context.indicators.bollLower),
    bollWidthPct: bollWidth === null ? null : bollWidth * 100,
    atr14: seriesAt(context.indicators.atr14),
  };
}

export function analyzeTechnicalPatterns(
  inputs: readonly CandleInput[],
  patternIds: readonly string[] = PATTERN_CATALOG.map((definition) => definition.id),
): PatternAnalysis {
  const context = createAnalysisContext(inputs);
  const selectedRules: PatternRule[] = [];
  for (const id of patternIds) {
    const rule = ruleById.get(id);
    if (rule && !selectedRules.includes(rule)) selectedRules.push(rule);
  }

  const insufficientData: string[] = [];
  const matches: PatternMatch[] = [];
  const signalTime = context.candles.at(-1)?.time ?? null;

  for (const rule of selectedRules) {
    if (context.candles.length < rule.requiredBars) {
      insufficientData.push(rule.id);
      continue;
    }
    const result = rule.detect(context);
    if (!result || signalTime === null) continue;
    matches.push({
      ...publicDefinition(rule),
      confidence: result.confidence,
      signalTime,
      evidence: result.evidence,
    });
  }

  matches.sort((left, right) => right.confidence - left.confidence || left.id.localeCompare(right.id));
  return {
    methodologyVersion: METHODOLOGY_VERSION,
    latestTime: signalTime,
    barsUsed: context.candles.length,
    evaluatedCount: selectedRules.length - insufficientData.length,
    insufficientData,
    indicators: snapshot(context),
    matches,
  };
}

export function patternCatalogSummary() {
  const categories = ["candlestick", "trend", "chart", "indicator", "volume"] as const;
  return {
    methodologyVersion: METHODOLOGY_VERSION,
    total: PATTERN_COUNT,
    categories: categories.map((category) => ({
      id: category,
      count: PATTERN_CATALOG.filter((definition) => definition.category === category).length,
      items: PATTERN_CATALOG.filter((definition) => definition.category === category),
    })),
    commandExamples: [
      "今天出现仙人指路形态的股票",
      "筛选今天出现早晨之星、MACD金叉的股票",
      "分析 600519 的全部技术形态",
      "查找均线多头排列并放量突破的股票",
      "分析 000001 是否出现头肩底",
    ],
    notes: [
      "中文名、常见俗称和英文 ID 都可作为 pattern 或 command 参数。",
      "同一个宽泛口令可能对应多种指标，例如“金叉”会同时解析为均线、MACD、KDJ 金叉。",
      "技术形态采用可复核的量化启发式规则，不等同于交易所或持牌机构的投资结论。",
    ],
  };
}

export type CommandIntent = "screen" | "analyze" | "catalog";

export function inferCommandIntent(command: string): CommandIntent {
  const normalized = normalizeTerm(command);
  if (/(有哪些|哪些股票|筛选|选股|找出|扫描|全市场|出现.*股票)/u.test(normalized)) return "screen";
  if (/(目录|口令|支持什么|全部形态|所有形态|列表)/u.test(normalized)) return "catalog";
  return "analyze";
}

export function extractSymbolFromCommand(command: string): string | null {
  const match = command.toUpperCase().match(/(?:SH|SZ|BJ)?\d{6}(?:\.(?:SH|SZ|BJ))?/u);
  return match?.[0] ?? null;
}

export type InferredPeriod = "5m" | "15m" | "30m" | "60m" | "day" | "week" | "month";

export function inferPeriodFromCommand(command: string): InferredPeriod {
  const normalized = normalizeTerm(command);
  if (/(月线|月k|monthly|month)/u.test(normalized)) return "month";
  if (/(周线|周k|weekly|week)/u.test(normalized)) return "week";
  if (/(60分钟|60分|60m)/u.test(normalized)) return "60m";
  if (/(30分钟|30分|30m)/u.test(normalized)) return "30m";
  if (/(15分钟|15分|15m)/u.test(normalized)) return "15m";
  if (/(5分钟|5分|5m)/u.test(normalized)) return "5m";
  return "day";
}

export function resolveTechnicalCommand(command: string) {
  const patterns = resolvePatternTerms([command]);
  return {
    command,
    intent: inferCommandIntent(command),
    symbol: extractSymbolFromCommand(command),
    period: inferPeriodFromCommand(command),
    patterns,
  };
}
