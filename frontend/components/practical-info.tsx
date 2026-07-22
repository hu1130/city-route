import type { PlacePracticalInfo } from "../lib/types";

export function PracticalInfoGrid({
  info,
  compact = false,
}: {
  info: PlacePracticalInfo;
  compact?: boolean;
}) {
  return (
    <div className={`practicalGrid ${compact ? "compact" : ""}`}>
      <Info label="营业" value={info.openingHours} />
      <Info label="门票" value={info.ticket} />
      <Info label="状态" value={info.closureStatus} />
      <Info label="热度" value={info.popularity} />
    </div>
  );
}

export function PracticalTips({ tips }: { tips: string[] }) {
  if (tips.length === 0) {
    return null;
  }

  return (
    <div className="practicalTips">
      {tips.slice(0, 2).map((tip, index) => (
        <span key={`${tip}-${index}`}>{tip}</span>
      ))}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <strong>{label}</strong>
      {value}
    </span>
  );
}
