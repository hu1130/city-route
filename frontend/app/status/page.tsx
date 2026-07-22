"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getBackendHealth, getSystemStatus } from "../../lib/api";
import type { ServiceStatus, SystemStatus } from "../../lib/types";

type StatusSnapshot = {
  backend: SystemStatus | null;
  frontendServices: ServiceStatus[];
  health: ServiceStatus;
  checkedAt: string;
};

export default function StatusPage() {
  const [snapshot, setSnapshot] = useState<StatusSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadStatus() {
    setLoading(true);
    setError("");
    const frontendServices = frontendStatus();

    try {
      const [health, backend] = await Promise.all([getBackendHealth(), getSystemStatus()]);
      setSnapshot({
        backend,
        frontendServices,
        health: {
          key: "backend_health",
          label: "后端健康检查",
          status: health.status === "ok" ? "ready" : "error",
          required: true,
          detail: health.status === "ok" ? "后端 /health 返回 ok。" : `后端返回 ${health.status}。`,
        },
        checkedAt: new Date().toISOString(),
      });
    } catch (statusError) {
      setSnapshot({
        backend: null,
        frontendServices,
        health: {
          key: "backend_health",
          label: "后端健康检查",
          status: "error",
          required: true,
          detail: statusError instanceof Error ? statusError.message : "无法连接后端。",
        },
        checkedAt: new Date().toISOString(),
      });
      setError(statusError instanceof Error ? statusError.message : "状态检查失败。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStatus();
  }, []);

  const allServices = useMemo(() => {
    if (!snapshot) {
      return [];
    }
    return [snapshot.health, ...snapshot.frontendServices, ...(snapshot.backend?.services ?? [])];
  }, [snapshot]);

  const blockingCount = allServices.filter((service) => service.required && service.status !== "ready").length;
  const readyCount = allServices.filter((service) => service.status === "ready").length;

  return (
    <>
      <div className="topStrip" aria-hidden="true" />
      <main className="statusShell">
        <header className="brandBar">
          <Link className="brand" href="/">
            <span className="brandMark">路</span>
            <strong>此刻路线</strong>
          </Link>
          <nav className="brandNav" aria-label="页面导航">
            <Link href="/">返回规划</Link>
          </nav>
        </header>

        <section className="statusHero">
          <div>
            <p className="eyebrow">系统状态</p>
            <h1>{blockingCount === 0 ? "关键服务正常" : "有服务需要处理"}</h1>
            <p>
              检查后端、前端代理、高德、DeepSeek、地图 JS 和持久化状态。这里不会显示任何 Key 内容。
            </p>
          </div>
          <div className="statusSummary" aria-label="检查摘要">
            <strong>{loading ? "检查中" : `${readyCount}/${allServices.length}`}</strong>
            <span>{snapshot ? `上次检查 ${formatCheckedTime(snapshot.checkedAt)}` : "等待检查"}</span>
            <button data-testid="status-refresh" disabled={loading} onClick={loadStatus} type="button">
              {loading ? "检查中" : "重新检查"}
            </button>
          </div>
        </section>

        {error && (
          <section className="statusNotice" role="status">
            <strong>后端连接异常</strong>
            <span>{error}</span>
          </section>
        )}

        <section className="statusGrid" aria-label="服务状态列表">
          {allServices.map((service) => (
            <article className={`statusCard ${service.status}`} key={service.key}>
              <div>
                <span className={`statusPill ${service.status}`}>{statusText(service.status)}</span>
                {service.required && <span className="statusRequired">必需</span>}
              </div>
              <h3>{service.label}</h3>
              <p>{service.detail}</p>
            </article>
          ))}
        </section>
      </main>
    </>
  );
}

function frontendStatus(): ServiceStatus[] {
  const amapJsKey = process.env.NEXT_PUBLIC_AMAP_JS_KEY?.trim();
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || "/api/backend";

  return [
    {
      key: "frontend_proxy",
      label: "前端 API 地址",
      status: apiBaseUrl ? "ready" : "missing",
      required: true,
      detail: `当前请求地址：${apiBaseUrl}`,
    },
    {
      key: "amap_js_key",
      label: "高德 JS 地图 Key",
      status: amapJsKey ? "ready" : "missing",
      required: false,
      detail: amapJsKey ? "已配置，用于地图可视化。" : "未配置时会显示本地路线示意图。",
    },
    {
      key: "amap_js_security",
      label: "高德 JS 安全代理",
      status: "ready",
      required: false,
      detail: "地图安全密钥只在服务端代理使用，不在浏览器页面中展示。",
    },
  ];
}

function statusText(status: string) {
  if (status === "ready") {
    return "正常";
  }
  if (status === "missing") {
    return "缺少配置";
  }
  if (status === "disabled") {
    return "已关闭";
  }
  return "异常";
}

function formatCheckedTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
}
