import { McpServer, type CallToolResult, type JSONObject } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";

const MCP_SERVER_VERSION = "1.2.0";

type QueryValue = boolean | number | string | undefined;

export type RestInvoker = (
  path: string,
  query?: Readonly<Record<string, QueryValue>>,
) => Promise<unknown>;

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
} as const;

function toolResult(value: unknown): CallToolResult {
  const structuredContent = JSON.parse(JSON.stringify({ result: value })) as JSONObject;
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    structuredContent,
  };
}

function toolError(error: unknown): CallToolResult {
  const message = error instanceof Error ? error.message : "A 股数据服务暂时不可用。";
  return {
    isError: true,
    content: [{ type: "text", text: message }],
    structuredContent: { error: message },
  };
}

async function runTool(action: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return toolResult(await action());
  } catch (error) {
    return toolError(error);
  }
}

function createServer(invokeRest: RestInvoker): McpServer {
  const server = new McpServer({
    name: "a-share-market-assistant",
    title: "A 股行情与技术形态助手",
    version: MCP_SERVER_VERSION,
  }, {
    instructions:
      "Use these read-only tools for A-share quotes, market review, K-lines, rankings, sectors, and technical-pattern analysis. Treat ‘today’ as the latest trading date returned by the data source. Never present incomplete breadth samples as full-market totals. A full-market pattern screen requires following pagination metadata through the final page. State that market data may be delayed and that analysis is not investment advice.",
  });

  server.registerTool(
    "get_stock_quotes",
    {
      title: "查询 A 股实时行情",
      description:
        "Use this when the user asks for the latest price, change, volume, turnover, valuation snapshot, or side-by-side quote comparison for one or more A-share securities. Accepts 1 to 50 stock codes.",
      inputSchema: z.object({
        symbols: z
          .array(z.string().min(6).describe("股票代码，如 600519、SH600519、000001.SZ。"))
          .min(1)
          .max(50)
          .describe("要查询的 1 到 50 只 A 股证券。"),
      }),
      annotations: { ...readOnlyAnnotations, openWorldHint: true },
    },
    ({ symbols }) => runTool(() => invokeRest("/api/v1/quotes", { symbols: symbols.join(",") })),
  );

  server.registerTool(
    "get_market_indices",
    {
      title: "查询主要 A 股指数",
      description:
        "Use this when the user asks how the broad A-share market is performing now, including the Shanghai Composite, Shenzhen Component, ChiNext, STAR 50, and CSI 300 indices.",
      inputSchema: z.object({}),
      annotations: { ...readOnlyAnnotations, openWorldHint: true },
    },
    () => runTool(() => invokeRest("/api/v1/indices")),
  );

  server.registerTool(
    "get_stock_rankings",
    {
      title: "查询 A 股个股排行",
      description:
        "Use this when the user asks for A-share gainers, losers, most actively traded stocks, highest turnover, or highest volume-ratio rankings.",
      inputSchema: z.object({
        sort: z
          .enum(["change_pct", "amount", "turnover", "volume_ratio"])
          .default("change_pct")
          .describe("排序指标：涨跌幅、成交额、换手率或量比。"),
        order: z.enum(["asc", "desc"]).default("desc").describe("升序或降序。"),
        limit: z.number().int().min(1).max(100).default(20).describe("返回 1 到 100 只股票。"),
      }),
      annotations: { ...readOnlyAnnotations, openWorldHint: true },
    },
    ({ sort, order, limit }) => runTool(() => invokeRest("/api/v1/rankings", { sort, order, limit })),
  );

  server.registerTool(
    "get_sector_rankings",
    {
      title: "查询 A 股板块排行",
      description:
        "Use this when the user asks which A-share industries or concepts are strongest, weakest, most active, or receiving the most main-fund inflow.",
      inputSchema: z.object({
        type: z.enum(["industry", "concept"]).default("industry").describe("industry 为行业，concept 为概念。"),
        sort: z
          .enum(["change_pct", "main_net_inflow", "turnover"])
          .default("change_pct")
          .describe("按涨跌幅、主力净流入或换手率排序。"),
        order: z.enum(["asc", "desc"]).default("desc").describe("升序或降序。"),
        limit: z.number().int().min(1).max(100).default(20).describe("返回 1 到 100 个板块。"),
      }),
      annotations: { ...readOnlyAnnotations, openWorldHint: true },
    },
    ({ type, sort, order, limit }) => runTool(() => invokeRest("/api/v1/sectors", { type, sort, order, limit })),
  );

  server.registerTool(
    "get_stock_kline",
    {
      title: "查询 A 股 K 线",
      description:
        "Use this when the user asks for historical price/volume bars, recent highs and lows, moving-window calculations, or raw data needed to analyze an A-share stock trend.",
      inputSchema: z.object({
        symbol: z.string().min(6).describe("股票代码，如 600519、SH600519、000001.SZ。"),
        period: z
          .enum(["5m", "15m", "30m", "60m", "day", "week", "month"])
          .default("day")
          .describe("K 线周期。"),
        adjust: z.enum(["none", "forward", "backward"]).default("forward").describe("不复权、前复权或后复权。"),
        limit: z.number().int().min(1).max(1000).default(120).describe("返回 1 到 1000 根 K 线。"),
      }),
      annotations: { ...readOnlyAnnotations, openWorldHint: true },
    },
    ({ symbol, period, adjust, limit }) => runTool(() => invokeRest("/api/v1/kline", {
      symbol,
      period,
      adjust,
      limit,
    })),
  );

  server.registerTool(
    "get_market_overview",
    {
      title: "复盘 A 股市场",
      description:
        "Use this when the user asks to review today's or the latest A-share trading session. Returns major indices, market breadth, top gainers and losers, and leading industry and concept sectors in one call.",
      inputSchema: z.object({}),
      annotations: { ...readOnlyAnnotations, openWorldHint: true },
    },
    () => runTool(() => invokeRest("/api/v1/market/overview")),
  );

  server.registerTool(
    "list_technical_patterns",
    {
      title: "查看 101 种技术形态",
      description:
        "Use this when the user asks which technical patterns are supported, needs the canonical pattern ID or aliases, or wants the quantitative detection description for the 101-pattern catalog.",
      inputSchema: z.object({
        category: z
          .enum(["candlestick", "trend", "chart", "indicator", "volume"])
          .optional()
          .describe("可选分类；不填则返回完整 101 种形态。"),
      }),
      annotations: { ...readOnlyAnnotations, openWorldHint: false },
    },
    ({ category }) => runTool(() => invokeRest("/api/v1/patterns", { category })),
  );

  server.registerTool(
    "resolve_technical_command",
    {
      title: "解析中文技术形态口令",
      description:
        "Use this when the user gives a natural-language Chinese stock-pattern command and you need to resolve its intent, stock code, period, and canonical technical-pattern IDs before analysis or screening.",
      inputSchema: z.object({
        command: z.string().min(1).max(500).describe("例如：今天出现仙人指路形态的股票。"),
      }),
      annotations: { ...readOnlyAnnotations, openWorldHint: false },
    },
    ({ command }) => runTool(() => invokeRest("/api/v1/patterns/resolve", { command })),
  );

  server.registerTool(
    "analyze_stock_patterns",
    {
      title: "分析个股技术形态",
      description:
        "Use this when the user asks whether an A-share stock currently matches named patterns or asks for a full technical-pattern scan. Returns indicator snapshots, matched patterns, confidence, signal time, and evidence.",
      inputSchema: z.object({
        symbol: z.string().min(6).describe("股票代码，如 600519、SH600519、000001.SZ。"),
        patterns: z
          .array(z.string().min(1))
          .max(101)
          .optional()
          .describe("中文名、别名或英文形态 ID；不填则分析全部 101 种。"),
        command: z.string().min(1).max(500).optional().describe("可选自然语言口令。"),
        period: z
          .enum(["5m", "15m", "30m", "60m", "day", "week", "month"])
          .default("day")
          .describe("分析周期。"),
        adjust: z.enum(["none", "forward", "backward"]).default("forward").describe("不复权、前复权或后复权。"),
        history: z.number().int().min(1).max(500).default(250).describe("用于计算的历史 K 线数量。"),
      }),
      annotations: { ...readOnlyAnnotations, openWorldHint: true },
    },
    ({ symbol, patterns, command, period, adjust, history }) => runTool(() => invokeRest(
      "/api/v1/patterns/analyze",
      {
        symbol,
        patterns: patterns?.join(","),
        command,
        period,
        adjust,
        history,
      },
    )),
  );

  const screenInput = z.object({
    patterns: z
      .array(z.string().min(1))
      .min(1)
      .max(12)
      .optional()
      .describe("要筛选的 1 到 12 种中文名、别名或英文形态 ID。"),
    command: z.string().min(1).max(500).optional().describe("也可直接填写中文选股口令。"),
    match: z.enum(["any", "all"]).default("any").describe("任一形态命中或全部形态同时命中。"),
    page: z.number().int().min(1).max(1000).default(1).describe("市场分页页码。"),
    page_size: z.number().int().min(1).max(30).default(20).describe("本页扫描 1 到 30 只股票。"),
    sort: z
      .enum(["change_pct", "amount", "turnover", "volume_ratio"])
      .default("amount")
      .describe("候选股票排序指标。"),
    order: z.enum(["asc", "desc"]).default("desc").describe("候选股票升序或降序。"),
    period: z
      .enum(["5m", "15m", "30m", "60m", "day", "week", "month"])
      .default("day")
      .describe("形态分析周期。"),
    adjust: z.enum(["none", "forward", "backward"]).default("forward").describe("不复权、前复权或后复权。"),
    history: z.number().int().min(1).max(500).default(180).describe("每只股票使用的历史 K 线数量。"),
    exclude_st: z.boolean().default(true).describe("是否排除 ST 和 *ST 股票。"),
    min_amount: z.number().min(0).default(0).describe("最低成交额筛选，单位与行情源返回值一致。"),
  }).refine((value) => (value.patterns?.length ?? 0) > 0 || Boolean(value.command), {
    message: "patterns 或 command 至少填写一项。",
  });

  server.registerTool(
    "screen_stock_patterns",
    {
      title: "按技术形态筛选 A 股",
      description:
        "Use this when the user asks which A-share stocks currently match one or more technical patterns. Each call scans one market page; follow the returned nextPage/page metadata until totalPages for an exhaustive full-market scan.",
      inputSchema: screenInput,
      annotations: { ...readOnlyAnnotations, openWorldHint: true },
    },
    ({ patterns, command, match, page, page_size, sort, order, period, adjust, history, exclude_st, min_amount }) => runTool(
      () => invokeRest("/api/v1/patterns/screen", {
        patterns: patterns?.join(","),
        command,
        match,
        page,
        page_size,
        sort,
        order,
        period,
        adjust,
        history,
        exclude_st,
        min_amount,
      }),
    ),
  );

  return server;
}

export function createAshareMcpHandler(invokeRest: RestInvoker) {
  return createMcpHandler(() => createServer(invokeRest), {
    route: "/mcp",
    onerror(error) {
      console.error(JSON.stringify({
        level: "error",
        component: "mcp",
        message: error.message,
      }));
    },
  });
}
