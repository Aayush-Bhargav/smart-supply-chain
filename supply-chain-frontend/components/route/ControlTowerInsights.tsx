'use client';

import { AlertTriangle, BrainCircuit, CheckCircle2, ShieldAlert, TimerReset, Waypoints } from 'lucide-react';
import { ComparisonRoute, RecommendedRoute, RouteResponse } from '@/types/route';

interface ControlTowerInsightsProps {
  response: RouteResponse;
  selectedRouteIndex: number;
  recommendedOption?: number | null;
}

type RiskEntry = {
  city: string;
  risk: number;
  reason: string;
  checkedAt?: string;
  components?: {
    weather?: number;
    news?: number;
    geo?: number;
  };
};

type RouteLike = RecommendedRoute | ComparisonRoute;

function extractRouteCities(route: RouteResponse['recommended_routes'][number]['route']) {
  const orderedCities: string[] = [];

  route.forEach((segment, index) => {
    if (index === 0) {
      orderedCities.push(segment.from);
    }
    orderedCities.push(segment.to);
  });

  return Array.from(new Set(orderedCities));
}

function getRiskyCitiesForRoute(route: RouteLike, nodeRisks: RouteResponse['node_risks'], threshold = 0.4) {
  return extractRouteCities(route.route).filter((city) => Number(nodeRisks?.[city]?.risk || 0) > threshold);
}

function getRouteDisplayLabel(route: RouteLike) {
  return route.option ? `Option ${route.option}` : 'Outside top 3';
}

function routeSignature(route: RouteLike) {
  return route.route.map((segment) => `${segment.from}->${segment.to}:${segment.mode}`).join('|');
}

