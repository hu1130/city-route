import { useState, type FormEvent } from "react";
import type { TripFormValue } from "../lib/types";

const naturalPromptExample = "我在上海，下午3点从人民广场出发，想去武康路、外滩、豫园、新天地，晚上9点前结束";

const knownCities = ["上海", "北京", "杭州", "成都", "广州", "深圳", "西安", "南京", "重庆", "武汉"] as const;

const transportOptions = [
  { value: "walk", label: "步行", icon: "🚶" },
  { value: "metro", label: "地铁", icon: "🚇" },
  { value: "taxi", label: "打车", icon: "🚕" },
] as const;

const paceOptions = [
  { value: "relaxed", label: "轻松" },
  { value: "balanced", label: "常规" },
  { value: "compact", label: "紧凑" },
] as const;

const travelerStyleOptions = [
  { value: "classic", label: "经典" },
  { value: "family", label: "亲子" },
  { value: "couple", label: "情侣" },
  { value: "senior", label: "老人" },
  { value: "photo", label: "摄影" },
  { value: "food", label: "美食" },
  { value: "intense", label: "特种兵" },
] as const;

export function TripForm({
  value,
  loading,
  locating,
  locationAccuracyMeters,
  onChange,
  onUseCurrentLocation,
  onSubmit,
  submitLabel,
}: {
  value: TripFormValue;
  loading: boolean;
  locating?: boolean;
  locationAccuracyMeters?: number | null;
  onChange: (next: TripFormValue) => void;
  onUseCurrentLocation?: () => void;
  onSubmit: () => void;
  submitLabel?: string;
}) {
  const [naturalText, setNaturalText] = useState("");
  const destinationNames = parseDestinationNames(value.destinationsText);

  function update<K extends keyof TripFormValue>(key: K, nextValue: TripFormValue[K]) {
    onChange({ ...value, [key]: nextValue });
  }

  function useCurrentDeparture() {
    onChange(buildCurrentDepartureValue(value));
  }

  function useScheduledDeparture() {
    onChange({
      ...value,
      departureMode: "scheduled",
      travelDate: value.travelDate || formatDateInput(new Date()),
    });
  }

  function handleParseNaturalInput() {
    onChange(parseNaturalTrip(naturalText, value));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form className="tripComposer" onSubmit={submit}>
      <div className="composerHead">
        <div>
          <span>告诉我你想去哪</span>
          <h2>把目的地丢进来，我来排路线</h2>
        </div>
        <strong>{destinationNames.length} 个目的地</strong>
      </div>

      <label className="destinationField">
        <span className="fieldLabelRow">
          <span className="fieldLabel required">想去的地方</span>
          <small>可直接增删改</small>
        </span>
        <div className="tagInput heroDestinationInput">
          <div className="tagRail" aria-label="已输入地点">
            {destinationNames.length === 0 ? (
              <span className="emptyTag">输入 2-6 个地点，用逗号隔开</span>
            ) : (
              destinationNames.map((name) => <span key={name}>{name}</span>)
            )}
          </div>
          <textarea
            required
            rows={3}
            value={value.destinationsText}
            onChange={(event) => update("destinationsText", event.target.value)}
            placeholder="例如：武康路、外滩、豫园、新天地。也可以直接写：想逛街、看夜景、吃点好吃的。"
          />
        </div>
      </label>

      {destinationNames.length > 0 && (
        <div className="suggestionRail" aria-label="地点建议">
          {destinationNames.map((name, index) => (
            <article className="suggestionCard" key={`${name}-${index}`}>
              <span className="placeThumb">{index + 1}</span>
              <div>
                <strong>{name}</strong>
                <small>第 {index + 1} 站候选</small>
              </div>
            </article>
          ))}
        </div>
      )}

      <section className="quickTripStrip" aria-label="出发地设置">
        <div className="quickTripHead">
          <div>
            <span>出发地</span>
            <strong>{value.startLocationName || "还没有设置起点"}</strong>
          </div>
          {onUseCurrentLocation && (
            <button
              className="useCurrentLocation"
              disabled={loading || locating}
              onClick={onUseCurrentLocation}
              type="button"
            >
              {locating ? "定位中..." : "使用当前位置"}
            </button>
          )}
        </div>

        <div className="quickTripGrid">
          <label>
            <span className="fieldLabel required">城市</span>
            <input
              required
              value={value.city}
              onChange={(event) => update("city", event.target.value)}
              placeholder="例如：上海"
            />
          </label>
          <label>
            <span className="fieldLabel required">起点，可手动改</span>
            <input
              required
              value={value.startLocationName}
              onChange={(event) => update("startLocationName", event.target.value)}
              placeholder="例如：当前位置、酒店、人民广场"
            />
          </label>
        </div>

        <small className={`startLocationHint ${locationAccuracyClass(locationAccuracyMeters)}`}>
          {locationAccuracyHint(locationAccuracyMeters)}
        </small>
      </section>

      <details className="naturalPromptBox" aria-label="一句话规划">
        <summary className="naturalPromptSummary">
          <div className="naturalPromptHead">
            <span>一句话规划</span>
            <strong>像聊天一样告诉我</strong>
          </div>
        </summary>
        <textarea
          rows={3}
          value={naturalText}
          onChange={(event) => setNaturalText(event.target.value)}
          placeholder={naturalPromptExample}
        />
        <div className="naturalPromptActions">
          <button type="button" onClick={handleParseNaturalInput}>
            智能拆解
          </button>
          <small>自动填城市、起点、时间和目的地，下面仍然可以手动改。</small>
        </div>
      </details>

      <section className="departurePanel" aria-label="出发时间">
        <div className="departureModeSwitch" role="group" aria-label="出发方式">
          <button className={value.departureMode === "now" ? "active" : ""} onClick={useCurrentDeparture} type="button">
            现在出发
          </button>
          <button
            className={value.departureMode === "scheduled" ? "active" : ""}
            onClick={useScheduledDeparture}
            type="button"
          >
            预约时间
          </button>
        </div>

        {value.departureMode === "now" && (
          <p className="departureHint">
            已按你电脑当前时间生成，可点“现在出发”刷新到最新时间。
          </p>
        )}

        <div className="departureInputs">
          {value.departureMode === "scheduled" && (
            <label>
              <span className="fieldLabel required">日期</span>
              <input
                required
                type="date"
                min={formatDateInput(new Date())}
                value={value.travelDate}
                onChange={(event) => update("travelDate", event.target.value)}
              />
            </label>
          )}
          <label>
            <span>{value.departureMode === "now" ? "当前出发" : "出发"}</span>
            <input
              required
              type="time"
              value={value.startTime}
              onChange={(event) => update("startTime", event.target.value)}
            />
          </label>
          <label>
            <span>结束</span>
            <input
              required
              type="time"
              value={value.endTime}
              onChange={(event) => update("endTime", event.target.value)}
            />
          </label>
        </div>
      </section>

      <details className="routeTastePanel">
        <summary>路线口味：{transportLabel(value.transportPreference)} · {paceLabel(value.pace)} · {travelerStyleLabel(value.travelerStyle)}</summary>

        <div className="choiceRow">
          <fieldset>
            <legend className="fieldLabel required">交通方式</legend>
            <div className="segmented transportChoices">
              {transportOptions.map((option) => (
                <button
                  className={value.transportPreference === option.value ? "active" : ""}
                  key={option.value}
                  onClick={() => update("transportPreference", option.value)}
                  type="button"
                >
                  <span className="optionIcon" aria-hidden="true">{option.icon}</span>
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="fieldLabel required">行程强度</legend>
            <div className="segmented paceChoices">
              {paceOptions.map((option) => (
                <button
                  className={value.pace === option.value ? "active" : ""}
                  key={option.value}
                  onClick={() => update("pace", option.value)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="travelerStyleField">
            <legend>玩法偏好</legend>
            <div className="segmented travelerStyleChoices">
              {travelerStyleOptions.map((option) => (
                <button
                  className={value.travelerStyle === option.value ? "active" : ""}
                  key={option.value}
                  onClick={() => update("travelerStyle", option.value)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      </details>

      <button className="primary" disabled={loading} type="submit">
        {loading && <span className="buttonSpinner" aria-hidden="true" />}
        {loading ? "正在规划..." : submitLabel ?? "生成路线"}
      </button>
    </form>
  );
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

function travelerStyleLabel(value: TripFormValue["travelerStyle"]) {
  return travelerStyleOptions.find((option) => option.value === value)?.label ?? "经典";
}

function locationAccuracyHint(accuracy: number | null | undefined) {
  if (!Number.isFinite(accuracy)) {
    return "这里就是路线的第 0 站。点“使用当前位置”会请求浏览器定位授权，也可以直接输入酒店、地铁站或商场。";
  }

  const normalized = Number(accuracy);
  if (normalized <= 200) {
    return `当前定位精度约 ${formatAccuracy(normalized)}，通常可以直接用；如果地图点不对，也可以手动改起点。`;
  }
  if (normalized <= 1000) {
    return `当前定位精度约 ${formatAccuracy(normalized)}，建议确认地图点和起点名称；不准就手动输入附近地标。`;
  }
  return `当前定位精度约 ${formatAccuracy(normalized)}，偏差可能较大。建议直接把起点改成酒店、地铁站或附近商场。`;
}

function locationAccuracyClass(accuracy: number | null | undefined) {
  if (!Number.isFinite(accuracy)) {
    return "";
  }
  return Number(accuracy) > 1000 ? "poor" : Number(accuracy) > 200 ? "medium" : "good";
}

function formatAccuracy(meters: number) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} 公里` : `${Math.round(meters)} 米`;
}

function parseNaturalTrip(text: string, current: TripFormValue): TripFormValue {
  const normalized = text.replace(/\s+/g, "").replace(/[。；;]/g, "，");
  const detectedCity = knownCities.find((city) => normalized.includes(city));
  const startLocationName = normalized.match(/从([^，,。；;]+?)出发/)?.[1] ?? current.startLocationName;
  const timeHints = extractTimeHints(normalized);
  const dateHint = extractDateHint(normalized);
  const destinations = extractDestinations(normalized);
  const wantsNow = /现在|马上|立即|此刻/u.test(normalized);

  const next = wantsNow ? buildCurrentDepartureValue(current) : current;

  return {
    ...next,
    city: detectedCity ?? current.city,
    startLocationName,
    departureMode: wantsNow ? "now" : "scheduled",
    travelDate: dateHint ?? next.travelDate,
    startTime: timeHints.startTime ?? next.startTime,
    endTime: timeHints.endTime ?? next.endTime,
    destinationsText: destinations.length > 0 ? destinations.join(", ") : current.destinationsText,
  };
}

function buildCurrentDepartureValue(current: TripFormValue): TripFormValue {
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

function extractDestinations(text: string): string[] {
  const targetMatch = text.match(/(?:想去|想逛|想看|去|逛|看看)(.+)$/);
  if (!targetMatch) {
    return [];
  }

  const destinationSection = targetMatch[1]
    .replace(/(凌晨|早上|上午|中午|下午|傍晚|晚上)?\d{1,2}(?:[:：点时]\d{0,2})?.*$/u, "")
    .replace(/(?:前)?(?:结束|返回|回去|回酒店).*$/u, "");

  return destinationSection
    .split(/[、，,；;]/)
    .map((item) =>
      item
        .replace(/^(然后|再|还想|顺便|以及|和|去|逛|看|看看)+/u, "")
        .replace(/(前结束|结束|出发)$/u, "")
        .trim(),
    )
    .filter((item) => item.length > 0)
    .slice(0, 6);
}

function extractTimeHints(text: string): { startTime: string | null; endTime: string | null } {
  const timePattern = /(凌晨|早上|上午|中午|下午|傍晚|晚上)?(\d{1,2})(?:[:：点时](\d{1,2})?)?/gu;
  const matches = Array.from(text.matchAll(timePattern)).map((match) => ({
    index: match.index ?? 0,
    value: normalizeTime(match[1], match[2], match[3]),
  }));

  const departureIndex = text.search(/出发|开始/u);
  const endIndex = text.search(/结束|前|回酒店|返回/u);
  const startTime =
    matches.find((match) => departureIndex >= 0 && match.index <= departureIndex)?.value ?? matches[0]?.value ?? null;
  const endTime =
    matches.find((match) => endIndex >= 0 && match.index <= endIndex && match.value !== startTime)?.value ??
    matches[matches.length - 1]?.value ??
    null;

  return {
    startTime,
    endTime: endTime === startTime ? null : endTime,
  };
}

function extractDateHint(text: string): string | null {
  const now = new Date();
  if (/今天|今日/u.test(text)) {
    return formatDateInput(now);
  }
  if (/明天/u.test(text)) {
    return formatDateInput(addDays(now, 1));
  }
  if (/后天/u.test(text)) {
    return formatDateInput(addDays(now, 2));
  }

  const monthDay = text.match(/(\d{1,2})月(\d{1,2})日/u);
  if (monthDay) {
    const date = new Date(now);
    date.setMonth(Number(monthDay[1]) - 1, Number(monthDay[2]));
    return formatDateInput(date);
  }

  return null;
}

function normalizeTime(period: string | undefined, hourText: string, minuteText: string | undefined) {
  let hour = Number(hourText);
  const minute = minuteText ? Number(minuteText.padEnd(2, "0")) : 0;

  if ((period === "下午" || period === "傍晚" || period === "晚上") && hour < 12) {
    hour += 12;
  }
  if (period === "中午" && hour < 11) {
    hour += 12;
  }
  if (period === "凌晨" && hour === 12) {
    hour = 0;
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function roundToNextMinutes(date: Date, step: number) {
  const next = new Date(date);
  next.setSeconds(0, 0);
  const minutes = next.getMinutes();
  const remainder = minutes % step;
  if (remainder !== 0) {
    next.setMinutes(minutes + (step - remainder));
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

function parseDestinationNames(text: string): string[] {
  return text
    .split(/[，,、；;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}
