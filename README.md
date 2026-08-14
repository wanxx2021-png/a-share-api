# A 股行情 API

部署在 Cloudflare Workers 上的轻量 A 股行情接口，返回统一 JSON，适合 ChatGPT、手机应用、网页看板和个人自动化使用。

## 已实现接口

| 接口 | 用途 |
| --- | --- |
| `GET /health` | 健康检查 |
| `GET /api/v1/quote?symbol=600519` | 单只股票实时行情 |
| `GET /api/v1/quotes?symbols=600519,000001` | 批量行情，最多 50 只 |
| `GET /api/v1/indices` | 上证、深证、创业板、科创 50、沪深 300 |
| `GET /api/v1/rankings?sort=change_pct&order=desc&limit=20` | 个股排行榜 |
| `GET /api/v1/sectors?type=industry&sort=change_pct&order=desc&limit=20` | 行业/概念板块排行 |
| `GET /api/v1/kline?symbol=600519&period=day&adjust=forward&limit=120` | 日、周、月及分钟 K 线 |
| `GET /api/v1/market/overview` | 指数、涨跌家数、涨跌榜及强势板块 |

访问 Worker 根地址 `/` 可获得完整的可点击接口列表。

## 参数说明

- 股票代码支持 `600519`、`SH600519`、`600519.SH`、`000001.SZ` 等格式。
- `rankings.sort`：`change_pct`、`amount`、`turnover`、`volume_ratio`。
- `sectors.type`：`industry` 或 `concept`。
- `sectors.sort`：`change_pct`、`main_net_inflow`、`turnover`。
- `order`：`desc` 或 `asc`。
- `period`：`5m`、`15m`、`30m`、`60m`、`day`、`week`、`month`。
- `adjust`：`forward`（前复权）、`backward`（后复权）、`none`（不复权）。

## 本地验证

需要 Node.js 24 或更高版本。

```bash
npm ci
npm run types
npm run check
npm run dev
```

## 部署

```bash
npx wrangler login
npm run deploy
```

部署成功后，Wrangler 会返回形如 `https://a-share-api.<账号子域>.workers.dev` 的公开地址。

## 配置

`wrangler.jsonc` 中有两个非敏感配置：

- `CORS_ORIGIN`：允许访问接口的网页来源，默认为 `*`。
- `UPSTREAM_TIMEOUT_MS`：行情源超时毫秒数，默认为 `8000`。

不要把 API 密钥或其他秘密写进仓库；如未来加入秘密，请使用 `wrangler secret put`。

## 数据说明

- 数据来自东方财富公开网页行情接口，并非带服务等级承诺的官方开放 API，接口字段或可用性可能调整。
- Worker 对实时接口设置了 3–10 秒短缓存，日/周/月 K 线设置了更长缓存，减少对上游的重复请求。
- `market/overview` 的 `breadth.complete` 表示涨跌家数是否覆盖上游返回的全部证券；若为 `false`，请同时查看 `sampleSize`。
- 行情可能存在延迟，仅供信息参考，不构成投资建议；交易前应以交易所或持牌行情终端为准。

## 开发规范

- Cloudflare Workers ES Modules + TypeScript
- 自动生成 Worker 环境类型
- 输入校验、上游超时、统一错误格式、CORS、结构化日志
- GitHub Actions 自动执行类型检查、测试和 Wrangler dry-run

## License

MIT
