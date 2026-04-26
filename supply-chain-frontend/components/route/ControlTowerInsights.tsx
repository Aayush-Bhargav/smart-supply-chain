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
  const fastestRoute = derivedFastestRoute;
  const safestRoute = derivedSafestRoute;
  const cleanestRoute = derivedCleanestRoute;

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
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Risk Score</p>
          <p className="text-2xl font-bold text-white mt-2">{Math.round(selectedRoute.route_risk_level * 100)}%</p>
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
                    <p className="text-white font-semibold">{Math.round(baseline.route.route_risk_level * 100)}%</p>
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

      <div className="flex flex-col gap-6 mt-6">
      {/* Disruption Hotspots Section - Always takes the entire row */}
      <div className="w-full bg-slate-950 rounded-2xl border border-slate-800 p-6">
        <div className="flex items-center gap-3 mb-2">
          <ShieldAlert className="w-5 h-5 text-purple-400" />
          <h3 className="text-xl font-bold text-white tracking-tight">Disruption Hotspots</h3>
        </div>
        <p className="text-xs text-slate-500 mb-6">
          Risk evidence is derived from live weather, logistics news, and geopolitical signals.
        </p>

        {riskHotspots.length === 0 ? (
          <div className="flex items-start gap-3 text-sm text-emerald-400 bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p>No major risk hotspots are currently detected on this route.</p>
          </div>
        ) : (
          /* Inner Grid: Each hotspot card is 1/3rd of the row */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {riskHotspots.slice(0, 3).map((hotspot) => (
              <div
                key={hotspot.city}
                className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 transition-all hover:border-purple-500/30"
              >
                <div className="flex items-center justify-between gap-4 mb-3">
                  <div>
                    <p className="font-bold text-white">{hotspot.city}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{hotspot.reason}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-tighter text-slate-500 font-bold">Risk Score</p>
                    <p className="text-xl font-black text-purple-400 leading-none">{Math.round(hotspot.risk * 100)}%</p>
                  </div>
                </div>

                {hotspot.components && (
                  <div className="grid grid-cols-3 gap-3 mt-4">
                    {['weather', 'news', 'geo'].map((key) => {
                      const value = Number((hotspot.components as any)[key] || 0);
                      const percentage = Math.round(value * 100);
                      
                      return (
                        <div key={key} className="bg-slate-950/80 border border-slate-800 rounded-lg p-2 flex flex-col items-center">
                          <p className="text-[9px] text-slate-500 font-bold uppercase tracking-tighter mb-1">
                            {key === 'geo' ? 'Geopol' : key}
                          </p>
                          
                          {/* Circular or Bar Progress Indicator */}
                          <div className="w-full h-1 bg-slate-800 rounded-full mb-1.5 overflow-hidden">
                            <div 
                              className={`h-full transition-all duration-500 ${
                                percentage > 70 ? 'bg-rose-500' : percentage > 30 ? 'bg-purple-500' : 'bg-emerald-500'
                              }`}
                              style={{ width: `${percentage}%` }}
                            />
                          </div>

                          <p className="text-[11px] font-bold text-slate-200">
                            {percentage}%
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="mt-4 flex items-center justify-between opacity-50">
                    <span className="text-[9px] text-slate-500">
                        Checked {formatCheckedAt(hotspot.checkedAt)}
                    </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
