"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode, TouchEvent } from "react";
import type { RoutePlan, TripFormValue } from "../lib/types";
import { routePlanTone } from "../lib/route-plan-labels";
import { MapPreview, type MapPreviewFocusPoint } from "./map-preview";
import { PlanningFailure } from "./planning-failure";
import { PlanningProgress, type PlanningStage } from "./planning-progress";
import { RouteMap, type RouteMapPoint } from "./route-map";
import { RouteDecisionSummary } from "./route-decision-summary";
import { RouteNavigator } from "./route-navigator";

type MobilePlannerProps = {
  accountSlot: ReactNode;
  canRetryQuickReplan: boolean;
  candidatesReady: boolean;
  lastRoutePrompt: LastRoutePrompt | null;
  loading: boolean;
  locating: boolean;
  locationAccuracyMeters: number | null;
  mapStops: RouteMapPoint[];
  failureMessage: string;
  message: string;
  names: string[];
  onChange: (next: TripFormValue) => void;
  onContinueLastRoute: () => void;
  onDismissLastRoute: () => void;
  onEditFailure: () => void;
  onQuickReplan: (next: TripFormValue, label: string) => void;
  onRetryQuickReplan: () => void;
  onSelectPlan: (planId: number) => void;
  onSubmit: () => void;
  onUseCurrentLocation: () => void;
  plans: RoutePlan[];
  previewMapPoint: MapPreviewFocusPoint | null;
  planningStage: PlanningStage;
  quickAdjustmentLabel: string | null;
  selectedPlan: RoutePlan | undefined;
  startPoint: RouteMapPoint | null;
  value: TripFormValue;
};

type LastRoutePrompt = {
  city: string;
  nextStopName: string;
  savedLabel: string;
  stopsCount: number;
  summary: string;
};

const transportOptions = [
  { value: "metro", label: "地铁" },
  { value: "taxi", label: "打车" },
  { value: "walk", label: "步行" },
] as const;

const paceOptions = [
  { value: "relaxed", label: "轻松" },
  { value: "balanced", label: "常规" },
  { value: "compact", label: "紧凑" },
] as const;

const styleOptions = [
  { value: "classic", label: "经典" },
  { value: "family", label: "亲子" },
  { value: "senior", label: "老人" },
  { value: "photo", label: "摄影" },
  { value: "food", label: "美食" },
  { value: "intense", label: "特种兵" },
] as const;

