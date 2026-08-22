# A 股行情与技术形态 API

部署在 Cloudflare Workers 上的轻量 A 股行情与远程 MCP 服务，适合 ChatGPT、手机应用、网页看板和个人自动化使用。

v1.2 新增公开、免登录、只读的远程 MCP 入口 `/mcp`，可在 ChatGPT 开发者模式中连接为“**A 股行情与技术形态助手**”。它把下列 REST 能力封装为 10 个带输入校验和安全注解的工具，同时保留所有原接口。

v1.1 新增完整技术形态口令系统：101 种可执行判定规则、中文俗称/英文 ID 别名、自然语言口令解析、单股分析和分页市场筛选。每次命中都会返回置信度、信号日期和可复查的触发依据。

## 已实现接口

| 接口 | 用途 |
| --- | --- |
| `GET /health` | 健康检查 |
| `POST /mcp` | ChatGPT 远程 MCP 插件入口（Streamable HTTP） |
| `GET /api/v1/quote?symbol=600519` | 单只股票实时行情 |
| `GET /api/v1/quotes?symbols=600519,000001` | 批量行情，最多 50 只 |
| `GET /api/v1/indices` | 上证、深证、创业板、科创 50、沪深 300 |
| `GET /api/v1/rankings?sort=change_pct&order=desc&limit=20` | 个股排行榜 |
| `GET /api/v1/sectors?type=industry&sort=change_pct&order=desc&limit=20` | 行业/概念板块排行 |
| `GET /api/v1/kline?symbol=600519&period=day&adjust=forward&limit=120` | 日、周、月及分钟 K 线 |
| `GET /api/v1/market/overview` | 指数、涨跌家数、涨跌榜及强势板块 |
| `GET /api/v1/patterns` | 101 种技术形态、别名和判定说明 |
| `GET /api/v1/patterns/resolve?command=...` | 解析自然语言技术形态口令 |
| `GET /api/v1/patterns/analyze?symbol=...` | 分析单只股票最新技术形态 |
| `GET /api/v1/patterns/screen?pattern=...` | 分页扫描市场中的指定形态 |

访问 Worker 根地址 `/` 可获得完整、可点击的接口列表。OpenAPI 文件见 [`openapi.yaml`](./openapi.yaml)。

## 在 ChatGPT 中连接

当前生产 MCP 地址：

```text
https://a-share-api.foul-outfit.workers.dev/mcp
```

在 ChatGPT 网页版中：

1. 打开 `设置 → 安全与登录 → 开发者模式`。
2. 进入 `插件`，点击 `+` 添加远程 MCP。
3. 粘贴上面的完整 `/mcp` 地址；认证方式选择“无认证”。
4. 新建聊天并选择该插件，即可输入“复盘昨天 A 股”“分析 002576 通达动力走势”或“筛选仙人指路”。

