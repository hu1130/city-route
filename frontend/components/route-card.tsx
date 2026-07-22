import type { RoutePlan } from "../lib/types";
import { routePlanTone } from "../lib/route-plan-labels";
import { RiskBadge } from "./risk-badge";

const walkingText = {
  low: "轻松",
  medium: "适中",
  high: "较多",
} as const;

export function RouteCard({
  plan,
  selected,
  onSelect,
}: {
  plan: RoutePlan;
  selected: boolean;
  onSelect: () => void;
}) {
  const decisionNotes = plan.decisionNotes ?? [];
  const scoreFactors = plan.scoreFactors ?? [];
  const tone = routePlanTone(plan);

  return (
    <button className={`routeCard ${selected ? "selected" : ""}`} onClick={onSelect} type="button">
      <div className="routeCardHead">
        <div>
          <span>{selected ? "当前选择" : "备选路线"}</span>
          <h3>{plan.title}</h3>
          <small className="routeCardTagline">
            {tone.label} · {tone.description}
          </small>
        </div>
        <RiskBadge level={plan.riskLevel} />
      </div>
      <p>{plan.summary}</p>
      <div className="metrics">
        <Metric label="全程" value={`${Math.round((plan.totalMinutes / 60) * 10) / 10} 小时`} />
        <Metric label="结束" value={formatTime(plan.estimatedEndTime)} />
        <Metric label="地点" value={`${plan.stops.length} 个`} />
        <Metric label="步行" value={walkingText[plan.walkingLevel]} />
      </div>
      {plan.qualityNotes.length > 0 && (
        <div className="qualityNotes" aria-label="推荐理由">
          {plan.qualityNotes.map((note) => (
            <span key={note}>{note}</span>
          ))}
        </div>
      )}
      {scoreFactors.length > 0 && (
        <div className="scoreFactors" aria-label="路线匹配依据">
          <strong>匹配依据</strong>
          <div>
            {scoreFactors.slice(0, 4).map((factor) => (
              <span key={factor}>{factor}</span>
            ))}
          </div>
        </div>
      )}
      <div className={`weatherStrip ${plan.weather.outdoorRisk}`} aria-label="天气提醒">
        <strong>{weatherTitle(plan)}</strong>
        <span>{plan.weather.alerts[0] ?? "出发前确认最新天气。"}</span>
      </div>
      {decisionNotes.length > 0 && (
        <div className="decisionNotes" aria-label="为什么这样排">
          <strong>为什么这样排</strong>
          <ul>
            {decisionNotes.slice(0, 3).map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      )}
    </button>
  );
}

function weatherTitle(plan: RoutePlan) {
  const weather = plan.weather.weather || "天气待确认";
  const temperature = plan.weather.temperature ? ` ${plan.weather.temperature}℃` : "";
  return `${weather}${temperature}`;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}
