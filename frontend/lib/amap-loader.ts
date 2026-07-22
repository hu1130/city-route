declare global {
  interface Window {
    AMap?: any;
    __CITY_ROUTE_MAP_DEBUG__?: Record<string, unknown>;
    _AMapSecurityConfig?: {
      serviceHost?: string;
    };
  }
}

let amapPromise: Promise<any> | null = null;

const AMAP_SCRIPT_ID = "city-route-amap-jsapi";
const AMAP_LOAD_TIMEOUT_MS = 15_000;

export function loadAmap(key: string): Promise<any> {
  if (typeof window === "undefined") {
    return Promise.resolve(null);
  }
  if (window.AMap) {
    return Promise.resolve(window.AMap);
  }
  if (amapPromise) {
    return amapPromise;
  }

  const serviceHost = `${window.location.origin}/_AMapService`;
  window._AMapSecurityConfig = { serviceHost };
  window.__CITY_ROUTE_MAP_DEBUG__ = {
    href: window.location.href,
    loadMode: "direct-jsapi",
    serviceHost,
    status: "loading-amap",
  };

  amapPromise = loadAmapScript(key)
    .then((AMap) => {
      window.__CITY_ROUTE_MAP_DEBUG__ = {
        ...window.__CITY_ROUTE_MAP_DEBUG__,
        status: "ready",
      };
      return AMap;
    })
    .catch((error) => {
      amapPromise = null;
      window.__CITY_ROUTE_MAP_DEBUG__ = {
        ...window.__CITY_ROUTE_MAP_DEBUG__,
        reason: error instanceof Error ? error.message : String(error),
        status: "failed",
      };
      throw error;
    });

  return amapPromise;
}

function loadAmapScript(key: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const callbackName = `__cityRouteAmapReady_${Date.now()}`;
    const callbackWindow = window as unknown as Record<string, unknown>;
    const existing = document.getElementById(AMAP_SCRIPT_ID);
    existing?.remove();

    let settled = false;
    const script = document.createElement("script");
    const finish = (error?: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timer);
      delete callbackWindow[callbackName];

      if (error || !window.AMap) {
        script.remove();
        reject(error ?? new Error("地图服务没有返回可用数据"));
        return;
      }
      resolve(window.AMap);
    };

    const timer = window.setTimeout(() => {
      finish(new Error("地图服务响应超时"));
    }, AMAP_LOAD_TIMEOUT_MS);

    callbackWindow[callbackName] = () => finish();
    script.id = AMAP_SCRIPT_ID;
    script.async = true;
    script.charset = "utf-8";
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}&callback=${callbackName}`;
    script.onload = () => {
      if (window.AMap) {
        finish();
      }
    };
    script.onerror = () => finish(new Error("地图脚本加载失败"));
    document.head.appendChild(script);
  });
}
