export function PlanningFailure({
  message,
  compact = false,
  onEdit,
  onRetry,
}: {
  message: string;
  compact?: boolean;
  onEdit: () => void;
  onRetry: () => void;
}) {
  const hints = failureHints(message);
  const editLabel = isTimeFailure(message) ? "调整时间或地点" : "改地点";

  return (
    <section className={`planningFailure ${compact ? "compact" : ""}`} role="status" aria-live="polite">
      <div>
        <span>这次没排出来</span>
        <strong>先处理这一步</strong>
        <p>{message}</p>
        <ul className="planningFailureHints">
          {hints.map((hint) => (
            <li key={hint}>{hint}</li>
          ))}
        </ul>
      </div>
      <div className="planningFailureActions">
        <button onClick={onRetry} type="button">
          再试一次
        </button>
        <button onClick={onEdit} type="button">
          {editLabel}
        </button>
      </div>
    </section>
  );
}

function failureHints(message: string) {
  if (message.includes("网络") || message.includes("连接") || message.includes("请求") || message.includes("离线")) {
    return ["检查 Wi-Fi 或移动网络是否可用", "已填写内容不会清空，联网后点“再试一次”"];
  }

  if (message.includes("最多")) {
    return ["最多保留 6 个目的地", "先删除较远或优先级较低的地点"];
  }

  if (isTimeFailure(message)) {
    return ["延长结束时间", "缩短单个地点的停留时间", "减少一个距离较远的地点"];
  }

  if (message.includes("至少")) {
    return ["至少保留 2 个目的地", "再补一个附近想去的地方"];
  }

  if (message.includes("没有匹配") || message.includes("匹配")) {
    return ["把地点写具体一点，例如加上商圈、区名或完整店名", "同名地点很多时优先选地址最接近的那个"];
  }

  if (message.includes("起点")) {
    return ["起点用酒店、地铁站、商场这类明确位置", "定位不准时直接手动改起点"];
  }

  return ["检查城市、起点和地点名是否具体", "如果地点分散，先减少一个点或延长时间"];
}

function isTimeFailure(message: string) {
  return message.includes("时间") || message.includes("分钟") || message.includes("太晚") || message.includes("不够");
}
