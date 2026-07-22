"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { PoiCard } from "../../../components/poi-card";
import { RouteCard } from "../../../components/route-card";
import { RouteMap, type RouteMapPoint } from "../../../components/route-map";
import { RouteTimeline } from "../../../components/route-timeline";
import { getSharedTrip } from "../../../lib/api";
import type { PoiCandidate, RoutePlan, TripRecord } from "../../../lib/types";

export default function SharedTripPage() {
  const params = useParams<{ shareToken: string }>();
  const shareToken = params.shareToken;
  const [trip, setTrip] = useState<TripRecord | null>(null);
  const [plans, setPlans] = useState<RoutePlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadSharedTrip() {
      setLoading(true);
      setError("");
      try {
        const data = await getSharedTrip(shareToken);
        if (!active) {
          return;
        }
        setTrip(data.trip);
        setPlans(data.plans);
        setSelectedPlanId(data.plans[0]?.planId ?? null);
      } catch (loadError) {
        if (!active) {
          return;
        }
        setTrip(null);
        setPlans([]);
        setSelectedPlanId(null);
        setError(loadError instanceof Error ? loadError.message : "分享行程加载失败。");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadSharedTrip();
    return () => {
      active = false;
    };
  }, [shareToken]);

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.planId === selectedPlanId) ?? plans[0],
    [plans, selectedPlanId],
  );
  const pois = useMemo(() => (trip ? tripToPois(trip) : []), [trip]);
  const startPoint = useMemo(() => (trip ? tripStartToMapPoint(trip) : null), [trip]);

  if (loading) {
    return (
      <SharedTripShell>
        <section className="tripDetailState" aria-live="polite">
          <p className="eyebrow">分享行程</p>
          <h1>正在打开路线</h1>
          <p>正在读取路线、地图和时间线。</p>
        </section>
      </SharedTripShell>
    );
  }

  if (error || !trip) {
    return (
      <SharedTripShell>
        <section className="tripDetailState error" aria-live="polite">
          <p className="eyebrow">分享行程</p>
          <h1>分享链接不可用</h1>
          <p>{error || "没有找到这个分享行程。"}</p>
          <Link className="detailBackLink" href="/">
            返回重新规划
          </Link>
        </section>
      </SharedTripShell>
    );
  }

  return (
    <SharedTripShell>
      <main className="tripDetailMain">
        <section className="tripDetailHero">
          <div>
            <p className="eyebrow">朋友分享给你的路线</p>
            <h1>{trip.city}城市行程</h1>
            <p>
              {formatTime(trip.startTime)}-{formatTime(trip.endTime)}｜从 {trip.startLocation.name} 出发｜{trip.destinations.length}{" "}
              个地点｜{travelerStyleLabel(trip.travelerStyle)}
            </p>
          </div>
          <div className="tripDetailActions">
            <Link href="/">我也规划一条</Link>
            <a href="#timeline">查看时间线</a>
          </div>
        </section>

        {plans.length === 0 ? (
          <section className="tripDetailState">
            <p className="eyebrow">路线结果</p>
            <h2>这个分享暂时没有保存路线</h2>
            <p>可以返回首页重新规划同类行程。</p>
          </section>
        ) : (
          <>
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

            {pois.length > 0 && (
              <section className="poiGrid tripDetailPois" aria-label="行程地点">
                {pois.map((poi) => (
                  <PoiCard key={poi.sourcePoiId} poi={poi} />
                ))}
              </section>
            )}

            {selectedPlan && (
              <div id="timeline">
                <RouteTimeline plan={selectedPlan} />
              </div>
            )}
          </>
        )}
      </main>
    </SharedTripShell>
  );
}

function SharedTripShell({ children }: { children: React.ReactNode }) {
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

function travelerStyleLabel(value: TripRecord["travelerStyle"]) {
  if (value === "family") return "亲子玩法";
  if (value === "couple") return "情侣玩法";
  if (value === "senior") return "老人玩法";
  if (value === "photo") return "摄影玩法";
  if (value === "food") return "美食玩法";
  if (value === "intense") return "特种兵玩法";
  return "经典玩法";
}
