"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import type { RouteLeg, RoutePlan } from "../lib/types";

const ARRIVAL_RADIUS_METERS = 180;
const REQUIRED_NEAR_READINGS = 2;

export function RouteNavigator({
  plan,
  variant = "default",
  onReplan,
}: {
  plan: RoutePlan;
  variant?: "default" | "mobile";
  onReplan?: () => void;
}) {
  const storageKey = `city-route:navigator:${plan.tripId ?? "guest"}:${plan.planId}`;
  const [activeIndex, setActiveIndex] = useState(0);
  const [arrivalWatchEnabled, setArrivalWatchEnabled] = useState(false);
  const [arrivalStatus, setArrivalStatus] = useState<"idle" | "watching" | "near" | "unavailable" | "error">("idle");
  const [arrivalMessage, setArrivalMessage] = useState("");
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null);
  const [accuracyMeters, setAccuracyMeters] = useState<number | null>(null);
  const [preflightOpen, setPreflightOpen] = useState(false);
  const [navigationLaunchError, setNavigationLaunchError] = useState("");
  const nearReadingsRef = useRef(0);
  const legs = plan.legs;
  const total = legs.length;
  const finished = total > 0 && activeIndex >= total;
  const currentLeg = finished ? legs[total - 1] : legs[activeIndex];
  const nextLeg = !finished && activeIndex + 1 < total ? legs[activeIndex + 1] : null;
  const targetStop = !finished ? plan.stops[activeIndex] : null;
  const hasTargetLocation =
    Boolean(targetStop) && Number.isFinite(targetStop?.lat) && Number.isFinite(targetStop?.lng);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      const nextIndex = saved ? Number(saved) : 0;
      setActiveIndex(Number.isFinite(nextIndex) ? clampStep(nextIndex, total) : 0);
    } catch {
      setActiveIndex(0);
    }
  }, [storageKey, total]);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, String(activeIndex));
    } catch {
      // Local storage is optional; navigation still works without persistence.
    }
  }, [activeIndex, storageKey]);

  useEffect(() => {
    nearReadingsRef.current = 0;
    setArrivalStatus(arrivalWatchEnabled ? "watching" : "idle");
    setArrivalMessage("");
    setDistanceMeters(null);
    setAccuracyMeters(null);
    setNavigationLaunchError("");
  }, [activeIndex, arrivalWatchEnabled]);

  useEffect(() => {
    if (!arrivalWatchEnabled || finished) {
      return;
    }

    if (!hasTargetLocation || !targetStop) {
      setArrivalStatus("unavailable");
      setArrivalMessage("这一站缺少坐标，暂时不能自动判断是否到达。");
      return;
    }

    if (!("geolocation" in navigator)) {
      setArrivalStatus("unavailable");
      setArrivalMessage("当前浏览器不支持定位，请手动点击“我已到达”。");
      return;
    }

    setArrivalStatus("watching");
    setArrivalMessage(`正在检测你和 ${targetStop.name} 的距离。`);

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const nextDistance = distanceBetweenMeters(
          position.coords.latitude,
          position.coords.longitude,
          Number(targetStop.lat),
          Number(targetStop.lng),
        );
        const nextAccuracy = Number(position.coords.accuracy);
        setDistanceMeters(nextDistance);
        setAccuracyMeters(Number.isFinite(nextAccuracy) ? nextAccuracy : null);

        if (nextDistance <= arrivalRadius(nextAccuracy)) {
          nearReadingsRef.current += 1;
        } else {
          nearReadingsRef.current = 0;
        }

        if (nearReadingsRef.current >= REQUIRED_NEAR_READINGS) {
          setArrivalStatus("near");
          setArrivalMessage(`你已接近 ${targetStop.name}，确认后可以进入下一段。`);
          return;
        }

        setArrivalStatus("watching");
        setArrivalMessage(`距离 ${targetStop.name} 约 ${formatDistance(nextDistance)}。`);
      },
      (error) => {
        nearReadingsRef.current = 0;
        setArrivalStatus(error.code === error.PERMISSION_DENIED ? "unavailable" : "error");
        setArrivalMessage(geolocationMessage(error));
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10_000,
        timeout: 18_000,
      },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [arrivalWatchEnabled, finished, hasTargetLocation, targetStop]);

  const progressPercent = useMemo(() => {
    if (total === 0) return 0;
    return Math.round((Math.min(activeIndex, total) / total) * 100);
  }, [activeIndex, total]);

  if (total === 0 || !currentLeg) {
    return null;
  }

  const navigationChecks = buildNavigationChecks(plan, currentLeg, targetStop);

  function markArrived() {
    setActiveIndex((current) => Math.min(total, current + 1));
    setArrivalWatchEnabled(false);
  }

  function openPreflightCheck() {
    setPreflightOpen(true);
    setNavigationLaunchError("");
  }

  function handleNavigationLaunch(event: MouseEvent<HTMLAnchorElement>) {
    if (!navigator.onLine) {
      event.preventDefault();
      setNavigationLaunchError("当前没有网络，恢复连接后再打开导航。");
      return;
    }
    setNavigationLaunchError("");
  }

  const supportContent = (
    <>
      <div className="routeNavigatorFoot">
        <button disabled={activeIndex <= 0} onClick={() => setActiveIndex((current) => Math.max(0, current - 1))} type="button">
          上一段
        </button>
        <span>{nextLeg ? `下一段：${nextLeg.toName}` : finished ? "路线已完成" : "这是最后一段"}</span>
        <button disabled={activeIndex === 0} onClick={() => setActiveIndex(0)} type="button">
          重置
        </button>
      </div>

      {!finished && (
        <section className={`arrivalWatcher ${arrivalStatus}`} aria-label="半自动到达提醒">
          <div>
            <strong>{arrivalTitle(arrivalStatus, arrivalWatchEnabled)}</strong>
            <span>{arrivalDetail(arrivalMessage, distanceMeters, accuracyMeters)}</span>
          </div>
          {arrivalStatus === "near" ? (
            <button onClick={markArrived} type="button">
              确认到达，进入下一段
            </button>
          ) : (
            <button
              disabled={!hasTargetLocation}
              onClick={() => setArrivalWatchEnabled((current) => !current)}
              type="button"
            >
              {arrivalWatchEnabled ? "关闭提醒" : "开启到达提醒"}
            </button>
          )}
        </section>
      )}
    </>
  );

  return (
    <section className={`routeNavigator ${variant}`} aria-label="路线执行导航">
      <div className="routeNavigatorTop">
        <div>
          <p className="eyebrow">{finished ? "行程完成" : "当前任务"}</p>
          <h3>{finished ? "这条路线已走完" : `去 ${currentLeg.toName}`}</h3>
        </div>
        <span>{finished ? `${total}/${total}` : `${activeIndex + 1}/${total}`}</span>
      </div>

      <div className="routeNavigatorProgress" aria-label={`导航进度 ${progressPercent}%`}>
        <span style={{ width: `${progressPercent}%` }} />
      </div>

      <article className="routeNavigatorTicket">
        <div className="routeNavigatorPlaces">
          <span>{currentLeg.fromName}</span>
          <i aria-hidden="true" />
          <strong>{currentLeg.toName}</strong>
        </div>
        <div className="routeNavigatorMeta">
          <span>{currentLeg.transportMode}</span>
          <span>约 {currentLeg.durationMinutes} 分钟</span>
          <span>{formatDistance(currentLeg.distanceMeters)}</span>
        </div>
        {!finished && (
          <p className="routeNavigatorInstruction">
            从 {currentLeg.fromName} 出发，{currentLeg.transportMode}，预计 {currentLeg.durationMinutes} 分钟到达。
          </p>
        )}
      </article>

      <div className="routeNavigatorActions">
        {!finished ? (
          <>
            <button className="routeNavigatorPrimary" onClick={openPreflightCheck} type="button">
              导航去 {currentLeg.toName}
            </button>
            <button className="routeNavigatorSecondary" onClick={markArrived} type="button">
              我已到达
            </button>
          </>
        ) : (
          <button className="routeNavigatorPrimary" onClick={openPreflightCheck} type="button">
            重开最后一段
          </button>
        )}
      </div>

      {preflightOpen && (
        <section className="navigationPreflight" aria-label="出发前检查">
          <div className="navigationPreflightHead">
            <span>出发前检查</span>
            <strong>{finished ? "重开最后一段前看一眼" : `去 ${currentLeg.toName} 前看一眼`}</strong>
          </div>
          <ul>
            {navigationChecks.map((check) => (
              <li className={check.level} key={check.text}>
                <strong>{check.label}</strong>
                <span>{check.text}</span>
              </li>
            ))}
          </ul>
          <p className="navigationLaunchHint">未安装高德地图时会打开网页导航。</p>
          {navigationLaunchError && (
            <p className="navigationLaunchError" role="status">
              {navigationLaunchError}
            </p>
          )}
          <div className="navigationPreflightActions">
            <a href={currentLeg.navigationUrl} onClick={handleNavigationLaunch} rel="noreferrer" target="_blank">
              继续导航
            </a>
            <button onClick={() => setPreflightOpen(false)} type="button">
              先调整
            </button>
          </div>
        </section>
      )}

      {variant === "mobile" ? (
        <details className="routeNavigatorSupport">
          <summary>下一段与到达提醒</summary>
          {supportContent}
        </details>
      ) : (
        supportContent
      )}

      {variant === "mobile" && (
        <nav className="mobileNavigatorDock" aria-label="路线快捷操作">
          <button onClick={openPreflightCheck} type="button">
            {finished ? "重开" : "导航"}
          </button>
          <button disabled={finished} onClick={markArrived} type="button">
            {finished ? "已完成" : "已到达"}
          </button>
          <button disabled={!onReplan} onClick={onReplan} type="button">
            重排
          </button>
        </nav>
      )}
    </section>
  );
}

