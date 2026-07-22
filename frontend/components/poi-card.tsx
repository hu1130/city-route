import type { PoiCandidate } from "../lib/types";
import { PracticalInfoGrid, PracticalTips } from "./practical-info";
import { RiskBadge } from "./risk-badge";

export function PoiCard({ poi }: { poi: PoiCandidate }) {
  return (
    <article className="poiCard">
      <div>
        <h3>{poi.name}</h3>
        <p>{poi.address}</p>
      </div>
      <PracticalInfoGrid info={poi.practicalInfo} />
      <PracticalTips tips={poi.practicalInfo.tips} />
      <div className="chipRow">
        {poi.tags.map((tag, index) => (
          <span className="chip" key={`${tag}-${index}`}>
            {tag}
          </span>
        ))}
        <span className="chip">建议 {poi.suggestedStayMinutes} 分钟</span>
        <RiskBadge level={poi.riskLevel} />
      </div>
    </article>
  );
}
