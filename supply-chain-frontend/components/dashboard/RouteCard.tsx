'use client';

import React, { useState } from 'react';
import { Package, MapPin, Clock, CheckCircle, Truck, Zap, Trash2 } from 'lucide-react';
import LiveTrackingToggle from './LiveTrackingToggle';

interface RouteCity {
  city: string;
  status: 'completed' | 'active' | 'pending';
}

interface Shipment {
  id: string;
  source: string;
  target: string;
  category_name: string;
  delivery_type: string;
  status: 'pending' | 'in_transit' | 'delivered' | 'cancelled';
  selected_route: {
    route: RouteCity[];
  };
  liveTracking?: boolean;
}

interface RouteCardProps {
  shipment: Shipment;
  startingTransit: { [key: string]: boolean };
  updatingCity: { [key: string]: boolean };
  onStartTransit: (shipmentId: string) => void;
  onToggleCityStatus: (shipmentId: string, cityIndex: number, currentStatus: string) => void;
  onLiveTrackingToggle: (shipmentId: string, enabled: boolean) => void;
  onDelete: (shipmentId: string) => void;
}

export default function RouteCard({
  shipment,
  startingTransit,
  updatingCity,
  onStartTransit,
  onToggleCityStatus,
  onLiveTrackingToggle,
  onDelete
}: RouteCardProps) {
  
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const isInTransit = shipment.status === 'in_transit';
  const isDelivered = shipment.status === 'delivered';

  const getStatusBadgeStyle = (status: string) => {
    switch (status) {
      case 'in_transit': return 'bg-blue-500/20 text-blue-300 border border-blue-500/30';
      case 'delivered': return 'bg-green-500/20 text-green-300 border border-green-500/30';
      case 'cancelled': return 'bg-red-500/20 text-red-300 border border-red-500/30';
      default: return 'bg-gray-500/20 text-gray-300 border border-gray-500/30';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-400';
      case 'active': return 'text-blue-400';
      default: return 'text-gray-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="w-4 h-4" />;
      case 'active': return <Truck className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  return (
    <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-2xl p-6 hover:shadow-2xl transition-all duration-300">
      {/* Shipment Header */}
      <div className="flex items-start justify-between mb-5">
        <div className="flex-1">
          <div className="flex items-center mb-2">
            <MapPin className="w-5 h-5 text-blue-400 mr-2" />
            <h3 className="text-xl font-bold text-white">
              {shipment.source} {shipment.target}
            </h3>
          </div>
          <div className="flex items-center flex-wrap gap-3 text-sm text-gray-300">
            <span className="flex items-center">
              <Package className="w-4 h-4 mr-1" />
              {shipment.category_name}
            </span>
            <span className="flex items-center">
              <Truck className="w-4 h-4 mr-1" />
              {shipment.delivery_type}
            </span>
            <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${getStatusBadgeStyle(shipment.status)}`}>
              {isInTransit && <Truck className="w-3 h-3" />}
              {isDelivered && <CheckCircle className="w-3 h-3" />}
              <span className="capitalize">{shipment.status.replace('_', ' ')}</span>
            </span>
          </div>
        </div>
        
        {/* Delete Button */}
        <div className="relative">
          <button
            onClick={() => setShowDeleteConfirm(!showDeleteConfirm)}
            className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
            title="Delete shipment"
          >
            <Trash2 className="w-5 h-5" />
          </button>
          
          {/* Delete Confirmation */}
          {showDeleteConfirm && (
            <div className="absolute right-0 mt-2 w-48 bg-white/95 backdrop-blur-lg border border-white/20 rounded-xl shadow-2xl p-3 z-10">
              <p className="text-sm text-gray-700 mb-2">Are you sure you want to delete?</p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    onDelete(shipment.id);
                    setShowDeleteConfirm(false);
                  }}
                  className="flex-1 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Yes
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm font-medium rounded-lg transition-colors"
                >
                  No
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Start Transit Button */}
      {!isInTransit && !isDelivered && (
        <div className="mb-5">
          <button
            onClick={() => onStartTransit(shipment.id)}
            disabled={startingTransit[shipment.id]}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-blue-900/30"
          >
            {startingTransit[shipment.id] ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Starting...
              </>
            ) : (
              <>
                <Truck className="w-4 h-4" />
                Start Transit
              </>
            )}
          </button>
        </div>
      )}

      {/* Live Tracking Toggle for Individual Route */}
      {isInTransit && (
        <div className="mb-4">
          <LiveTrackingToggle
            enabled={shipment.liveTracking || false}
            onToggle={(enabled) => onLiveTrackingToggle(shipment.id, enabled)}
            size="small"
            showLabel={true}
          />
        </div>
      )}

      {/* Route Progress with Checkboxes */}
      <div className="mb-6">
        <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4 text-blue-400" />
          Transit Progress
        </h4>

        <div className="flex flex-col gap-2">
          {shipment.selected_route.route.map((city, index) => {
            const isCompleted = city.status === 'completed';
            const isActive = city.status === 'active';
            const cityKey = `${shipment.id}-${index}`;

            return (
              <div
                key={index}
                className={`flex items-center gap-4 px-4 py-3 rounded-xl transition-all ${
                  isActive
                    ? 'bg-blue-500/15 border border-blue-500/30'
                    : isCompleted
                    ? 'bg-green-500/10 border border-green-500/20'
                    : 'bg-gray-800/40 border border-white/5'
                }`}
              >
                {/* Checkbox */}
                <div className="flex-shrink-0">
                  {isInTransit ? (
                    <button
                      onClick={() => onToggleCityStatus(shipment.id, index, city.status)}
                      disabled={updatingCity[cityKey] || (!isCompleted && !isActive)}
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                        isCompleted
                          ? 'bg-green-500 border-green-500'
                          : isActive
                          ? 'border-blue-400 bg-transparent hover:bg-blue-500/20 cursor-pointer'
                          : 'border-gray-600 bg-transparent cursor-not-allowed opacity-40'
                      } ${updatingCity[cityKey] ? 'opacity-50' : ''}`}
                      title={
                        isCompleted
                          ? 'Mark as not crossed'
                          : isActive
                          ? 'Mark as crossed'
                          : 'Cannot mark future cities'
                      }
                    >
                      {isCompleted && <CheckCircle className="w-3 h-3 text-white" />}
                    </button>
                  ) : (
                    <div className={`w-5 h-5 rounded border-2 ${
                      isCompleted ? 'bg-green-500 border-green-500' : 'border-gray-600'
                    }`}>
                      {isCompleted && <CheckCircle className="w-3 h-3 text-white" />}
                    </div>
                  )}
                </div>

                {/* City Info */}
                <div className="flex-1 flex items-center gap-3">
                  <span className={`font-medium ${
                    isCompleted ? 'text-green-300' : isActive ? 'text-blue-300' : 'text-gray-400'
                  }`}>
                    {city.city}
                  </span>
                  {isCompleted && (
                    <span className="text-xs text-green-400">Crossed</span>
                  )}
                  {isActive && (
                    <span className="text-xs text-blue-400 animate-pulse">Current</span>
                  )}
                </div>

                {/* Status Icon */}
                <div className={`flex-shrink-0 ${getStatusColor(city.status)}`}>
                  {getStatusIcon(city.status)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
