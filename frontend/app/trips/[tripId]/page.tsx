"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { PoiCard } from "../../../components/poi-card";
import { RouteCard } from "../../../components/route-card";
import { RouteExporter } from "../../../components/route-exporter";
import { RouteMap, type RouteMapPoint } from "../../../components/route-map";
import { RouteNavigator } from "../../../components/route-navigator";
import { RouteTimeline } from "../../../components/route-timeline";
import { getSavedRoutes, getTrip } from "../../../lib/api";
import type { PoiCandidate, RoutePlan, TripRecord } from "../../../lib/types";

export default function TripDetailPage() {
  const params = useParams<{ tripId: string }>();
  const tripId = Number(params.tripId);
  const [trip, setTrip] = useState<TripRecord | null>(null);
  const [plans, setPlans] = useState<RoutePlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadTrip() {
      if (!Number.isInteger(tripId) || tripId <= 0) {
        setError("行程地址不正确。");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");
      try {
        const [nextTrip, nextPlans] = await Promise.all([getTrip(tripId), getSavedRoutes(tripId)]);
        if (!active) {
          return;
        }
        setTrip(nextTrip);
        setPlans(nextPlans);
        setSelectedPlanId(nextPlans[0]?.planId ?? null);
      } catch (loadError) {
        if (!active) {
          return;
        }
        setTrip(null);
        setPlans([]);
        setSelectedPlanId(null);
        setError(loadError instanceof Error ? loadError.message : "行程加载失败。");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadTrip();
    return () => {
      active = false;
    };
  }, [retryToken, tripId]);

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.planId === selectedPlanId) ?? plans[0],
    [plans, selectedPlanId],
  );
  const pois = useMemo(() => (trip ? tripToPois(trip) : []), [trip]);
  const startPoint = useMemo(() => (trip ? tripStartToMapPoint(trip) : null), [trip]);

  if (loading) {
    return (
      <TripDetailShell>
        <section className="tripDetailState" aria-live="polite">
          <p className="eyebrow">历史行程</p>
          <h1>正在打开行程</h1>
          <p>正在读取路线、地图和时间线。</p>
        </section>
      </TripDetailShell>
    );
  }

  if (error || !trip) {
    return (
      <TripDetailShell>
        <section className="tripDetailState error" aria-live="polite">
          <p className="eyebrow">历史行程</p>
          <h1>行程打不开</h1>
          <p>{error || "没有找到这个行程。"}</p>
          <div className="tripDetailStateActions">
            <button className="detailRetryButton" onClick={() => setRetryToken((current) => current + 1)} type="button">
              重新加载
            </button>
            <Link className="detailBackLink" href="/">
              返回重新选择
            </Link>
          </div>
        </section>
      </TripDetailShell>
    );
  }

  return (
    <TripDetailShell>
      <main className="tripDetailMain">
        <section className="tripDetailHero">
          <div>
            <p className="eyebrow">已保存路线 #{trip.id}</p>
            <h1>{trip.city}城市行程</h1>
            <p>
              {formatTime(trip.startTime)}-{formatTime(trip.endTime)}｜从 {trip.startLocation.name} 出发｜{trip.destinations.length}{" "}
              个地点｜{travelerStyleLabel(trip.travelerStyle)}
            </p>
          </div>
          <div className="tripDetailActions">
            <Link href="/">返回规划</Link>
            <a href="#timeline">查看时间线</a>
          </div>
        </section>

        {plans.length === 0 ? (
          <section className="tripDetailState">
            <p className="eyebrow">路线结果</p>
            <h2>这个行程还没有保存路线</h2>
            <p>返回首页重新打开或重新规划，就可以生成路线。</p>
          </section>
        ) : (
          <>
            {selectedPlan && <TripPlanSummary plan={selectedPlan} startName={trip.startLocation.name} />}

            <section className="routeGrid tripDetailRoutes" aria-label="路线方案">
              {plans.map((plan) => (
                <RouteCard
                  key={plan.planId}
                  onSelect={() => setSelectedPlanId(plan.planId)}
                  plan={plan}
                  selected={selectedPlan?.planId === plan.planId}
                />
              ))}
            </section>

            {selectedPlan && (
              <RouteMap selectedPlan={selectedPlan} startPoint={startPoint} stops={orderedMapStops(pois, selectedPlan)} />
            )}

            {selectedPlan && selectedPlan.legs.length > 0 && (
              <div className="tripDetailNavigator">
                <RouteNavigator plan={selectedPlan} variant="mobile" onReplan={() => window.location.assign("/")} />
              </div>
            )}

            {selectedPlan && (
              <RouteExporter
                city={trip.city}
                endTime={timeInputValue(trip.endTime)}
                plan={selectedPlan}
                startName={trip.startLocation.name}
                startTime={timeInputValue(trip.startTime)}
              />
            )}

            {pois.length > 0 && (
              <section className="poiGrid tripDetailPois" aria-label="行程地点">
                {pois.map((poi) => (
                  <PoiCard key={poi.sourcePoiId} poi={poi} />
                ))}
              </section>
            )}

            {selectedPlan && (
              <div id="timeline">
                <RouteTimeline plan={selectedPlan} showNavigator={false} />
              </div>
            )}
          </>
        )}
      </main>
    </TripDetailShell>
  );
}

