import {
  getBreadth,
  getIndices,
  getKline,
  getQuote,
  getQuotes,
  getRankings,
  getSectors,
  type Fetcher,
  type KlinePeriod,
  type PriceAdjustment,
  type RankingSort,
  type SectorSort,
  type SectorType,
  type SortOrder,
} from "./eastmoney";
import { ApiError } from "./errors";

const API_VERSION = "1.0.0";
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
