# 《此刻路线》项目规划书 v2

生成日期：2026-06-29  
执行要求：先规划，确认后只实现 MVP；每完成一个阶段必须运行测试并汇报结果；代码完成后按《AI代码完成后最终测试清单.md》做最终检查。  
项目暂名：此刻路线  

## 1. 市场调研

### 1.1 类似产品

#### 地图导航类

代表产品：高德地图、百度地图、Google Maps。

它们擅长 POI 搜索、路径规划、导航和实时交通，但主要解决“从 A 到 B 怎么走”，不擅长解决“今天此时此刻几个目的地先去哪、哪个放弃、哪个晚上去更好”。

参考：

- 高德路径规划 API：https://lbs.amap.com/api/webservice/guide/api/direction
- 高德 POI 搜索 API：https://lbs.amap.com/api/webservice/guide/api/search
- 百度 Direction API：https://lbsyun.baidu.com/docs/webapi?title=directionv2/direction-api-v2

#### 旅行行程规划类

代表产品：Wanderlog。

Wanderlog 支持 itinerary、map view、AI Assistant、route optimization、reservation、budgeting 等，是较接近的海外竞品。

参考：

- Wanderlog：https://wanderlog.com/

#### AI 旅行助手类

代表产品：Google AI Mode、GuideGeek、ChatGPT 类旅行助手。

这类产品擅长自然语言问答和 itinerary 生成，但路线可执行性、真实交通耗时和营业约束需要外部事实数据支撑。

参考：

- Google AI Mode travel plans：https://www.theverge.com/news/822240/google-ai-mode-travel-plans-canvas
- GuideGeek：https://www.guidegeek.com/

#### 攻略/OTA/内容平台

代表产品：携程、马蜂窝、穷游、小红书。

它们强在攻略、酒店、门票、套餐、评价和交易，但临时在城市里做路线取舍时，用户仍然需要自己筛选内容并查地图。

### 1.2 需求判断

该需求真实存在。

原因：

- 用户已经在 Wanderlog 等产品中使用“行程 + 地图 + 路线优化 + AI”的组合能力。
- 高德、百度等地图 API 提供成熟的 POI 和路线能力。
- AI 旅行规划相关研究指出，单靠大模型容易漏约束，混合“大模型 + 规划器/事实数据”的方式更可靠。

参考：

- Roamify：https://arxiv.org/abs/2504.10489
- TRIP-PAL：https://arxiv.org/abs/2406.10196

### 1.3 产品机会

不做大而全旅行平台，也不替代地图导航。

切入点：

> 用户已经到城市里了，现在有几个想去的地方，系统帮他排出今天能实际走的路线。

差异化：

- 此时此刻，而不是长期攻略。
- 多地点排序，而不是两点导航。
- 路线可执行，而不是只生成文字攻略。
- 地图 API 负责事实，路线算法负责决策，大模型负责理解和解释。

## 2. 需求梳理

### 2.1 做什么

做一个城市即时旅行路线规划工具。

用户输入：

- 当前城市
- 当前所在位置
- 当前时间/出发时间
- 最晚结束时间
- 3-6 个想去地点
- 出行方式
- 路线节奏

系统输出：

- 推荐路线
- 轻松路线
- 紧凑路线
- 每站到达/离开时间
- 每段交通耗时
- 每个地点建议停留时间
- 风险提示
- 地图导航跳转

### 2.2 给谁用

第一批用户：

- 临时自由行游客
- 短途/周末游用户
- Citywalk 用户
- 轻攻略用户

### 2.3 解决什么问题

核心问题：

> 用户不是不知道地点在哪，而是不知道“今天此时此刻，先去哪最合理”。

具体问题：

- 地点多，不知道顺序。
- 地图只能两点导航，不会做旅行取舍。
- 攻略太长，不适合临时决策。
- 不知道时间够不够。
- 不知道哪个点适合白天/晚上去。
- 不想自己反复查地图、比路线、算时间。

### 2.4 用户故事

