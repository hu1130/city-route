"use client";

import Link from "next/link";
import { useState } from "react";
import styles from "./experience.module.css";

const routeOptions = {
  recommended: {
    label: "推荐路线",
    note: "地标与街区的平衡解",
    total: "3 小时 46 分",
    travel: "66 分钟",
    finish: "20:46",
    reason: "先逛街区，再顺着城市夜色抵达江边，减少折返，也把外滩留在更好看的时段。",
    stops: [
      { time: "15:10", name: "武康路", detail: "梧桐街区 · 建议停留 70 分钟", status: "适合拍照" },
      { time: "17:05", name: "新天地", detail: "步行与晚餐 · 建议停留 65 分钟", status: "用餐窗口" },
      { time: "18:42", name: "豫园", detail: "老城灯景 · 建议停留 55 分钟", status: "留意闭园" },
      { time: "20:02", name: "外滩", detail: "江景收尾 · 建议停留 44 分钟", status: "夜景时段" },
    ],
  },
  relaxed: {
    label: "轻松路线",
    note: "少走一点，停久一点",
    total: "3 小时 24 分",
    travel: "48 分钟",
    finish: "20:24",
    reason: "减少一个跨区点位，为吃饭、休息和临时停留留出余量，适合亲子、长辈或慢慢逛。",
    stops: [
      { time: "15:18", name: "新天地", detail: "街区漫游 · 建议停留 80 分钟", status: "节奏宽松" },
      { time: "17:12", name: "豫园", detail: "老城与晚餐 · 建议停留 75 分钟", status: "可提前预约" },
      { time: "19:16", name: "外滩", detail: "江边散步 · 建议停留 68 分钟", status: "夜景时段" },
    ],
  },
  compact: {
    label: "紧凑路线",
    note: "多看几个点，控制停留",
    total: "5 小时 36 分",
    travel: "82 分钟",
    finish: "22:36",
    reason: "用更短停留换取更多城市切面，路线更密集，适合时间有限但愿意多走的旅行者。",
    stops: [
      { time: "15:00", name: "上海博物馆", detail: "室内文化 · 建议停留 55 分钟", status: "确认开放" },
      { time: "16:22", name: "新天地", detail: "城市街区 · 建议停留 45 分钟", status: "快速经过" },
      { time: "17:34", name: "豫园", detail: "老城风貌 · 建议停留 50 分钟", status: "留意闭园" },
      { time: "19:02", name: "外滩", detail: "江景拍摄 · 建议停留 55 分钟", status: "夜景时段" },
      { time: "20:28", name: "南京路", detail: "步行与夜宵 · 建议停留 68 分钟", status: "人流较多" },
    ],
  },
} as const;

type RouteMode = keyof typeof routeOptions;

const capabilities = [
  {
    index: "01",
    title: "先把地点找准",
    text: "高德搜索起点和目的地，同名地点逐一确认，不让错误位置毁掉整条路线。",
    meta: "定位 · POI 候选 · 实用信息",
  },
  {
    index: "02",
    title: "不是只给一条答案",
    text: "推荐、轻松、紧凑三种方案同时比较，时间、交通、步行量和风险都说清楚。",
    meta: "三方案 · 天气 · 风险解释",
  },
  {
    index: "03",
    title: "出发后还能调整",
    text: "把地点设为必去、修改停留时间、重排顺序，再按当前状态重新规划。",
    meta: "路线编辑 · 地图 · 导航",
  },
  {
    index: "04",
    title: "同行人拿到同一份计划",
    text: "保存历史、恢复旧路线、复制文本或生成公开只读链接，旅行计划不再散落。",
    meta: "账号 · 历史 · 分享导出",
  },
] as const;

