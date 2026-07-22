import type { RoutePlan } from "../lib/types";

export function RouteDecisionSummary({
  plan,
  compact = false,
  requestedNames = [],
}: {
  plan: RoutePlan;
  compact?: boolean;
  requestedNames?: string[];
}) {
  const requested = uniqueTexts(requestedNames);
  const stopNames = plan.stops.map((stop) => stop.name);
  const keptRequested = requested.filter((name) => stopNames.some((stopName) => placeNameMatches(stopName, name)));
  const omittedRequested = requested.filter((name) => !keptRequested.includes(name));
  const hasRequestedContext = requested.length > 0;
  const reasons = uniqueTexts([
    ...(plan.decisionNotes ?? []),
    ...(plan.scoreFactors ?? []),
    ...(compact ? [] : plan.qualityNotes ?? []),
  ]).slice(0, compact ? 3 : 8);
  const takeaway = decisionTakeaway(plan, requested, keptRequested, omittedRequested, reasons);

  if (!hasRequestedContext && reasons.length === 0 && !plan.insight?.routeReason) {
    return null;
  }

  return (
    <section className={`routeDecisionSummary ${compact ? "compact" : ""}`} aria-label="路线排序依据">
      <div className="routeDecisionSummaryHead">
        <div>
          <p className="eyebrow">{hasRequestedContext ? "路线取舍" : "为什么这样排"}</p>
          <h3>{hasRequestedContext ? decisionTitle(requested, keptRequested) : plan.title}</h3>
        </div>
        <span>{hasRequestedContext ? `${plan.stops.length} 站` : `${Math.round(plan.score)} 分`}</span>
      </div>
      <p className="routeDecisionTakeaway">{takeaway}</p>
      {omittedRequested.length > 0 && (
        <p className="routeDecisionOmitted">暂不放入：{formatNames(omittedRequested, omittedRequested.length)}</p>
      )}
      {!compact && plan.insight?.routeReason && !hasRequestedContext && <p>{plan.insight.routeReason}</p>}
      {reasons.length > 0 &&
        (compact ? (
          <details className="routeDecisionDetails">
            <summary>查看依据</summary>
            <div className="routeDecisionBullets">
              {reasons.map((reason, index) => (
                <span key={`${reason}-${index}`}>{reason}</span>
              ))}
            </div>
          </details>
        ) : (
          <div className="routeDecisionBullets">
            {reasons.map((reason, index) => (
              <span key={`${reason}-${index}`}>{reason}</span>
            ))}
          </div>
        ))}
    </section>
  );
}

function uniqueTexts(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const text = value.trim();
    if (!text || seen.has(text)) {
      return false;
    }
    seen.add(text);
    return true;
  });
}

function decisionTitle(requested: string[], keptRequested: string[]) {
  if (requested.length === 0) {
    return "路线已排好";
  }
  if (keptRequested.length === requested.length) {
    return `已放入 ${requested.length} 个地点`;
  }
  return `保留 ${keptRequested.length}/${requested.length} 个地点`;
}

function decisionTakeaway(
  plan: RoutePlan,
  requested: string[],
  keptRequested: string[],
  omittedRequested: string[],
  reasons: string[],
) {
  if (requested.length === 0) {
    return plan.insight?.routeReason ?? reasons[0] ?? plan.summary;
  }

  if (omittedRequested.length === 0) {
    return `全部地点已放入路线，按顺路和时间排序。`;
  }

  const keptText = keptRequested.length > 0 ? `先走 ${formatNames(keptRequested, 3)}` : "先保留最顺路的地点";
  return `${keptText}，其余地点放到备选；可切到紧凑路线或延长时间再试。`;
}

function formatNames(names: string[], limit: number) {
  const visibleNames = names.slice(0, limit).join("、");
  const rest = names.length - limit;
  return rest > 0 ? `${visibleNames} 等 ${names.length} 个` : visibleNames;
}

function placeNameMatches(stopName: string, requestedName: string) {
  const stop = normalizePlaceName(stopName);
  const requested = normalizePlaceName(requestedName);
  return stop.includes(requested) || requested.includes(stop);
}

function normalizePlaceName(value: string) {
  return value.trim().replace(/\s+/g, "").toLowerCase();
}