1. 作为一个临时到达城市的游客，我可以输入我现在的位置和想去的几个地点，从而快速得到今天的路线安排。
2. 作为一个只有半天时间的游客，我可以设置最晚结束时间，从而知道哪些地点今天能去完、哪些应该放弃。
3. 作为一个不熟悉城市路线的游客，我可以看到系统推荐的游玩顺序，从而少走回头路。
4. 作为一个怕行程太赶的用户，我可以选择轻松路线，从而减少赶路和体力消耗。
5. 作为一个想多打卡的用户，我可以选择紧凑路线，从而尽量多覆盖想去的地点。
6. 作为一个重视体验的游客，我可以看到每个地点在当前时间段适合看什么，从而知道到这里该做什么。
7. 作为一个担心闭馆或预约问题的用户，我可以看到风险提示，从而提前决定是否替换地点。
8. 作为一个准备出发的用户，我可以点击某一段路线跳转到高德地图导航，从而直接开始执行路线。
9. 作为一个输入模糊地点名称的用户，我可以在系统匹配 POI 后确认具体地点，从而避免规划到错误位置。
10. 作为一个有必去地点的用户，我可以标记某些地点为必去，从而让系统优先保留这些地点。

### 2.5 MVP 范围

MVP 必须做：

- 地点输入
- 当前地点输入
- 时间范围设置
- 出行方式选择
- 路线节奏选择
- Mock POI 匹配
- 目的地停留时间
- 路线生成
- 推荐/轻松/紧凑三方案
- 路线详情时间轴
- 风险提示
- 导航链接
- 后端测试
- 前端构建测试
- 启动脚本和端口检查

MVP 不做：

- 高德真实 API
- DeepSeek 接入
- MySQL 持久化
- 登录
- 分享
- 多城市真实数据
- 可去性实时搜索
- 替换地点
- 小程序

## 3. 技术选型

### 3.1 技术栈

```text
前端：Next.js + React + TypeScript
后端：Python + FastAPI
数据库：MySQL 8.4 LTS / MySQL 8.x，MVP 后期接入
ORM：SQLAlchemy 2.x + Alembic，MVP 后期接入
地图服务：高德地图 API，MVP 后期接入
大模型：DeepSeek API，模型 deepseek-v4-flash，MVP 后期接入
缓存：Redis，MVP 不接
测试：pytest + FastAPI TestClient，前端构建测试，后续 Playwright
```

### 3.2 选择理由

前端选择 Next.js：

- 快速做 H5 MVP。
- 适合交互页面和后续部署。
- TypeScript 减少接口字段错配。

后端选择 FastAPI：

- Python 适合路线算法、API 编排、大模型处理。
- FastAPI 支持类型声明、Pydantic、自动文档。
- 便于写接口测试。

数据库选择 MySQL：

- 用户偏好 MySQL。
- MVP 的行程、地点、路线、缓存数据 MySQL 足够。
- 经纬度先用 `DECIMAL(10,7)`。

DeepSeek：

- 使用 `deepseek-v4-flash`。
- 兼容 OpenAI 格式。
- 只做自然语言解析和路线解释，不直接决定路线顺序。

高德 API：

- MVP 第一阶段不使用真实高德。
- 第二阶段使用免费配额测试。
- 上线或超出配额后再评估购买和商用授权。

## 4. 架构设计

### 4.1 整体架构

```text
用户浏览器
  ↓
Next.js 前端
  ↓
FastAPI 后端
  ↓
业务服务层
  ├─ POI 解析服务
  ├─ 路线规划服务
  ├─ 路线评分服务
  ├─ 导航链接服务
  ├─ 高德地图服务，MVP 后期接入
  └─ DeepSeek 服务，MVP 后期接入
  ↓
MySQL 数据库，MVP 后期接入
```

### 4.2 MVP 第一阶段架构

```text
Next.js 前端
  ↓
FastAPI 后端
  ↓
Mock POI + Mock 路线耗时 + 内存存储 + 路线算法
```

### 4.3 项目目录结构

```text
city-route-mvp/
  frontend/
    app/
      page.tsx
      layout.tsx
      globals.css
    components/
      trip-form.tsx
      poi-card.tsx
      route-card.tsx
      route-timeline.tsx
    lib/
      api.ts
      types.ts
    package.json
    tsconfig.json

  backend/
    app/
      main.py
      api/
        routes/
          poi.py
          trips.py
          routes.py
      core/
        config.py
      schemas/
        poi.py
        trip.py
        route.py
      services/
        poi_resolver.py
        route_planner.py
        route_scoring.py
        navigation_link.py
        amap_service.py
        deepseek_service.py
      storage/
        memory_store.py
      tests/
        test_poi.py
        test_routes.py
    requirements.txt
    pytest.ini

  scripts/
    dev.ps1

  docs/
    project-plan.md
    test-report.md

  .env.example
  .gitignore
  README.md
```

