import { useEffect, useMemo, useState } from "react";
import type { PoiCandidate, RoutePlan } from "../lib/types";

export type RouteEditDraftItem = {
  destinationId: string;
  stayMinutes: number;
};

export function RouteEditor({
  plan,
  pois,
  loading,
  onRegenerate,
}: {
  plan: RoutePlan;
  pois: PoiCandidate[];
  loading: boolean;
  onRegenerate: (items: RouteEditDraftItem[], fixedOrder: boolean) => void;
}) {
  const [items, setItems] = useState<RouteEditDraftItem[]>(() => draftFromPlan(plan));
  const [fixedOrder, setFixedOrder] = useState(false);
  const stopById = useMemo(() => new Map(plan.stops.map((stop) => [stop.destinationId, stop])), [plan]);
  const poiById = useMemo(() => new Map(pois.map((poi) => [poi.sourcePoiId, poi])), [pois]);
  const hasMissingPoi = items.some((item) => !poiById.has(item.destinationId));
  const canRegenerate = items.length >= 2 && items.length <= 6 && !hasMissingPoi && !loading;

  useEffect(() => {
    setItems(draftFromPlan(plan));
  }, [plan]);

  function updateStayMinutes(destinationId: string, value: string) {
    const stayMinutes = parseStayMinutes(value);
    setItems((current) =>
      current.map((item) => (item.destinationId === destinationId ? { ...item, stayMinutes } : item)),
    );
  }

  function removeDestination(destinationId: string) {
    setItems((current) => (current.length <= 2 ? current : current.filter((item) => item.destinationId !== destinationId)));
  }

  function moveDestination(index: number, direction: -1 | 1) {
    setItems((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }

  return (
    <section className="routeEditorPanel" data-testid="route-editor-panel" aria-label="路线再调整">
      <div className="routeEditorHead">
        <div>
          <p className="eyebrow">路线再调整</p>
          <h3>删点或改停留时间</h3>
        </div>
        <span>调整后会生成一条新行程，原路线会保留在历史里。</span>
      </div>

      <div className="routeEditorList">
        {items.map((item, index) => {
          const stop = stopById.get(item.destinationId);
          const poi = poiById.get(item.destinationId);
          return (
            <article className="routeEditorItem" key={item.destinationId}>
              <span className="routeEditIndex">{index + 1}</span>
              <div className="routeEditMain">
                <strong>{stop?.name ?? poi?.name ?? "未知地点"}</strong>
                <small>{poi?.address ?? "历史地点"}</small>
              </div>
              <div className="routeEditMove" aria-label="调整顺序">
                <button
                  data-testid="route-edit-move-up"
                  disabled={index === 0 || loading}
                  onClick={() => moveDestination(index, -1)}
                  type="button"
                >
                  上移
                </button>
                <button
                  data-testid="route-edit-move-down"
                  disabled={index === items.length - 1 || loading}
                  onClick={() => moveDestination(index, 1)}
                  type="button"
                >
                  下移
                </button>
              </div>
              <label className="routeEditStay">
                停留分钟
                <input
                  data-testid="route-edit-stay"
                  max={240}
                  min={25}
                  step={5}
                  type="number"
                  value={item.stayMinutes}
                  onChange={(event) => updateStayMinutes(item.destinationId, event.target.value)}
                />
              </label>
              <button
                data-testid="route-edit-remove"
                disabled={items.length <= 2 || loading}
                onClick={() => removeDestination(item.destinationId)}
                type="button"
              >
                删除
              </button>
            </article>
          );
        })}
      </div>

      <div className="routeEditorActions">
        <div className="routeEditorActionText">
          <span>{items.length <= 2 ? "当前已是最少 2 个地点。" : "可以删除不想去的地点。"}</span>
          <label className="routeOrderLock">
            <input
              data-testid="route-fixed-order"
              checked={fixedOrder}
              disabled={loading}
              onChange={(event) => setFixedOrder(event.target.checked)}
              type="checkbox"
            />
            按当前顺序规划
          </label>
        </div>
        <button
          data-testid="route-edit-regenerate"
          disabled={!canRegenerate}
          onClick={() => onRegenerate(items, fixedOrder)}
          type="button"
        >
          {loading ? "正在重新规划..." : "按设置重新规划"}
        </button>
      </div>
    </section>
  );
}

function draftFromPlan(plan: RoutePlan): RouteEditDraftItem[] {
  return plan.stops.map((stop) => ({
    destinationId: stop.destinationId,
    stayMinutes: stop.stayMinutes,
  }));
}

function parseStayMinutes(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 60;
  }
  return Math.min(240, Math.max(25, Math.round(parsed)));
}