function TripPlanSummary({ plan, startName }: { plan: RoutePlan; startName: string }) {
  const visibleStops = plan.stops.slice(0, 4);
  const hiddenStops = Math.max(0, plan.stops.length - visibleStops.length);

  return (
    <section className="tripDetailPlanSummary" aria-label="当前路线摘要">
      <div className="tripDetailPlanSummaryHead">
        <span>当前选择</span>
        <strong>{plan.title}</strong>
      </div>
      <div className="tripDetailPlanMetrics">
        <span>
          <b>{formatDuration(plan.totalMinutes)}</b>
          总用时
        </span>
        <span>
          <b>{plan.stops.length}</b>
          地点
        </span>
        <span>
          <b>{walkingLevelLabel(plan.walkingLevel)}</b>
          步行
        </span>
      </div>
      <ol className="tripDetailStopOrder">
        <li className="start">{startName}</li>
        {visibleStops.map((stop, index) => (
          <li key={`${stop.destinationId}-${index}`}>{stop.name}</li>
        ))}
        {hiddenStops > 0 && <li className="more">+{hiddenStops}</li>}
      </ol>
    </section>
  );
}

function TripDetailShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="topStrip" />
      <div className="tripDetailShell">
        <header className="brandBar">
          <Link className="brand" href="/">
            <span className="brandMark">路</span>
            <strong>此刻路线</strong>
          </Link>
        </header>
        {children}
      </div>
    </>
  );
}

function tripToPois(trip: TripRecord): PoiCandidate[] {
  return trip.destinations.map((destination) => ({
    source: destination.source,
    sourcePoiId: destination.sourcePoiId,
    name: destination.name,
    address: destination.address ?? destination.name,
    lat: destination.lat,
    lng: destination.lng,
    poiType: destination.poiType,
    suggestedStayMinutes: destination.suggestedStayMinutes,
    riskLevel: destination.riskLevel,
    tags: destination.tags,
    note: destination.note ?? "历史行程地点，建议重新确认最新营业状态。",
    practicalInfo: destination.practicalInfo,
  }));
}

function orderedMapStops(pois: PoiCandidate[], selectedPlan: RoutePlan | undefined): RouteMapPoint[] {
  const byId = new Map(pois.map((poi) => [poi.sourcePoiId, poi]));
  if (!selectedPlan) {
    return pois.map((poi) => poiToMapPoint(poi));
  }

  return selectedPlan.stops
    .map((stop) => byId.get(stop.destinationId))
    .filter((poi): poi is PoiCandidate => Boolean(poi))
    .map((poi) => poiToMapPoint(poi));
}

function poiToMapPoint(poi: PoiCandidate, fallbackId?: string): RouteMapPoint {
  return {
    id: fallbackId ?? poi.sourcePoiId,
    name: poi.name,
    lat: poi.lat,
    lng: poi.lng,
  };
}

function tripStartToMapPoint(trip: TripRecord): RouteMapPoint {
  return {
    id: `trip-${trip.id}-start`,
    name: trip.startLocation.name,
    lat: trip.startLocation.lat,
    lng: trip.startLocation.lng,
  };
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} 分钟`;
  return rest === 0 ? `${hours} 小时` : `${hours} 小时 ${rest} 分`;
}

function walkingLevelLabel(value: RoutePlan["walkingLevel"]) {
  if (value === "high") return "较多";
  if (value === "medium") return "适中";
  return "较少";
}

function timeInputValue(value: string) {
  return value.match(/T(\d{2}:\d{2})/)?.[1] ?? "09:00";
}

function travelerStyleLabel(value: TripRecord["travelerStyle"]) {
  if (value === "family") return "亲子玩法";
  if (value === "couple") return "情侣玩法";
  if (value === "senior") return "老人玩法";
  if (value === "photo") return "摄影玩法";
  if (value === "food") return "美食玩法";
  if (value === "intense") return "特种兵玩法";
  return "经典玩法";
}
