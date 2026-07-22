# 给其他 AI 工具的项目交接提示词

你现在接手的是一个城市旅游路线规划 MVP。后端主流程已经基本可用，但前端体验不达标，当前页面看起来像测试页/后台工具，缺少旅游产品应有的吸引力、科技感和使用欲望。

请不要只做局部 CSS 微调。你的任务是以“真实可用的 AI 旅游路线规划产品”为目标，重做前端体验。

## 项目定位

产品名称暂定：半日游

用户输入城市、起点、出行时间、交通方式、行程强度、想去的多个地点，系统会：

- 用高德 POI 搜索确认真实地点和坐标
- 用高德路径规划估算真实交通耗时
- 结合天气、偏好、路线顺序、景点信息生成路线
- 用 DeepSeek 生成地点说明、路线解释和注意事项
- 支持注册登录、游客行程绑定、历史行程、分享链接

## 技术栈

前端：

- Next.js App Router
- React
- TypeScript
- CSS 在 `frontend/app/globals.css`

后端：

- Python FastAPI
- 高德 Web 服务 API
- DeepSeek API
- 本地 JSON 存储和 MySQL 存储都已做

## 运行方式

前端：

```powershell
cd frontend
npm install
npm run dev
```

后端：

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8011
```

根目录有 `.env.example` 和 `.env.production.example`。不要使用真实 `.env` 文件，真实 Key 不在交接包里。

## 重要页面和文件

首页：

- `frontend/app/page.tsx`
- `frontend/components/trip-form.tsx`
- `frontend/components/map-preview.tsx`
- `frontend/components/account-panel.tsx`

路线结果页：

- `frontend/components/route-card.tsx`
- `frontend/components/route-timeline.tsx`
- `frontend/components/route-map.tsx`
- `frontend/components/route-editor.tsx`
- `frontend/components/practical-info.tsx`
- `frontend/app/trips/[tripId]/page.tsx`

分享页：

- `frontend/app/share/[shareToken]/page.tsx`

API 客户端：

- `frontend/lib/api.ts`
- `frontend/lib/types.ts`

## 当前前端问题

- 首屏缺少明确的旅游产品吸引力
- 视觉像测试系统，不像用户愿意打开使用的产品
- 地图和路线展示没有形成核心记忆点
- 表单、地图、结果之间的层级关系不够清晰
- 文案偏功能说明，缺少真实用户语言
- 结果页和分享页需要和首页统一风格
- 手机端体验需要重新检查

## 设计目标

请做一个更有产品感、更有科技感、更想让人使用的前端。

方向可以是：

- AI 城市路线驾驶舱
- 城市探索地图
- 智能旅行规划工作台

但不要做成普通后台管理系统，也不要做成空洞的营销落地页。首页第一屏就应该能直接规划路线。

## 必须保留的能力

- 用户可以输入城市、起点、开始时间、结束时间、交通方式、行程强度、想去的地点
- 用户可以搜索/确认候选 POI
- 用户可以生成路线
- 用户可以查看路线顺序、交通耗时、游玩时间、地点说明、风险提示
- 用户可以登录/注册
- 用户可以查看历史行程
- 用户可以分享行程
- 地图必须继续支持高德地图 JS Key；如果没有 Key，要有合理降级展示

## 前端改造要求

### 1. 首页重做

首页不是宣传页，而是“直接可用的规划界面”。

建议结构：

- 顶部：产品名、登录/注册、历史行程
- 左侧：规划表单
- 中间/右侧：真实地图或路线预览
- 辅助区：AI 路线判断、天气/拥堵/排队风险、路线策略说明

### 2. 地图体验增强

- 地图要成为视觉核心
- 标记点要有编号
- 生成路线后要能清楚看到路线顺序
- 地图旁边要显示 AI 为什么这样安排
- 地图不可像装饰图，要像产品核心功能

### 3. 结果页重做

结果页应该让用户一眼知道：

- 总路线是什么
- 第一站到最后一站怎么走
- 每站建议玩多久
- 为什么这个顺序合理
- 哪些地方可能闭馆、排队、天气不适合
- 哪些地点适合亲子、老人、摄影、美食、特种兵玩法

### 4. 分享页重做

分享页应该像一张可以发给朋友看的旅行路线卡，不要像系统详情页。

需要：

- 标题清楚
- 路线顺序清楚
- 地图/时间线清楚
- 注意事项清楚
- 手机端好看

### 5. 交互要求

- 表单必填项要有清楚提示
- 生成路线时要有 loading 状态
- API 失败时要有明确错误提示
- 空状态不能空白
- 手机端不能挤压、遮挡、文字溢出
- 按钮、卡片、标签、地图面板要有统一设计语言

## 不要做的事

- 不要重写后端业务逻辑，除非前端确实需要字段支持
- 不要删除现有 API 能力
- 不要把真实 API Key 写进代码
- 不要只换颜色、加阴影就交付
- 不要做只有宣传文案、不能直接规划路线的首页

## 验收标准

完成后必须运行：

```powershell
cd frontend
npm run build
```

如果修改了后端，必须运行：

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest
```

验收时请提供：

- 首页截图
- 路线结果页截图
- 手机端截图
- 构建/测试结果
- 修改了哪些文件
- 哪些功能保持不变

## 一句话目标

把这个项目从“能跑的路线规划测试页”，升级成“用户看到就愿意输入目的地试一试的 AI 城市旅行规划产品”。
