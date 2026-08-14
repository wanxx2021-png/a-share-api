import { ApiError } from "./errors";

export type Exchange = "SH" | "SZ" | "BJ";

export interface SecurityId {
  readonly input: string;
  readonly code: string;
  readonly exchange: Exchange;
  readonly marketId: 0 | 1;
  readonly secid: string;
  readonly symbol: string;
}

const EXCHANGE_ALIASES: Readonly<Record<string, Exchange>> = {
  SH: "SH",
  SSE: "SH",
  XSHG: "SH",
  SZ: "SZ",
  SZSE: "SZ",
  XSHE: "SZ",
  BJ: "BJ",
  BSE: "BJ",
  XBEI: "BJ",
};

function inferExchange(code: string): Exchange {
  if (/^(4|8|92)/.test(code)) {
    return "BJ";
  }

  if (/^(5|6|9)/.test(code)) {
    return "SH";
  }

  return "SZ";
}

function resolveExchange(raw: string | undefined): Exchange | undefined {
  if (!raw) {
    return undefined;
  }

  return EXCHANGE_ALIASES[raw.toUpperCase()];
}

export function normalizeSymbol(input: string): SecurityId {
  const original = input;
  const value = input.trim().toUpperCase().replaceAll(" ", "");

  const prefixed = value.match(/^([A-Z]{2,4})(\d{6})$/);
  const suffixed = value.match(/^(\d{6})\.([A-Z]{2,4})$/);
  const bare = value.match(/^(\d{6})$/);

  let code: string | undefined;
  let exchangeHint: string | undefined;

  if (prefixed) {
    exchangeHint = prefixed[1];
    code = prefixed[2];
  } else if (suffixed) {
    code = suffixed[1];
    exchangeHint = suffixed[2];
  } else if (bare) {
    code = bare[1];
  }

  if (!code) {
    throw new ApiError(
      400,
      "INVALID_SYMBOL",
      "股票代码格式不正确；可使用 600519、SH600519 或 600519.SH。",
    );
  }

  const hintedExchange = resolveExchange(exchangeHint);
  if (exchangeHint && !hintedExchange) {
    throw new ApiError(400, "INVALID_EXCHANGE", "不支持的交易所代码。" );
  }

  const exchange = hintedExchange ?? inferExchange(code);
  const marketId = exchange === "SH" ? 1 : 0;

  return {
    input: original,
    code,
    exchange,
    marketId,
    secid: `${marketId}.${code}`,
    symbol: `${exchange}${code}`,
  };
}

export function exchangeFromMarket(code: string, market: number | null): Exchange {
  if (market === 1) {
    return "SH";
  }

  return inferExchange(code);
}
