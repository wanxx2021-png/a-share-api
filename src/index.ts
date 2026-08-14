import {
  getBreadth,
  getIndices,
  getKline,
  getQuote,
  getQuotes,
  getRankings,
  getSectors,
  getStockPage,
  type Fetcher,
  type KlinePeriod,
  type MarketStock,
  type PriceAdjustment,
  type RankingSort,
  type SectorSort,
  type SectorType,
  type SortOrder,
} from "./eastmoney";
import { ApiError } from "./errors";
import {
  analyzeTechnicalPatterns,
  extractSymbolFromCommand,
  inferPeriodFromCommand,
  patternCatalogSummary,
  resolvePatternTerms,
  resolveTechnicalCommand,
  type PatternAnalysis,
  type PatternResolution,
} from "./technical";

const API_VERSION = "1.1.0";
const SOURCE_NAME = "东方财富公开网页行情接口";

function positiveInteger(
  value: string | null,
  fallback: number,
  maximum: number,
  name: string,
): number {
  if (value === null || value === "") {
    return fallback;
  }

  if (!/^\d+$/.test(value)) {
    throw new ApiError(400, "INVALID_PARAMETER", `${name} 必须是正整数。`);
  }

  const number = Number(value);
  if (number < 1 || number > maximum) {
    throw new ApiError(400, "INVALID_PARAMETER", `${name} 必须在 1 到 ${maximum} 之间。`);
  }

  return number;
}

function enumParameter<T extends string>(
  value: string | null,
  fallback: T,
  allowed: readonly T[],
  name: string,
): T {
  if (value === null || value === "") {
    return fallback;
  }

  if (!allowed.includes(value as T)) {
    throw new ApiError(
      400,
      "INVALID_PARAMETER",
      `${name} 只支持：${allowed.join("、")}。`,
    );
  }

  return value as T;
}

function booleanParameter(
  value: string | null,
  fallback: boolean,
  name: string,
): boolean {
  if (value === null || value === "") return fallback;
  if (["1", "true", "yes", "on"].includes(value.toLowerCase())) return true;
  if (["0", "false", "no", "off"].includes(value.toLowerCase())) return false;
  throw new ApiError(400, "INVALID_PARAMETER", `${name} 只支持 true 或 false。`);
}

function nonNegativeNumber(
  value: string | null,
  fallback: number,
  name: string,
): number {
  if (value === null || value === "") return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new ApiError(400, "INVALID_PARAMETER", `${name} 必须是非负数。`);
  }
  return number;
}

function corsHeaders(env: Env): Headers {
  const headers = new Headers({
    "Access-Control-Allow-Origin": env.CORS_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  });

  if (env.CORS_ORIGIN !== "*") {
    headers.append("Vary", "Origin");
  }

  return headers;
}

function jsonResponse(
  body: unknown,
  status: number,
  env: Env,
  requestId: string,
  cacheSeconds = 0,
): Response {
  const headers = corsHeaders(env);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("X-Request-Id", requestId);
  headers.set("X-API-Version", API_VERSION);
  headers.set("X-Data-Source", "eastmoney-public-web");
  headers.set(
    "Cache-Control",
    cacheSeconds > 0
      ? `public, max-age=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 3}`
      : "no-store",
  );
  return new Response(JSON.stringify(body, null, 2), { status, headers });
}

function success(
  data: unknown,
  env: Env,
  requestId: string,
  cacheSeconds: number,
): Response {
  return jsonResponse(
    {
      ok: true,
      data,
      meta: {
        apiVersion: API_VERSION,
        source: SOURCE_NAME,
        requestedAt: new Date().toISOString(),
        cacheSeconds,
        disclaimer: "数据可能存在延迟，仅供信息参考，不构成投资建议。",
      },
    },
    200,
    env,
    requestId,
    cacheSeconds,
  );
}

function requireQuery(url: URL, name: string): string {
  const value = url.searchParams.get(name)?.trim();
  if (!value) {
    throw new ApiError(400, "MISSING_PARAMETER", `缺少参数 ${name}。`);
  }
  return value;
}

