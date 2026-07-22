export type RiskLevel = "low" | "medium" | "high";

export type TravelerStyle = "classic" | "family" | "couple" | "senior" | "photo" | "food" | "intense";

export type PlacePracticalInfo = {
  source: string;
  confidence: "low" | "medium" | "high" | string;
  openingHours: string;
  ticket: string;
  closureStatus: string;
  popularity: string;
  tips: string[];
};

export type PoiCandidate = {
  source: string;
  sourcePoiId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  poiType: string;
  suggestedStayMinutes: number;
  riskLevel: RiskLevel;
  tags: string[];
  note: string;
  practicalInfo: PlacePracticalInfo;
};

export type LocationCandidate = {
  source: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  city?: string | null;
};

export type RouteStop = {
  destinationId: string;
  name: string;
  lat?: number | null;
  lng?: number | null;
  arrivalTime: string;
  departureTime: string;
  stayMinutes: number;
  suggestion: string;
  riskLevel: RiskLevel;
  tags: string[];
  practicalInfo: PlacePracticalInfo;
};

export type RouteLeg = {
  fromName: string;
  toName: string;
  transportMode: string;
  durationMinutes: number;
  distanceMeters: number;
  navigationUrl: string;
  source: string;
};

export type RouteStopInsight = {
  destinationId: string;
  name: string;
  highlight: string;
  practicalNote: string;
  riskNote: string;
};

export type RouteInsight = {
  source: string;
  summary: string;
  routeReason: string;
  reminders: string[];
  stopInsights: RouteStopInsight[];
};

export type WeatherSnapshot = {
  source: string;
  city: string;
  weather: string;
  temperature: string;
  wind: string;
  humidity: string;
  reportTime: string;
  outdoorRisk: RiskLevel;
  alerts: string[];
};

export type AuthUser = {
  id: number;
  email: string;
  createdAt: string;
};

export type AuthSession = {
  token: string;
  user: AuthUser;
  movedTrips: number;
};

export type RoutePlan = {
  planId: number;
  tripId: number | null;
  title: string;
  style: string;
  totalMinutes: number;
  travelMinutes: number;
  visitMinutes: number;
  walkingLevel: RiskLevel;
  riskLevel: RiskLevel;
  score: number;
  estimatedEndTime: string;
  summary: string;
  scoreFactors: string[];
  qualityNotes: string[];
  decisionNotes?: string[];
  weather: WeatherSnapshot;
  stops: RouteStop[];
  legs: RouteLeg[];
  insight: RouteInsight | null;
};

export type TripSummary = {
  tripId: number;
  clientId: string;
  city: string;
  startLocationName: string;
  startTime: string;
  endTime: string;
  travelerStyle: TravelerStyle;
  destinationNames: string[];
  status: string;
  planCount: number;
};

export type TripDestination = {
  source: string;
  sourcePoiId: string;
  rawName: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  poiType: string;
  mustGo: boolean;
  stayMinutes: number | null;
  suggestedStayMinutes: number;
  riskLevel: RiskLevel;
  tags: string[];
  note: string | null;
  practicalInfo: PlacePracticalInfo;
};

export type TripRecord = {
  id: number;
  clientId: string;
  shareToken?: string | null;
  city: string;
  startLocation: {
    name: string;
    lat: number;
    lng: number;
  };
  startTime: string;
  endTime: string;
  transportPreference: "metro" | "taxi" | "walk";
  pace: "relaxed" | "balanced" | "compact";
  travelerStyle: TravelerStyle;
  destinations: TripDestination[];
  status: string;
};

export type ShareTripResponse = {
  shareToken: string;
};

export type SharedTripResponse = {
  trip: TripRecord;
  plans: RoutePlan[];
};

export type TripFormValue = {
  city: string;
  startLocationName: string;
  departureMode: "now" | "scheduled";
  travelDate: string;
  startTime: string;
  endTime: string;
  transportPreference: "metro" | "taxi" | "walk";
  pace: "relaxed" | "balanced" | "compact";
  travelerStyle: TravelerStyle;
  destinationsText: string;
};

export type ServiceStatus = {
  key: string;
  label: string;
  status: "ready" | "missing" | "disabled" | "error" | string;
  required: boolean;
  detail: string;
};

export type SystemStatus = {
  ok: boolean;
  appEnv: string;
  persistenceEnabled: boolean;
  services: ServiceStatus[];
};
