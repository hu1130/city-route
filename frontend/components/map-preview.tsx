"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadAmap } from "../lib/amap-loader";

const cityCenters: Record<string, [number, number]> = {
  上海: [121.4737, 31.2304],
  北京: [116.4074, 39.9042],
  杭州: [120.1551, 30.2741],
  成都: [104.0665, 30.5728],
  广州: [113.2644, 23.1291],
  深圳: [114.0579, 22.5431],
  西安: [108.9398, 34.3416],
  南京: [118.7969, 32.0603],
  重庆: [106.5516, 29.563],
  武汉: [114.3054, 30.5931],
};
const countryCenter: [number, number] = [104.1954, 35.8617];

export type MapPreviewFocusPoint = {
  name: string;
  lat: number;
  lng: number;
};

export function MapPreview({
  city,
  focusPoint,
  resizeSignal,
}: {
  city: string;
  focusPoint?: MapPreviewFocusPoint | null;
  resizeSignal?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "fallback">("loading");
  const [statusMessage, setStatusMessage] = useState("");
  const [retryToken, setRetryToken] = useState(0);
  const amapKey = process.env.NEXT_PUBLIC_AMAP_JS_KEY?.trim();
  const center = useMemo<[number, number]>(() => {
    if (focusPoint && Number.isFinite(focusPoint.lng) && Number.isFinite(focusPoint.lat)) {
      return [focusPoint.lng, focusPoint.lat];
    }
    return cityCenters[city.trim()] ?? countryCenter;
  }, [city, focusPoint]);
  const label = focusPoint?.name ? `起点：${focusPoint.name}` : city || "当前城市";
  const loadingTarget = focusPoint?.name || city.trim() || "城市地图";

  useEffect(() => {
    if (!amapKey || !containerRef.current) {
      setStatusMessage("缺少高德 JS Key，请检查 NEXT_PUBLIC_AMAP_JS_KEY。");
      setStatus("fallback");
      return;
    }

    let disposed = false;
    setStatus("loading");
    setStatusMessage("");
    window.__CITY_ROUTE_MAP_DEBUG__ = {
      city,
      focusPoint,
      hasKey: Boolean(amapKey),
      href: window.location.href,
      status: "loading-preview",
    };

    loadAmap(amapKey)
      .then((AMap) => {
        if (disposed || !containerRef.current) {
          return;
        }
        if (!AMap) {
          throw new Error("AMap object missing after loader resolved");
        }

        mapRef.current?.destroy?.();
        const map = new AMap.Map(containerRef.current, {
          center,
          features: ["bg", "road", "building"],
          mapStyle: "amap://styles/fresh",
          resizeEnable: true,
          viewMode: "2D",
          zoom: focusPoint || city.trim() ? 13 : 4,
        });

        if (focusPoint) {
          const marker = new AMap.Marker({
            position: center,
            title: label,
            label: {
              content: `<span class="home-map-label">${escapeHtml(label)}</span>`,
              direction: "top",
            },
          });
          map.add(marker);
        }
        mapRef.current = map;
        window.__CITY_ROUTE_MAP_DEBUG__ = {
          ...window.__CITY_ROUTE_MAP_DEBUG__,
          center,
          status: "ready-preview",
        };
        setStatus("ready");
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        window.__CITY_ROUTE_MAP_DEBUG__ = {
          ...window.__CITY_ROUTE_MAP_DEBUG__,
          reason: message,
          status: "failed-preview",
        };
        setStatusMessage(!navigator.onLine ? "当前没有网络，恢复连接后再加载地图。" : mapLoadMessage(message));
        setStatus("fallback");
      });

    return () => {
      disposed = true;
      mapRef.current?.destroy?.();
      mapRef.current = null;
    };
  }, [amapKey, center, city, focusPoint, label, retryToken]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      mapRef.current?.resize?.();
      mapRef.current?.setCenter?.(center);
    }, 260);
    return () => window.clearTimeout(timer);
  }, [center, resizeSignal]);

  return (
    <>
      <div className="homeMapCanvas" ref={containerRef} />
      {status === "loading" && <MapLoadingScene target={loadingTarget} />}
      {status === "fallback" && (
        <div className="homeMapFallback">
          <div className="homeMapFallbackCard">
            <strong>{label || "城市地图"}</strong>
            <span>{statusMessage || "交互地图暂时没加载出来，请重新加载地图。"}</span>
            <button className="mapRetryButton" onClick={() => setRetryToken((current) => current + 1)} type="button">
              重新加载地图
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function MapLoadingScene({ target }: { target: string }) {
  return (
    <div className="mapLoadingScene" role="status" aria-live="polite">
      <div className="mapLoadingGrid" aria-hidden="true" />
      <span className="mapLoadingRoad roadOne" aria-hidden="true" />
      <span className="mapLoadingRoad roadTwo" aria-hidden="true" />
      <span className="mapLoadingRoad roadThree" aria-hidden="true" />
      <span className="mapLoadingRoute" aria-hidden="true" />
      <span className="mapLoadingPin start" aria-hidden="true">
        起
      </span>
      <span className="mapLoadingPin stop" aria-hidden="true">
        1
      </span>
      <span className="mapLoadingLens" aria-hidden="true">
        <i />
      </span>
      <div className="mapLoadingCopy">
        <strong>正在寻找 {target}</strong>
        <span>
          定位道路与周边地点
          <i className="mapLoadingDots" aria-hidden="true">
            <b />
            <b />
            <b />
          </i>
        </span>
      </div>
    </div>
  );
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function mapLoadMessage(message: string) {
  if (message.includes("超时")) {
    return "地图服务响应较慢，请检查网络后重试。";
  }
  if (message.includes("脚本")) {
    return "手机浏览器没有连上地图服务，请切换网络后重试。";
  }
  return "地图暂时没有加载出来，请重试。";
}
