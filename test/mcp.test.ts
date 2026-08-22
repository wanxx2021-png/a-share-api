import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Fetcher } from "../src/eastmoney";
import { handleWorkerRequest } from "../src/index";

const env = {
  CORS_ORIGIN: "*",
  UPSTREAM_TIMEOUT_MS: "8000",
} satisfies Env;

const clients: Client[] = [];

function createClient(fetcher: Fetcher = vi.fn<Fetcher>()) {
  const localFetch: typeof fetch = async (input, init) => {
    const request = input instanceof Request
      ? new Request(input, init)
      : new Request(input, init);
    return handleWorkerRequest(request, env, fetcher);
  };
  const transport = new StreamableHTTPClientTransport(
    new URL("https://example.com/mcp"),
    { fetch: localFetch },
  );
  const client = new Client({ name: "a-share-mcp-test", version: "1.0.0" });
  clients.push(client);
  return { client, transport };
}

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close().catch(() => undefined)));
});

describe("remote MCP server", () => {
  it("negotiates the protocol and advertises ten read-only tools", async () => {
    const { client, transport } = createClient();
    await client.connect(transport);

    const { tools } = await client.listTools();

    expect(tools).toHaveLength(10);
    expect(tools.map((tool) => tool.name)).toEqual(expect.arrayContaining([
      "get_stock_quotes",
      "get_market_overview",
      "analyze_stock_patterns",
      "screen_stock_patterns",
    ]));
    for (const tool of tools) {
      expect(tool.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      });
    }
  });

  it("calls a local technical-command tool through Streamable HTTP", async () => {
    const upstream = vi.fn<Fetcher>();
    const { client, transport } = createClient(upstream);
    await client.connect(transport);

    const result = await client.callTool({
      name: "resolve_technical_command",
      arguments: { command: "今天出现仙人指路形态的股票" },
    });
    const structured = result.structuredContent as {
      result: { data: { intent: string; patterns: { patternIds: string[] } } };
    };

    expect(result.isError).not.toBe(true);
    expect(structured.result.data.intent).toBe("screen");
    expect(structured.result.data.patterns.patternIds).toContain("fairy_guide");
    expect(upstream).not.toHaveBeenCalled();
  });

  it("rejects invalid tool arguments before invoking market data", async () => {
    const upstream = vi.fn<Fetcher>();
    const { client, transport } = createClient(upstream);
    await client.connect(transport);

    const result = await client.callTool({
      name: "get_stock_quotes",
      arguments: { symbols: [] },
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({ type: "text" });
    expect(upstream).not.toHaveBeenCalled();
  });

  it("serves MCP CORS preflight separately from the REST API", async () => {
    const response = await handleWorkerRequest(
      new Request("https://a-share-api.foul-outfit.workers.dev/mcp", {
        method: "OPTIONS",
        headers: {
          Host: "a-share-api.foul-outfit.workers.dev",
          Origin: "https://a-share-api.foul-outfit.workers.dev",
        },
      }),
      env,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    expect(response.headers.get("Access-Control-Allow-Headers")).toContain("MCP-Protocol-Version");
  });
});
