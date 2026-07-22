import type { RoutePlan, RiskLevel } from "../lib/types";
import { PracticalInfoGrid, PracticalTips } from "./practical-info";
import { RiskBadge } from "./risk-badge";
import { RouteDecisionSummary } from "./route-decision-summary";
import { RouteNavigator } from "./route-navigator";

const walkingText: Record<RiskLevel, string> = {
  low: "低",
  medium: "中",
  high: "高",
};

export function RouteTimeline({ plan, showNavigator = true }: { plan: RoutePlan; showNavigator?: boolean }) {
  return (
    <section className="timeline">
      <div className="timelineHead">
        <div>
          <p className="eyebrow">行程时间轴</p>
          <h2>{plan.title}详情</h2>
        </div>
        <span>
          交通 {plan.travelMinutes} 分钟｜游玩 {plan.visitMinutes} 分钟｜步行强度{" "}
          {walkingText[plan.walkingLevel]}
        </span>
      </div>

      {plan.insight && (
        <section className="insightPanel">
          <div className="insightHead">
            <div>
              <p className="eyebrow">行程说明</p>
              <h3>行程说明</h3>
            </div>
            <span className={`insightSource ${plan.insight.source}`}>
              {plan.insight.source === "deepseek" ? "智能建议" : "路线建议"}
            </span>
          </div>
          <p>{plan.insight.summary}</p>
          <p>{plan.insight.routeReason}</p>
          {plan.qualityNotes.length > 0 && (
            <div className="qualityNotes detail" aria-label="推荐依据">
              {plan.qualityNotes.map((note) => (
                <span key={note}>{note}</span>
              ))}
            </div>
          )}
          <div className="reminderList">
            {plan.insight.reminders.map((item, index) => (
              <span key={`${item}-${index}`}>{item}</span>
            ))}
          </div>
        </section>
      )}

      <section className={`weatherPanel ${plan.weather.outdoorRisk}`} aria-label="天气与室内外提醒">
        <div className="weatherPanelHead">
          <div>
            <p className="eyebrow">天气提醒</p>
            <h3>{weatherSummary(plan)}</h3>
          </div>
          <span>{weatherSource(plan.weather.source)}</span>
        </div>
        <div className="weatherAlertList">
          {plan.weather.alerts.map((item, index) => (
            <span key={`${item}-${index}`}>{item}</span>
          ))}
        </div>
      </section>

      {showNavigator && plan.legs.length > 0 && <RouteNavigator plan={plan} />}

      <RouteDecisionSummary plan={plan} />

      <div className="timelineList">
        {plan.stops.map((stop, index) => {
          const leg = plan.legs[index];
          const insight = plan.insight?.stopInsights.find(
            (item) => item.destinationId === stop.destinationId,
          );
          return (
            <div className="timelineItem" key={`${stop.destinationId}-${stop.arrivalTime}`}>
              {leg && (
                <div className="leg">
                  <span>
                    {leg.transportMode}｜{leg.fromName} → {leg.toName}｜{sourceText(leg.source)}约{" "}
                    {leg.durationMinutes} 分钟
                  </span>
                  <a
                    aria-label={`打开高德导航：${leg.fromName} 到 ${leg.toName}`}
                    href={leg.navigationUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    打开高德
                  </a>
                </div>
              )}
              <article className="stop">
                <time>{formatTime(stop.arrivalTime)}</time>
                <div>
                  <h3>{stop.name}</h3>
                  <p>
                    停留 {stop.stayMinutes} 分钟，预计 {formatTime(stop.departureTime)} 离开。
                  </p>
                  <p>{stop.suggestion}</p>
                  <PracticalInfoGrid info={stop.practicalInfo} />
                  <PracticalTips tips={stop.practicalInfo.tips} />
                  {insight && (
                    <div className="stopInsight">
                      <strong>{insight.highlight}</strong>
                      <span>{insight.practicalNote}</span>
                      <span>{insight.riskNote}</span>
                    </div>
                  )}
                  <div className="chipRow">
                    {stop.tags.map((tag, index) => (
                      <span className="chip" key={`${tag}-${index}`}>
                        {tag}
                      </span>
                    ))}
                    <RiskBadge level={stop.riskLevel} />
                  </div>
                </div>
              </article>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function sourceText(source: string) {
  return source === "amap" ? "高德耗时 " : "估算耗时 ";
}

function weatherSummary(plan: RoutePlan) {
  const weather = plan.weather.weather || "天气待确认";
  const temperature = plan.weather.temperature ? `｜${plan.weather.temperature}℃` : "";
  const wind = plan.weather.wind ? `｜${plan.weather.wind}` : "";
  return `${weather}${temperature}${wind}`;
}

function weatherSource(source: string) {
  return source === "amap" ? "高德天气" : "出发前确认";
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}
