'use client';

import { Package, TrendingUp, Calendar } from 'lucide-react';
import { RouteResponse } from '@/types/route';

interface RouteDetailsProps {
  response: RouteResponse;
}

export default function RouteDetails({ response }: RouteDetailsProps) {
  return (
    <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
      <h2 className="text-xl font-bold mb-4 text-blue-400">Shipment Details</h2>
      <div className="space-y-3">
        <div className="flex items-center">
          <Package className="w-5 h-5 mr-3 text-blue-400" />
          <span className="text-gray-300">Category:</span>
          <span className="ml-auto font-semibold text-white">{response.category_name}</span>
        </div>
        <div className="flex items-center">
          <Package className="w-5 h-5 mr-3 text-blue-400" />
          <span className="text-gray-300">Quantity:</span>
          <span className="ml-auto font-semibold text-white">{response.quantity}</span>
        </div>
        <div className="flex items-center">
          <TrendingUp className="w-5 h-5 mr-3 text-blue-400" />
          <span className="text-gray-300">Priority:</span>
          <span className="ml-auto font-semibold text-white">{response.priority_level}</span>
        </div>
        <div className="flex items-center">
          <Calendar className="w-5 h-5 mr-3 text-blue-400" />
          <span className="text-gray-300">Dispatch:</span>
          <span className="ml-auto font-semibold text-white text-sm">
            {new Date(response.dispatch_date).toLocaleDateString()}
          </span>
        </div>
      </div>
    </div>
  );
}
