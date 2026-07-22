# 此刻路线

城市即时旅行路线规划工具。

## 当前阶段

当前项目已经完成 MVP 验证，并进入 **V1 内测版**：核心路线规划、账号、历史行程、公开分享、移动端体验和生产部署基线均已具备。

当前能力：用户输入城市、当前位置、时间和想去地点后，系统先用高德搜索当前位置和想去地点候选，让用户确认具体地点；确认后前端调用 FastAPI 后端生成推荐 / 轻松 / 紧凑三条路线。POI 搜索优先使用高德 Web 服务；路线交通耗时优先使用高德路径规划 API；候选地点、已选 POI 和路线时间轴会显示营业时间、门票、闭馆风险、热门程度等实用信息。行程与路线会保存到本地 JSON 文件，并在页面显示最近行程；历史行程支持查看恢复已保存路线、编辑复用输入、删除历史。生成路线前，用户可以把目的地设为必去、修改停留分钟、移除本次不去的地点。行程说明可接 DeepSeek。未配置 Key 或外部调用失败时回退到本地结果。
浏览器会自动生成游客身份，行程历史按游客身份隔离；用户也可以用邮箱和密码注册/登录本地账号，登录时会把当前浏览器游客行程绑定到账号。路线卡片会展示“为什么这样排”，说明路线类型、被排除地点和停留时间调整原因。已保存行程可以生成公开只读分享链接，同行人打开链接即可查看路线、地图和时间线。

## 已完成功能

当前已完成：

- POI 搜索，高德优先，mock fallback
- 当前地点解析，高德地理编码优先，mock fallback
- 地点候选确认，支持当前位置和每个想去地点逐项确认
- 每个候选地点显示说明、类型、适合活动、建议停留和注意事项
- 实用信息提醒，包含营业时间、门票、闭馆风险、热门程度和官方确认提示
- 本地 JSON 持久化，服务重启后保留行程和路线
- MySQL 持久化；开发环境不可用时可降级为 JSON，生产环境会停止写入并报告未就绪
- 游客身份隔离，历史行程只显示当前浏览器的行程
- 本地账号注册/登录，支持把游客行程绑定到账号
- 路线质量提醒，包含午饭/晚饭时段、结束时间超时、缓冲时间和过紧节奏提醒
- 路线偏好精细化，老人/亲子/摄影/美食/特种兵等偏好会实际影响停留时间、移动缓冲和候选点位数量
- 路线解释透明化，展示路线排序、删点取舍和停留时间调整原因
- 最近行程展示
- 历史行程查看，可恢复已保存路线
- 历史行程编辑复用，修改后生成新行程
- 历史行程删除，同时删除对应路线
- 公开只读分享链接，别人无需登录即可查看分享行程
- 路线可编辑：目的地必去/可选、自定义停留时间、移除本次目的地
- 路线交通耗时，高德优先，估算 fallback
- FastAPI 后端接口
- 路线算法
- Next.js 前端页面
- 推荐 / 轻松 / 紧凑三条路线
- 启动脚本和端口检查
- 阶段测试报告

当前暂不做：

- 小程序
- 多日行程

## 技术栈

- Frontend: Next.js + React + TypeScript
- Backend: Python + FastAPI
- Storage: 优先使用 MySQL；开发环境可回退到本地 JSON，生产环境禁止自动降级
- AI: V1 接 DeepSeek `deepseek-v4-flash`
- Map: 高德 Web 服务 POI 搜索和路径规划已接入

## 目录结构

```text
city-route-mvp/
  frontend/
    app/
    components/
    lib/
  backend/
    app/
      api/
      core/
      schemas/
      services/
      storage/
      tests/
  scripts/
  docs/
```

## 开发原则

1. 先规划，确认后写代码。
2. 不一次性做完整大项目，只做 MVP。
3. 每完成一个阶段都运行测试并汇报结果。
4. 代码完成后按《AI代码完成后最终测试清单.md》做最终检查。
5. 启动服务前必须检查端口。
6. 启动服务后必须验证前端和后端可访问。

## 环境变量

真实密钥只放在本地 `.env`，不要提交、截图或发到聊天里。

```env
NEXT_PUBLIC_API_BASE_URL=/api/backend
BACKEND_INTERNAL_URL=http://127.0.0.1:8011

AMAP_API_KEY=你的高德Web服务Key
AMAP_BASE_URL=https://restapi.amap.com
CITY_ROUTE_USE_AMAP=true

NEXT_PUBLIC_AMAP_JS_KEY=你的高德Web端JSAPIKey
AMAP_SECURITY_JS_CODE=你的高德JSAPI安全密钥

DEEPSEEK_API_KEY=你的DeepSeek API Key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
CITY_ROUTE_USE_DEEPSEEK=true

CITY_ROUTE_AUTH_SECRET=换成你自己的随机长字符串

CITY_ROUTE_USE_PERSISTENCE=true
CITY_ROUTE_STORAGE_PATH=backend/data/store.json
```

