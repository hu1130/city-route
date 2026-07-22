import { useState } from "react";
import Link from "next/link";
import type { TripSummary } from "../lib/types";

const HISTORY_PREVIEW_LIMIT = 6;

export function TripHistory({
  trips,
  loading,
  activeTripId,
  onDelete,
  onEdit,
  onRefresh,
  onView,
  total,
}: {
  trips: TripSummary[];
  total: number;
  loading: boolean;
  activeTripId: number | null;
  onDelete: (tripId: number) => void;
  onEdit: (tripId: number) => void;
  onRefresh: () => void;
  onView: (tripId: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasMoreTrips = trips.length > HISTORY_PREVIEW_LIMIT;
  const visibleTrips = expanded ? trips : trips.slice(0, HISTORY_PREVIEW_LIMIT);
  const hiddenCount = Math.max(0, trips.length - visibleTrips.length);
  const totalTrips = Math.max(total, trips.length);

  return (
    <section className="historyPanel" aria-label="最近行程">
      <div className="historyHead">
        <div>
          <p className="eyebrow">最近行程</p>
          <h2>最近行程</h2>
          {trips.length > 0 && (
            <span className="historyCount">
              共 {totalTrips} 条，已加载最近 {trips.length} 条
            </span>
          )}
        </div>
        <div className="historyToolbar">
          {hasMoreTrips && (
            <button
              data-testid="history-toggle"
              onClick={() => setExpanded((current) => !current)}
              type="button"
            >
              {expanded ? "收起" : `展开最近 ${trips.length} 条`}
            </button>
          )}
          <button data-testid="history-refresh" disabled={loading} onClick={onRefresh} type="button">
            {loading ? "刷新中" : "刷新"}
          </button>
        </div>
      </div>

      {trips.length === 0 ? (
        <p className="historyEmpty">还没有行程记录，输入想去的地方生成第一条路线吧。</p>
      ) : (
        <>
          <div className="historyRail" data-testid="history-list">
            {visibleTrips.map((trip) => (
              <article className={`historyItem ${activeTripId === trip.tripId ? "active" : ""}`} key={trip.tripId}>
                <div>
                  <span className="historyDate">{formatDate(trip.startTime)}</span>
                  <strong>{trip.city}路线</strong>
                  <span>
                    {formatTime(trip.startTime)}-{formatTime(trip.endTime)}｜从 {trip.startLocationName} 出发
                  </span>
                </div>
                <p>{trip.destinationNames.join(" / ")}</p>
                <div className="historyMeta">
                  <span>{trip.destinationNames.length} 个地点</span>
                  <span>{travelerStyleLabel(trip.travelerStyle)}</span>
                  <div className="historyActions">
                    <button
                      data-action="view"
                      data-trip-id={trip.tripId}
                      disabled={loading}
                      onClick={() => onView(trip.tripId)}
                      type="button"
                    >
                      查看
                    </button>
                    <Link data-action="detail" data-trip-id={trip.tripId} href={`/trips/${trip.tripId}`}>
                      详情
                    </Link>
                    <button
                      data-action="edit"
                      data-trip-id={trip.tripId}
                      disabled={loading}
                      onClick={() => onEdit(trip.tripId)}
                      type="button"
                    >
                      编辑
                    </button>
                    <button
                      className="danger"
                      data-action="delete"
                      data-trip-id={trip.tripId}
                      disabled={loading}
                      onClick={() => onDelete(trip.tripId)}
                      type="button"
                    >
                      删除
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
          {!expanded && hiddenCount > 0 && (
            <p className="historyHiddenHint" data-testid="history-hidden-count">
              已收起较早的 {hiddenCount} 条行程，需要时可查看全部。
            </p>
          )}
        </>
      )}
    </section>
  );
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function travelerStyleLabel(value: TripSummary["travelerStyle"]) {
  if (value === "family") return "亲子";
  if (value === "couple") return "情侣";
  if (value === "senior") return "老人";
  if (value === "photo") return "摄影";
  if (value === "food") return "美食";
  if (value === "intense") return "特种兵";
  return "经典";
}
