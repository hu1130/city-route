"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RoutePlan } from "../lib/types";
import { loadAmap } from "../lib/amap-loader";

export type RouteMapPoint = {
  id: string;
  name: string;
  lat: number;
  lng: number;
};

export function RouteMap({
  startPoint,
  stops,
  selectedPlan,
  resizeSignal,
  variant = "panel",
}: {
  startPoint: RouteMapPoint | null;
  stops: RouteMapPoint[];
  selectedPlan: RoutePlan | undefined;
  resizeSignal?: string;
  variant?: "panel" | "stage";
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const fitMapRef = useRef<(() => void) | null>(null);
  const [mapStatus, setMapStatus] = useState<"idle" | "loading" | "ready" | "fallback">("idle");
  const [mapError, setMapError] = useState("");
  const [retryToken, setRetryToken] = useState(0);
  const amapKey = process.env.NEXT_PUBLIC_AMAP_JS_KEY?.trim();
  const points = useMemo(() => uniquePoints(startPoint ? [startPoint, ...stops] : stops), [startPoint, stops]);

  useEffect(() => {
    if (!amapKey || points.length === 0 || !containerRef.current) {
      return;
    }

    let disposed = false;
    let fitTimer: number | undefined;
    setMapStatus("loading");
    setMapError("");
    loadAmap(amapKey)
      .then((AMap) => {
        if (disposed || !containerRef.current) {
          return;
        }
        if (!AMap) {
          setMapError("高德地图对象没有返回。");
          setMapStatus("fallback");
          return;
        }

        mapRef.current?.destroy?.();
        const map = new AMap.Map(containerRef.current, {
          animateEnable: false,
          resizeEnable: false,
          viewMode: "2D",
          zoom: 12,
        });
        const path = points.map((point) => [point.lng, point.lat]);
        const polyline = new AMap.Polyline({
          path,
          strokeColor: "#ff6848",
          strokeOpacity: 0.9,
          strokeWeight: variant === "stage" ? 6 : 5,
          lineJoin: "round",
          lineCap: "round",
        });
        const fitGuard = new AMap.Polyline({
          path: routeFitGuardPath(points),
          strokeOpacity: 0,
          strokeWeight: 0,
        });
        const markers = points.map((point, index) => {
          const display = markerDisplay(point.name, index, variant);
          return new AMap.Marker({
            position: [point.lng, point.lat],
            title: `${index === 0 ? "起点" : `第 ${index} 站`} ${point.name}`,
            content: `<span class="route-map-marker ${markerTone(index)}">${markerLabel(index)}</span>`,
            offset: new AMap.Pixel(-15, -15),
            zIndex: index <= 1 ? 130 : 120 - index,
            label: display.text
              ? {
                  content: `<span class="amap-route-label ${display.className}">${escapeHtml(display.text)}</span>`,
                  direction: markerDirection(index, variant),
                }
              : undefined,
          });
        });

        map.add([fitGuard, polyline, ...markers]);
        const overlays = [fitGuard, polyline, ...markers];
        const fitPadding = variant === "stage" ? [44, 42, 44, 42] : [36, 36, 36, 36];
        const fitRoute = () => map.setFitView(overlays, true, fitPadding, 16);
        fitMapRef.current = fitRoute;
        fitRoute();
        fitTimer = window.setTimeout(() => {
          map.resize?.();
          fitRoute();
        }, 360);
        mapRef.current = map;
        setMapStatus("ready");
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        setMapError(
          !navigator.onLine
            ? "当前没有网络，恢复连接后再加载地图。"
            : message.includes("超时")
              ? "地图服务响应较慢，请检查网络后重试。"
              : "地图暂时没有加载出来，请重试。",
        );
        setMapStatus("fallback");
      });

    return () => {
      disposed = true;
      if (fitTimer !== undefined) {
        window.clearTimeout(fitTimer);
      }
      fitMapRef.current = null;
      mapRef.current?.destroy?.();
      mapRef.current = null;
    };
  }, [amapKey, points, retryToken, variant]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      mapRef.current?.resize?.();
      fitMapRef.current?.();
    }, 260);
    return () => window.clearTimeout(timer);
  }, [resizeSignal]);

  if (points.length === 0) {
    return null;
  }

  return (
    <section className={`routeMapPanel ${variant === "stage" ? "stage" : ""}`} data-testid="route-map" aria-label="路线地图">
      <div className="routeMapHead">
        <div>
          <p className="eyebrow">路线地图</p>
          <h2>路线地图</h2>
        </div>
        <span>{selectedPlan ? selectedPlan.title : "地点预览"}</span>
      </div>

      {amapKey && mapStatus !== "fallback" ? (
        <div className="amapCanvasWrap">
          <div className="amapCanvas" ref={containerRef} />
          {mapStatus === "loading" && <span className="mapStatus">地图加载中</span>}
        </div>
      ) : (
        <RouteMapError
          message={amapKey ? mapError : "缺少高德 JS Key，请检查 NEXT_PUBLIC_AMAP_JS_KEY。"}
          onRetry={() => {
            setMapStatus("idle");
            setRetryToken((current) => current + 1);
          }}
        />
      )}
    </section>
  );
}

function RouteMapError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="routeMapError">
      <strong>地图没有加载成功</strong>
      <span>{message || "请检查手机网络后重试；路线文字仍可继续查看。"}</span>
      <button className="mapRetryButton" onClick={onRetry} type="button">
        重新加载地图
      </button>
    </div>
  );
}

function uniquePoints(points: RouteMapPoint[]) {
  const seen = new Set<string>();
  return points.filter((point) => {
    const key = point.id || `${point.lng},${point.lat}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return Number.isFinite(point.lat) && Number.isFinite(point.lng);
  });
}

function markerLabel(index: number) {
  return index === 0 ? "起" : String(index);
}

function markerDisplay(name: string, index: number, variant: "panel" | "stage") {
  if (variant === "stage") {
    if (index === 0) return { className: "compact start", text: shortPlaceName(name, 6) };
    if (index === 1) return { className: "compact current", text: shortPlaceName(name, 6) };
    return { className: "", text: "" };
  }

  return {
    className: index === 0 ? "start" : index === 1 ? "current" : "",
    text: shortPlaceName(name, 9),
  };
}

function markerTone(index: number) {
  if (index === 0) return "start";
  if (index === 1) return "current";
  return "secondary";
}

function markerDirection(index: number, variant: "panel" | "stage") {
  return variant === "stage"
    ? (["right", "left", "bottom", "top"] as const)[index % 4]
    : (["right", "left", "top", "bottom"] as const)[index % 4];
}

function shortPlaceName(value: string, limit: number) {
  const characters = Array.from(value.trim());
  return characters.length > limit ? `${characters.slice(0, limit).join("")}…` : value.trim();
}

function routeFitGuardPath(points: RouteMapPoint[]) {
  const latitudes = points.map((point) => point.lat);
  const longitudes = points.map((point) => point.lng);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);
  const latPadding = Math.max((maxLat - minLat) * 0.36, 0.0008);
  const lngPadding = Math.max((maxLng - minLng) * 0.44, 0.0008);

  return [
    [minLng - lngPadding, minLat - latPadding],
    [maxLng + lngPadding, maxLat + latPadding],
  ];
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
