type ChinaSearchLoaderProps = {
  announce?: boolean;
  compact?: boolean;
  showStatus?: boolean;
  status: string;
};

export function ChinaSearchLoader({
  announce = true,
  compact = false,
  showStatus = true,
  status,
}: ChinaSearchLoaderProps) {
  return (
    <div
      aria-hidden={announce ? undefined : true}
      aria-live={announce ? "polite" : undefined}
      className={`chinaSearchLoader${compact ? " compact" : ""}`}
      role={announce ? "status" : undefined}
    >
      <div className="chinaSearchMapViewport" aria-hidden="true">
        <img className="chinaSearchMap" src="/china-search-map.svg" alt="" />
        <img className="chinaSearchMap chinaSearchMapHighlight" src="/china-search-map.svg" alt="" />
        <span className="chinaSearchLens">
          <span className="chinaSearchLensGlass">
            <img className="chinaSearchLensMap" src="/china-search-map.svg" alt="" />
          </span>
          <i />
        </span>
      </div>
      {showStatus && <p className="chinaSearchStatus">{status}</p>}
    </div>
  );
}

export function mapLoadingStatus({
  city,
  destinationNames,
  locating,
}: {
  city: string;
  destinationNames: string[];
  locating: boolean;
}) {
  const currentCity = city.trim();
  const places = destinationNames.map((name) => name.trim()).filter(Boolean);

  if (locating) {
    return "正在寻找你的出发位置";
  }
  if (places.length === 1) {
    return `正在寻找「${places[0]}」`;
  }
  if (places.length > 1) {
    return currentCity ? `正在查找${currentCity}的目的地` : "正在查找目的地";
  }
  return currentCity ? `正在打开${currentCity}地图` : "正在打开城市地图";
}
