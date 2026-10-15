import type { TripFormValue } from "./types";

export function tripFormValidationMessage(form: TripFormValue, destinationNames: string[]): string | null {
  const hasCity = form.city.trim().length > 0;
  const hasStart = form.startLocationName.trim().length > 0;

  if (!hasCity && !hasStart) {
    return "请先设置城市和起点。";
  }
  if (!hasCity) {
    return "请填写城市。";
  }
  if (!hasStart) {
    return "请填写当前地点。";
  }
  if (destinationNames.length < 2) {
    return "请至少填写 2 个想去的地点。";
  }
  if (destinationNames.length > 6) {
    return "最多可以填写 6 个想去的地点。";
  }
  if (!form.travelDate.trim()) {
    return "请选择出发日期。";
  }
  if (form.travelDate < localDateInput(new Date())) {
    return "出发日期不能早于今天。";
  }
  if (timeToMinutes(form.endTime) <= timeToMinutes(form.startTime)) {
    return "结束时间需要晚于开始时间。";
  }
  return null;
}

export function tripFormActionLabel(validationMessage: string | null): string | null {
  if (!validationMessage) return null;
  if (validationMessage.includes("城市和起点")) return "先设置城市和起点";
  if (validationMessage.includes("城市")) return "先填写城市";
  if (validationMessage.includes("当前地点")) return "先填写起点";
  if (validationMessage.includes("至少")) return "至少填 2 个地点";
  if (validationMessage.includes("最多")) return "最多填 6 个地点";
  if (validationMessage.includes("日期")) return "检查出发日期";
  if (validationMessage.includes("结束时间")) return "检查出行时间";
  return "检查输入信息";
}

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return -1;
  }
  return hours * 60 + minutes;
}

function localDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
