import { ApiError, UpstreamError } from "./errors";
import {
  exchangeFromMarket,
  normalizeSymbol,
  type SecurityId,
} from "./symbol";

export type Fetcher = typeof fetch;

export interface UpstreamOptions {
  readonly timeoutMs: number;
  readonly fetcher?: Fetcher;
}

type JsonRecord = Record<string, unknown>;

const QUOTE_API = "https://push2.eastmoney.com/api/qt";
const HISTORY_API = "https://push2his.eastmoney.com/api/qt";
const EASTMONEY_TOKEN = "fa5fd1943c7b386f172d6893dbfba10b";
const A_SHARE_FILTER = "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23";
const MAX_UPSTREAM_BYTES = 2_000_000;

const STOCK_LIST_FIELDS = [
  "f12",
  "f13",
  "f14",
  "f2",
  "f3",
  "f4",
  "f5",
  "f6",
  "f7",
  "f8",
  "f9",
  "f10",
  "f15",
  "f16",
  "f17",
  "f18",
  "f124",
].join(",");

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value !== "" && value !== "-") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value !== "-" && value !== ""
    ? value
    : null;
}

function unixSecondsToIso(value: unknown): string | null {
  const seconds = asNumber(value);
  if (seconds === null || seconds <= 0) {
    return null;
  }

  return new Date(seconds * 1000).toISOString();
}