function formatCheckedAt(value?: string) {
  if (!value) return 'Unknown';

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function ControlTowerInsights({
  response,
  selectedRouteIndex,
  recommendedOption,
}: ControlTowerInsightsProps) {
  console.log('Full Response Object:', response);
  console.log('Node Risks Data:', response.node_risks);
  
  const selectedRoute = response.recommended_routes[selectedRouteIndex];
  const aiRecommendedRoute =
    response.recommended_routes.find((route) => route.option === recommendedOption) ?? selectedRoute;
  const derivedFastestRoute = response.recommended_routes.reduce((best, route) =>
    route.total_transit_days < best.total_transit_days ? route : best
  );
  const derivedSafestRoute = response.recommended_routes.reduce((best, route) =>
    route.route_risk_level < best.route_risk_level ? route : best
  );
  const derivedCleanestRoute = response.recommended_routes.reduce((best, route) =>
    route.total_carbon_kg < best.total_carbon_kg ? route : best
  );
  const fastestRoute = response.baseline_fastest_route ?? derivedFastestRoute;
  const safestRoute = response.baseline_safest_route ?? derivedSafestRoute;
  const cleanestRoute = response.baseline_cleanest_route ?? derivedSafestRoute;

  const routeCities = extractRouteCities(selectedRoute.route);
  const riskHotspots = routeCities.reduce<RiskEntry[]>((entries, city) => {
    const riskData = response.node_risks?.[city];
    if (!riskData || typeof riskData !== 'object') {
      return entries;
    }

    const riskEntry: RiskEntry = {
      city,
      risk: Number(riskData.risk || 0),
      reason: riskData.reason || 'Normal operations',
      checkedAt: riskData.checked_at,
      components: riskData.components,
    };

    if (riskEntry.risk > 0.2) {
      entries.push(riskEntry);
    }

    return entries;
  }, []).sort((a, b) => b.risk - a.risk);

  const riskGapToSafest = selectedRoute.route_risk_level - safestRoute.route_risk_level;
  const timeGapToFastest = selectedRoute.total_transit_days - fastestRoute.total_transit_days;
  const isRecommended = recommendedOption === selectedRoute.option;
  const riskSources = response.risk_sources
    ? Object.values(response.risk_sources)
    : ['OpenWeatherMap', 'GNews', 'Gemini 2.5 Flash Lite'];
  const aiMatchesFastest = routeSignature(aiRecommendedRoute) === routeSignature(fastestRoute);
  const aiMatchesSafest = routeSignature(aiRecommendedRoute) === routeSignature(safestRoute);
  const aiMatchesCleanest = routeSignature(aiRecommendedRoute) === routeSignature(cleanestRoute);
  const operationalBaselines = [
    {
      label: 'Fastest baseline',
      accent: 'text-blue-300',
      border: 'border-blue-400/20 bg-blue-500/10',
      route: fastestRoute,
      summary: aiMatchesFastest
        ? 'Optimized for the shortest transit time currently available.'
        : 'Prioritizes maximum speed to reduce lead times.',
    },
    {
      label: 'Safest baseline',
      accent: 'text-violet-300',
      border: 'border-violet-400/20 bg-violet-500/10',
      route: safestRoute,
      summary: aiMatchesFastest
        ? 'This route provides the best balance between speed and reliability.'
        : aiMatchesSafest
        ? 'Optimized for maximum security and risk avoidance.'
        : 'Strategically bypasses high-risk areas to ensure cargo security.',
    },
    {
      label: 'Greenest baseline',
      accent: 'text-emerald-300',
      border: 'border-emerald-400/20 bg-emerald-500/10',
      route: cleanestRoute,
      summary: aiMatchesCleanest
        ? 'Optimized for minimum carbon output and environmental impact.'
        : 'Prioritizes sustainability by selecting lower-emission transit modes.',
    },
  ];

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/15 rounded-lg">
            <BrainCircuit className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">Control Tower Snapshot</h2>
            <p className="text-sm text-slate-400">
              Operational view of the currently selected route option
            </p>
          </div>
        </div>

        {isRecommended && (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-500/15 border border-emerald-400/30 rounded-full text-emerald-300 text-sm font-medium">
            <CheckCircle2 className="w-4 h-4" />
            AI recommended option
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-4 gap-4 mt-6">
        <div className="bg-slate-950 rounded-xl border border-slate-800 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Selected</p>
          <p className="text-2xl font-bold text-white mt-2">Option {selectedRoute.option}</p>
          <p className="text-sm text-slate-400 mt-1">{routeCities.length} cities monitored</p>
        </div>

        <div className="bg-slate-950 rounded-xl border border-slate-800 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Transit Time</p>
          <p className="text-2xl font-bold text-white mt-2">{selectedRoute.total_transit_days} days</p>
          <p className="text-sm text-slate-400 mt-1">
            {timeGapToFastest <= 0
              ? 'This is the fastest available route'
              : `${timeGapToFastest.toFixed(1)} days slower than the fastest option`}
          </p>
        </div>

        <div className="bg-slate-950 rounded-xl border border-slate-800 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Risk Level</p>
          <p className="text-2xl font-bold text-white mt-2">{selectedRoute.route_risk_level}</p>
          <p className="text-sm text-slate-400 mt-1">
            {riskGapToSafest <= 0
              ? 'This is the safest available route'
              : `${riskGapToSafest.toFixed(2)} above the safest option`}
          </p>
        </div>

        <div className="bg-slate-950 rounded-xl border border-slate-800 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Carbon</p>
          <p className="text-2xl font-bold text-white mt-2">{selectedRoute.total_carbon_kg || 0} kg</p>
          <p className="text-sm text-slate-400 mt-1">Estimated route footprint</p>
        </div>
      </div>

      <div className="mt-6 bg-slate-950 rounded-xl border border-slate-800 p-5">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Operational Baselines</h3>
            <p className="text-sm text-slate-400">
              Compare the pure fastest path, the pure safest path, and the AI-selected tradeoff.
            </p>
          </div>
          <div className="text-xs text-slate-500 text-right">
            <div>{riskSources.join(' • ')}</div>
            <div className="mt-1">Last checked {formatCheckedAt(response.risk_checked_at)}</div>
          </div>
        </div>

        <div className="grid xl:grid-cols-3 gap-4">
          {operationalBaselines.map((baseline) => {
            const riskyCities = getRiskyCitiesForRoute(baseline.route, response.node_risks);
            const isCurrentSelection = baseline.route.option === selectedRoute.option;

            return (
              <div
                key={baseline.label}
                className={`rounded-xl border p-4 ${baseline.border}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className={`text-sm font-semibold ${baseline.accent}`}>{baseline.label}</p>
                    <p className="text-white text-xl font-bold mt-1">{getRouteDisplayLabel(baseline.route)}</p>
                  </div>
                  {isCurrentSelection && (
                    <span className="text-xs font-semibold text-white bg-white/10 border border-white/15 px-2.5 py-1 rounded-full">
                      Viewing now
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2 mt-4 text-sm">
                  <div className="bg-slate-900/70 rounded-lg px-3 py-2">
                    <p className="text-slate-500 text-xs uppercase tracking-wide">Time</p>
                    <p className="text-white font-semibold">{baseline.route.total_transit_days} Days</p>
                  </div>
                  <div className="bg-slate-900/70 rounded-lg px-3 py-2">
                    <p className="text-slate-500 text-xs uppercase tracking-wide">Risk</p>
                    <p className="text-white font-semibold">{baseline.route.route_risk_level}</p>
                  </div>

                  <div className="bg-slate-900/70 rounded-lg px-3 py-2">
                    <p className="text-slate-500 text-xs uppercase tracking-wide">Carbon</p>
                    <p className="text-white font-semibold">{baseline.route.total_carbon_kg} kg</p>
                  </div>
                </div>

                <p className="text-sm text-slate-300 mt-4">{baseline.summary}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid lg:grid-cols gap-6 mt-6">
        <div className="bg-slate-950 rounded-xl border border-slate-800 p-5">
          <div className="flex items-center gap-2 mb-4">
            <ShieldAlert className="w-5 h-5 text-amber-400" />
            <h3 className="text-lg font-semibold text-white">Disruption Hotspots</h3>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            Risk evidence is derived from live weather, logistics news, and geopolitical signals at route-analysis time.
          </p>

          {riskHotspots.length === 0 ? (
            <div className="flex items-start gap-3 text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-400/20 rounded-xl p-4">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <p>No major risk hotspots are currently detected on this route.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {riskHotspots.slice(0, 4).map((hotspot) => (
                <div
                  key={hotspot.city}
                  className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-4"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-white">{hotspot.city}</p>
                      <p className="text-sm text-slate-300 mt-1">{hotspot.reason}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Risk</p>
                      <p className="text-xl font-bold text-amber-300">{hotspot.risk.toFixed(2)}</p>
                    </div>
                  </div>

                  {hotspot.components && (
                  <div className="grid grid-cols-3 gap-2 mt-3 text-xs text-slate-300">
                      <div className="bg-slate-900/70 rounded-lg px-3 py-2">
                        Weather {Number(hotspot.components.weather || 0).toFixed(2)}
                      </div>
                      <div className="bg-slate-900/70 rounded-lg px-3 py-2">
                        News {Number(hotspot.components.news || 0).toFixed(2)}
                      </div>
                      <div className="bg-slate-900/70 rounded-lg px-3 py-2">
                        Geo {Number(hotspot.components.geo || 0).toFixed(2)}
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-slate-500 mt-3">
                    Snapshot refreshed {formatCheckedAt(hotspot.checkedAt)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          {/* <div className="bg-slate-950 rounded-xl border border-slate-800 p-5">
            <div className="flex items-center gap-2 mb-4">
              <TimerReset className="w-5 h-5 text-blue-400" />
              <h3 className="text-lg font-semibold text-white">Operational Flags</h3>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-3">
                <Waypoints className="w-4 h-4 text-blue-400 mt-0.5" />
                <p className="text-slate-300">
                  {selectedRoute.forced_through_hubs
                    ? 'This route respects user-selected transit hubs.'
                    : 'This route was chosen without forced transit hubs.'}
                </p>
              </div>
              <div className="flex items-start gap-3">
                <AlertTriangle
                  className={`w-4 h-4 mt-0.5 ${
                    selectedRoute.has_high_risk_hub ? 'text-red-400' : 'text-emerald-400'
                  }`}
                />
                <p className="text-slate-300">
                  {selectedRoute.has_high_risk_hub
                    ? 'One or more required hubs remain high risk right now.'
                    : 'No required high-risk hub is forcing this route.'}
                </p>
              </div>
            </div>
          </div> */}

          {/* <div className="bg-slate-950 rounded-xl border border-slate-800 p-5">
            <h3 className="text-lg font-semibold text-white mb-4">Option Comparison</h3>
            <div className="space-y-3">
              {response.recommended_routes.map((route) => {
                const isActive = route.option === selectedRoute.option;
                return (
                  <div
                    key={route.option}
                    className={`rounded-xl border px-4 py-3 ${
                      isActive
                        ? 'border-blue-400/40 bg-blue-500/10'
                        : 'border-slate-800 bg-slate-900/70'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-medium text-white">Option {route.option}</p>
                        <p className="text-sm text-slate-400">
                          {route.total_transit_days} days · Risk {route.route_risk_level}
                        </p>
                      </div>
                      {recommendedOption === route.option && (
                        <span className="text-xs font-semibold text-emerald-300 bg-emerald-500/10 border border-emerald-400/20 px-2.5 py-1 rounded-full">
                          Recommended
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div> */}
        </div>
      </div>
    </div>
  );
}