export function ExperiencePreview() {
  const [mode, setMode] = useState<RouteMode>("recommended");
  const route = routeOptions[mode];

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label="此刻路线首页">
          <span className={styles.brandMark} aria-hidden="true">路</span>
          <span>
            <strong>此刻路线</strong>
            <small>城市即时路线规划</small>
          </span>
        </Link>
        <nav className={styles.nav} aria-label="页面导航">
          <a href="#route-sample">路线样片</a>
          <a href="#capabilities">功能地图</a>
          <Link className={styles.navAction} href="/">开始规划</Link>
        </nav>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroGrid} aria-hidden="true" />
        <div className={styles.heroCopy}>
          <p className={styles.kicker}>不是攻略清单，是今天走得完的路线</p>
          <h1>把散落的想去，<br />排成一条走得完的路。</h1>
          <p className={styles.heroIntro}>
            输入城市、时间和几个目的地。此刻路线先确认位置，再把交通、营业风险、天气和你的旅行节奏一起算进去。
          </p>
          <div className={styles.heroActions}>
            <Link className={styles.primaryAction} href="/">规划我的路线 <span aria-hidden="true">→</span></Link>
            <a className={styles.textAction} href="#route-sample">先看路线怎么排</a>
          </div>
          <dl className={styles.heroFacts}>
            <div><dt>输入</dt><dd>城市 · 时间 · 2—6 个地点</dd></div>
            <div><dt>输出</dt><dd>三套路线 · 地图 · 时间轴</dd></div>
            <div><dt>继续</dt><dd>编辑 · 导航 · 分享 · 复用</dd></div>
          </dl>
        </div>

        <section className={styles.routePreview} id="route-sample" aria-labelledby="route-preview-title">
          <div className={styles.previewTopline}>
            <div>
              <span className={styles.demoLabel}>上海 · 项目内置示例</span>
              <h2 id="route-preview-title">人民广场出发</h2>
            </div>
            <span className={styles.liveStatus}><i aria-hidden="true" />路线已生成</span>
          </div>

          <div className={styles.modeTabs} role="tablist" aria-label="路线类型">
            {(Object.keys(routeOptions) as RouteMode[]).map((key) => (
              <button
                aria-controls="route-preview-panel"
                aria-selected={mode === key}
                className={mode === key ? styles.activeTab : ""}
                id={`route-tab-${key}`}
                key={key}
                onClick={() => setMode(key)}
                role="tab"
                type="button"
              >
                <strong>{routeOptions[key].label}</strong>
                <span>{routeOptions[key].note}</span>
              </button>
            ))}
          </div>

          <div
            aria-labelledby={`route-tab-${mode}`}
            className={styles.routePanel}
            id="route-preview-panel"
            role="tabpanel"
          >
            <div className={styles.routeSummary}>
              <div><span>总用时</span><strong>{route.total}</strong></div>
              <div><span>交通</span><strong>{route.travel}</strong></div>
              <div><span>预计结束</span><strong>{route.finish}</strong></div>
            </div>

            <ol className={styles.timeline}>
              {route.stops.map((stop, index) => (
                <li key={`${mode}-${stop.name}`}>
                  <time>{stop.time}</time>
                  <span className={styles.routeNode} aria-hidden="true">{index + 1}</span>
                  <div>
                    <div className={styles.stopTitle}>
                      <strong>{stop.name}</strong>
                      <span>{stop.status}</span>
                    </div>
                    <p>{stop.detail}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className={styles.routeReason}>
              <span>为什么这样排</span>
              <p>{route.reason}</p>
            </div>
          </div>
        </section>
      </section>

      <section className={styles.capabilitySection} id="capabilities" aria-labelledby="capability-title">
        <div className={styles.sectionLead}>
          <p className={styles.sectionIndex}>功能不是堆在菜单里，而是沿着一次旅行自然出现</p>
          <h2 id="capability-title">从“我想去”到“现在出发”</h2>
        </div>
        <div className={styles.capabilityGrid}>
          {capabilities.map((item) => (
            <article key={item.index}>
              <span className={styles.capabilityIndex}>{item.index}</span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
              <small>{item.meta}</small>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.closing}>
        <div>
          <p>城市不会按攻略顺序出现。</p>
          <h2>路线应该跟着时间、位置和你此刻的状态变化。</h2>
        </div>
        <Link className={styles.closingAction} href="/">
          <span>打开正式规划器</span>
          <strong aria-hidden="true">↗</strong>
        </Link>
      </section>

      <footer className={styles.footer}>
        <span>此刻路线 · V1 内测版</span>
        <span>页面内容来自项目现有功能与内置上海测试数据</span>
      </footer>
    </main>
  );
}
