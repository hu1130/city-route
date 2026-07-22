import type { RoutePlan } from "./types";

export function routePlanTone(plan: RoutePlan) {
  const signal = `${plan.style} ${plan.title}`.toLowerCase();

  if (signal.includes("relaxed") || signal.includes("轻松") || signal.includes("舒缓")) {
    return {
      label: "少赶场",
      description: "留出缓冲，适合慢走",
    };
  }

  if (signal.includes("compact") || signal.includes("紧凑") || signal.includes("特种")) {
    return {
      label: "多去点",
      description: "站点更多，节奏更快",
    };
  }

  if (plan.walkingLevel === "high" || plan.stops.length >= 5) {
    return {
      label: "更完整",
      description: "覆盖更多地点",
    };
  }

  return {
    label: "更均衡",
    description: "顺路、时间和体力平衡",
  };
}
