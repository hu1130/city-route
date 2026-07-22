import type { RiskLevel } from "../lib/types";

const riskText: Record<RiskLevel, string> = {
  low: "低风险",
  medium: "需确认",
  high: "高风险",
};

export function RiskBadge({ level }: { level: RiskLevel }) {
  return <span className={`risk ${level}`}>{riskText[level]}</span>;
}
