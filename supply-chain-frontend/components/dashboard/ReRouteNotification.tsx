'use client';

import React from 'react';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import Link from 'next/link';

interface ReRouteNotificationProps {
  reRoutedCount: number;
  onClose: () => void;
}

export default function ReRouteNotification({ reRoutedCount, onClose }: ReRouteNotificationProps) {
  if (reRoutedCount === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 max-w-md">
      <div className="bg-orange-500 text-white px-6 py-4 rounded-lg shadow-lg animate-pulse">
        <div className="flex items-start">
          <AlertTriangle className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <h4 className="font-semibold mb-1">Route Re-calculated!</h4>
            <p className="text-sm mb-3">
              {reRoutedCount} route{reRoutedCount > 1 ? 's' : ''} re-calculated due to high-risk cities. 
              Click to view alternative routes.
            </p>
            <div className="flex items-center space-x-3">
              <Link
                href="/reroutes"
                className="inline-flex items-center px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition-colors"
              >
                <ExternalLink className="w-4 h-4 mr-1" />
                View Routes
              </Link>
              <button
                onClick={onClose}
                className="text-white/80 hover:text-white text-sm"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
