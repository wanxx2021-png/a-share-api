import { describe, expect, it, vi } from "vitest";
import { handleRequest } from "../src/index";
import type { Fetcher } from "../src/eastmoney";

const env = {
  CORS_ORIGIN: "*",
  UPSTREAM_TIMEOUT_MS: "8000",
} satisfies Env;

describe("worker routes", () => {
  it("serves API documentation", async () => {
    const response = await handleRequest(new Request("https://example.com/"), env);
    const body = await response.json() as { ok: boolean; data: { endpoints: unknown[] } };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.endpoints.length).toBeGreaterThan(10);
  });

  it("serves the complete technical-pattern command catalog", async () => {
    const response = await handleRequest(
      new Request("https://example.com/api/v1/patterns"),
      env,
    );
    const body = await response.json() as {
      ok: boolean;
      data: { total: number; categories: Array<{ count: number }> };
    };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.total).toBe(101);
    expect(body.data.categories.reduce((sum, category) => sum + category.count, 0)).toBe(101);
  });

  it("resolves a natural-language screening command", async () => {
    const response = await handleRequest(
      new Request("https://example.com/api/v1/patterns/resolve?command=%E4%BB%8A%E5%A4%A9%E5%87%BA%E7%8E%B0%E4%BB%99%E4%BA%BA%E6%8C%87%E8%B7%AF%E5%BD%A2%E6%80%81%E7%9A%84%E8%82%A1%E7%A5%A8"),
      env,
    );
    const body = await response.json() as {
      data: { intent: string; patterns: { patternIds: string[] } };
    };

    expect(body.data.intent).toBe("screen");
    expect(body.data.patterns.patternIds).toContain("fairy_guide");
  });

  it("rejects malformed symbols before calling upstream", async () => {
    const fetcher = vi.fn<Fetcher>();
    const response = await handleRequest(
      new Request("https://example.com/api/v1/quote?symbol=bad"),
      env,
      fetcher,
    );
    const body = await response.json() as { error: { code: string } };

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("INVALID_SYMBOL");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("maps a realtime quote into stable field names", async () => {
    const fetcher: Fetcher = vi.fn(async () => new Response(JSON.stringify({
      rc: 0,
      data: {
        f57: "600519",
        f58: "贵州茅台",
        f43: 1500.25,
        f44: 1510,
        f45: 1488,
        f46: 1490,
        f47: 12345,
        f48: 1850000000,
        f60: 1495,
        f86: 1786723200,
        f169: 5.25,
        f170: 0.35,
      },
    }), { headers: { "Content-Type": "application/json" } }));

    const response = await handleRequest(
      new Request("https://example.com/api/v1/quote?symbol=600519"),
      env,
      fetcher,
    );
    const body = await response.json() as {
      ok: boolean;
      data: { symbol: string; name: string; price: number; changePct: number };
    };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data).toMatchObject({
      symbol: "SH600519",
      name: "贵州茅台",
      price: 1500.25,
      changePct: 0.35,
    });
  });

  it("screens one market page for a requested technical pattern", async () => {
    const klineRows = (breakout: boolean) => Array.from({ length: 21 }, (_, index) => {
      const latest = index === 20;
      const close = latest && breakout ? 11 : 10;
      const open = latest && breakout ? 10.4 : 9.9;
      const high = latest && breakout ? 11.2 : 10.5;
      return `2026-01-${String(index + 1).padStart(2, "0")},${open},${close},${high},9.5,100,1000000,5,0,0,1`;
    });
    const fetcher: Fetcher = vi.fn(async (input) => {
      const url = new URL(typeof input === "string" ? input : input.url);
      if (url.pathname.endsWith("/clist/get")) {
        return new Response(JSON.stringify({
          rc: 0,
          data: {
            total: 2,
            diff: [
              { f12: "600001", f13: 1, f14: "测试突破", f2: 11, f6: 100000000 },
              { f12: "000001", f13: 0, f14: "测试横盘", f2: 10, f6: 90000000 },
            ],
          },
        }), { headers: { "Content-Type": "application/json" } });
      }

      const breakout = url.searchParams.get("secid") === "1.600001";
      return new Response(JSON.stringify({
        rc: 0,
        data: {
          code: breakout ? "600001" : "000001",
          name: breakout ? "测试突破" : "测试横盘",
          klines: klineRows(breakout),
        },
      }), { headers: { "Content-Type": "application/json" } });
    });

    const response = await handleRequest(
      new Request("https://example.com/api/v1/patterns/screen?pattern=%E7%AA%81%E7%A0%B420%E6%97%A5%E6%96%B0%E9%AB%98&page_size=2&history=21"),
      env,
      fetcher,
    );
    const body = await response.json() as {
      data: {
        matchedCount: number;
        items: Array<{ stock: { symbol: string }; analysis: { matches: Array<{ id: string }> } }>;
      };
    };

    expect(response.status).toBe(200);
    expect(body.data.matchedCount).toBe(1);
    expect(body.data.items[0]?.stock.symbol).toBe("SH600001");
    expect(body.data.items[0]?.analysis.matches[0]?.id).toBe("breakout_20d_high");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("supports CORS preflight", async () => {
    const response = await handleRequest(
      new Request("https://example.com/api/v1/indices", { method: "OPTIONS" }),
      env,
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});
