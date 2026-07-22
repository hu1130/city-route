"use client";

import { useEffect, useRef, useState } from "react";
import { createTripShare } from "../lib/api";
import type { RouteLeg, RoutePlan, RouteStop } from "../lib/types";

type RouteExporterProps = {
  plan: RoutePlan;
  city: string;
  startName: string;
  startTime: string;
  endTime: string;
};

export function RouteExporter({ plan, city, startName, startTime, endTime }: RouteExporterProps) {
  const previewRef = useRef<HTMLTextAreaElement>(null);
  const [status, setStatus] = useState("文本会随当前选中路线自动更新。");
  const [shareUrl, setShareUrl] = useState("");
  const [creatingShare, setCreatingShare] = useState(false);
  const shareText = buildShareText({ city, endTime, plan, startName, startTime }, shareUrl);

  useEffect(() => {
    setShareUrl("");
  }, [plan.tripId, plan.planId]);

  async function handleCopy() {
    setStatus("正在复制...");
    const copied = (await writeClipboard(shareText)) || copyFromPreview(previewRef.current);
    setStatus(copied ? "已复制，可直接发给同行人。" : "复制失败，可以手动选中文本复制。");
  }

  function handleDownload() {
    const blob = new Blob([shareText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `city-route-${Date.now()}.txt`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setStatus("已生成文本文件。");
  }

  async function handleCopyLink() {
    if (!plan.tripId) {
      setStatus("当前行程还没有保存，暂时不能生成分享链接。");
      return;
    }

    setCreatingShare(true);
    setStatus("正在生成公开分享链接...");
    try {
      const nextShareUrl = shareUrl || buildSharedTripUrl((await createTripShare(plan.tripId)).shareToken);
      setShareUrl(nextShareUrl);
      const copied = await writeClipboard(nextShareUrl);
      setStatus(copied ? "已复制公开分享链接。" : "分享链接已生成，可从预览文本中手动复制。");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "生成分享链接失败。");
    } finally {
      setCreatingShare(false);
    }
  }

  return (
    <section className="routeExportPanel" aria-label="导出行程">
      <div className="routeExportHead">
        <div>
          <p className="eyebrow">保存行程</p>
          <h3>复制给同行人，或下载备用</h3>
        </div>
        <span>{status}</span>
      </div>

      <div className="routeExportActions">
        <button className="primary" data-testid="route-copy-button" onClick={handleCopy} type="button">
          复制行程
        </button>
        <button data-testid="route-copy-link-button" disabled={!plan.tripId || creatingShare} onClick={handleCopyLink} type="button">
          {creatingShare ? "生成中" : "生成分享链接"}
        </button>
        <button data-testid="route-download-button" onClick={handleDownload} type="button">
          下载文本
        </button>
      </div>

      <textarea
        className="routeExportPreview"
        data-testid="route-share-text"
        readOnly
        ref={previewRef}
        rows={8}
        value={shareText}
      />
    </section>
  );
}

function buildShareText({
  plan,
  city,
  startName,
  startTime,
  endTime,
}: RouteExporterProps, shareUrl: string) {
  const lines = [
    `${city}${plan.title}｜${startTime}-${endTime}`,
    `推荐路线：${[startName, ...plan.stops.map((stop) => stop.name)].join(" → ")}`,
    `预计结束：${formatTime(plan.estimatedEndTime)}｜交通 ${plan.travelMinutes} 分钟｜游玩 ${plan.visitMinutes} 分钟`,
    `推荐理由：${plan.insight?.routeReason ?? plan.summary}`,
    `天气提醒：${weatherText(plan)}`,
  ];

  if (plan.qualityNotes.length > 0) {
    lines.push(`排序依据：${plan.qualityNotes.join("、")}`);
  }

  if (plan.insight?.summary) {
    lines.push(`整体说明：${plan.insight.summary}`);
  }

  if (shareUrl) {
    lines.push(`公开分享链接：${shareUrl}`);
  }

  lines.push("", "详细行程：");

  plan.stops.forEach((stop, index) => {
    const leg = plan.legs[index];
    if (leg) {
      lines.push(formatLeg(leg));
    }
    lines.push(...formatStop(stop, index));
  });

  if (plan.insight?.reminders.length) {
    lines.push("", "提醒：", ...plan.insight.reminders.map((item) => `- ${item}`));
  }

  lines.push("", "出发前请再核对景区官方公告，门票、预约和临时闭馆可能变化。");
  return lines.join("\n");
}

function buildSharedTripUrl(shareToken: string) {
  const path = `/share/${encodeURIComponent(shareToken)}`;
  if (typeof window === "undefined") {
    return path;
  }
  return new URL(path, window.location.origin).toString();
}

function formatLeg(leg: RouteLeg) {
  const distanceKm = Math.round((leg.distanceMeters / 1000) * 10) / 10;
  return `- ${leg.fromName} 到 ${leg.toName}：${leg.transportMode}，约 ${leg.durationMinutes} 分钟，${distanceKm} 公里`;
}

function weatherText(plan: RoutePlan) {
  const base = [
    plan.weather.weather || "天气待确认",
    plan.weather.temperature ? `${plan.weather.temperature}℃` : "",
    plan.weather.wind,
  ]
    .filter(Boolean)
    .join("｜");
  const alerts = plan.weather.alerts.length > 0 ? `；${plan.weather.alerts.join("；")}` : "";
  return `${base || "天气待确认"}${alerts}`;
}

function formatStop(stop: RouteStop, index: number) {
  const tips = stop.practicalInfo.tips.slice(0, 2).join("；");
  const lines = [
    `${index + 1}. ${formatTime(stop.arrivalTime)} ${stop.name}`,
    `   停留 ${stop.stayMinutes} 分钟，预计 ${formatTime(stop.departureTime)} 离开。`,
    `   看点：${stop.suggestion}`,
    `   实用信息：营业 ${stop.practicalInfo.openingHours}｜门票 ${stop.practicalInfo.ticket}｜状态 ${stop.practicalInfo.closureStatus}`,
  ];

  if (tips) {
    lines.push(`   注意：${tips}`);
  }

  return lines;
}

function copyFromPreview(textarea: HTMLTextAreaElement | null) {
  if (!textarea) {
    return false;
  }

  try {
    textarea.focus();
    textarea.select();
    return document.execCommand("copy");
  } catch {
    return false;
  }
}

async function writeClipboard(text: string) {
  if (!navigator.clipboard?.writeText || !window.isSecureContext) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 5);
  }

  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}
