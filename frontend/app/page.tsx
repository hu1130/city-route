"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AccountPanel } from "../components/account-panel";
import {
  CandidateConfirmation,
  preferredCandidateForGroup,
  type CandidateGroup,
  type CandidateSelection,
  type DestinationPreference,
  type DestinationPreferences,
} from "../components/candidate-confirmation";
import { MapPreview } from "../components/map-preview";
import { MobilePlanner } from "../components/mobile-planner";
import { PoiCard } from "../components/poi-card";
import { PlanningFailure } from "../components/planning-failure";
import { PlanningProgress, type PlanningStage } from "../components/planning-progress";
import { RouteCard } from "../components/route-card";
import { RouteEditor, type RouteEditDraftItem } from "../components/route-editor";
import { RouteExporter } from "../components/route-exporter";
import { RouteMap, type RouteMapPoint } from "../components/route-map";
import { RouteNextStep } from "../components/route-next-step";
import { RouteTimeline } from "../components/route-timeline";
import { TripForm } from "../components/trip-form";
import { TripHistory } from "../components/trip-history";
import {
  createTrip,
  deleteTrip,
  generateRoutes,
  getCurrentAccount,
  getSavedRoutes,
  getTrip,
  getTripHistory,
  resolveLocation,
  reverseGeocodeLocation,
  searchPoi,
} from "../lib/api";
import { clearAuthSession, getAuthToken, getStoredAuthUser } from "../lib/auth";
import type {
  AuthSession,
  AuthUser,
  LocationCandidate,
  PoiCandidate,
  RoutePlan,
  TripDestination,
  TripFormValue,
  TripRecord,
  TripSummary,
} from "../lib/types";

const initialForm: TripFormValue = {
  city: "",
  startLocationName: "",
  departureMode: "now",
  travelDate: "",
  startTime: "09:00",
  endTime: "15:00",
  transportPreference: "metro",
  pace: "balanced",
  travelerStyle: "classic",
  destinationsText: "",
};

const LAST_ROUTE_STORAGE_KEY = "city-route:last-route-session";
const LOCATION_FAILURE_MESSAGE = "未获得定位，请手动输入起点。";

type LastRouteSession = {
  version: 1;
  savedAt: string;
  form: TripFormValue;
  startPoint: RouteMapPoint | null;
  pois: PoiCandidate[];
  plans: RoutePlan[];
  selectedPlanId: number | null;
  activeTripId: number | null;
};

