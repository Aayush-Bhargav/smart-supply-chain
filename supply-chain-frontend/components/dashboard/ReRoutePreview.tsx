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
  const { updated_route, recommended_routes, message, high_risk_cities } = previewData;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white/95 backdrop-blur-lg border border-white/20 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-500/20 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Route Update Available</h3>
              <p className="text-sm text-gray-600">{message}</p>
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

        {/* New Route Preview */}
        <div className="mb-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
            <MapPin className="w-4 h-4" />
            New Route Preview
          </h4>
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="flex flex-col gap-1">
              {updated_route.slice(0, 3).map((city: any, index: number) => (
                <div key={index} className="flex items-center gap-2 text-sm">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <span className="text-gray-700">{city.city}</span>
                  {index === 0 && (
                    <span className="text-xs text-blue-500 font-medium">Start</span>
                  )}
                  {index === updated_route.length - 1 && (
                    <span className="text-xs text-green-500 font-medium">Destination</span>
                  )}
                </div>
              ))}
              {updated_route.length > 3 && (
                <div className="text-xs text-gray-500 text-center">
                  +{updated_route.length - 3} more cities
                </div>
              )}
            </div>
          </div>
        </div>

        {/* New Route Details */}
        {recommended_routes.length > 0 && (
          <div className="mb-6 bg-blue-50 rounded-lg p-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-gray-600">Transit Time:</span>
                <span className="ml-2 font-medium text-gray-900">
                  {recommended_routes[0]?.total_transit_days || 'N/A'} days
                </span>
              </div>
              <div>
                <span className="text-gray-600">Risk Level:</span>
                <span className="ml-2 font-medium text-gray-900">
                  {recommended_routes[0]?.route_risk_level || 'N/A'}
                </span>
              </div>
            </div>
          </div>
        )}

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