### 4.4 数据库表结构，V1 接入

核心表：

- `trips`
- `trip_destinations`
- `route_plans`
- `route_plan_steps`
- `poi_cache`
- `route_matrix_cache`
- `visit_checks`

关键字段：

- 行程：城市、起点、开始时间、结束时间、出行方式、路线节奏。
- 目的地：来源、POI ID、名称、地址、经纬度、类型、停留时间、风险等级。
- 路线：类型、总耗时、交通时间、游玩时间、预计结束时间、评分、摘要。
- 步骤：交通段或停留点、顺序、时间、距离、导航链接。

### 4.5 核心 API

#### POST /api/poi/search

搜索候选 POI。

#### POST /api/trips

创建行程。

#### POST /api/trips/{tripId}/routes

生成路线。

#### GET /api/route-plans/{planId}

获取路线详情。

#### GET /health

健康检查。

后续接口：

- `POST /api/trips/parse`
- `POST /api/trips/{tripId}/visit-check`
- `POST /api/trips/{tripId}/alternatives`

### 4.6 路线算法

流程：

```text
接收 trip
  ↓
读取 destinations
  ↓
生成交通耗时矩阵
  ↓
枚举地点组合和顺序
  ↓
计算候选路线时间轴
  ↓
按规则评分
  ↓
选推荐/轻松/紧凑三条路线
  ↓
生成导航链接
  ↓
返回前端
```

评分：

```text
时间可行性：30
路线顺路程度：20
最佳游玩时段：15
用户偏好匹配：15
风险低：10
体力友好：10
```

## 5. 风险评估

### 5.1 地图 API 风险

风险：

- POI 模糊匹配错误。
- 多点路线会导致 API 调用量增长。
- 免费配额可能不够长期测试。
- 商用可能需要付费授权。

先验证：

- 上海 20 个地点 POI 搜索准确率。
- 3-6 个地点耗时矩阵速度。
- 高德导航链接可用性。

备用方案：

- MVP 先 mock。
- POI 必须用户确认。
- 高德失败时用直线估算并标记。
- 后续接百度备选。

### 5.2 DeepSeek 风险

风险：

- JSON 输出不稳定。
- 营业时间、闭馆信息可能幻觉。
- API 延迟影响体验。

先验证：

- 20 条自然语言解析。
- 输出 schema 校验。
- 模型失败降级。

备用方案：

- MVP 不依赖 DeepSeek。
- DeepSeek 只解释，不决策。
- 模型失败返回基础路线。

### 5.3 路线算法风险

风险：

- 最短路线不等于体验最好。
- 时间不足时用户仍想全去。
- 三条路线差异不明显。

先验证：

- 5 组真实案例人工判断。
- 时间不足时删点逻辑。
- 夜景点是否排到晚上。

备用方案：

- 用可解释规则。
- 用户可改停留时间。
- 用户可标记必去。
- 三种路线强制不同策略。

### 5.4 启动和环境风险

风险：

- 端口被占用。
- 服务没有稳定启动。
- Windows PowerShell 路径和编码问题。

先验证：

- 启动前检查端口。
- 启动后请求后端 `/health`。
- 启动后请求前端首页 `200`。

备用方案：

- 端口占用自动换端口。
- 用可见终端运行服务。
- 写 `scripts/dev.ps1`。

### 5.5 数据库风险

风险：

- 本机无 MySQL。
- 迁移、时区、编码增加复杂度。

备用方案：

- MVP 先内存存储。
- 后续再接 MySQL。
- 必要时 SQLite 临时过渡。

### 5.6 安全与隐私风险

风险：

- 位置敏感。
- API Key 泄露。
- 日志泄露请求内容。

应对：

- MVP 不做登录和长期轨迹保存。
- Key 只放后端环境变量。
- `.env` 不提交。
- 后端不打印完整敏感请求。

## 6. 验收标准

### 6.1 总体验收

> 页面可打开，用户可输入 3-6 个地点并生成推荐、轻松、紧凑三条路线；后端接口、路线算法、前端构建、启动流程都必须经过测试并通过。

### 6.2 行程输入

- 能输入城市、当前位置、开始时间、结束时间。
- 能选出行方式和路线节奏。
- 能输入 3-6 个目的地。
- 2 个地点、7 个地点、结束时间错误必须提示。
- 提交时有 loading，失败时有错误。

