'use client';

import { RouteResponse } from '@/types/route';

interface RouteStatsProps {
  response: RouteResponse;
}

export default function RouteStats({ response }: RouteStatsProps) {
  return (
    <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
      <h2 className="text-xl font-bold mb-4 text-blue-400">Statistics</h2>
      <div className="space-y-3">
        
        <div className="flex justify-between">
          <span className="text-gray-300">Transit Time:</span>
          <span className="font-semibold text-white">{response.total_transit_days} days</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-300">Segments:</span>
          <span className="font-semibold text-white">{response.route.length}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-300">Avg Time/Segment:</span>
          <span className="font-semibold text-white">
            {(response.total_transit_days / response.route.length).toFixed(1)} days
          </span>
        </div>
      </div>
    </div>
  );
}