function clampStep(value: number, total: number) {
  return Math.max(0, Math.min(total, Math.floor(value)));
}

function formatDistance(value: RouteLeg["distanceMeters"]) {
  if (!Number.isFinite(value) || value <= 0) {
    return "距离待确认";
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)} 公里`;
  }
  return `${Math.round(value)} 米`;
}

function buildNavigationChecks(
  plan: RoutePlan,
  leg: RouteLeg,
  targetStop: RoutePlan["stops"][number] | null,
) {
  const checks: { label: string; level: "ok" | "watch" | "risk"; text: string }[] = [];
  const practical = targetStop?.practicalInfo;
  const practicalText = `${practical?.openingHours ?? ""} ${practical?.ticket ?? ""} ${practical?.closureStatus ?? ""}`;
  const needsAttention =
    targetStop?.riskLevel === "high" ||
    hasAny(practicalText, ["预约", "门票", "闭馆", "暂停", "限流", "实时", "确认"]);

  checks.push({
    label: needsAttention ? "先核对" : "开放",
    level: needsAttention ? "risk" : "ok",
    text: needsAttention
      ? `${targetStop?.name ?? leg.toName} 可能涉及预约、门票或开放变化，出发前看一眼官方信息。`
      : "没有明显开放风险，仍建议到站前留意现场信息。",
  });

  const outdoorRisk = plan.weather.outdoorRisk;
  checks.push({
    label: outdoorRisk === "high" ? "天气" : "天气",
    level: outdoorRisk === "high" ? "risk" : outdoorRisk === "medium" ? "watch" : "ok",
    text:
      outdoorRisk === "high"
        ? `${plan.weather.weather || "天气"} ${plan.weather.temperature || ""}，户外段建议备选室内或打车。`
        : outdoorRisk === "medium"
          ? `${plan.weather.weather || "天气待确认"}，户外停留别排太满。`
          : "天气风险不高，可以按当前路线走。",
  });

  checks.push({
    label: "交通",
    level: leg.durationMinutes >= 35 ? "watch" : "ok",
    text:
      leg.durationMinutes >= 35
        ? `这一段约 ${leg.durationMinutes} 分钟，赶时间可以切到打车或重新规划。`
        : `这一段约 ${leg.durationMinutes} 分钟，${leg.transportMode}。`,
  });

  const arrivalHour = targetStop ? new Date(targetStop.arrivalTime).getHours() : 0;
  checks.push({
    label: arrivalHour >= 20 ? "时间" : "节奏",
    level: arrivalHour >= 20 ? "watch" : "ok",
    text:
      arrivalHour >= 20
        ? "到达时间偏晚，夜间营业和返程交通要提前确认。"
        : "当前节奏正常，到站后可用“我已到达”进入下一段。",
  });

  return checks.slice(0, 4);
}

function arrivalRadius(accuracy: number) {
  if (!Number.isFinite(accuracy)) {
    return ARRIVAL_RADIUS_METERS;
  }
  return Math.max(ARRIVAL_RADIUS_METERS, Math.min(320, accuracy * 0.75));
}

function distanceBetweenMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const radius = 6_371_000;
  const phi1 = toRadians(lat1);
  const phi2 = toRadians(lat2);
  const deltaPhi = toRadians(lat2 - lat1);
  const deltaLambda = toRadians(lng2 - lng1);
  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  return 2 * radius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function arrivalTitle(status: string, enabled: boolean) {
  if (status === "near") return "已接近目的地";
  if (status === "unavailable") return "无法自动检测";
  if (status === "error") return "定位暂时失败";
  if (enabled) return "到达提醒已开启";
  return "半自动到达提醒";
}

function arrivalDetail(message: string, distance: number | null, accuracy: number | null) {
  const accuracyText = Number.isFinite(accuracy) ? `定位精度约 ${formatDistance(Number(accuracy))}。` : "";
  if (message) {
    return `${message}${accuracyText ? ` ${accuracyText}` : ""}`;
  }
  if (Number.isFinite(distance)) {
    return `距离终点约 ${formatDistance(Number(distance))}。${accuracyText}`;
  }
  return "开启后会检测你和当前终点的距离，接近时提醒你确认进入下一段。";
}

function geolocationMessage(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) {
    return "定位权限被拒绝，请允许定位，或手动点击“我已到达”。";
  }
  if (error.code === error.TIMEOUT) {
    return "定位超时，请到开阔位置后重试，或手动点击“我已到达”。";
  }
  return "暂时无法获取当前位置，请手动点击“我已到达”。";
}

function hasAny(text: string, tokens: string[]) {
  return tokens.some((token) => text.includes(token));
}
