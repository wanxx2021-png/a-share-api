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
    expect(body.data.endpoints.length).toBeGreaterThan(5);
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

  it("supports CORS preflight", async () => {
    const response = await handleRequest(
      new Request("https://example.com/api/v1/indices", { method: "OPTIONS" }),
      env,
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});