### 6.3 POI 搜索

- 搜索“外滩”返回外滩。
- 搜索“武康路”返回武康路。
- 搜不到地点有错误提示。
- 页面显示匹配地点卡片。

### 6.4 创建行程

- 正常 payload 返回 `tripId`。
- 参数错误返回 4xx。
- 行程保存到内存存储。

### 6.5 路线生成

- 返回推荐、轻松、紧凑三条路线。
- 每条路线有总耗时、交通时间、游玩时间、预计结束时间、风险等级、分数、stops、legs。
- 每个 stop 时间顺序正确。
- 总耗时 = 交通时间 + 游玩时间。
- 三条路线不能完全一样。

### 6.6 后端接口

- `/health` 返回 `ok`。
- POI、创建行程、生成路线、路线详情接口通过测试。
- 不存在的 trip/plan 返回 404。

### 6.7 启动与端口

- 启动前检查端口。
- `3000` 占用时尝试 `3001`。
- `8011` 占用时尝试 `8012`。
- 启动后验证前端 `200`、后端 `ok`。
- 服务在可见终端运行。

### 6.8 构建与质量

- `python -m compileall app` 通过。
- `pytest` 通过。
- `npm run build` 通过。
- 无真实密钥。
- README 完整。

### 6.9 最终检查

代码完成后按《AI代码完成后最终测试清单.md》检查，并输出测试结果。

## 7. 迭代计划与时间估算

### 阶段 0：项目清理与重新初始化

内容：

- 新建 `city-route-mvp/`
- 初始化前后端目录
- 写 `.gitignore`
- 写 `.env.example`
- 写 README 初版
- 设计端口检查脚本

估时：0.5 天

### 阶段 1：后端 Mock API + 路线算法

内容：

- FastAPI
- `/health`
- POI 搜索
- 创建行程
- 生成路线
- 路线详情
- Mock POI
- 内存存储
- 路线算法
- pytest

估时：1-2 天

测试：

- `python -m compileall app`
- `pytest`

### 阶段 2：前端 MVP 页面

内容：

- Next.js 页面
- 表单
- 地点卡
- 路线卡
- 时间轴
- loading/error/empty
- 移动端基础适配

估时：1.5-2.5 天

测试：

- `npm run build`
- 页面主流程测试

### 阶段 3：启动脚本与本地冒烟测试

内容：

- `scripts/dev.ps1`
- 端口检查
- 自动验证前后端
- 输出访问地址

估时：0.5-1 天

测试：

- 端口空闲正常启动。
- 端口占用可换端口或提示。
- 前端 `200`，后端 `ok`。

### 阶段 4：MVP 最终检查

内容：

- 按最终测试清单检查。
- 输出 `docs/test-report.md`。

估时：0.5 天

### MVP 总估时

> 4-6.5 个开发日

### V1

内容：

- 高德 POI
- 高德路径规划
- MySQL
- DeepSeek 路线解释
- DeepSeek 自然语言解析
- 路线保存

估时：8-15 个开发日

### V1.5

内容：

- 地点替换
- 修改停留时间
- 必去地点
- 分享路线
- 移动端优化
- 细分偏好

估时：10-20 个开发日

### V2

内容：

- 微信小程序
- 城市模板路线
- 票务/预约跳转
- 餐饮推荐
- 天气影响
- 百度地图备选
- 数据分析后台
- 账号体系

估时：1-2 个月以上

## 8. 执行约束

1. 规划确认后才开始写代码。
2. 不一次性做完整大项目，只做 MVP。
3. 每完成一个阶段都要运行测试并告诉用户结果。
4. 代码完成后必须按《AI代码完成后最终测试清单.md》做最终检查。
5. 启动服务前必须检查端口。
6. 启动服务后必须验证前端和后端可访问。
7. 不再用一次短暂结果判断服务已稳定运行。

## 9. 最终结论

MVP 目标：

> 使用 mock 数据跑通“输入地点 → 创建行程 → 生成三条路线 → 查看时间轴 → 点击导航链接”的完整闭环。

MVP 技术：

```text
Next.js + React + TypeScript
FastAPI + Python
Mock 数据 + 内存存储
pytest + npm build
dev.ps1 端口检查和启动
```

后续再接：

```text
高德 API
DeepSeek deepseek-v4-flash
MySQL
```

