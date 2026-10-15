import { useState } from "react";

import type { PoiCandidate } from "../lib/types";
import { PracticalInfoGrid } from "./practical-info";
import { RiskBadge } from "./risk-badge";

export type CandidateRole = "start" | "destination";

export type CandidateGroup = {
  key: string;
  role: CandidateRole;
  rawName: string;
  candidates: PoiCandidate[];
};

export type CandidateSelection = Record<string, string>;

export type DestinationPreference = {
  mustGo: boolean;
  stayMinutes: number | null;
};

export type DestinationPreferences = Record<string, DestinationPreference>;

export function CandidateConfirmation({
  groups,
  selection,
  preferences,
  loading,
  open,
  onClose,
  onConfirm,
  onSelect,
  onPreferenceChange,
  onRemoveDestination,
}: {
  groups: CandidateGroup[];
  selection: CandidateSelection;
  preferences: DestinationPreferences;
  loading: boolean;
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onSelect: (groupKey: string, sourcePoiId: string) => void;
  onPreferenceChange: (groupKey: string, next: DestinationPreference) => void;
  onRemoveDestination: (groupKey: string) => void;
}) {
  const [activeGroupIndex, setActiveGroupIndex] = useState(0);

  if (groups.length === 0 || !open) {
    return null;
  }

  const reviewGroups = groups.filter(candidateGroupNeedsReview);
  const autoConfirmedCount = groups.length - reviewGroups.length;
  const safeGroupIndex = Math.min(activeGroupIndex, Math.max(0, reviewGroups.length - 1));
  const activeGroup = reviewGroups[safeGroupIndex] ?? null;
  const isLastGroup = safeGroupIndex === reviewGroups.length - 1;

  const startGroup = groups.find((group) => group.role === "start");
  const selectedStart = startGroup
    ? startGroup.candidates.find((candidate) => candidate.sourcePoiId === selection[startGroup.key]) ??
      startGroup.candidates[0]
    : null;

  function closeConfirmation() {
    setActiveGroupIndex(0);
    onClose();
  }

  function confirmSelection() {
    setActiveGroupIndex(0);
    onConfirm();
  }

  return (
    <div className="confirmOverlay" role="presentation">
      <section className="confirmPanel" aria-label="地点候选确认" aria-modal="true" role="dialog">
        <div className="confirmHead">
          <div>
            <p className="eyebrow">地点确认</p>
            <h2>{reviewGroups.length > 0 ? "确认容易选错的地点" : "地点已经匹配"}</h2>
          </div>
          <button className="ghostButton" onClick={closeConfirmation} type="button">
            继续编辑
          </button>
        </div>

        <div className="confirmList desktopCandidateList">
          {autoConfirmedCount > 0 && <AutoConfirmedNotice count={autoConfirmedCount} />}
          {reviewGroups.map((group) => (
            <CandidateGroupSection
              group={group}
              key={group.key}
              onPreferenceChange={onPreferenceChange}
              onRemoveDestination={onRemoveDestination}
              onSelect={onSelect}
              preference={preferences[group.key] ?? defaultPreference()}
              selectedPoiId={selection[group.key]}
              selectedStart={selectedStart}
            />
          ))}
        </div>

        <div className="mobileCandidateFlow">
          {autoConfirmedCount > 0 && <AutoConfirmedNotice count={autoConfirmedCount} />}

          {activeGroup ? (
            <>
              <nav className="mobileCandidateSteps" aria-label="地点确认进度">
                {reviewGroups.map((group, index) => (
                  <button
                    aria-current={index === safeGroupIndex ? "step" : undefined}
                    className={index === safeGroupIndex ? "active" : ""}
                    key={group.key}
                    onClick={() => setActiveGroupIndex(index)}
                    type="button"
                  >
                    <span>{index + 1}</span>
                    {group.role === "start" ? "起点" : group.rawName}
                  </button>
                ))}
              </nav>

              <div className="mobileCandidateCounter">
                <span>{safeGroupIndex + 1} / {reviewGroups.length}</span>
                <div>
                  <strong>{activeGroup.role === "start" ? "确认出发点" : `确认 ${activeGroup.rawName}`}</strong>
                  <small>先核对区县和完整地址</small>
                </div>
              </div>

              <CandidateGroupSection
                group={activeGroup}
                onPreferenceChange={onPreferenceChange}
                onRemoveDestination={onRemoveDestination}
                onSelect={onSelect}
                preference={preferences[activeGroup.key] ?? defaultPreference()}
                selectedPoiId={selection[activeGroup.key]}
                selectedStart={selectedStart}
              />

              <div className="confirmActions mobileConfirmActions">
                <button
                  className="ghostButton"
                  onClick={() => (safeGroupIndex === 0 ? closeConfirmation() : setActiveGroupIndex(safeGroupIndex - 1))}
                  type="button"
                >
                  {safeGroupIndex === 0 ? "继续编辑" : "上一个"}
                </button>
                <button
                  className="primary"
                  disabled={loading}
                  onClick={() => (isLastGroup ? confirmSelection() : setActiveGroupIndex(safeGroupIndex + 1))}
                  type="button"
                >
                  {loading ? "正在规划路线..." : isLastGroup ? "确认生成" : "下一个地点"}
                </button>
              </div>
            </>
          ) : (
            <div className="mobileAutoConfirmedAll">
              <strong>这些地点都匹配清楚了</strong>
              <span>名称和地点类型一致，可以直接生成路线。</span>
              <div className="confirmActions mobileConfirmActions">
                <button className="ghostButton" onClick={closeConfirmation} type="button">
                  继续编辑
                </button>
                <button className="primary" disabled={loading} onClick={confirmSelection} type="button">
                  {loading ? "正在规划路线..." : "直接生成路线"}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="confirmActions desktopConfirmActions">
          <button className="ghostButton" onClick={closeConfirmation} type="button">
            再改一下
          </button>
          <button className="primary" disabled={loading} onClick={confirmSelection} type="button">
            {loading ? "正在规划路线..." : "确认生成"}
          </button>
        </div>
      </section>
    </div>
  );
}

function AutoConfirmedNotice({ count }: { count: number }) {
  return (
    <div className="autoConfirmedNotice">
      <span aria-hidden="true">✓</span>
      <div>
        <strong>已自动确认 {count} 个地点</strong>
        <small>名称与地点类型匹配，无需逐个检查。</small>
      </div>
    </div>
  );
}

function CandidateGroupSection({
  group,
  selectedPoiId,
  selectedStart,
  preference,
  onSelect,
  onPreferenceChange,
  onRemoveDestination,
}: {
  group: CandidateGroup;
  selectedPoiId: string | undefined;
  selectedStart: PoiCandidate | null;
  preference: DestinationPreference;
  onSelect: (groupKey: string, sourcePoiId: string) => void;
  onPreferenceChange: (groupKey: string, next: DestinationPreference) => void;
  onRemoveDestination: (groupKey: string) => void;
}) {
  const primaryCandidate =
    group.candidates.find((candidate) => candidate.sourcePoiId === selectedPoiId) ?? group.candidates[0];
  const alternativeCandidates = group.candidates.filter(
    (candidate) => candidate.sourcePoiId !== primaryCandidate?.sourcePoiId,
  );
  const visibleAlternatives = alternativeCandidates.slice(0, 1);
  const hiddenAlternatives = alternativeCandidates.slice(1);

  return (
    <section className="candidateGroup">
      <div className="candidateGroupHead">
        <div>
          <strong>{group.role === "start" ? "从这里出发" : "想去这里"}</strong>
          <span>{group.rawName}</span>
        </div>
        <span>{group.candidates.length > 1 ? "请选择一个地点" : "已为你选好"}</span>
      </div>

      <div className="candidateChoiceFlow">
        {primaryCandidate && (
          <div className="candidatePrimaryPick">
            <div className="candidateQuestion">
              <span>{group.role === "start" ? "你现在是从这里出发吗？" : "你说的是这个地方吗？"}</span>
              <strong>{primaryCandidate.name}</strong>
              <small>
                {addressArea(primaryCandidate.address)} · {distanceLabel(primaryCandidate, selectedStart, group.role)} · {typeLabel(primaryCandidate)}
              </small>
            </div>
            <CandidateOption
              candidate={primaryCandidate}
              featured
              group={group}
              onSelect={onSelect}
              selected
              selectedStart={selectedStart}
            />
          </div>
        )}

        {visibleAlternatives.length > 0 && (
          <div className="candidateAlternativeBlock">
            <div className="candidateAlternativeHead">
              <span>不是这个？</span>
              <strong>看最像的备选</strong>
            </div>
            <div className="candidateOptions">
              {visibleAlternatives.map((candidate) => (
                <CandidateOption
                  candidate={candidate}
                  group={group}
                  key={candidate.sourcePoiId}
                  onSelect={onSelect}
                  selected={false}
                  selectedStart={selectedStart}
                />
              ))}
            </div>
            {hiddenAlternatives.length > 0 && (
              <details className="candidateMore">
                <summary>查看更多相似地点</summary>
                <div className="candidateOptions">
                  {hiddenAlternatives.map((candidate) => (
                    <CandidateOption
                      candidate={candidate}
                      group={group}
                      key={candidate.sourcePoiId}
                      onSelect={onSelect}
                      selected={false}
                      selectedStart={selectedStart}
                    />
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </div>

      {group.role === "destination" && (
        <DestinationControls
          groupKey={group.key}
          onChange={onPreferenceChange}
          onRemove={onRemoveDestination}
          preference={preference}
        />
      )}
    </section>
  );
}

function CandidateOption({
  candidate,
  group,
  selected,
  selectedStart,
  featured = false,
  onSelect,
}: {
  candidate: PoiCandidate;
  group: CandidateGroup;
  selected: boolean;
  selectedStart: PoiCandidate | null;
  featured?: boolean;
  onSelect: (groupKey: string, sourcePoiId: string) => void;
}) {
  const match = candidateMatch(candidate, group.rawName, group.role);

  return (
    <article className={`candidateOption ${featured ? "featured" : ""} ${selected ? "selected" : ""}`}>
      <button className="candidateSelectSurface" onClick={() => onSelect(group.key, candidate.sourcePoiId)} type="button">
        <span className="candidateImage">{candidate.name.slice(0, 1)}</span>
        <div className="candidateContent">
          <div className="candidateTopline">
            <h3>{candidate.name}</h3>
            <span>{selected ? "已选" : "换成这个"}</span>
          </div>
          <div className="candidateLocationLine">
            <strong>{addressArea(candidate.address)}</strong>
            <p className="candidateAddress">{candidateAddressDetail(candidate.address)}</p>
          </div>
          <div className="candidateSignalBar" aria-label="候选地点识别信息">
            <span className={`candidateSignal ${match.level}`}>{match.label}</span>
            <span>{distanceLabel(candidate, selectedStart, group.role)}</span>
            <span>{typeLabel(candidate)}</span>
          </div>
          {featured && <p className="candidateReason">推荐原因：{candidateRecommendationReason(candidate, match, group)}</p>}
          {featured && <p className="candidateBrief">{candidateBrief(candidate, group.rawName, group.role)}</p>}
          <div className="candidateFacts">
            <span>{activityLabel(candidate)}</span>
            <span>{stayLabel(candidate)}</span>
          </div>
        </div>
      </button>
      <details className="candidateDetails">
        <summary>查看开放、风险和标签</summary>
        <div className="candidateDetailBody">
          <PracticalInfoGrid info={candidate.practicalInfo} compact />
          <p className="candidateReminder">{candidateReminder(candidate, group.rawName, group.role)}</p>
          <div className="chipRow">
            {candidate.tags.map((tag, index) => (
              <span className="chip" key={`${tag}-${index}`}>
                {tag}
              </span>
            ))}
            <RiskBadge level={candidate.riskLevel} />
          </div>
        </div>
      </details>
    </article>
  );
}

function candidateRecommendationReason(
  candidate: PoiCandidate,
  match: { label: string; level: string },
  group: CandidateGroup,
) {
  if (group.role === "start") {
    return "它会作为路线第 0 站，优先确认地址是否就是你现在的出发点。";
  }
  if (match.label.includes("完全")) {
    return "名称完全匹配，通常就是你输入的那个地点。";
  }
  if (match.label.includes("接近")) {
    return "名称最接近，同时会结合地址和地点类型判断。";
  }
  if (match.label.includes("地址")) {
    return "地址里包含你输入的关键词，适合用来排除同名地点。";
  }
  if (candidate.riskLevel === "high") {
    return "名称相关，但开放或预约风险较高，生成路线前建议核对。";
  }
  return "名称、地址和类型都相关，但仍建议看一眼地址。";
}

function DestinationControls({
  groupKey,
  preference,
  onChange,
  onRemove,
}: {
  groupKey: string;
  preference: DestinationPreference;
  onChange: (groupKey: string, next: DestinationPreference) => void;
  onRemove: (groupKey: string) => void;
}) {
  return (
    <div className="destinationControls" aria-label="本次路线设置">
      <div>
        <strong>本次安排</strong>
        <span>可以标记一定想去，也可以改停留时间。</span>
      </div>
      <button
        className={preference.mustGo ? "active" : ""}
        onClick={() => onChange(groupKey, { ...preference, mustGo: !preference.mustGo })}
        type="button"
      >
        {preference.mustGo ? "一定想去" : "可调整"}
      </button>
      <label>
        停留分钟
        <input
          min={25}
          max={240}
          placeholder="自动"
          step={5}
          type="number"
          value={preference.stayMinutes ?? ""}
          onChange={(event) =>
            onChange(groupKey, {
              ...preference,
              stayMinutes: parseStayMinutes(event.target.value),
            })
          }
        />
      </label>
      <button className="removeDestination" onClick={() => onRemove(groupKey)} type="button">
        移除
      </button>
    </div>
  );
}

function defaultPreference(): DestinationPreference {
  return { mustGo: false, stayMinutes: null };
}

export function preferredCandidateForGroup(group: CandidateGroup) {
  const browserLocation = group.role === "start" ? group.candidates.find((candidate) => candidate.source === "browser") : null;
  if (browserLocation) {
    return browserLocation;
  }

  const rawName = normalizePlaceName(group.rawName);
  const exactMatches = group.candidates.filter((candidate) => normalizePlaceName(candidate.name) === rawName);
  return exactMatches.length === 1 ? exactMatches[0] : group.candidates[0];
}

export function candidateGroupNeedsReview(group: CandidateGroup) {
  if (group.candidates.length <= 1) {
    return false;
  }
  if (group.role === "start") {
    return !group.candidates.some((candidate) => candidate.source === "browser");
  }

  const rawName = normalizePlaceName(group.rawName);
  const exactMatches = group.candidates.filter((candidate) => normalizePlaceName(candidate.name) === rawName);
  return exactMatches.length !== 1;
}

function normalizePlaceName(value: string) {
  return value.trim().toLocaleLowerCase("zh-CN").replace(/[\s·•・,，。.!！?？()（）\-_]/g, "");
}

function parseStayMinutes(value: string) {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.min(240, Math.max(25, Math.round(parsed)));
}

function candidateBrief(candidate: PoiCandidate, rawName: string, role: CandidateRole) {
  if (role === "start") {
    return "这里会作为路线起点。请确认它是不是你此刻所在或准备出发的位置。";
  }

  const type = typeLabel(candidate);
  const activity = activityLabel(candidate);
  if (candidate.name.includes(rawName) || rawName.includes(candidate.name)) {
    return `这是与“${rawName}”名称最接近的候选，偏向${type}，适合${activity}。`;
  }
  return `这是“${rawName}”相关候选之一，名称不完全一致，偏向${type}，适合${activity}。`;
}

function candidateMatch(candidate: PoiCandidate, rawName: string, role: CandidateRole) {
  if (role === "start") {
    return { label: "起点候选", level: "strong" };
  }
  if (candidate.name === rawName) {
    return { label: "名称完全匹配", level: "strong" };
  }
  if (candidate.name.includes(rawName) || rawName.includes(candidate.name)) {
    return { label: "名称接近", level: "strong" };
  }
  if (candidate.address.includes(rawName)) {
    return { label: "地址相关", level: "medium" };
  }
  return { label: "相关候选", level: "weak" };
}

function distanceLabel(candidate: PoiCandidate, origin: PoiCandidate | null, role: CandidateRole) {
  if (role === "start") {
    return "作为出发点";
  }
  if (!origin || !Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) {
    return "距起点待确认";
  }

  const distance = distanceBetweenMeters(origin.lat, origin.lng, candidate.lat, candidate.lng);
  return `距起点约 ${formatDistance(distance)}`;
}

function candidateReminder(candidate: PoiCandidate, rawName: string, role: CandidateRole) {
  if (role === "start") {
    return "如果你要从酒店、车站或商场的具体入口出发，建议选择地址最接近的候选。";
  }
  if (!candidate.name.includes(rawName) && !rawName.includes(candidate.name)) {
    return "名称不完全一致，优先核对地址和地点类型，避免选到同名商场、店铺或区域内子地点。";
  }
  if (candidate.riskLevel === "high") {
    return "该地点可能涉及预约、闭馆或开放时间限制，生成路线前建议确认官方信息。";
  }
  return "如果你想去的是具体店铺、商场或入口，请优先选择地址更精确的候选。";
}

function typeLabel(candidate: PoiCandidate) {
  const text = `${candidate.name};${candidate.poiType};${candidate.tags.join(";")}`;
  if (hasAny(text, ["博物馆", "展览", "美术馆", "文化"])) return "展馆/文化空间";
  if (hasAny(text, ["风景名胜", "景点", "地标", "夜景"])) return "景点/地标";
  if (hasAny(text, ["购物", "商场", "商业", "步行街"])) return "商业/购物";
  if (hasAny(text, ["餐饮", "小吃", "美食", "晚餐"])) return "餐饮/休闲";
  if (hasAny(text, ["交通", "火车站", "机场", "地铁", "车站"])) return "交通/出发点";
  if (hasAny(text, ["道路", "街区", "Citywalk", "拍照"])) return "街区/步行";
  return "城市地点";
}

function addressArea(address: string) {
  const area = address.match(/(?:^|省|市)([\u4e00-\u9fff]{2,6}(?:区|县))/)?.[1];
  return area || "区域待确认";
}

function candidateAddressDetail(address: string) {
  if (!address.trim()) {
    return "完整地址待确认";
  }
  if (address.trim() === addressArea(address)) {
    return "地址仅到区，请结合名称和距离确认";
  }
  return address;
}

function activityLabel(candidate: PoiCandidate) {
  const text = `${candidate.name};${candidate.poiType};${candidate.tags.join(";")}`;
  if (hasAny(text, ["夜景", "外滩", "地标"])) return "看景、拍照和散步";
  if (hasAny(text, ["购物", "商场", "商业", "步行街"])) return "逛街、吃饭和休闲";
  if (hasAny(text, ["博物馆", "展览", "美术馆"])) return "室内参观和文化体验";
  if (hasAny(text, ["餐饮", "小吃", "美食"])) return "吃饭和短暂停留";
  if (hasAny(text, ["道路", "街区", "Citywalk", "拍照"])) return "城市漫步和拍照";
  if (hasAny(text, ["交通", "火车站", "机场", "地铁", "车站"])) return "作为出发或换乘地点";
  return "短暂停留和周边游览";
}

function stayLabel(candidate: PoiCandidate) {
  if (candidate.suggestedStayMinutes <= 0) {
    return "起点";
  }
  return `建议 ${candidate.suggestedStayMinutes} 分钟`;
}

function hasAny(text: string, tokens: string[]) {
  return tokens.some((token) => text.includes(token));
}

function distanceBetweenMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const radius = 6_371_000;
  const phi1 = toRadians(lat1);
  const phi2 = toRadians(lat2);
  const deltaPhi = toRadians(lat2 - lat1);
  const deltaLambda = toRadians(lng2 - lng1);
  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  return 2 * radius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function formatDistance(value: number) {
  if (!Number.isFinite(value)) {
    return "待确认";
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)} 公里`;
  }
  return `${Math.max(1, Math.round(value))} 米`;
}