`CITY_ROUTE_USE_AMAP=false` 时强制使用 mock POI，适合排查问题或离线开发。
`CITY_ROUTE_USE_DEEPSEEK=false` 时强制使用本地行程说明，适合排查问题或离线开发。
`CITY_ROUTE_USE_PERSISTENCE=false` 时关闭本地 JSON 持久化，适合自动化测试或临时调试。
`CITY_ROUTE_AUTH_SECRET` 用于签发本地登录 token。正式部署前必须换成随机长字符串，且不要提交到代码仓库。

地图可视化说明：`AMAP_API_KEY` 是后端高德 Web 服务 Key，用于 POI 搜索和路径规划；`NEXT_PUBLIC_AMAP_JS_KEY` 是前端高德 Web端 JS API Key，用于显示真实地图。没有配置 JS API Key 时，页面会显示本地坐标示意图，不影响路线生成。

注意：当前 DeepSeek 用于生成行程解释和风险提醒，不等于实时搜索。当前实用信息优先读取高德 POI 扩展字段，并结合地点名称和类型做低成本风险提醒；它可以识别候选名称中的“暂停开放/闭馆/停业”等信号，但仍不等于官方实时票务或闭馆数据。严格准确的门票、预约、临时闭馆通常需要景区官方、购票平台或商业数据源。

## 本地启动

端口已经固定，不再自动换端口：

- Frontend: `http://127.0.0.1:3000`
- Backend: `http://127.0.0.1:8011`
- Health: `http://127.0.0.1:8011/health`

前端默认走同源代理 `/api/backend`，再由 Next.js 转发到 `http://127.0.0.1:8011`。这样浏览器只需要访问 `3000`，可以减少本机浏览器或插件拦截后端端口的问题。

启动命令：

```powershell
cd C:\Users\HYF05\Documents\Codex\2026-06-11\api\city-route-mvp
.\scripts\dev.ps1
```

脚本会在隐藏 PowerShell 后台窗口启动前后端服务。需要重启时使用 `-StopExisting`。

如果脚本提示 `3000` 或 `8011` 被旧项目进程占用，可以确认这些是旧的本项目开发服务后运行：

```powershell
.\scripts\dev.ps1 -StopExisting
```

不要再手动访问 `3001`、`8012`。以后默认只用 `3000` 和 `8011`。

## 后续阶段

- 已完成：后端 Mock API + 路线算法
- 已完成：前端 MVP 页面
- 已完成：启动脚本与本地冒烟测试
- 已完成：最终测试清单检查
- 已完成：高德 Web 服务 POI 搜索接入
- 已完成：高德路径规划 API 接入，真实交通耗时优先
- 已完成：DeepSeek 行程解释接入，未配置 Key 时本地说明 fallback
- 已完成：高德地理编码接入，当前地点不再固定为人民广场
- 已完成：地点候选确认，避免高德第一条结果被误选
- 已完成：低成本实用信息提醒，展示营业时间、门票、闭馆风险、热门程度和官方确认提示
- 已完成：本地 JSON 持久化和最近行程展示，服务重启后行程不丢
- 已完成：历史行程查看、编辑复用和删除
- 已完成：路线可编辑，支持必去、停留时间和移除本次目的地
- 已完成：路线地图可视化，配置高德 JS API Key 时显示真实地图，未配置时显示本地示意图
- 已完成：路线解释透明化，展示路线排序、删点取舍和停留时间调整原因
- 已完成：本地账号注册/登录，支持游客行程绑定到账号
- 已完成：公开只读分享链接，别人无需登录即可查看分享行程
- 已完成：单机生产部署基线，包括 Docker Compose、HTTPS、自动重启、结构化日志、监控和数据库定时备份
- 后续：部署到实际云服务器后做域名、告警、异地备份和恢复演练，或评估景区官方/票务平台数据源
- 数据库操作说明：见 [docs/database.md](docs/database.md)，常用命令为 `.\scripts\db.ps1 status`、`.\scripts\db.ps1 init`、`.\scripts\db.ps1 migrate-json`。
- 生产运维说明：见 [docs/production-operations.md](docs/production-operations.md)，统一入口为 `.\scripts\prod.ps1`。