export function MobilePlanner({
  accountSlot,
  canRetryQuickReplan,
  candidatesReady,
  lastRoutePrompt,
  loading,
  locating,
  locationAccuracyMeters,
  mapStops,
  failureMessage,
  message,
  names,
  onChange,
  onContinueLastRoute,
  onDismissLastRoute,
  onEditFailure,
  onQuickReplan,
  onRetryQuickReplan,
  onSelectPlan,
  onSubmit,
  onUseCurrentLocation,
  plans,
  previewMapPoint,
  planningStage,
  quickAdjustmentLabel,
  selectedPlan,
  startPoint,
  value,
}: MobilePlannerProps) {
  const [sheetCollapsed, setSheetCollapsed] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const controlSheetRef = useRef<HTMLElement>(null);
  const sheetTouchStartYRef = useRef<number | null>(null);
  const sheetSwipeRef = useRef(false);
  const parsedDestinationNames = parseDestinationNames(value.destinationsText);
  const destinationNames =
    parsedDestinationNames.length > 0 || value.destinationsText.trim().length === 0 ? parsedDestinationNames : names;
  const planMatchesInput = planMatchesDestinationInput(selectedPlan, destinationNames);
  const visibleStops =
    selectedPlan && planMatchesInput
      ? selectedPlan.stops.slice(0, 6).map((stop) => stop.name)
      : destinationNames.slice(0, 6);
  const hasResult = plans.length > 0 && Boolean(selectedPlan);
  const sheetSignal = `${sheetCollapsed ? "collapsed" : "expanded"}-${selectedPlan?.planId ?? "draft"}`;
  const nextStopName = selectedPlan?.stops[0]?.name ?? visibleStops[0] ?? "";
  const canSubmit =
    isOnline &&
    !loading &&
    value.city.trim().length > 0 &&
    value.startLocationName.trim().length > 0 &&
    destinationNames.length >= 2 &&
    destinationNames.length <= 6;

  useEffect(() => {
    const syncConnection = () => setIsOnline(navigator.onLine);
    syncConnection();
    window.addEventListener("online", syncConnection);
    window.addEventListener("offline", syncConnection);
    return () => {
      window.removeEventListener("online", syncConnection);
      window.removeEventListener("offline", syncConnection);
    };
  }, []);

  useEffect(() => {
    if (hasResult) {
      setSheetCollapsed(true);
    }
  }, [hasResult, selectedPlan?.planId]);

  useEffect(() => {
    if (sheetCollapsed) {
      controlSheetRef.current?.scrollTo({ top: 0, left: 0 });
    }
  }, [sheetCollapsed]);

  function update<K extends keyof TripFormValue>(key: K, nextValue: TripFormValue[K]) {
    onChange({ ...value, [key]: nextValue });
  }

  function updateDestinations(nextNames: string[]) {
    update("destinationsText", nextNames.join(", "));
  }

  function removeDestination(indexToRemove: number) {
    updateDestinations(destinationNames.filter((_, index) => index !== indexToRemove));
  }

  function useNow() {
    const start = roundToNextMinutes(new Date(), 5);
    const end = addMinutes(start, 6 * 60);
    onChange({
      ...value,
      departureMode: "now",
      travelDate: formatDateInput(start),
      startTime: formatTimeInput(start),
      endTime: formatTimeInput(end),
    });
  }

  function useScheduled() {
    onChange({
      ...value,
      departureMode: "scheduled",
      travelDate: value.travelDate || formatDateInput(new Date()),
    });
  }

  function openPlannerForReplan() {
    setSheetCollapsed(false);
    window.requestAnimationFrame(() => {
      controlSheetRef.current?.scrollTo({ top: 0, left: 0, behavior: "smooth" });
    });
  }

  function handleSheetTouchStart(event: TouchEvent<HTMLButtonElement>) {
    sheetTouchStartYRef.current = event.touches[0]?.clientY ?? null;
    sheetSwipeRef.current = false;
  }

  function handleSheetTouchEnd(event: TouchEvent<HTMLButtonElement>) {
    const startY = sheetTouchStartYRef.current;
    const endY = event.changedTouches[0]?.clientY;
    sheetTouchStartYRef.current = null;
    if (startY === null || endY === undefined || Math.abs(endY - startY) < 44) {
      return;
    }

    sheetSwipeRef.current = true;
    setSheetCollapsed(endY > startY);
    window.setTimeout(() => {
      sheetSwipeRef.current = false;
    }, 300);
  }

  return (
    <section
      className={`mobilePlannerShell ${sheetCollapsed ? "sheetCollapsed" : "sheetExpanded"} ${hasResult ? "hasResult" : "noResult"}`}
      aria-label="手机路线规划"
    >
      <header className="mobileAppBar">
        <a className="mobileAppBrand" href="#mobile-plan">
          <span>路</span>
          <strong>此刻路线</strong>
        </a>
        <div className="mobileAppTools">
          <span className={`mobileAppStatus ${!isOnline ? "offline" : ""}`}>
            {!isOnline ? "离线" : loading ? "规划中" : hasResult ? "已生成" : "未规划"}
          </span>
          <div className="mobileAccountSlot">{accountSlot}</div>
        </div>
      </header>

      {!isOnline && (
        <div className="mobileOfflineBanner" role="status">
          <strong>网络已断开</strong>
          <span>已填写内容会保留，恢复网络后再规划。</span>
        </div>
      )}

      <section className="mobileMapStage" aria-label="地图预览">
        {hasResult && selectedPlan ? (
          <RouteMap
            resizeSignal={sheetSignal}
            selectedPlan={selectedPlan}
            startPoint={startPoint}
            stops={mapStops}
            variant="stage"
          />
        ) : (
          <MapPreview city={value.city} focusPoint={previewMapPoint} resizeSignal={sheetSignal} />
        )}
        <div className="mobileMapStageOverlay" aria-hidden="true">
          <div>
            <span>{hasResult ? "下一站" : "地图预览"}</span>
            <strong>{hasResult ? nextStopName || "查看路线" : value.startLocationName || "选择起点"}</strong>
            {hasResult && selectedPlan && (
              <small>
                {formatDuration(selectedPlan.totalMinutes)} · {selectedPlan.stops.length} 站
              </small>
            )}
          </div>
          <ol className="mobileRouteTrack">
            <li className="start">起</li>
            {visibleStops.length === 0 ? (
              <li className="empty">待输入</li>
            ) : (
              visibleStops.slice(0, 4).map((name, index) => (
                <li className={`stop ${hasResult && index === 0 ? "next" : ""}`} key={`${name}-${index}`}>
                  {index + 1}
                </li>
              ))
            )}
          </ol>
        </div>
        {loading && (
          <div className="mobilePlanningOverlay">
            <PlanningProgress
              city={value.city}
              destinationNames={destinationNames}
              actionLabel={quickAdjustmentLabel}
              stage={planningStage}
              startName={value.startLocationName}
              variant="mobile"
            />
          </div>
        )}
      </section>

      <form
        className="mobilePlanFlow"
        id="mobile-plan"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <section className="mobileControlSheet" ref={controlSheetRef}>
          <button
            aria-expanded={!sheetCollapsed}
            className="mobileSheetHandle"
            onClick={() => {
              if (!sheetSwipeRef.current) {
                setSheetCollapsed((current) => !current);
              }
            }}
            onTouchEnd={handleSheetTouchEnd}
            onTouchStart={handleSheetTouchStart}
            type="button"
          >
            <span aria-hidden="true" />
            {sheetCollapsed ? "展开输入" : "收起输入"}
          </button>
          <div className="mobileSheetHead">
            <div>
              <span>{hasResult ? "调整路线" : "规划路线"}</span>
              <strong>{hasResult ? selectedPlan?.title ?? "最近路线" : "从哪出发，想去哪"}</strong>
            </div>
            <small>{destinationNames.length}/6</small>
          </div>
          <p className="mobileSheetSummary">
            {value.startLocationName || "选择起点"} · {value.city || "城市"} · {destinationNames.length || 0} 个目的地
          </p>
          <div className="mobileTripPulse" aria-label="当前规划摘要">
            <span>
              <b>起</b>
              {value.startLocationName || "起点"}
            </span>
            <span>
              <b>到</b>
              {destinationNames.length || 0} 地
            </span>
            <span>
              {value.startTime}-{value.endTime}
            </span>
          </div>

          <div className="mobileStartGrid">
            <label className="mobileField start">
              <span>从哪里出发</span>
              <div className="mobileInlineField">
                <input
                  required
                  value={value.startLocationName}
                  onChange={(event) => update("startLocationName", event.target.value)}
                  placeholder="酒店、地铁站、商场"
                />
                <button disabled={loading || locating || !isOnline} onClick={onUseCurrentLocation} type="button">
                  {!isOnline ? "需联网" : locating ? "定位中" : "定位"}
                </button>
              </div>
            </label>

            <label className="mobileField city">
              <span>城市</span>
              <input
                required
                value={value.city}
                onChange={(event) => update("city", event.target.value)}
                placeholder="城市"
              />
            </label>
          </div>

          {!value.startLocationName && (
            <p className="mobileLocationPrompt" aria-live="polite">
              {locating ? "正在请求定位授权，请在浏览器弹窗中选择允许。" : message}
            </p>
          )}

          <label className="mobileField">
            <span>想去的地方</span>
            <textarea
              required
              rows={2}
              value={value.destinationsText}
              onChange={(event) => update("destinationsText", event.target.value)}
              placeholder="例如：武康路、外滩、豫园、新天地"
            />
          </label>

          <div className="mobileDestinationChips" aria-label="已输入目的地">
            {destinationNames.length === 0 ? (
              <span>输入后自动拆成地点</span>
            ) : (
              destinationNames.map((name, index) => (
                <button
                  aria-label={`删除 ${name}`}
                  key={`${name}-${index}`}
                  onClick={() => removeDestination(index)}
                  type="button"
                >
                  {name}
                  <span aria-hidden="true">×</span>
                </button>
              ))
            )}
          </div>

          {destinationNames.length > 0 && (
            <div className="mobileDestinationTools">
              <button className="mobileClearDestinations" onClick={() => updateDestinations([])} type="button">
                清空全部
              </button>
            </div>
          )}

          <p className={`mobileAccuracy ${accuracyLevel(locationAccuracyMeters)}`}>{accuracyHint(locationAccuracyMeters)}</p>

          <div className="mobileModeSwitch" role="group" aria-label="出发时间">
            <button className={value.departureMode === "now" ? "active" : ""} onClick={useNow} type="button">
              现在出发
            </button>
            <button className={value.departureMode === "scheduled" ? "active" : ""} onClick={useScheduled} type="button">
              预约时间
            </button>
          </div>

          <div className="mobileTimeGrid">
            {value.departureMode === "scheduled" && (
              <label className="mobileField date">
                <span>日期</span>
                <input
                  required
                  min={formatDateInput(new Date())}
                  type="date"
                  value={value.travelDate}
                  onChange={(event) => update("travelDate", event.target.value)}
                />
              </label>
            )}
            <label className="mobileField">
              <span>出发</span>
              <input required type="time" value={value.startTime} onChange={(event) => update("startTime", event.target.value)} />
            </label>
            <label className="mobileField">
              <span>结束</span>
              <input required type="time" value={value.endTime} onChange={(event) => update("endTime", event.target.value)} />
            </label>
          </div>

          <details className="mobileSecondaryControls">
            <summary>
              <span>路线偏好</span>
              <strong>
                {transportLabel(value.transportPreference)} · {paceLabel(value.pace)} · {styleLabel(value.travelerStyle)}
              </strong>
            </summary>
            <MobileChoiceGroup
              label="交通"
              onChange={(next) => update("transportPreference", next as TripFormValue["transportPreference"])}
              options={transportOptions}
              value={value.transportPreference}
            />
            <MobileChoiceGroup
              label="强度"
              onChange={(next) => update("pace", next as TripFormValue["pace"])}
              options={paceOptions}
              value={value.pace}
            />
            <MobileChoiceGroup
              label="玩法"
              onChange={(next) => update("travelerStyle", next as TripFormValue["travelerStyle"])}
              options={styleOptions}
              value={value.travelerStyle}
            />
          </details>

          <button className="mobilePrimaryAction" disabled={!canSubmit} type="submit">
            {!isOnline
              ? "等待网络恢复"
              : loading
                ? "正在规划..."
                : destinationNames.length < 2
                  ? "至少填 2 个地点"
                  : destinationNames.length > 6
                    ? "最多填 6 个地点"
                  : candidatesReady
                    ? "生成路线"
                    : "开始规划"}
          </button>
          {!hasResult && lastRoutePrompt && (
            <ContinueRoutePrompt
              prompt={lastRoutePrompt}
              onContinue={onContinueLastRoute}
              onDismiss={onDismissLastRoute}
            />
          )}
          {(loading || failureMessage) && (
            <p className={`mobileMessage ${loading ? "loading" : ""}`} aria-live="polite">
              {message}
            </p>
          )}
          {failureMessage && !loading && (
            <PlanningFailure
              compact
              message={failureMessage}
              onEdit={() => {
                onEditFailure();
                openPlannerForReplan();
              }}
              onRetry={onSubmit}
            />
          )}
        </section>
      </form>

      <section className="mobileDraftStrip" aria-label="路线草稿">
        <div>
          <span>路线草稿</span>
          <strong>{value.startLocationName || "起点"}</strong>
        </div>
        <ol>
          {visibleStops.length === 0 ? (
            <li>输入目的地后生成草稿</li>
          ) : (
            visibleStops.map((name) => <li key={name}>{name}</li>)
          )}
        </ol>
      </section>

      {plans.length > 0 && (
        <section className="mobileResultPanel" id="mobile-routes" aria-label="路线结果">
          <div className="mobileResultHead">
            <span>路线结果</span>
            <strong>{plans.length} 个方案</strong>
          </div>

          {plans.length > 1 && (
            <div className="mobilePlanTabs" aria-label="路线方案">
              {plans.map((plan) => {
                const tone = routePlanTone(plan);
                return (
                  <button
                    className={selectedPlan?.planId === plan.planId ? "active" : ""}
                    key={plan.planId}
                    onClick={() => onSelectPlan(plan.planId)}
                    type="button"
                  >
                    <span>{plan.title}</span>
                    <small>{tone.label}</small>
                  </button>
                );
              })}
            </div>
          )}

          {selectedPlan && (
            <>
              <MobileResultSummary plan={selectedPlan} />
              <RouteNavigator onReplan={openPlannerForReplan} plan={selectedPlan} variant="mobile" />
              <MobileRouteFixes
                canRetry={canRetryQuickReplan}
                destinationNames={destinationNames}
                failureMessage={failureMessage}
                loading={loading}
                onQuickReplan={onQuickReplan}
                onRetry={onRetryQuickReplan}
                onSelectPlan={onSelectPlan}
                plans={plans}
                quickAdjustmentLabel={quickAdjustmentLabel}
                selectedPlan={selectedPlan}
                value={value}
              />
              <details className="mobileResultDisclosure">
                <summary>查看为什么这样排</summary>
                <RouteDecisionSummary compact plan={selectedPlan} requestedNames={destinationNames} />
                <div className="mobileResultMetrics">
                  <MobileMetric label="全程" value={formatDuration(selectedPlan.totalMinutes)} />
                  <MobileMetric label="交通" value={`${selectedPlan.travelMinutes} 分`} />
                  <MobileMetric label="结束" value={formatClock(selectedPlan.estimatedEndTime)} />
                </div>
              </details>
              <details className="mobileResultDisclosure">
                <summary>查看完整时间线</summary>
                <div className="mobileTimelineLite">
                  {selectedPlan.stops.map((stop, index) => (
                    <article key={`${stop.destinationId}-${index}`}>
                      <time>{formatClock(stop.arrivalTime)}</time>
                      <div>
                        <strong>{stop.name}</strong>
                        <span>停留 {stop.stayMinutes} 分钟 · {stop.suggestion}</span>
                      </div>
                    </article>
                  ))}
                </div>
              </details>
            </>
          )}
        </section>
      )}
    </section>
  );
}

function MobileChoiceGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: string; label: string }[];
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <fieldset className="mobileChoiceGroup">
      <legend>{label}</legend>
      <div>
        {options.map((option) => (
          <button
            className={value === option.value ? "active" : ""}
            key={option.value}
            onClick={() => onChange(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function MobileMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function MobileResultSummary({ plan }: { plan: RoutePlan }) {
  const tone = routePlanTone(plan);
  const visibleStops = plan.stops.slice(0, 4);

  return (
    <section className="mobileResultSummary" aria-label="推荐路线概览">
      <div className="mobileResultSummaryHead">
        <div>
          <span>推荐方案</span>
          <strong>{plan.title}</strong>
        </div>
        <small>{tone.label}</small>
      </div>
      <p>{plan.summary}</p>
      <div className="mobileResultSummaryStats">
        <MobileMetric label="总用时" value={formatDuration(plan.totalMinutes)} />
        <MobileMetric label="交通" value={`${plan.travelMinutes} 分`} />
        <MobileMetric label="结束" value={formatClock(plan.estimatedEndTime)} />
      </div>
      <ol className="mobileResultStopLine" aria-label="路线顺序">
        {visibleStops.map((stop, index) => (
          <li key={`${stop.destinationId}-${index}`}>
            <span>{index + 1}</span>
            <strong>{stop.name}</strong>
          </li>
        ))}
        {plan.stops.length > visibleStops.length && <li className="more">+{plan.stops.length - visibleStops.length}</li>}
      </ol>
    </section>
  );
}

function ContinueRoutePrompt({
  prompt,
  onContinue,
  onDismiss,
}: {
  prompt: LastRoutePrompt;
  onContinue: () => void;
  onDismiss: () => void;
}) {
  return (
    <details className="continueRoutePrompt">
      <summary>
        <span>继续上次路线</span>
        <strong>{prompt.city} · 下一站 {prompt.nextStopName}</strong>
      </summary>
      <div className="continueRouteBody">
        <p>{prompt.savedLabel} · {prompt.summary} · {prompt.stopsCount} 站</p>
        <div className="continueRouteActions">
          <button onClick={onContinue} type="button">
            继续路线
          </button>
          <button onClick={onDismiss} type="button">
            不再显示
          </button>
        </div>
      </div>
    </details>
  );
}

function MobileRouteFixes({
  canRetry,
  destinationNames,
  failureMessage,
  loading,
  plans,
  quickAdjustmentLabel,
  selectedPlan,
  value,
  onQuickReplan,
  onRetry,
  onSelectPlan,
}: {
  canRetry: boolean;
  destinationNames: string[];
  failureMessage: string;
  loading: boolean;
  plans: RoutePlan[];
  quickAdjustmentLabel: string | null;
  selectedPlan: RoutePlan;
  value: TripFormValue;
  onQuickReplan: (next: TripFormValue, label: string) => void;
  onRetry: () => void;
  onSelectPlan: (planId: number) => void;
}) {
  const relaxedPlan = findPlanByKind(plans, "relaxed");
  const compactPlan = findPlanByKind(plans, "compact");
  const dropName = suggestedDropName(selectedPlan, destinationNames);
  const canDrop = destinationNames.length > 2 && Boolean(dropName);
  const relaxedApplied = relaxedPlan?.planId === selectedPlan.planId || (!relaxedPlan && value.pace === "relaxed");
  const compactApplied = compactPlan?.planId === selectedPlan.planId || (!compactPlan && value.pace === "compact");
  const taxiApplied = value.transportPreference === "taxi";
  const canExtend = value.endTime !== "23:59";
  const selectedPace = relaxedPlan?.planId === selectedPlan.planId
    ? "relaxed"
    : compactPlan?.planId === selectedPlan.planId
      ? "compact"
      : value.pace;

  function applyPatch(patch: Partial<TripFormValue>, label: string) {
    onQuickReplan({ ...value, pace: selectedPace, ...patch }, label);
  }

  function selectPlanOrReplan(plan: RoutePlan | undefined, patch: Partial<TripFormValue>, label: string) {
    if (plan && plan.planId !== selectedPlan.planId) {
      onSelectPlan(plan.planId);
      return;
    }
    applyPatch(patch, label);
  }

  function removeSuggestedDestination() {
    if (!dropName) {
      return;
    }

    const dropIndex = destinationNames.findIndex((name) => placeNameMatches(name, dropName));
    const nextNames = destinationNames.filter((_, index) => index !== Math.max(0, dropIndex));
    applyPatch({ destinationsText: nextNames.join(", ") }, `去掉“${dropName}”后重新规划`);
  }

  return (
    <section className="mobileRouteFixes" aria-label="快速调整路线">
      <div>
        <span>不满意就这样改</span>
        <strong>一键换思路</strong>
      </div>
      <div className="mobileRouteFixGrid">
        <button
          className={quickAdjustmentLabel === "按轻松节奏重新规划" ? "adjusting" : ""}
          disabled={loading || relaxedApplied}
          onClick={() => selectPlanOrReplan(relaxedPlan, { pace: "relaxed" }, "按轻松节奏重新规划")}
          type="button"
        >
          <span>少走路</span>
          <small>{relaxedApplied ? "当前方案" : relaxedPlan ? "切轻松方案" : "自动重排"}</small>
        </button>
        <button
          className={quickAdjustmentLabel === "按紧凑节奏重新规划" ? "adjusting" : ""}
          disabled={loading || compactApplied}
          onClick={() => selectPlanOrReplan(compactPlan, { pace: "compact" }, "按紧凑节奏重新规划")}
          type="button"
        >
          <span>多去点</span>
          <small>{compactApplied ? "当前方案" : compactPlan ? "切紧凑方案" : "自动重排"}</small>
        </button>
        <button
          className={quickAdjustmentLabel === "改成打车路线" ? "adjusting" : ""}
          disabled={loading || taxiApplied}
          onClick={() => applyPatch({ transportPreference: "taxi" }, "改成打车路线")}
          type="button"
        >
          <span>换打车</span>
          <small>{taxiApplied ? "当前已是打车" : "自动重排"}</small>
        </button>
        <button
          className={quickAdjustmentLabel === "延长 1 小时重新规划" ? "adjusting" : ""}
          disabled={loading || !canExtend}
          onClick={() => applyPatch({ endTime: addMinutesToTime(value.endTime, 60) }, "延长 1 小时重新规划")}
          type="button"
        >
          <span>延长 1 小时</span>
          <small>{canExtend ? "自动重排" : "已到当天最晚"}</small>
        </button>
        {canDrop && (
          <button
            className={quickAdjustmentLabel?.startsWith("去掉") ? "adjusting" : ""}
            disabled={loading}
            onClick={removeSuggestedDestination}
            type="button"
          >
            <span>去掉难排点</span>
            <small>{dropName}</small>
          </button>
        )}
      </div>
      {canRetry && failureMessage && !loading && (
        <div className="mobileRouteFixError" role="alert">
          <span>
            <strong>调整未完成，原路线还在</strong>
            <small>{failureMessage}</small>
          </span>
          <button onClick={onRetry} type="button">
            重试
          </button>
        </div>
      )}
    </section>
  );
}

function parseDestinationNames(text: string): string[] {
  return text
    .split(/[，,、；;\n\r]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function planMatchesDestinationInput(plan: RoutePlan | undefined, destinationNames: string[]) {
  if (!plan || destinationNames.length === 0 || plan.stops.length !== destinationNames.length) {
    return false;
  }

  const stopNames = plan.stops.map((stop) => normalizePlaceName(stop.name));
  return destinationNames
    .map((name) => normalizePlaceName(name))
    .every((name) => stopNames.some((stopName) => stopName.includes(name) || name.includes(stopName)));
}

function normalizePlaceName(value: string) {
  return value.trim().replace(/\s+/g, "").toLowerCase();
}

function findPlanByKind(plans: RoutePlan[], kind: "relaxed" | "compact") {
  return plans.find((plan) => {
    const tone = routePlanTone(plan);
    const signal = `${plan.style} ${plan.title} ${tone.label}`.toLowerCase();
    if (kind === "relaxed") {
      return signal.includes("relaxed") || signal.includes("轻松") || signal.includes("少赶场");
    }
    return signal.includes("compact") || signal.includes("紧凑") || signal.includes("多去点");
  });
}

function suggestedDropName(plan: RoutePlan, destinationNames: string[]) {
  if (destinationNames.length <= 2) {
    return "";
  }

  const stopNames = plan.stops.map((stop) => stop.name);
  const omitted = destinationNames.find((name) => !stopNames.some((stopName) => placeNameMatches(stopName, name)));
  return omitted ?? destinationNames[destinationNames.length - 1] ?? "";
}

function placeNameMatches(left: string, right: string) {
  const normalizedLeft = normalizePlaceName(left);
  const normalizedRight = normalizePlaceName(right);
  return normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft);
}

function addMinutesToTime(value: string, minutes: number) {
  const [hourText, minuteText] = value.split(":");
  const hours = Number(hourText);
  const currentMinutes = Number(minuteText);

  if (!Number.isFinite(hours) || !Number.isFinite(currentMinutes)) {
    return value;
  }

  const total = Math.min(23 * 60 + 59, Math.max(0, hours * 60 + currentMinutes + minutes));
  const safeTotal = total;
  const nextHours = Math.floor(safeTotal / 60);
  const nextMinutes = safeTotal % 60;
  return `${String(nextHours).padStart(2, "0")}:${String(nextMinutes).padStart(2, "0")}`;
}

function accuracyHint(accuracy: number | null) {
  if (!Number.isFinite(accuracy)) {
    return "定位只用于填起点。不准时直接改成酒店、地铁站或商场。";
  }
  if (Number(accuracy) <= 200) {
    return `定位精度约 ${formatAccuracy(Number(accuracy))}，可以直接用。`;
  }
  if (Number(accuracy) <= 1000) {
    return `定位精度约 ${formatAccuracy(Number(accuracy))}，建议核对起点。`;
  }
  return `定位精度约 ${formatAccuracy(Number(accuracy))}，建议手动输入更准确的起点。`;
}

function accuracyLevel(accuracy: number | null) {
  if (!Number.isFinite(accuracy)) return "";
  if (Number(accuracy) <= 200) return "good";
  if (Number(accuracy) <= 1000) return "medium";
  return "poor";
}

function transportLabel(value: TripFormValue["transportPreference"]) {
  if (value === "walk") return "步行";
  if (value === "taxi") return "打车";
  return "地铁";
}

function paceLabel(value: TripFormValue["pace"]) {
  if (value === "relaxed") return "轻松";
  if (value === "compact") return "紧凑";
  return "常规";
}

function styleLabel(value: TripFormValue["travelerStyle"]) {
  if (value === "family") return "亲子";
  if (value === "senior") return "老人";
  if (value === "photo") return "摄影";
  if (value === "food") return "美食";
  if (value === "intense") return "特种兵";
  return "经典";
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours <= 0) return `${rest} 分钟`;
  if (rest === 0) return `${hours} 小时`;
  return `${hours} 小时 ${rest} 分`;
}

function formatClock(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(11, 16);
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatAccuracy(value: number) {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)} 公里`;
  }
  return `${Math.round(value)} 米`;
}

function roundToNextMinutes(date: Date, step: number) {
  const next = new Date(date);
  const minutes = next.getMinutes();
  const rounded = Math.ceil(minutes / step) * step;
  next.setMinutes(rounded, 0, 0);
  return next;
}

function addMinutes(date: Date, minutes: number) {
  const next = new Date(date);
  next.setMinutes(next.getMinutes() + minutes);
  return next;
}

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTimeInput(date: Date) {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}