export default function HomePage() {
  const [form, setForm] = useState<TripFormValue>(initialForm);
  const [startPoint, setStartPoint] = useState<RouteMapPoint | null>(null);
  const [pois, setPois] = useState<PoiCandidate[]>([]);
  const [plans, setPlans] = useState<RoutePlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [candidateGroups, setCandidateGroups] = useState<CandidateGroup[]>([]);
  const [candidateSelection, setCandidateSelection] = useState<CandidateSelection>({});
  const [destinationPreferences, setDestinationPreferences] = useState<DestinationPreferences>({});
  const [candidateSignature, setCandidateSignature] = useState("");
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [tripHistory, setTripHistory] = useState<TripSummary[]>([]);
  const [tripHistoryTotal, setTripHistoryTotal] = useState(0);
  const [activeTripId, setActiveTripId] = useState<number | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failureMessage, setFailureMessage] = useState("");
  const [message, setMessage] = useState("点击定位，或手动输入起点。");
  const [quickAdjustmentLabel, setQuickAdjustmentLabel] = useState<string | null>(null);
  const [detectedStartLocation, setDetectedStartLocation] = useState<PoiCandidate | null>(null);
  const [typedStartPreview, setTypedStartPreview] = useState<RouteMapPoint | null>(null);
  const [locationAccuracyMeters, setLocationAccuracyMeters] = useState<number | null>(null);
  const [lastRouteSession, setLastRouteSession] = useState<LastRouteSession | null>(null);
  const clockInitializedRef = useRef(false);
  const planningRequestRef = useRef(false);
  const lastQuickAdjustmentRef = useRef<{ form: TripFormValue; label: string } | null>(null);

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.planId === selectedPlanId) ?? plans[0],
    [plans, selectedPlanId],
  );
  const previewMapPoint = useMemo(
    () =>
      startPoint ??
      (detectedStartLocation ? poiToMapPoint(detectedStartLocation, "detected-start") : null) ??
      typedStartPreview,
    [startPoint, detectedStartLocation, typedStartPreview],
  );

  const names = useMemo(() => parseDestinationNames(form.destinationsText), [form.destinationsText]);
  const currentSignature = useMemo(() => buildCandidateSignature(form, names), [form, names]);
  const candidatesReady = candidateGroups.length > 0 && candidateSignature === currentSignature;
  const planningStage = quickAdjustmentLabel ? "routing" : resolvePlanningStage(message, candidatesReady);
  const lastRoutePrompt = useMemo(
    () => (plans.length === 0 ? buildLastRoutePrompt(lastRouteSession) : null),
    [lastRouteSession, plans.length],
  );

  useEffect(() => {
    const city = form.city.trim();
    const keyword = form.startLocationName.trim();
    if (startPoint || detectedStartLocation || !city || !keyword) {
      setTypedStartPreview(null);
      return;
    }

    let disposed = false;
    const timer = window.setTimeout(() => {
      void resolveLocation(city, keyword)
        .then((location) => {
          if (disposed || !location) {
            return;
          }
          setTypedStartPreview({
            id: `typed-start-${location.lng}-${location.lat}`,
            name: keyword,
            lat: location.lat,
            lng: location.lng,
          });
        })
        .catch(() => {
          if (!disposed) {
            setTypedStartPreview(null);
          }
        });
    }, 450);

    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [detectedStartLocation, form.city, form.startLocationName, startPoint]);

  useEffect(() => {
    if (!clockInitializedRef.current) {
      clockInitializedRef.current = true;
      setForm((current) =>
        current.departureMode === "now"
          ? buildCurrentDepartureForm(current)
          : { ...current, travelDate: current.travelDate || formatDateInput(new Date()) },
      );
    }

    const storedUser = getStoredAuthUser();
    if (storedUser) {
      setAuthUser(storedUser);
    }
    setLastRouteSession(readLastRouteSession());
    refreshHistory();
    validateStoredAccount();
  }, []);

  useEffect(() => {
    if (!selectedPlan || plans.length === 0) {
      return;
    }

    const nextSession = buildLastRouteSession({
      activeTripId,
      form,
      plans,
      pois,
      selectedPlanId: selectedPlan.planId,
      startPoint,
    });
    setLastRouteSession(nextSession);
    writeLastRouteSession(nextSession);
  }, [activeTripId, form, plans, pois, selectedPlan, startPoint]);

  async function validateStoredAccount() {
    if (!getAuthToken()) {
      return;
    }

    try {
      const user = await getCurrentAccount();
      setAuthUser(user);
      await refreshHistory();
    } catch {
      clearAuthSession();
      setAuthUser(null);
      await refreshHistory();
    }
  }

  async function handleAuthenticated(session: AuthSession) {
    setAuthUser(session.user);
    setMessage(
      session.movedTrips > 0
        ? `已登录，并绑定 ${session.movedTrips} 条游客行程到账号。`
        : "已登录，后续行程会保存到账号。",
    );
    await refreshHistory();
  }

  async function handleLogout() {
    clearAuthSession();
    setAuthUser(null);
    setStartPoint(null);
    setPois([]);
    setPlans([]);
    setSelectedPlanId(null);
    setCandidateGroups([]);
    setCandidateSelection({});
    setDestinationPreferences({});
    setCandidateSignature("");
    setActiveTripId(null);
    setDetectedStartLocation(null);
    setLocationAccuracyMeters(null);
    setLastRouteSession(null);
    clearLastRouteSession();
    setMessage("已退出账号，当前回到游客模式。");
    await refreshHistory();
  }

  async function handleUseCurrentLocation() {
    if (!window.isSecureContext) {
      setMessage(LOCATION_FAILURE_MESSAGE);
      return;
    }
    if (!("geolocation" in navigator)) {
      setMessage(LOCATION_FAILURE_MESSAGE);
      return;
    }

    setLocating(true);
    setLocationAccuracyMeters(null);
    setMessage("正在请求定位授权，并尝试获取更准确的位置。请在浏览器弹窗中允许获取当前位置。");

    try {
      const position = await getBrowserPosition();
      const location = await reverseGeocodeLocation(position.coords.latitude, position.coords.longitude);
      if (!location) {
        throw new Error("没有解析到当前位置地址，请手动填写起点。");
      }

      const locationName = location.name || location.address || "当前位置";
      setForm((current) => ({
        ...current,
        city: location.city || current.city,
        startLocationName: locationName,
      }));
      setDetectedStartLocation(locationToPoiCandidate({ ...location, source: "browser", name: locationName }));
      setLocationAccuracyMeters(position.coords.accuracy);
      setCandidateGroups([]);
      setCandidateSelection({});
      setDestinationPreferences({});
      setCandidateSignature("");
      setConfirmationOpen(false);
      setStartPoint(null);
      setPois([]);
      setPlans([]);
      setSelectedPlanId(null);
      setActiveTripId(null);
      setMessage(
        `已定位到：${location.address || locationName}。${locationAccuracyMessage(position.coords.accuracy)}生成路线前仍会让你确认起点是否准确。`,
      );
    } catch {
      setLocationAccuracyMeters(null);
      setMessage(LOCATION_FAILURE_MESSAGE);
    } finally {
      setLocating(false);
    }
  }

  async function handleSubmit() {
    if (planningRequestRef.current) {
      return;
    }

    lastQuickAdjustmentRef.current = null;
    setQuickAdjustmentLabel(null);
    planningRequestRef.current = true;
    setLoading(true);
    setFailureMessage("");

    try {
      validateForm(form, names);

      if (!candidatesReady) {
        setMessage("正在查找可以匹配的地点...");
        setStartPoint(null);
        setPois([]);
        setPlans([]);
        setSelectedPlanId(null);
        await loadCandidates(names);
        return;
      }

      setConfirmationOpen(false);
      setMessage("正在规划路线...");
      setStartPoint(null);
      setPois([]);
      setPlans([]);
      setSelectedPlanId(null);

      const startCandidate = selectedCandidate(candidateGroups[0], candidateSelection);
      if (!startCandidate) {
        throw new Error("请先确认当前地点。");
      }

      const resolved = await Promise.all(
        names.map(async (name, index) => {
          const group = candidateGroups[index + 1];
          const poi = selectedCandidate(group, candidateSelection);
          if (!poi) {
            throw new Error(`请先确认地点：${name}`);
          }
          return { groupKey: group.key, rawName: name, poi };
        }),
      );

      const trip = await createTrip({
        city: form.city,
        startLocation: {
          name: startCandidate.name,
          lat: startCandidate.lat,
          lng: startCandidate.lng,
        },
        startTime: buildChinaDateTime(form.travelDate, form.startTime),
        endTime: buildChinaDateTime(form.travelDate, form.endTime),
        transportPreference: form.transportPreference,
        pace: form.pace,
        travelerStyle: form.travelerStyle,
        destinations: resolved.map(({ groupKey, rawName, poi }) => {
          const preference = destinationPreferences[groupKey] ?? defaultDestinationPreference();
          return {
            source: poi.source,
            sourcePoiId: poi.sourcePoiId,
            rawName,
            name: poi.name,
            address: poi.address,
            lat: poi.lat,
            lng: poi.lng,
            poiType: poi.poiType,
            mustGo: preference.mustGo,
            stayMinutes: preference.stayMinutes,
            suggestedStayMinutes: poi.suggestedStayMinutes,
            riskLevel: poi.riskLevel,
            tags: poi.tags,
            note: poi.note,
            practicalInfo: poi.practicalInfo,
          };
        }),
      });

      const nextPlans = await generateRoutes(trip.tripId);
      setStartPoint(poiToMapPoint(startCandidate, "start"));
      setPois(resolved.map(({ poi }) => poi));
      setPlans(nextPlans);
      setSelectedPlanId(nextPlans[0]?.planId ?? null);
      setActiveTripId(trip.tripId);
      setMessage(`已规划好 ${nextPlans.length} 条路线，可以从 ${startCandidate.name} 出发。`);
      await refreshHistory();
      window.requestAnimationFrame(() => {
        document.getElementById("routes")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (error) {
      setFailureMessage(error instanceof Error ? error.message : "路线没有规划成功，请稍后再试。");
      setMessage(error instanceof Error ? error.message : "路线没有规划成功，请稍后再试。");
    } finally {
      planningRequestRef.current = false;
      setLoading(false);
    }
  }

  async function handleConfirmCandidates() {
    await handleSubmit();
  }

  async function handleQuickReplan(nextForm: TripFormValue, label: string) {
    if (planningRequestRef.current) {
      return;
    }

    const sourceTripId = activeTripId ?? selectedPlan?.tripId;
    if (!sourceTripId) {
      setFailureMessage("当前路线缺少原始行程，暂时不能一键调整。请展开输入后重新规划。");
      return;
    }

    planningRequestRef.current = true;
    lastQuickAdjustmentRef.current = { form: nextForm, label };
    setQuickAdjustmentLabel(label);
    setLoading(true);
    setFailureMessage("");
    setConfirmationOpen(false);
    setMessage(`正在${label}...`);

    try {
      const nextNames = parseDestinationNames(nextForm.destinationsText);
      validateForm(nextForm, nextNames);

      const sourceTrip = await getTrip(sourceTripId);
      const selectedDestinations = selectTripDestinations(sourceTrip.destinations, nextNames);
      const trip = await createTrip({
        city: nextForm.city,
        startLocation: sourceTrip.startLocation,
        startTime: buildChinaDateTime(nextForm.travelDate, nextForm.startTime),
        endTime: buildChinaDateTime(nextForm.travelDate, nextForm.endTime),
        transportPreference: nextForm.transportPreference,
        pace: nextForm.pace,
        travelerStyle: nextForm.travelerStyle,
        destinations: selectedDestinations.map(({ destination, rawName }) => ({
          ...destination,
          rawName,
        })),
      });

      const nextPlans = await generateRoutes(trip.tripId);
      if (nextPlans.length === 0) {
        throw new Error("这次调整没有得到可用路线，原路线已为你保留。");
      }

      setForm(nextForm);
      setStartPoint(tripStartToMapPoint(sourceTrip));
      setPois(tripDestinationsToPois(selectedDestinations.map(({ destination }) => destination)));
      setPlans(nextPlans);
      setSelectedPlanId(nextPlans[0].planId);
      setActiveTripId(trip.tripId);
      setCandidateGroups([]);
      setCandidateSelection({});
      setDestinationPreferences({});
      setCandidateSignature("");
      setDetectedStartLocation(null);
      setLocationAccuracyMeters(null);
      lastQuickAdjustmentRef.current = null;
      setMessage(`已完成：${label}。新路线已经自动替换，原路线仍在历史里。`);
      await refreshHistory();
      window.requestAnimationFrame(() => {
        document.getElementById("mobile-routes")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : "调整没有完成，原路线已为你保留。";
      setFailureMessage(nextMessage);
      setMessage(nextMessage);
    } finally {
      planningRequestRef.current = false;
      setQuickAdjustmentLabel(null);
      setLoading(false);
    }
  }

  function handleRetryQuickReplan() {
    const pending = lastQuickAdjustmentRef.current;
    if (pending) {
      void handleQuickReplan(pending.form, pending.label);
    }
  }

  function handleContinueLastRoute() {
    if (!lastRouteSession) {
      return;
    }

    setForm(lastRouteSession.form);
    setStartPoint(lastRouteSession.startPoint);
    setPois(lastRouteSession.pois);
    setPlans(lastRouteSession.plans);
    setSelectedPlanId(lastRouteSession.selectedPlanId ?? lastRouteSession.plans[0]?.planId ?? null);
    setActiveTripId(lastRouteSession.activeTripId);
    setCandidateGroups([]);
    setCandidateSelection({});
    setDestinationPreferences({});
    setCandidateSignature("");
    setConfirmationOpen(false);
    setFailureMessage("");
    lastQuickAdjustmentRef.current = null;
    setDetectedStartLocation(null);
    setLocationAccuracyMeters(null);
    setMessage("已恢复上次路线，可以继续导航。");
    window.requestAnimationFrame(() => {
      document.getElementById("mobile-routes")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function handleDismissLastRoute() {
    setLastRouteSession(null);
    clearLastRouteSession();
    setMessage("已隐藏上次路线，可以重新规划。");
  }

  function handleEditFailure() {
    setFailureMessage("");
    document.getElementById("planner")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function loadCandidates(destinationNames: string[]) {
    const [startCandidates, destinationGroups] = await Promise.all([
      searchStartCandidates(form.city, form.startLocationName, detectedStartLocation),
      Promise.all(
        destinationNames.map(async (name, index) => {
          const candidates = await searchPoi(form.city, name);
          if (candidates.length === 0) {
            throw new Error(`没有匹配到地点：${name}`);
          }
          return {
            key: `destination-${index}`,
            role: "destination" as const,
            rawName: name,
            candidates,
          };
        }),
      ),
    ]);

    if (startCandidates.length === 0) {
      throw new Error(`没有匹配到当前地点：${form.startLocationName}`);
    }

    const groups: CandidateGroup[] = [
      {
        key: "start",
        role: "start",
        rawName: form.startLocationName,
        candidates: startCandidates,
      },
      ...destinationGroups,
    ];
    setCandidateGroups(groups);
    setCandidateSelection(defaultSelection(groups));
    setDestinationPreferences(defaultDestinationPreferences(groups));
    setCandidateSignature(currentSignature);
    setConfirmationOpen(true);
    setMessage("请先确认地点，确认后马上生成路线。");
  }

  function handleFormChange(next: TripFormValue) {
    setForm(next);
    setFailureMessage("");
    lastQuickAdjustmentRef.current = null;
    setCandidateGroups([]);
    setCandidateSelection({});
    setDestinationPreferences({});
    setCandidateSignature("");
    setConfirmationOpen(false);
    setStartPoint(null);
    setPois([]);
    setPlans([]);
    setSelectedPlanId(null);
    setActiveTripId(null);
    setDetectedStartLocation(null);
    setLocationAccuracyMeters(null);
    setMessage("输入已变化，可以重新规划。");
  }

  function handleCandidateSelect(groupKey: string, sourcePoiId: string) {
    setCandidateSelection((current) => ({ ...current, [groupKey]: sourcePoiId }));
    setFailureMessage("");
    setStartPoint(null);
    setPois([]);
    setPlans([]);
    setSelectedPlanId(null);
  }

  function handleDestinationPreferenceChange(groupKey: string, next: DestinationPreference) {
    setDestinationPreferences((current) => ({ ...current, [groupKey]: next }));
    setFailureMessage("");
    setPlans([]);
    setStartPoint(null);
    setPois([]);
    setSelectedPlanId(null);
    setActiveTripId(null);
    setConfirmationOpen(true);
    setMessage("安排已更新，确认后重新规划路线。");
  }

  function handleRemoveDestinationGroup(groupKey: string) {
    const group = candidateGroups.find((item) => item.key === groupKey);
    if (!group || group.role !== "destination") {
      return;
    }

    const nextGroups = candidateGroups.filter((item) => item.key !== groupKey);
    const nextNames = nextGroups.filter((item) => item.role === "destination").map((item) => item.rawName);
    const nextForm = { ...form, destinationsText: nextNames.join(", ") };
    setForm(nextForm);
    setCandidateGroups(nextGroups);
    setCandidateSelection((current) =>
      Object.fromEntries(Object.entries(current).filter(([key]) => key !== groupKey)),
    );
    setDestinationPreferences((current) =>
      Object.fromEntries(Object.entries(current).filter(([key]) => key !== groupKey)),
    );
    setCandidateSignature(buildCandidateSignature(nextForm, nextNames));
    setConfirmationOpen(true);
    setFailureMessage("");
    setStartPoint(null);
    setPois([]);
    setPlans([]);
    setSelectedPlanId(null);
    setActiveTripId(null);
    setMessage(
      nextNames.length >= 2
        ? `已移除“${group.rawName}”，可以继续生成路线。`
        : `已移除“${group.rawName}”。当前少于 2 个目的地，请补充后再生成。`,
    );
  }

  async function refreshHistory() {
    setHistoryLoading(true);
    try {
      const history = await getTripHistory();
      setTripHistory(history.trips);
      setTripHistoryTotal(history.total);
    } catch {
      setTripHistory([]);
      setTripHistoryTotal(0);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function handleViewHistory(tripId: number) {
    setHistoryLoading(true);
    try {
      setMessage(`正在打开历史行程 #${tripId}...`);
      const [trip, savedPlans] = await Promise.all([getTrip(tripId), getSavedRoutes(tripId)]);
      setForm(tripToForm(trip));
      setStartPoint(tripStartToMapPoint(trip));
      setPois(tripToPois(trip));
      setPlans(savedPlans);
      setSelectedPlanId(savedPlans[0]?.planId ?? null);
      setCandidateGroups([]);
      setCandidateSelection({});
      setDestinationPreferences({});
      setCandidateSignature("");
      setDetectedStartLocation(null);
      setActiveTripId(tripId);
      setMessage(
        savedPlans.length > 0
          ? `已打开历史行程 #${tripId}，恢复 ${savedPlans.length} 条路线。`
          : `已打开历史行程 #${tripId}，暂无保存路线，可以重新查找候选地点。`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "打开历史行程失败。");
    } finally {
      setHistoryLoading(false);
    }
  }

  async function handleEditHistory(tripId: number) {
    setHistoryLoading(true);
    try {
      setMessage(`正在载入历史行程 #${tripId}...`);
      const trip = await getTrip(tripId);
      setForm(tripToForm(trip));
      setStartPoint(tripStartToMapPoint(trip));
      setPois(tripToPois(trip));
      setPlans([]);
      setSelectedPlanId(null);
      setCandidateGroups([]);
      setCandidateSelection({});
      setDestinationPreferences({});
      setCandidateSignature("");
      setDetectedStartLocation(null);
      setActiveTripId(tripId);
      setMessage(`已把历史行程 #${tripId} 填回表单。修改后重新查找候选地点，会生成一条新行程。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "载入历史行程失败。");
    } finally {
      setHistoryLoading(false);
    }
  }

  async function handleDeleteHistory(tripId: number) {
    if (!window.confirm(`确定删除行程 #${tripId} 吗？对应路线也会一起删除。`)) {
      return;
    }

    setHistoryLoading(true);
    try {
      const deletingVisibleTrip = activeTripId === tripId || plans.some((plan) => plan.tripId === tripId);
      await deleteTrip(tripId);
      if (deletingVisibleTrip) {
        setActiveTripId(null);
        setStartPoint(null);
        setPois([]);
        setPlans([]);
        setSelectedPlanId(null);
        setCandidateGroups([]);
        setCandidateSelection({});
        setDestinationPreferences({});
        setCandidateSignature("");
        setDetectedStartLocation(null);
      }
      setMessage(`已删除历史行程 #${tripId}。`);
      await refreshHistory();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除历史行程失败。");
    } finally {
      setHistoryLoading(false);
    }
  }

  async function handleRegenerateFromEditedRoute(items: RouteEditDraftItem[], fixedOrder: boolean) {
    if (planningRequestRef.current) {
      return;
    }

    planningRequestRef.current = true;
    setLoading(true);
    setFailureMessage("");
    try {
      if (!startPoint) {
        throw new Error("缺少起点坐标，请重新生成一次路线。");
      }
      if (items.length < 2) {
        throw new Error("至少保留 2 个地点才能重新规划。");
      }

      const poiById = new Map(pois.map((poi) => [poi.sourcePoiId, poi]));
      const editedPois = items.map((item) => {
        const poi = poiById.get(item.destinationId);
        if (!poi) {
          throw new Error("缺少地点详情，请重新确认地点后再规划。");
        }
        return { poi, stayMinutes: item.stayMinutes };
      });

      setMessage(fixedOrder ? "正在按你调整的地点顺序重新规划..." : "正在按新的停留时间和地点重新规划...");
      const trip = await createTrip({
        city: form.city,
        startLocation: {
          name: startPoint.name,
          lat: startPoint.lat,
          lng: startPoint.lng,
        },
        startTime: buildChinaDateTime(form.travelDate, form.startTime),
        endTime: buildChinaDateTime(form.travelDate, form.endTime),
        transportPreference: form.transportPreference,
        pace: form.pace,
        travelerStyle: form.travelerStyle,
        destinations: editedPois.map(({ poi, stayMinutes }) => ({
          source: poi.source,
          sourcePoiId: poi.sourcePoiId,
          rawName: poi.name,
          name: poi.name,
          address: poi.address,
          lat: poi.lat,
          lng: poi.lng,
          poiType: poi.poiType,
          mustGo: true,
          stayMinutes,
          suggestedStayMinutes: poi.suggestedStayMinutes,
          riskLevel: poi.riskLevel,
          tags: poi.tags,
          note: poi.note,
          practicalInfo: poi.practicalInfo,
        })),
      });

      const nextPlans = await generateRoutes(trip.tripId, { fixedOrder });
      setPois(editedPois.map(({ poi }) => poi));
      setPlans(nextPlans);
      setSelectedPlanId(nextPlans[0]?.planId ?? null);
      setActiveTripId(trip.tripId);
      setCandidateGroups([]);
      setCandidateSelection({});
      setDestinationPreferences({});
      setCandidateSignature("");
      setConfirmationOpen(false);
      setForm((current) => ({
        ...current,
        destinationsText: editedPois.map(({ poi }) => poi.name).join(", "),
      }));
      setMessage(
        fixedOrder
          ? `已按当前顺序重新规划 ${editedPois.length} 个地点，原路线仍保留在历史里。`
          : `已按 ${editedPois.length} 个地点重新规划，原路线仍保留在历史里。`,
      );
      await refreshHistory();
      window.requestAnimationFrame(() => {
        document.getElementById("routes")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : "重新规划失败，请稍后再试。";
      setFailureMessage(nextMessage);
      setMessage(nextMessage);
    } finally {
      planningRequestRef.current = false;
      setLoading(false);
    }
  }

  return (
    <main className="mapAppShell">
      <div className="topStrip" aria-hidden="true" />

      <MobilePlanner
        accountSlot={<AccountPanel user={authUser} onAuthenticated={handleAuthenticated} onLogout={handleLogout} />}
        canRetryQuickReplan={Boolean(failureMessage && lastQuickAdjustmentRef.current)}
        candidatesReady={candidatesReady}
        loading={loading}
        locating={locating}
        locationAccuracyMeters={detectedStartLocation ? locationAccuracyMeters : null}
        mapStops={orderedMapStops(pois, selectedPlan)}
        failureMessage={failureMessage}
        lastRoutePrompt={lastRoutePrompt}
        message={message}
        names={names}
        onChange={handleFormChange}
        onContinueLastRoute={handleContinueLastRoute}
        onDismissLastRoute={handleDismissLastRoute}
        onEditFailure={handleEditFailure}
        onQuickReplan={handleQuickReplan}
        onRetryQuickReplan={handleRetryQuickReplan}
        onSelectPlan={setSelectedPlanId}
        onSubmit={handleSubmit}
        onUseCurrentLocation={handleUseCurrentLocation}
        plans={plans}
        previewMapPoint={previewMapPoint}
        quickAdjustmentLabel={quickAdjustmentLabel}
        planningStage={planningStage}
        selectedPlan={selectedPlan}
        startPoint={startPoint}
        value={form}
      />

      <section className="mapWorkbench" id="planner" aria-label="规划此刻路线">
        <div className="workbenchMapLayer" aria-hidden="true">
          <MapPreview city={form.city} focusPoint={previewMapPoint} />
        </div>

        <header className="workbenchTopbar">
          <a className="brand workbenchBrand" href="#planner" aria-label="此刻路线首页">
            <span className="brandMark">路</span>
            <strong>此刻路线</strong>
          </a>
          <div className="brandTools">
            <AccountPanel user={authUser} onAuthenticated={handleAuthenticated} onLogout={handleLogout} />
          </div>
        </header>

        <section className="routeBuilderPanel" aria-label="路线创建器">
          <div className="builderIntro">
            <p className="eyebrow">AI 城市路线地图</p>
            <h1>今天去哪，直接排成一条路线</h1>
            <p>
              输入想去的地点，先确认真实 POI，再按交通、天气、营业风险和玩法偏好，把它们排成一条能走的城市行程。
            </p>
          </div>

          <TripForm
            locating={locating}
            loading={loading}
            onChange={handleFormChange}
            onSubmit={handleSubmit}
            onUseCurrentLocation={handleUseCurrentLocation}
            locationAccuracyMeters={detectedStartLocation ? locationAccuracyMeters : null}
            submitLabel="开始规划"
            value={form}
          />
          <p aria-live="polite" className={`message workbenchMessage ${loading ? "loadingMessage" : ""}`}>
            {message}
          </p>
          {failureMessage && !loading && (
            <PlanningFailure message={failureMessage} onEdit={handleEditFailure} onRetry={handleSubmit} />
          )}
        </section>

        <aside className="routeIntelligencePanel" aria-label="AI 行程判断">
          <div className="intelligenceHead">
            <div>
              <span>当前城市</span>
              <strong>{form.city || "未选择城市"}</strong>
            </div>
            <small>{selectedPlan ? "路线已生成" : candidatesReady ? "地点已确认" : "等待选点"}</small>
          </div>

          <div className="workbenchMetrics">
            {selectedPlan ? (
              <>
                <BriefStat label="全程" value={formatDuration(selectedPlan.totalMinutes)} />
                <BriefStat label="交通" value={formatDuration(selectedPlan.travelMinutes)} />
                <BriefStat label="结束" value={formatClock(selectedPlan.estimatedEndTime)} />
              </>
            ) : (
              <>
                <BriefStat label="出发" value={form.startTime} />
                <BriefStat label="结束" value={form.endTime} />
                <BriefStat label="玩法" value={travelerStyleLabel(form.travelerStyle)} />
              </>
            )}
          </div>

          {selectedPlan && <RouteNextStep plan={selectedPlan} />}

          <section className="stopStack" aria-label="目的地摘要">
            <div className="stopStackHead">
              <span>{selectedPlan ? "推荐路线" : "路线草稿"}</span>
              <strong>{selectedPlan ? `${selectedPlan.stops.length} 站` : `${names.length}/6`}</strong>
            </div>
            <div className="stopList">
              <PreviewStop index={0} meta={selectedPlan ? "已确认起点" : undefined} name={form.startLocationName || "出发点"} type="start" />
              {selectedPlan ? (
                selectedPlan.stops.slice(0, 6).map((stop, index) => (
                  <PreviewStop
                    index={index + 1}
                    key={`${stop.destinationId}-${index}`}
                    meta={`${formatClock(stop.arrivalTime)} 到达 · 停留 ${stop.stayMinutes} 分钟`}
                    name={stop.name}
                  />
                ))
              ) : names.length === 0 ? (
                <p className="emptyStop">输入 2-6 个地点后，这里会生成路线草稿。</p>
              ) : (
                names.slice(0, 6).map((name, index) => <PreviewStop index={index + 1} key={`${name}-${index}`} name={name} />)
              )}
            </div>
          </section>

          <div className="routeDecisionCard">
            <span>{selectedPlan ? "为什么这样排" : "AI 会先做什么"}</span>
            <strong>
              {selectedPlan
                ? selectedPlan.title
                : candidatesReady
                  ? "把确认后的地点排成顺路路线"
                  : "先查同名地点，避免选错位置"}
            </strong>
            <p>
              {selectedPlan
                ? summarizeRouteDecision(selectedPlan, names)
                : candidatesReady
                  ? "下一步会计算站点顺序、交通耗时、停留时间和风险提示。"
                  : "例如商场分店、街区入口、同名景点，都会先让你确认。"}
            </p>
          </div>
        </aside>

        {loading && (
          <div className="workbenchPlanningOverlay">
            <PlanningProgress
              city={form.city}
              destinationNames={names}
              stage={planningStage}
              startName={form.startLocationName}
            />
          </div>
        )}

        <div className="mapBoardingRibbon" aria-label="行程时间">
          <div>
            <span>从这里出发</span>
            <strong>{form.startLocationName || "出发点"}</strong>
          </div>
          <i aria-hidden="true" />
          <div>
            <span>{form.departureMode === "now" ? "现在出发" : "预约出发"} · {transportLabel(form.transportPreference)}优先</span>
            <strong>{formatTravelDate(form.travelDate)} {form.startTime}-{form.endTime}</strong>
          </div>
        </div>
      </section>

      <TripHistory
        activeTripId={activeTripId}
        loading={historyLoading}
        onDelete={handleDeleteHistory}
        onEdit={handleEditHistory}
        onRefresh={refreshHistory}
        onView={handleViewHistory}
        total={tripHistoryTotal}
        trips={tripHistory}
      />

      {plans.length > 0 && (
        <section className="resultsPanel" id="routes" aria-label="路线结果">
          <header className="sectionHead">
            <div>
              <p className="eyebrow">你的城市行程</p>
              <h2>路线已排好，可以继续微调</h2>
            </div>
            <span>
              {form.city}｜{formatTravelDate(form.travelDate)} {form.startTime}-{form.endTime}｜{travelerStyleLabel(form.travelerStyle)}
            </span>
          </header>

          <section className="routeGrid" aria-label="路线方案">
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
            <div className="routeSketch" aria-label="路线示意">
              <span className="routeSketchPoint start">起点</span>
              {selectedPlan.stops.slice(0, 5).map((stop, index) => (
                <span className="routeSketchPoint" key={`${stop.destinationId}-${index}`}>
                  {stop.name}
                </span>
              ))}
            </div>
          )}

          {selectedPlan && (
            <RouteEditor
              loading={loading}
              onRegenerate={handleRegenerateFromEditedRoute}
              plan={selectedPlan}
              pois={pois}
            />
          )}

          {selectedPlan && (
            <RouteMap selectedPlan={selectedPlan} startPoint={startPoint} stops={orderedMapStops(pois, selectedPlan)} />
          )}

          {selectedPlan && (
            <RouteExporter
              city={form.city}
              endTime={form.endTime}
              plan={selectedPlan}
              startName={startPoint?.name ?? form.startLocationName}
              startTime={form.startTime}
            />
          )}

          {pois.length > 0 && (
            <section className="poiGrid" aria-label="已确认地点">
              {pois.map((poi) => (
                <PoiCard key={poi.sourcePoiId} poi={poi} />
              ))}
            </section>
          )}

          {selectedPlan && <RouteTimeline plan={selectedPlan} />}
        </section>
      )}

      <CandidateConfirmation
        groups={candidateGroups}
        loading={loading}
        onClose={() => setConfirmationOpen(false)}
        onConfirm={handleConfirmCandidates}
        onPreferenceChange={handleDestinationPreferenceChange}
        onRemoveDestination={handleRemoveDestinationGroup}
        onSelect={handleCandidateSelect}
        open={confirmationOpen}
        preferences={destinationPreferences}
        selection={candidateSelection}
      />

      {plans.length > 0 && (
        <button
          className="fixedReplan"
          onClick={() => document.getElementById("planner")?.scrollIntoView({ behavior: "smooth", block: "start" })}
          type="button"
        >
          重新规划
        </button>
      )}
    </main>
  );
}

async function searchStartCandidates(
  city: string,
  keyword: string,
  detectedLocation?: PoiCandidate | null,
): Promise<PoiCandidate[]> {
  const poiCandidates = await searchPoi(city, keyword);
  if (poiCandidates.length > 0) {
    const candidates = poiCandidates.map((candidate) => ({
      ...candidate,
      suggestedStayMinutes: 0,
      tags: unique(["起点", ...candidate.tags]),
      note: "这里会作为当前出发地点，请优先确认地址是否准确。",
    }));
    return detectedLocation ? uniquePoiCandidates([detectedLocation, ...candidates]) : candidates;
  }

  const location = await resolveLocation(city, keyword);
  const candidates = location ? [locationToPoiCandidate(location)] : [];
  return detectedLocation ? uniquePoiCandidates([detectedLocation, ...candidates]) : candidates;
}

function locationToPoiCandidate(location: LocationCandidate): PoiCandidate {
  const isCurrentLocation = location.source === "browser";
  return {
    source: location.source,
    sourcePoiId: `start_${location.source}_${location.lng}_${location.lat}`,
    name: location.name,
    address: location.address,
    lat: location.lat,
    lng: location.lng,
    poiType: "start",
    suggestedStayMinutes: 0,
    riskLevel: "low",
    tags: unique([isCurrentLocation ? "当前位置" : "", "起点"]),
    note: isCurrentLocation
      ? "这是浏览器授权定位得到的出发点，请确认地址或附近入口是否准确。"
      : "这里会作为当前出发地点，请优先确认地址是否准确。",
    practicalInfo: {
      source: "rule",
      confidence: "low",
      openingHours: "起点无需营业时间",
      ticket: "无需门票",
      closureStatus: "不适用",
      popularity: "不适用",
      tips: ["起点只用于计算路线，请确认地址和入口是否准确。"],
    },
  };
}

function tripToForm(trip: TripRecord): TripFormValue {
  return {
    city: trip.city,
    startLocationName: trip.startLocation.name,
    departureMode: "scheduled",
    travelDate: dateInputValue(trip.startTime),
    startTime: timeInputValue(trip.startTime),
    endTime: timeInputValue(trip.endTime),
    transportPreference: trip.transportPreference,
    pace: trip.pace,
    travelerStyle: trip.travelerStyle ?? "classic",
    destinationsText: trip.destinations.map((destination) => destination.rawName || destination.name).join(", "),
  };
}

function tripToPois(trip: TripRecord): PoiCandidate[] {
  return tripDestinationsToPois(trip.destinations);
}

function tripDestinationsToPois(destinations: TripDestination[]): PoiCandidate[] {
  return destinations.map((destination) => ({
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

function selectTripDestinations(destinations: TripDestination[], requestedNames: string[]) {
  const available = [...destinations];
  return requestedNames.map((rawName) => {
    const index = available.findIndex(
      (destination) =>
        placeNameMatches(destination.rawName || destination.name, rawName) ||
        placeNameMatches(destination.name, rawName),
    );
    if (index < 0) {
      throw new Error(`找不到“${rawName}”的原始地点信息，请展开输入后重新确认。`);
    }
    const [destination] = available.splice(index, 1);
    return { destination, rawName };
  });
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

function timeInputValue(value: string) {
  return value.match(/T(\d{2}:\d{2})/)?.[1] ?? "09:00";
}

function dateInputValue(value: string) {
  return value.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? formatDateInput(new Date());
}

function selectedCandidate(group: CandidateGroup | undefined, selection: CandidateSelection) {
  if (!group) {
    return null;
  }
  const selectedId = selection[group.key];
  return group.candidates.find((candidate) => candidate.sourcePoiId === selectedId) ?? null;
}

function defaultSelection(groups: CandidateGroup[]): CandidateSelection {
  return Object.fromEntries(groups.map((group) => [group.key, preferredCandidateForGroup(group)?.sourcePoiId ?? ""]));
}

function defaultDestinationPreferences(groups: CandidateGroup[]): DestinationPreferences {
  return Object.fromEntries(
    groups
      .filter((group) => group.role === "destination")
      .map((group) => [group.key, defaultDestinationPreference()]),
  );
}

function defaultDestinationPreference(): DestinationPreference {
  return { mustGo: false, stayMinutes: null };
}

function buildCandidateSignature(form: TripFormValue, names: string[]) {
  return JSON.stringify({
    city: form.city.trim(),
    startLocationName: form.startLocationName.trim(),
    destinations: names,
  });
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function uniquePoiCandidates(candidates: PoiCandidate[]) {
  const seen = new Set<string>();
  const result: PoiCandidate[] = [];
  for (const candidate of candidates) {
    const key = `${candidate.sourcePoiId}:${candidate.lat.toFixed(6)}:${candidate.lng.toFixed(6)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(candidate);
  }
  return result;
}

function parseDestinationNames(text: string): string[] {
  return text
    .split(/[，,、；;\n\r]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolvePlanningStage(message: string, candidatesReady: boolean): PlanningStage {
  if (message.includes("查找") || message.includes("匹配") || message.includes("确认")) {
    return "searching";
  }
  if (message.includes("说明") || message.includes("建议")) {
    return "explaining";
  }
  return candidatesReady ? "routing" : "searching";
}

function summarizeRouteDecision(plan: RoutePlan, requestedNames: string[]) {
  const requested = unique(requestedNames);
  if (requested.length === 0) {
    return plan.decisionNotes?.[0] ?? plan.insight?.routeReason ?? plan.summary;
  }

  const kept = requested.filter((name) => plan.stops.some((stop) => placeNameMatches(stop.name, name)));
  const omitted = requested.filter((name) => !kept.includes(name));
  if (omitted.length === 0) {
    return `已放入 ${requested.length} 个地点，按顺路和时间排序。`;
  }

  const keptText = kept.length > 0 ? `先走 ${formatPlaceNames(kept, 3)}` : "先保留最顺路的地点";
  return `${keptText}；${formatPlaceNames(omitted, omitted.length)} 暂不放入。`;
}

function placeNameMatches(stopName: string, requestedName: string) {
  const stop = normalizePlaceName(stopName);
  const requested = normalizePlaceName(requestedName);
  return stop.includes(requested) || requested.includes(stop);
}

function normalizePlaceName(value: string) {
  return value.trim().replace(/\s+/g, "").toLowerCase();
}

function formatPlaceNames(names: string[], limit: number) {
  const visibleNames = names.slice(0, limit).join("、");
  const rest = names.length - limit;
  return rest > 0 ? `${visibleNames} 等 ${names.length} 个地点` : visibleNames;
}

function buildLastRouteSession({
  activeTripId,
  form,
  plans,
  pois,
  selectedPlanId,
  startPoint,
}: Omit<LastRouteSession, "savedAt" | "version">): LastRouteSession {
  return {
    activeTripId,
    form,
    plans,
    pois,
    savedAt: new Date().toISOString(),
    selectedPlanId,
    startPoint,
    version: 1,
  };
}

function readLastRouteSession(): LastRouteSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(LAST_ROUTE_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as LastRouteSession;
    if (parsed?.version !== 1 || !Array.isArray(parsed.plans) || parsed.plans.length === 0 || !parsed.form) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeLastRouteSession(session: LastRouteSession) {
  try {
    window.localStorage.setItem(LAST_ROUTE_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Restoring a route is optional; the app still works without storage.
  }
}

function clearLastRouteSession() {
  try {
    window.localStorage.removeItem(LAST_ROUTE_STORAGE_KEY);
  } catch {
    // Local storage can be unavailable in private or restricted contexts.
  }
}

function buildLastRoutePrompt(session: LastRouteSession | null) {
  if (!session) {
    return null;
  }

  const plan = session.plans.find((item) => item.planId === session.selectedPlanId) ?? session.plans[0];
  if (!plan) {
    return null;
  }

  const step = readNavigatorStep(plan);
  const currentLeg = plan.legs[Math.min(step, Math.max(0, plan.legs.length - 1))];
  const nextStopName = currentLeg?.toName ?? plan.stops[0]?.name ?? "下一站";
  return {
    city: session.form.city,
    nextStopName,
    savedLabel: formatLastRouteSavedAt(session.savedAt),
    stopsCount: plan.stops.length,
    summary: `${session.form.startLocationName} · ${session.form.startTime}-${session.form.endTime}`,
  };
}

function readNavigatorStep(plan: RoutePlan) {
  try {
    const raw = window.localStorage.getItem(`city-route:navigator:${plan.tripId ?? "guest"}:${plan.planId}`);
    const parsed = raw ? Number(raw) : 0;
    return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
  } catch {
    return 0;
  }
}

function formatLastRouteSavedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "上次路线";
  }

  const today = formatDateInput(new Date());
  if (formatDateInput(date) === today) {
    return `今天 ${formatTimeInput(date)}`;
  }
  return `${date.getMonth() + 1}月${date.getDate()}日 ${formatTimeInput(date)}`;
}

function validateForm(form: TripFormValue, names: string[]) {
  if (!form.city.trim()) {
    throw new Error("请填写城市。");
  }
  if (!form.startLocationName.trim()) {
    throw new Error("请填写当前地点。");
  }
  if (names.length < 2 || names.length > 6) {
    throw new Error("请填写 2-6 个想去的地点。");
  }
  if (!form.travelDate.trim()) {
    throw new Error("请选择出发日期。");
  }
  if (form.travelDate < formatDateInput(new Date())) {
    throw new Error("出发日期不能早于今天。");
  }
  if (toMinutes(form.endTime) <= toMinutes(form.startTime)) {
    throw new Error("结束时间需要晚于开始时间。");
  }
}

function toMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function travelerStyleLabel(value: TripFormValue["travelerStyle"]) {
  if (value === "family") return "亲子玩法";
  if (value === "couple") return "情侣玩法";
  if (value === "senior") return "老人玩法";
  if (value === "photo") return "摄影玩法";
  if (value === "food") return "美食玩法";
  if (value === "intense") return "特种兵玩法";
  return "经典玩法";
}

function transportLabel(value: TripFormValue["transportPreference"]) {
  if (value === "walk") return "步行";
  if (value === "taxi") return "打车";
  return "地铁";
}

function buildCurrentDepartureForm(current: TripFormValue): TripFormValue {
  const start = roundToNextMinutes(new Date(), 5);
  const end = clampSameDay(start, addMinutes(start, 6 * 60));
  return {
    ...current,
    departureMode: "now",
    travelDate: formatDateInput(start),
    startTime: formatTimeInput(start),
    endTime: formatTimeInput(end),
  };
}

function formatTravelDate(value: string) {
  if (!value) {
    return "今天";
  }

  const today = formatDateInput(new Date());
  if (value === today) {
    return "今天";
  }
  if (value === formatDateInput(addDays(new Date(), 1))) {
    return "明天";
  }

  const [, , month, day] = value.match(/^(\d{4})-(\d{2})-(\d{2})$/) ?? [];
  return month && day ? `${Number(month)}月${Number(day)}日` : value;
}

function roundToNextMinutes(date: Date, step: number) {
  const next = new Date(date);
  next.setSeconds(0, 0);
  const remainder = next.getMinutes() % step;
  if (remainder !== 0) {
    next.setMinutes(next.getMinutes() + (step - remainder));
  }
  return next;
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function clampSameDay(start: Date, candidate: Date) {
  const end = new Date(candidate);
  if (formatDateInput(start) !== formatDateInput(end)) {
    end.setTime(start.getTime());
    end.setHours(23, 59, 0, 0);
  }
  if (end.getTime() <= start.getTime()) {
    end.setTime(start.getTime());
    end.setMinutes(end.getMinutes() + 30);
    if (formatDateInput(start) !== formatDateInput(end)) {
      end.setTime(start.getTime());
      end.setHours(23, 59, 0, 0);
    }
  }
  return end;
}

function formatDateInput(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatTimeInput(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

async function getBrowserPosition(): Promise<GeolocationPosition> {
  const positions: GeolocationPosition[] = [];
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const position = await requestBrowserPosition({
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: attempt === 0 ? 15_000 : 10_000,
      });
      positions.push(position);
      if (Number.isFinite(position.coords.accuracy) && position.coords.accuracy <= 120) {
        return position;
      }
    } catch (error) {
      lastError = error;
      if (typeof (error as { code?: unknown })?.code === "number" && (error as { code: number }).code === 1) {
        throw error;
      }
    }
  }

  if (positions.length > 0) {
    return positions.reduce((best, current) =>
      normalizeAccuracy(current.coords.accuracy) < normalizeAccuracy(best.coords.accuracy) ? current : best,
    );
  }

  throw lastError ?? new Error("定位失败，请手动填写起点。");
}

function requestBrowserPosition(options: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

function normalizeAccuracy(value: number | null | undefined) {
  return Number.isFinite(value) ? Number(value) : Number.POSITIVE_INFINITY;
}

function locationAccuracyMessage(accuracy: number | null | undefined) {
  const normalized = normalizeAccuracy(accuracy);
  if (!Number.isFinite(normalized)) {
    return "浏览器没有返回定位精度，建议检查地图位置。";
  }
  if (normalized <= 200) {
    return `浏览器定位精度约 ${formatAccuracy(normalized)}，通常可以直接使用。`;
  }
  if (normalized <= 1000) {
    return `浏览器定位精度约 ${formatAccuracy(normalized)}，建议看一下地图和起点名称。`;
  }
  return `浏览器定位精度约 ${formatAccuracy(normalized)}，可能偏差较大，建议把起点手动改成酒店、地铁站或附近地标。`;
}

function formatAccuracy(meters: number) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} 公里` : `${Math.round(meters)} 米`;
}

function formatDuration(minutes: number) {
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const restMinutes = minutes % 60;
    return restMinutes > 0 ? `${hours}时${restMinutes}分` : `${hours}小时`;
  }

  return `${minutes}分钟`;
}

function formatClock(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.match(/T(\d{2}:\d{2})/)?.[1] ?? value.slice(0, 5);
  }

  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function BriefStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EngineSignal({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PreviewStop({ index, name, meta, type }: { index: number; name: string; meta?: string; type?: "start" }) {
  return (
    <article className={`previewStop ${type === "start" ? "start" : ""}`}>
      <span>{type === "start" ? "起" : index}</span>
      <div>
        <strong>{name}</strong>
        <small>{meta ?? (type === "start" ? "出发位置" : "待确认地点")}</small>
      </div>
    </article>
  );
}

function buildChinaDateTime(date: string, time: string) {
  return `${date || formatDateInput(new Date())}T${time}:00+08:00`;
}
