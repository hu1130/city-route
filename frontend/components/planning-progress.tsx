import { ChinaSearchLoader, mapLoadingStatus } from "./china-search-loader";

export type PlanningStage = "searching" | "routing" | "explaining";

const steps: { key: PlanningStage; label: string; detail: string }[] = [
  { key: "searching", label: "找地点", detail: "确认真实位置" },
  { key: "routing", label: "算路线", detail: "比较时间和顺路程度" },
  { key: "explaining", label: "写建议", detail: "整理取舍理由" },
];

export function PlanningProgress({
  actionLabel,
  city,
  destinationNames,
  stage,
  startName,
  variant = "desktop",
}: {
  actionLabel?: string | null;
  city: string;
  destinationNames: string[];
  stage: PlanningStage;
  startName: string;
  variant?: "desktop" | "mobile";
}) {
  const activeIndex = Math.max(
    0,
    steps.findIndex((step) => step.key === stage),
  );
  const status = planningStatus({ actionLabel, city, destinationNames, stage, startName });

  return (
    <section
      className={`planningProgress ${variant}`}
      aria-label="路线规划进度"
      aria-live={variant === "desktop" ? "polite" : undefined}
    >
      <div className="planningProgressMap">
        <ChinaSearchLoader
          announce={variant === "mobile"}
          compact
          showStatus={variant === "mobile"}
          status={status}
        />
      </div>

      <div className="planningProgressCopy">
        <span>{city || "当前城市"} · {startName || "出发点"}</span>
        <strong>{status}</strong>
        <p>{actionLabel ? "原路线先保留，完成后自动换成新路线" : steps[activeIndex]?.detail ?? "马上给你路线"}</p>
      </div>

      <ol className="planningProgressSteps">
        {steps.map((step, index) => (
          <li
            className={index < activeIndex ? "done" : index === activeIndex ? "active" : ""}
            key={step.key}
          >
            <span>{index + 1}</span>
            <div>
              <strong>{step.label}</strong>
              <small>{step.detail}</small>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function planningStatus({
  actionLabel,
  city,
  destinationNames,
  stage,
  startName,
}: {
  actionLabel?: string | null;
  city: string;
  destinationNames: string[];
  stage: PlanningStage;
  startName: string;
}) {
  if (actionLabel) {
    return `正在${actionLabel}`;
  }
  if (stage === "routing") {
    return `正在比较${destinationNames.length || "各"}个地点的路线`;
  }
  if (stage === "explaining") {
    return `正在整理${city.trim() || "这座城市"}的出发建议`;
  }
  return mapLoadingStatus({ city, destinationNames, locating: !startName.trim() });
}
