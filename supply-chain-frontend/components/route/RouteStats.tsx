'use client';

import { RouteResponse } from '@/types/route';

interface RouteStatsProps {
  response: RouteResponse;
}

export default function RouteStats({ response }: RouteStatsProps) {
  const totalTransitDays = response.total_transit_days ?? 0;
  const segments = response.route ?? [];
  const averageTimePerSegment = segments.length > 0 ? (totalTransitDays / segments.length).toFixed(1) : '0.0';

  return (
    <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
      <h2 className="text-xl font-bold mb-4 text-blue-400">Statistics</h2>
      <div className="space-y-3">
        
        <div className="flex justify-between">
          <span className="text-gray-300">Transit Time:</span>
          <span className="font-semibold text-white">{totalTransitDays} days</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-300">Segments:</span>
          <span className="font-semibold text-white">{segments.length}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-300">Avg Time/Segment:</span>
          <span className="font-semibold text-white">
            {averageTimePerSegment} days
          </span>
        </div>
      </div>
    </div>
  );
}