function patternInputs(url: URL): string[] {
  const values = url.searchParams.getAll("pattern");
  const patterns = url.searchParams.get("patterns");
  const command = url.searchParams.get("command");
  if (patterns) values.push(patterns);
  if (command) values.push(command);
  return values;
}

function resolvePatterns(url: URL, requireSelection = false): PatternResolution {
  const inputs = patternInputs(url);
  if (requireSelection && inputs.length === 0) {
    throw new ApiError(400, "MISSING_PARAMETER", "缺少 pattern 或 command 参数。" );
  }
  const resolution = resolvePatternTerms(inputs);
  if (resolution.patternIds.length === 0) {
    throw new ApiError(
      400,
      "INVALID_PATTERN",
      `未识别技术形态口令：${resolution.unresolvedTerms.join("、")}。访问 /api/v1/patterns 查看完整目录。`,
    );
  }
  return resolution;
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: Array<R | undefined> = Array.from({ length: items.length });
  let nextIndex = 0;
  const worker = async (): Promise<void> => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      const item = items[index];
      if (item !== undefined) results[index] = await task(item, index);
    }
  };
  await Promise.all(Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => worker(),
  ));
  return results.filter((item): item is R => item !== undefined);
}

interface ScreenSuccess {
  readonly ok: true;
  readonly stock: MarketStock;
  readonly analysis: PatternAnalysis;
}

interface ScreenFailure {
  readonly ok: false;
  readonly stock: MarketStock;
  readonly error: string;
}

type ScreenOutcome = ScreenSuccess | ScreenFailure;

function docs(origin: string) {
  return {
    service: "A 股行情 API",
    version: API_VERSION,
    status: "ready",
    endpoints: [
      { path: "/health", description: "服务健康检查" },
      { path: "/api/v1/quote?symbol=600519", description: "单只证券实时行情" },
      { path: "/api/v1/quotes?symbols=600519,000001", description: "批量实时行情（最多 50 只）" },
      { path: "/api/v1/indices", description: "主要 A 股指数" },
      { path: "/api/v1/rankings?sort=change_pct&order=desc&limit=20", description: "A 股排行" },
      { path: "/api/v1/sectors?type=industry&sort=change_pct&order=desc&limit=20", description: "行业或概念板块排行" },
      { path: "/api/v1/kline?symbol=600519&period=day&adjust=forward&limit=120", description: "K 线数据" },
      { path: "/api/v1/market/overview", description: "指数、涨跌家数、强势股和强势板块概览" },
      { path: "/api/v1/patterns", description: "101 种技术形态口令与判定说明" },
      { path: "/api/v1/patterns/resolve?command=今天出现仙人指路形态的股票", description: "解析自然语言技术形态口令" },
      { path: "/api/v1/patterns/analyze?symbol=600519&pattern=全部", description: "分析单只股票的技术形态" },
      { path: "/api/v1/patterns/screen?pattern=仙人指路&page=1&page_size=20", description: "分页筛选全市场技术形态" },
    ].map((item) => ({ ...item, url: `${origin}${item.path}` })),
    source: SOURCE_NAME,
    disclaimer: "公开网页行情接口可能调整；数据可能延迟，仅供信息参考，不构成投资建议。",
  };
}