function buildUrl(base: string, path: string, params: Record<string, string>): string {
  const url = new URL(`${base}/${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

async function fetchPayload(
  url: string,
  cacheSeconds: number,
  options: UpstreamOptions,
): Promise<JsonRecord> {
  const fetcher = options.fetcher ?? fetch;
  let response: Response;

  try {
    response = await fetcher(url, {
      headers: {
        Accept: "application/json,text/plain,*/*",
        Referer: "https://quote.eastmoney.com/",
      },
      signal: AbortSignal.timeout(options.timeoutMs),
      cf: {
        cacheEverything: true,
        cacheTtl: cacheSeconds,
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new UpstreamError("UPSTREAM_TIMEOUT", "行情数据源响应超时。", 504);
    }

    throw new UpstreamError("UPSTREAM_UNAVAILABLE", "暂时无法连接行情数据源。", 502);
  }

  if (!response.ok) {
    throw new UpstreamError(
      "UPSTREAM_HTTP_ERROR",
      `行情数据源返回 HTTP ${response.status}。`,
    );
  }

  const contentLength = asNumber(response.headers.get("content-length"));
  if (contentLength !== null && contentLength > MAX_UPSTREAM_BYTES) {
    throw new UpstreamError("UPSTREAM_RESPONSE_TOO_LARGE", "行情数据响应超过安全上限。" );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new UpstreamError("UPSTREAM_INVALID_JSON", "行情数据源返回了无效数据。" );
  }

  if (!isRecord(payload)) {
    throw new UpstreamError("UPSTREAM_INVALID_DATA", "行情数据结构不正确。" );
  }

  return payload;
}

function extractData(payload: JsonRecord): JsonRecord {
  const returnCode = asNumber(payload.rc);
  if (returnCode !== 0 || !isRecord(payload.data)) {
    throw new UpstreamError("UPSTREAM_NO_DATA", "行情数据源暂时没有可用数据。" );
  }

  return payload.data;
}

function rowsFromData(data: JsonRecord): JsonRecord[] {
  if (!Array.isArray(data.diff)) {
    return [];
  }

  return data.diff.filter(isRecord);
}

function parseStockRow(row: JsonRecord) {
  const code = asString(row.f12) ?? "";
  const market = asNumber(row.f13);
  const exchange = exchangeFromMarket(code, market);

  return {
    symbol: code ? `${exchange}${code}` : null,
    code: code || null,
    exchange,
    name: asString(row.f14),
    price: asNumber(row.f2),
    changePct: asNumber(row.f3),
    change: asNumber(row.f4),
    volumeLots: asNumber(row.f5),
    amount: asNumber(row.f6),
    amplitudePct: asNumber(row.f7),
    turnoverRatePct: asNumber(row.f8),
    peDynamic: asNumber(row.f9),
    volumeRatio: asNumber(row.f10),
    high: asNumber(row.f15),
    low: asNumber(row.f16),
    open: asNumber(row.f17),
    previousClose: asNumber(row.f18),
    sourceUpdatedAt: unixSecondsToIso(row.f124),
  };
}

export async function getQuote(symbol: string, options: UpstreamOptions) {
  const security = normalizeSymbol(symbol);
  const fields = [
    "f57",
    "f58",
    "f43",
    "f44",
    "f45",
    "f46",
    "f47",
    "f48",
    "f50",
    "f51",
    "f52",
    "f59",
    "f60",
    "f86",
    "f116",
    "f117",
    "f162",
    "f167",
    "f168",
    "f169",
    "f170",
    "f171",
  ].join(",");
  const url = buildUrl(QUOTE_API, "stock/get", {
    invt: "2",
    fltt: "2",
    ut: EASTMONEY_TOKEN,
    fields,
    secid: security.secid,
  });
  const payload = await fetchPayload(url, 3, options);

  if (asNumber(payload.rc) !== 0 || !isRecord(payload.data)) {
    throw new ApiError(404, "SYMBOL_NOT_FOUND", `未找到股票 ${security.symbol}。`);
  }

  const row = payload.data;
  return {
    symbol: security.symbol,
    code: asString(row.f57) ?? security.code,
    exchange: security.exchange,
    name: asString(row.f58),
    price: asNumber(row.f43),
    change: asNumber(row.f169),
    changePct: asNumber(row.f170),
    open: asNumber(row.f46),
    high: asNumber(row.f44),
    low: asNumber(row.f45),
    previousClose: asNumber(row.f60),
    amplitudePct: asNumber(row.f171),
    volumeLots: asNumber(row.f47),
    amount: asNumber(row.f48),
    volumeRatio: asNumber(row.f50),
    turnoverRatePct: asNumber(row.f168),
    limitUp: asNumber(row.f51),
    limitDown: asNumber(row.f52),
    peDynamic: asNumber(row.f162),
    pb: asNumber(row.f167),
    totalMarketCap: asNumber(row.f116),
    floatMarketCap: asNumber(row.f117),
    sourceUpdatedAt: unixSecondsToIso(row.f86),
  };
}

export async function getQuotes(symbols: readonly string[], options: UpstreamOptions) {
  const securities = symbols.map(normalizeSymbol);
  const unique = new Map<string, SecurityId>();
  for (const security of securities) {
    unique.set(security.secid, security);
  }

  const url = buildUrl(QUOTE_API, "ulist.np/get", {
    invt: "2",
    fltt: "2",
    ut: EASTMONEY_TOKEN,
    fields: STOCK_LIST_FIELDS,
    secids: [...unique.keys()].join(","),
  });
  const data = extractData(await fetchPayload(url, 3, options));
  return rowsFromData(data).map(parseStockRow);
}

const INDEX_LABELS: Readonly<Record<string, string>> = {
  "1.000001": "上证指数",
  "0.399001": "深证成指",
  "0.399006": "创业板指",
  "1.000688": "科创50",
  "1.000300": "沪深300",
};

export async function getIndices(options: UpstreamOptions) {
  const secids = Object.keys(INDEX_LABELS);
  const url = buildUrl(QUOTE_API, "ulist.np/get", {
    invt: "2",
    fltt: "2",
    ut: EASTMONEY_TOKEN,
    fields: "f12,f13,f14,f2,f3,f4,f5,f6,f15,f16,f17,f18,f124",
    secids: secids.join(","),
  });
  const data = extractData(await fetchPayload(url, 3, options));

  return rowsFromData(data).map((row) => {
    const code = asString(row.f12) ?? "";
    const market = asNumber(row.f13) ?? 0;
    const secid = `${market}.${code}`;
    return {
      secid,
      code: code || null,
      name: asString(row.f14) ?? INDEX_LABELS[secid] ?? null,
      price: asNumber(row.f2),
      changePct: asNumber(row.f3),
      change: asNumber(row.f4),
      volumeLots: asNumber(row.f5),
      amount: asNumber(row.f6),
      high: asNumber(row.f15),
      low: asNumber(row.f16),
      open: asNumber(row.f17),
      previousClose: asNumber(row.f18),
      sourceUpdatedAt: unixSecondsToIso(row.f124),
    };
  });
}

export type RankingSort = "change_pct" | "amount" | "turnover" | "volume_ratio";
export type SortOrder = "asc" | "desc";

const RANKING_FIELDS: Readonly<Record<RankingSort, string>> = {
  change_pct: "f3",
  amount: "f6",
  turnover: "f8",
  volume_ratio: "f10",
};

export async function getRankings(
  sort: RankingSort,
  order: SortOrder,
  limit: number,
  options: UpstreamOptions,
) {
  const url = buildUrl(QUOTE_API, "clist/get", {
    pn: "1",
    pz: String(limit),
    po: order === "desc" ? "1" : "0",
    np: "1",
    invt: "2",
    fltt: "2",
    ut: EASTMONEY_TOKEN,
    fid: RANKING_FIELDS[sort],
    fs: A_SHARE_FILTER,
    fields: STOCK_LIST_FIELDS,
  });
  const data = extractData(await fetchPayload(url, 5, options));
  return {
    sort,
    order,
    total: asNumber(data.total),
    items: rowsFromData(data).map(parseStockRow),
  };
}

export type SectorType = "industry" | "concept";
export type SectorSort = "change_pct" | "main_net_inflow" | "turnover";

const SECTOR_SORT_FIELDS: Readonly<Record<SectorSort, string>> = {
  change_pct: "f3",
  main_net_inflow: "f62",
  turnover: "f8",
};

export async function getSectors(
  type: SectorType,
  sort: SectorSort,
  order: SortOrder,
  limit: number,
  options: UpstreamOptions,
) {
  const url = buildUrl(QUOTE_API, "clist/get", {
    pn: "1",
    pz: String(limit),
    po: order === "desc" ? "1" : "0",
    np: "1",
    invt: "2",
    fltt: "2",
    ut: EASTMONEY_TOKEN,
    fid: SECTOR_SORT_FIELDS[sort],
    fs: type === "industry" ? "m:90+t:2" : "m:90+t:3",
    fields: "f12,f14,f2,f3,f4,f8,f20,f62,f104,f105,f124",
  });
  const data = extractData(await fetchPayload(url, 10, options));
  return {
    type,
    sort,
    order,
    total: asNumber(data.total),
    items: rowsFromData(data).map((row) => ({
      code: asString(row.f12),
      name: asString(row.f14),
      price: asNumber(row.f2),
      changePct: asNumber(row.f3),
      change: asNumber(row.f4),
      turnoverRatePct: asNumber(row.f8),
      totalMarketCap: asNumber(row.f20),
      mainNetInflow: asNumber(row.f62),
      risingCount: asNumber(row.f104),
      fallingCount: asNumber(row.f105),
      sourceUpdatedAt: unixSecondsToIso(row.f124),
    })),
  };
}

export async function getBreadth(options: UpstreamOptions) {
  const requestedLimit = 6000;
  const url = buildUrl(QUOTE_API, "clist/get", {
    pn: "1",
    pz: String(requestedLimit),
    po: "1",
    np: "1",
    invt: "2",
    fltt: "2",
    ut: EASTMONEY_TOKEN,
    fid: "f3",
    fs: A_SHARE_FILTER,
    fields: "f3,f6",
  });
  const data = extractData(await fetchPayload(url, 10, options));
  const rows = rowsFromData(data);
  let rising = 0;
  let falling = 0;
  let flat = 0;
  let unavailable = 0;
  let amount = 0;

  for (const row of rows) {
    const changePct = asNumber(row.f3);
    if (changePct === null) {
      unavailable += 1;
    } else if (changePct > 0) {
      rising += 1;
    } else if (changePct < 0) {
      falling += 1;
    } else {
      flat += 1;
    }

    amount += asNumber(row.f6) ?? 0;
  }

  const total = asNumber(data.total);
  return {
    rising,
    falling,
    flat,
    unavailable,
    totalAmount: amount,
    totalSecurities: total,
    sampleSize: rows.length,
    complete: total !== null && rows.length >= total,
  };
}

export type KlinePeriod = "5m" | "15m" | "30m" | "60m" | "day" | "week" | "month";
export type PriceAdjustment = "none" | "forward" | "backward";

const KLINE_PERIODS: Readonly<Record<KlinePeriod, string>> = {
  "5m": "5",
  "15m": "15",
  "30m": "30",
  "60m": "60",
  day: "101",
  week: "102",
  month: "103",
};

const PRICE_ADJUSTMENTS: Readonly<Record<PriceAdjustment, string>> = {
  none: "0",
  forward: "1",
  backward: "2",
};

export async function getKline(
  symbol: string,
  period: KlinePeriod,
  adjustment: PriceAdjustment,
  limit: number,
  options: UpstreamOptions,
) {
  const security = normalizeSymbol(symbol);
  const url = buildUrl(HISTORY_API, "stock/kline/get", {
    secid: security.secid,
    ut: EASTMONEY_TOKEN,
    fields1: "f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13",
    fields2: "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61",
    klt: KLINE_PERIODS[period],
    fqt: PRICE_ADJUSTMENTS[adjustment],
    end: "20500101",
    lmt: String(limit),
  });
  const payload = await fetchPayload(url, period.endsWith("m") ? 10 : 300, options);

  if (asNumber(payload.rc) !== 0 || !isRecord(payload.data)) {
    throw new ApiError(404, "KLINE_NOT_FOUND", `未找到 ${security.symbol} 的 K 线数据。`);
  }

  const data = payload.data;
  const rawKlines = Array.isArray(data.klines)
    ? data.klines.filter((item): item is string => typeof item === "string")
    : [];

  const items = rawKlines.map((line) => {
    const columns = line.split(",");
    return {
      time: columns[0] ?? null,
      open: asNumber(columns[1]),
      close: asNumber(columns[2]),
      high: asNumber(columns[3]),
      low: asNumber(columns[4]),
      volumeLots: asNumber(columns[5]),
      amount: asNumber(columns[6]),
      amplitudePct: asNumber(columns[7]),
      changePct: asNumber(columns[8]),
      change: asNumber(columns[9]),
      turnoverRatePct: asNumber(columns[10]),
    };
  });

  return {
    symbol: security.symbol,
    code: asString(data.code) ?? security.code,
    name: asString(data.name),
    period,
    adjustment,
    items,
  };
}
