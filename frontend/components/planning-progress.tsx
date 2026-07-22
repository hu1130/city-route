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
  const visibleStops = destinationNames.slice(0, 4);

  return (
    <section className={`planningProgress ${variant}`} aria-label="路线规划进度" aria-live="polite">
      <div className="planningProgressMap" aria-hidden="true">
        <div className="planningMapGrid" />
        <span className="planningMapPin start">起</span>
        {visibleStops.map((name, index) => (
          <span className={`planningMapPin stop stop${index + 1}`} key={`${name}-${index}`}>
            {index + 1}
          </span>
        ))}
        <span className="planningRouteTrace" />
        <span className="planningMagnifier">
          <i />
        </span>
      </div>

      <div className="planningProgressCopy">
        <span>{city || "当前城市"} · {startName || "出发点"}</span>
        <strong>{actionLabel ? `正在${actionLabel}` : steps[activeIndex]?.label ?? "正在规划"}</strong>
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
