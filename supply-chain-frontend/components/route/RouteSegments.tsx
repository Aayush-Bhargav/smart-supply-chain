'use client';

import { RouteResponse } from '@/types/route';

interface RouteSegmentsProps {
  response: RouteResponse;
}

const getTransportModeColor = (mode: string): string => {
  if (mode === "Air") return "255, 80, 80";      // red
  if (mode === "Ocean") return "50, 160, 255";   // blue
  return "80, 255, 140";                           // green = Truck/Rail
};

export default function RouteSegments({ response }: RouteSegmentsProps) {
  return (
    <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
      <h2 className="text-xl font-bold mb-4 text-blue-400">Route Segments</h2>
      <div className="space-y-3">
        {response.route.map((segment, index) => (
          <div key={index} className="flex items-center p-3 bg-gray-700 rounded-lg">
            <div className="text-2xl mr-3">
              {segment.mode === 'Truck' && '🚚'}
              {segment.mode === 'Ocean' && '🚢'}
              {segment.mode === 'Air' && '✈️'}
              {segment.mode === 'Rail' && '🚂'}
            </div>
            <div className="flex-1">
              <div className="font-medium text-white">
                {segment.from} → {segment.to}
              </div>
              <div className="text-sm text-gray-400">
                {segment.mode} • {segment.days} days
              </div>
            </div>
            <div
              className="w-4 h-4 rounded-full"
              style={{ backgroundColor: `rgb(${getTransportModeColor(segment.mode)})` }}
            ></div>
          </div>
        ))}
      </div>
    </div>
  );
}