export async function handleRequest(
  request: Request,
  env: Env,
  fetcher: Fetcher = fetch,
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(env) });
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return jsonResponse(
      { ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "只支持 GET、HEAD 和 OPTIONS。" } },
      405,
      env,
      requestId,
    );
  }

  const timeoutMs = positiveInteger(env.UPSTREAM_TIMEOUT_MS, 8000, 30_000, "UPSTREAM_TIMEOUT_MS");
  const upstream = { timeoutMs, fetcher };

  try {
    let response: Response;

    switch (url.pathname.replace(/\/$/, "") || "/") {
      case "/":
        response = success(docs(url.origin), env, requestId, 300);
        break;

      case "/health":
        response = success(
          { status: "ok", service: "a-share-api", version: API_VERSION },
          env,
          requestId,
          0,
        );
        break;

      case "/api/v1/quote": {
        const symbol = requireQuery(url, "symbol");
        response = success(await getQuote(symbol, upstream), env, requestId, 3);
        break;
      }

      case "/api/v1/quotes": {
        const symbols = requireQuery(url, "symbols")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
        if (symbols.length < 1 || symbols.length > 50) {
          throw new ApiError(400, "INVALID_PARAMETER", "symbols 必须包含 1 到 50 个股票代码。" );
        }
        response = success(await getQuotes(symbols, upstream), env, requestId, 3);
        break;
      }

      case "/api/v1/indices":
        response = success(await getIndices(upstream), env, requestId, 3);
        break;

      case "/api/v1/rankings": {
        const sort = enumParameter<RankingSort>(
          url.searchParams.get("sort"),
          "change_pct",
          ["change_pct", "amount", "turnover", "volume_ratio"],
          "sort",
        );
        const order = enumParameter<SortOrder>(
          url.searchParams.get("order"),
          "desc",
          ["asc", "desc"],
          "order",
        );
        const limit = positiveInteger(url.searchParams.get("limit"), 20, 100, "limit");
        response = success(await getRankings(sort, order, limit, upstream), env, requestId, 5);
        break;
      }

      case "/api/v1/sectors": {
        const type = enumParameter<SectorType>(
          url.searchParams.get("type"),
          "industry",
          ["industry", "concept"],
          "type",
        );
        const sort = enumParameter<SectorSort>(
          url.searchParams.get("sort"),
          "change_pct",
          ["change_pct", "main_net_inflow", "turnover"],
          "sort",
        );
        const order = enumParameter<SortOrder>(
          url.searchParams.get("order"),
          "desc",
          ["asc", "desc"],
          "order",
        );
        const limit = positiveInteger(url.searchParams.get("limit"), 20, 100, "limit");
        response = success(await getSectors(type, sort, order, limit, upstream), env, requestId, 10);
        break;
      }

      case "/api/v1/kline": {
        const symbol = requireQuery(url, "symbol");
        const period = enumParameter<KlinePeriod>(
          url.searchParams.get("period"),
          "day",
          ["5m", "15m", "30m", "60m", "day", "week", "month"],
          "period",
        );
        const adjustment = enumParameter<PriceAdjustment>(
          url.searchParams.get("adjust"),
          "forward",
          ["none", "forward", "backward"],
          "adjust",
        );
        const limit = positiveInteger(url.searchParams.get("limit"), 120, 1000, "limit");
        response = success(
          await getKline(symbol, period, adjustment, limit, upstream),
          env,
          requestId,
          period.endsWith("m") ? 10 : 300,
        );
        break;
      }

      case "/api/v1/market/overview": {
        const [indices, breadth, gainers, losers, industries, concepts] = await Promise.all([
          getIndices(upstream),
          getBreadth(upstream),
          getRankings("change_pct", "desc", 10, upstream),
          getRankings("change_pct", "asc", 10, upstream),
          getSectors("industry", "change_pct", "desc", 10, upstream),
          getSectors("concept", "change_pct", "desc", 10, upstream),
        ]);
        response = success(
          { indices, breadth, gainers, losers, industries, concepts },
          env,
          requestId,
          10,
        );
        break;
      }

      case "/api/v1/patterns":
      case "/api/v1/patterns/catalog": {
        const category = url.searchParams.get("category");
        const summary = patternCatalogSummary();
        if (category) {
          const selected = summary.categories.find((item) => item.id === category);
          if (!selected) {
            throw new ApiError(400, "INVALID_PARAMETER", "category 只支持：candlestick、trend、chart、indicator、volume。" );
          }
          response = success(
            { methodologyVersion: summary.methodologyVersion, total: selected.count, category: selected },
            env,
            requestId,
            3600,
          );
        } else {
          response = success(summary, env, requestId, 3600);
        }
        break;
      }

      case "/api/v1/patterns/resolve": {
        const command = requireQuery(url, "command");
        const resolved = resolveTechnicalCommand(command);
        const encodedPatterns = encodeURIComponent(resolved.patterns.patternIds.join(","));
        const symbol = resolved.symbol ?? "600519";
        response = success(
          {
            ...resolved,
            suggestedRequest: resolved.intent === "screen"
              ? `${url.origin}/api/v1/patterns/screen?patterns=${encodedPatterns}&period=${resolved.period}`
              : resolved.intent === "catalog"
                ? `${url.origin}/api/v1/patterns`
                : `${url.origin}/api/v1/patterns/analyze?symbol=${encodeURIComponent(symbol)}&patterns=${encodedPatterns}&period=${resolved.period}`,
          },
          env,
          requestId,
          3600,
        );
        break;
      }

      case "/api/v1/patterns/analyze": {
        const command = url.searchParams.get("command") ?? "";
        const symbol = url.searchParams.get("symbol")?.trim()
          || extractSymbolFromCommand(command)
          || "";
        if (!symbol) {
          throw new ApiError(400, "MISSING_PARAMETER", "缺少 symbol；也可以在 command 中写入 6 位股票代码。" );
        }
        const inferredPeriod = inferPeriodFromCommand(command);
        const period = enumParameter<KlinePeriod>(
          url.searchParams.get("period"),
          inferredPeriod,
          ["5m", "15m", "30m", "60m", "day", "week", "month"],
          "period",
        );
        const adjustment = enumParameter<PriceAdjustment>(
          url.searchParams.get("adjust"),
          "forward",
          ["none", "forward", "backward"],
          "adjust",
        );
        const history = positiveInteger(url.searchParams.get("history"), 250, 500, "history");
        const resolution = resolvePatterns(url);
        const kline = await getKline(symbol, period, adjustment, history, upstream);
        response = success(
          {
            symbol: kline.symbol,
            code: kline.code,
            name: kline.name,
            period,
            adjustment,
            requestedPatterns: resolution,
            analysis: analyzeTechnicalPatterns(kline.items, resolution.patternIds),
          },
          env,
          requestId,
          period.endsWith("m") ? 10 : 300,
        );
        break;
      }

      case "/api/v1/patterns/screen": {
        const resolution = resolvePatterns(url, true);
        if (resolution.selectedAll || resolution.patternIds.length > 12) {
          throw new ApiError(400, "TOO_MANY_PATTERNS", "市场筛选一次最多选择 12 种具体形态；请不要使用“全部”。" );
        }
        const command = url.searchParams.get("command") ?? "";
        const period = enumParameter<KlinePeriod>(
          url.searchParams.get("period"),
          inferPeriodFromCommand(command),
          ["5m", "15m", "30m", "60m", "day", "week", "month"],
          "period",
        );
        const adjustment = enumParameter<PriceAdjustment>(
          url.searchParams.get("adjust"),
          "forward",
          ["none", "forward", "backward"],
          "adjust",
        );
        const page = positiveInteger(url.searchParams.get("page"), 1, 1000, "page");
        const pageSize = positiveInteger(url.searchParams.get("page_size"), 20, 30, "page_size");
        const history = positiveInteger(url.searchParams.get("history"), 180, 500, "history");
        const sort = enumParameter<RankingSort>(
          url.searchParams.get("sort"),
          "amount",
          ["change_pct", "amount", "turnover", "volume_ratio"],
          "sort",
        );
        const order = enumParameter<SortOrder>(
          url.searchParams.get("order"),
          "desc",
          ["asc", "desc"],
          "order",
        );
        const matchMode = enumParameter<"any" | "all">(
          url.searchParams.get("match"),
          /同时|并且|全部满足/u.test(command) ? "all" : "any",
          ["any", "all"],
          "match",
        );
        const excludeSt = booleanParameter(url.searchParams.get("exclude_st"), true, "exclude_st");
        const minAmount = nonNegativeNumber(url.searchParams.get("min_amount"), 0, "min_amount");
        const stockPage = await getStockPage(page, pageSize, sort, order, upstream);
        const candidates = stockPage.items.filter((stock) => stock.symbol
          && stock.price !== null
          && stock.price > 0
          && (stock.amount ?? 0) >= minAmount
          && (!excludeSt || !/\*?ST/iu.test(stock.name ?? "")));
        const outcomes = await mapWithConcurrency<MarketStock, ScreenOutcome>(
          candidates,
          6,
          async (stock) => {
            try {
              const kline = await getKline(stock.symbol ?? "", period, adjustment, history, upstream);
              return {
                ok: true,
                stock,
                analysis: analyzeTechnicalPatterns(kline.items, resolution.patternIds),
              };
            } catch (error) {
              return {
                ok: false,
                stock,
                error: error instanceof Error ? error.message : "未知错误",
              };
            }
          },
        );
        const completed = outcomes.filter((item): item is ScreenSuccess => item.ok);
        const failed = outcomes.filter((item): item is ScreenFailure => !item.ok);
        const matched = completed
          .filter((item) => matchMode === "all"
            ? resolution.patternIds.every((id) => item.analysis.matches.some((match) => match.id === id))
            : item.analysis.matches.length > 0)
          .sort((left, right) => (right.analysis.matches[0]?.confidence ?? 0) - (left.analysis.matches[0]?.confidence ?? 0))
          .map((item) => ({ stock: item.stock, analysis: item.analysis }));
        response = success(
          {
            requestedPatterns: resolution,
            period,
            adjustment,
            matchMode,
            universe: {
              sort,
              order,
              page,
              pageSize,
              totalSecurities: stockPage.total,
              totalPages: stockPage.totalPages,
              candidatesOnPage: candidates.length,
              analyzedOnPage: completed.length,
              failedOnPage: failed.length,
              exhaustive: false,
              note: "单次请求只扫描当前页；按 nextPage 继续，直到 page 等于 totalPages，才覆盖完整市场。",
              nextPage: stockPage.totalPages !== null && page < stockPage.totalPages
                ? `${url.origin}/api/v1/patterns/screen?patterns=${encodeURIComponent(resolution.patternIds.join(","))}&page=${page + 1}&page_size=${pageSize}&sort=${sort}&order=${order}&period=${period}&adjust=${adjustment}&history=${history}&match=${matchMode}&exclude_st=${String(excludeSt)}&min_amount=${minAmount}`
                : null,
            },
            matchedCount: matched.length,
            items: matched,
            failures: failed.map((item) => ({
              symbol: item.stock.symbol,
              name: item.stock.name,
              error: item.error,
            })),
          },
          env,
          requestId,
          period.endsWith("m") ? 10 : 300,
        );
        break;
      }

      default:
        throw new ApiError(404, "NOT_FOUND", "接口不存在；访问 / 查看接口列表。" );
    }

    if (request.method === "HEAD") {
      return new Response(null, { status: response.status, headers: response.headers });
    }

    return response;
  } catch (error) {
    if (error instanceof ApiError) {
      console.warn(JSON.stringify({
        level: "warn",
        requestId,
        path: url.pathname,
        code: error.code,
        status: error.status,
      }));
      return jsonResponse(
        { ok: false, error: { code: error.code, message: error.message }, meta: { requestId } },
        error.status,
        env,
        requestId,
      );
    }

    console.error(JSON.stringify({
      level: "error",
      requestId,
      path: url.pathname,
      message: error instanceof Error ? error.message : "Unknown error",
    }));
    return jsonResponse(
      { ok: false, error: { code: "INTERNAL_ERROR", message: "服务内部错误。" }, meta: { requestId } },
      500,
      env,
      requestId,
    );
  }
}

export default {
  fetch(request, env): Promise<Response> {
    return handleRequest(request, env);
  },
} satisfies ExportedHandler<Env>;