该 MCP 仅暴露读取行情与计算技术形态的工具，不包含下单、交易、改仓或写入操作。ChatGPT 开发者模式及连接步骤以 [OpenAI 官方说明](https://developers.openai.com/api/docs/guides/developer-mode) 为准。

### MCP 工具

| 工具 | 用途 |
| --- | --- |
| `get_stock_quotes` | 单只或批量实时行情 |
| `get_market_indices` | 主要 A 股指数 |
| `get_stock_rankings` | 涨跌幅、成交额、换手率、量比排行 |
| `get_sector_rankings` | 行业和概念板块排行 |
| `get_stock_kline` | 分钟、日、周、月 K 线 |
| `get_market_overview` | 最近交易日市场复盘数据 |
| `list_technical_patterns` | 101 种形态目录与别名 |
| `resolve_technical_command` | 中文自然语言形态口令解析 |
| `analyze_stock_patterns` | 单股技术形态分析 |
| `screen_stock_patterns` | 分页技术形态选股 |

## 技术形态口令

共 101 种实际判定规则，不是只有名称的静态列表：

| 分类 | 数量 | 已覆盖形态 |
| --- | ---: | --- |
| K 线与组合 | 38 | 大阳线、大阴线、光头光脚阳/阴线、十字星、蜻蜓/墓碑十字星、纺锤线、锤头线、上吊线、倒锤头、射击之星、看涨/看跌吞没、看涨/看跌孕线、曙光初现、乌云盖顶、平头底/顶、早晨/黄昏之星、红三兵、黑三鸦、好友/淡友反攻、上升/下降三法、三内升/降、向上/向下跳空、向上/向下岛形反转、仙人指路、揉搓线、多方炮、空方炮 |
| 均线与趋势 | 17 | 均线多头/空头排列、均线金叉/死叉、一阳穿三线、出水芙蓉、蛟龙出海、断头铡刀、金蜘蛛、价托、价压、银山谷、金山谷、老鸭头、三线开花、均线支撑反弹、均线压力回落 |
| 图表与突破 | 23 | 20/60 日新高突破、20/60 日新低破位、放量突破、箱体突破/破位、双底、双顶、头肩底、头肩顶、V 形底、倒 V 形顶、圆弧底/顶、上升/下降/对称三角形、上升/下降旗形、下降/上升楔形、杯柄形态 |
| 技术指标 | 17 | MACD 金叉/死叉、MACD 上/下穿零轴、MACD 底/顶背离、KDJ 金叉/死叉、KDJ 低位金叉/高位死叉、RSI 超卖反弹/超买回落、RSI 底/顶背离、突破布林上轨、跌破布林下轨、布林带收口 |
| 量价 | 6 | 量价齐升、价涨量缩背离、缩量回踩、高位放量滞涨、底部放量转强、地量 |

每种形态支持：

- 标准中文名，例如 `仙人指路`、`早晨之星`。
- 常见俗称，例如 `两阳夹一阴` 会解析为 `多方炮`，`阳包阴` 会解析为 `看涨吞没`。
- 英文 ID，例如 `fairy_guide`、`bullish_engulfing`。
- 宽泛口令，例如 `金叉` 会同时解析为均线、MACD 和 KDJ 金叉；`底背离` 会同时解析为 MACD 与 RSI 底背离。

完整别名和每种量化判定说明以 `GET /api/v1/patterns` 返回值为准。

## 直接使用自然语言口令

先解析口令，不请求行情：

```text
GET /api/v1/patterns/resolve?command=今天出现仙人指路形态的股票
GET /api/v1/patterns/resolve?command=分析600519的全部技术形态
GET /api/v1/patterns/resolve?command=筛选早晨之星并且MACD金叉的股票
```

解析结果会返回 `intent`、股票代码、周期、形态 ID 和可直接调用的 `suggestedRequest`。

## 单股技术分析

```text
GET /api/v1/patterns/analyze?symbol=600519&pattern=全部
GET /api/v1/patterns/analyze?symbol=600519&patterns=仙人指路,均线多头排列,放量突破
GET /api/v1/patterns/analyze?command=分析600519是否出现头肩底
```

参数：

- `symbol`：股票代码；也可以直接写在 `command` 中。
- `pattern`：可重复传入；`patterns` 支持逗号分隔；不传时分析全部 101 种。
- `command`：自然语言口令，可代替形态参数并辅助识别股票代码和周期。
- `period`：`5m`、`15m`、`30m`、`60m`、`day`、`week`、`month`，默认 `day`。
- `adjust`：`forward`（前复权）、`backward`（后复权）、`none`（不复权）。
- `history`：用于计算的 K 线数量，默认 250，最大 500。

响应中的 `analysis.matches` 只列出最新一根 K 线确认命中的形态；`insufficientData` 表示历史长度不足的规则；`indicators` 返回 MA、MACD、KDJ、RSI、BOLL、ATR 快照。

## 分页市场筛选

```text
GET /api/v1/patterns/screen?pattern=仙人指路&page=1&page_size=20
GET /api/v1/patterns/screen?patterns=早晨之星,MACD金叉&match=all&page=1
GET /api/v1/patterns/screen?command=今天出现两阳夹一阴的股票&page=1
```

重要规则：

- 单次最多扫描 30 只股票、最多选择 12 种具体形态。
- `match=any` 表示任一形态命中；`match=all` 表示所选形态同时命中。
- 默认按成交额从高到低分页，可用 `sort=change_pct|amount|turnover|volume_ratio` 和 `order=asc|desc` 调整。
- 默认排除名称含 `ST` 或 `*ST` 的股票；可用 `exclude_st=false` 关闭。
- `min_amount` 可设置最低成交额。
- 响应中的 `nextPage` 可继续扫描下一页；遍历至 `totalPages` 才是完整市场覆盖。
- 免费 Workers 每次最多 50 个子请求。本接口限制为 1 次股票列表请求 + 最多 30 次 K 线请求，并将并发连接限制为 6，兼容免费额度。

“今天”指行情源当前返回的最新交易日。周末、节假日或收盘后，请以每个结果的 `signalTime` 为准。

## 其他参数

- 股票代码支持 `600519`、`SH600519`、`600519.SH`、`000001.SZ` 等格式。
- `rankings.sort`：`change_pct`、`amount`、`turnover`、`volume_ratio`。
- `sectors.type`：`industry` 或 `concept`。
- `sectors.sort`：`change_pct`、`main_net_inflow`、`turnover`。
- `order`：`desc` 或 `asc`。

## 本地验证

需要 Node.js 24 或更高版本。

```bash
npm ci
npm run types
npm run check
npm run dev
```

当前测试包含形态目录完整性、自然语言别名解析、K 线组合、均线交叉、突破形态、仙人指路和分页市场筛选。

## 部署

```bash
npx wrangler login
npm run deploy
```

部署成功后，Wrangler 会返回形如 `https://a-share-api.<账号子域>.workers.dev` 的公开地址。

## 配置与资源边界

`wrangler.jsonc` 中有两个非敏感配置：

- `CORS_ORIGIN`：允许访问接口的网页来源，默认为 `*`。
- `UPSTREAM_TIMEOUT_MS`：行情源超时毫秒数，默认为 `8000`。

不要把 API 密钥或其他秘密写进仓库；如未来加入秘密，请使用 `wrangler secret put`。

## 数据与方法说明

- 数据来自东方财富公开网页行情接口，并非带服务等级承诺的官方开放 API，接口字段或可用性可能调整。
- Worker 对实时接口设置 3—10 秒短缓存，日/周/月 K 线和技术分析设置 300 秒缓存。
- 技术形态并无完全统一的行业公式。本项目使用公开、可复查的启发式阈值；响应会给出判定说明、置信度和触发依据。
- 形态命中不代表未来一定上涨或下跌，应结合趋势、成交量、基本面、风险承受能力和正式行情终端交叉验证。
- 行情可能存在延迟，仅供信息参考，不构成投资建议。

## 开发规范

- Cloudflare Workers ES Modules + TypeScript
- 自动生成 Worker 环境类型
- 输入校验、上游超时、统一错误格式、CORS、结构化日志
- 免费 Worker 子请求与并发连接保护
- GitHub Actions 自动执行类型检查、测试和 Wrangler dry-run

## License

MIT
