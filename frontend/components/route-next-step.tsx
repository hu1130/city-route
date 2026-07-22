import type { RoutePlan } from "../lib/types";

export function RouteNextStep({
  plan,
  compact = false,
  onReplan,
}: {
  plan: RoutePlan;
  compact?: boolean;
  onReplan?: () => void;
}) {
  const firstLeg = plan.legs[0];
  const firstStop = plan.stops[0];
  const targetName = firstLeg?.toName ?? firstStop?.name ?? "第一站";
  const travelText = firstLeg ? `约 ${firstLeg.durationMinutes} 分钟` : "先查看路线顺序";
  const transportText = firstLeg?.transportMode ? `，${firstLeg.transportMode}。` : "。";

  return (
    <section className={`routeNextStep ${compact ? "compact" : ""}`} aria-label="下一步">
      <div>
        <span>现在先做</span>
        <strong>去 {targetName}</strong>
        <p>
          {travelText}
          {firstLeg ? transportText : "，再决定是否微调。"}
        </p>
      </div>
      {onReplan && (
        <button onClick={onReplan} type="button">
          调整
        </button>
      )}
    </section>
  );
}
