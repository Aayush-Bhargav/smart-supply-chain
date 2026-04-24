'use client';

import React from 'react';
import { AlertTriangle, CheckCircle, X, MapPin } from 'lucide-react';

interface ReRoutePreviewProps {
  shipmentId: string;
  previewData: {
    updated_route: any[];
    recommended_routes: any[];
    message: string;
    high_risk_cities: string[];
    current_route: Array<{
      city: string;
      status: string;
      mode?: string;
      days?: number;
    }>;
    current_total_days: number;
    current_risk_level: number;
    current_high_risk_cities: string[];
    avoided_high_risk_cities: string[];
  };
  onApply: (shipmentId: string) => void;
  onDismiss: (shipmentId: string) => void;
}

export default function ReRoutePreview({
  shipmentId,
  previewData,
  onApply,
  onDismiss
}: ReRoutePreviewProps) {
  const {
    updated_route,
    recommended_routes,
    message,
    high_risk_cities,
    current_route,
    current_total_days,
    current_risk_level,
    current_high_risk_cities,
    avoided_high_risk_cities,
  } = previewData;
  const proposedRoute = recommended_routes[0];
  const proposedTransitDays = Number(proposedRoute?.total_transit_days || 0);
  const proposedRiskLevel = Number(proposedRoute?.route_risk_level || 0);
  const transitDelta = proposedTransitDays - current_total_days;
  const riskDelta = proposedRiskLevel - current_risk_level;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white/95 backdrop-blur-lg border border-white/20 rounded-2xl p-6 max-w-3xl w-full mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-500/20 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Route Update Available</h3>
              {/* <p className="text-sm text-gray-600">{message}</p> */}
            </div>
          </div>
          <button
            onClick={() => onDismiss(shipmentId)}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* High Risk Cities */}
        {high_risk_cities.length > 0 && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <span className="text-sm font-medium text-red-800">High Risk Cities Detected:</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {high_risk_cities.map((city, index) => (
                <span
                  key={index}
                  className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full"
                >
                  {city}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="mb-5 grid lg:grid-cols-2 gap-4">
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <h4 className="text-sm font-semibold text-gray-800 mb-3">Current Route</h4>
            <div className="space-y-2">
              {current_route.slice(0, 5).map((city, index) => (
                <div key={`${city.city}-${index}`} className="flex items-center gap-2 text-sm">
                  <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                  <span className="font-medium text-gray-700">{city.city}</span>
                  {city.mode && index < current_route.length - 1 && (
                    <span className="text-xs px-2 py-0.5 bg-gray-200 rounded-md text-gray-700">
                      {city.mode}
                    </span>
                  )}
                </div>
              ))}
              {current_route.length > 5 && (
                <p className="text-xs text-gray-500">+{current_route.length - 5} more stops</p>
              )}
            </div>
          </div>

          <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
            <h4 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Proposed Route
            </h4>
            <div className="space-y-2">
              {updated_route.slice(0, 5).map((city: any, index: number) => (
                <div key={`${city.city}-${index}`} className="flex items-center gap-2 text-sm">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <span className="font-medium text-gray-700">{city.city}</span>
                  {city.mode && index < updated_route.length - 1 && (
                    <span className="text-xs px-2 py-0.5 bg-blue-100 rounded-md text-blue-700">
                      {city.mode}
                    </span>
                  )}
                </div>
              ))}
              {updated_route.length > 5 && (
                <p className="text-xs text-gray-500">+{updated_route.length - 5} more stops</p>
              )}
            </div>
          </div>
        </div>

        <div className="mb-5 grid md:grid-cols-2 xl:grid-cols-4 gap-3 text-sm">
          <div className="rounded-lg bg-gray-50 border border-gray-200 p-4">
            <p className="text-gray-500 text-xs uppercase tracking-wide">Current time</p>
            <p className="text-lg font-semibold text-gray-900 mt-1">{current_total_days.toFixed(1)} days</p>
          </div>
          <div className="rounded-lg bg-blue-50 border border-blue-100 p-4">
            <p className="text-gray-500 text-xs uppercase tracking-wide">Proposed time</p>
            <p className="text-lg font-semibold text-gray-900 mt-1">{proposedTransitDays.toFixed(1)} days</p>
            <p className={`text-xs mt-1 ${transitDelta <= 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
              {transitDelta <= 0 ? `${Math.abs(transitDelta).toFixed(1)}d faster` : `${transitDelta.toFixed(1)}d slower`}
            </p>
          </div>
          <div className="rounded-lg bg-gray-50 border border-gray-200 p-4">
            <p className="text-gray-500 text-xs uppercase tracking-wide">Current risk</p>
            <p className="text-lg font-semibold text-gray-900 mt-1">{current_risk_level.toFixed(2)}</p>
          </div>
          <div className="rounded-lg bg-blue-50 border border-blue-100 p-4">
            <p className="text-gray-500 text-xs uppercase tracking-wide">Proposed risk</p>
            <p className="text-lg font-semibold text-gray-900 mt-1">{proposedRiskLevel.toFixed(2)}</p>
            <p className={`text-xs mt-1 ${riskDelta <= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {riskDelta <= 0 ? `${Math.abs(riskDelta).toFixed(2)} lower risk` : `${riskDelta.toFixed(2)} higher risk`}
            </p>
          </div>
        </div>

        <div className="mb-6 grid lg:grid-cols-2 gap-4">
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <h4 className="text-sm font-semibold text-red-800 mb-2">Current exposure</h4>
            {current_high_risk_cities.length === 0 ? (
              <p className="text-sm text-red-700">No saved high-risk cities on the current route.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {current_high_risk_cities.map((city) => (
                  <span key={city} className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full">
                    {city}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <h4 className="text-sm font-semibold text-emerald-800 mb-2">Impact avoided</h4>
            {avoided_high_risk_cities.length === 0 ? (
              <p className="text-sm text-emerald-700">This reroute mainly reduces exposure severity rather than removing a full hotspot.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {avoided_high_risk_cities.map((city) => (
                  <span key={city} className="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs rounded-full">
                    {city}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={() => onApply(shipmentId)}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl transition-all duration-200 shadow-lg shadow-blue-900/30"
          >
            <CheckCircle className="w-4 h-4" />
            Apply New Route
          </button>
          <button
            onClick={() => onDismiss(shipmentId)}
            className="flex-1 px-4 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium rounded-xl transition-all duration-200"
          >
            Keep Current
          </button>
        </div>

        {/* Note */}
        <p className="text-xs text-gray-500 text-center mt-3">
          Your completed cities will be preserved in the new route
        </p>
      </div>
    </div>
  );
}
