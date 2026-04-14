'use client';

import { ArrowLeft, Share2, Download, Save } from 'lucide-react';
import { RouteResponse } from '@/types/route';

interface HeaderProps {
  response: RouteResponse;
  onBack: () => void;
  onShare: () => void;
  onExport: () => void;
  onSave?: () => void; // Optional save prop
  saving?: boolean; // Optional saving state
}

export default function Header({ response, onBack, onShare, onExport, onSave, saving }: HeaderProps) {
  return (
    <>
      <div className="bg-gray-900 text-white shadow-lg border-b border-gray-800">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={onBack}
              className="flex items-center text-gray-300 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-5 h-5 mr-2" />
              Back to Home
            </button>
            <div className="flex items-center space-x-4">
              <button
                onClick={onShare}
                className="flex items-center px-4 py-2 text-gray-300 hover:text-white transition-colors"
              >
                <Share2 className="w-4 h-4 mr-2" />
                Share
              </button>
              <button
                onClick={onExport}
                className="flex items-center px-4 py-2 text-gray-300 hover:text-white transition-colors"
              >
                <Download className="w-4 h-4 mr-2" />
                Export
              </button>
              {onSave && (
                <button
                  onClick={onSave}
                  disabled={saving}
                  className="flex items-center px-4 py-2 text-gray-300 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? (
                    <>
                      <div className="w-4 h-4 mr-2 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Save
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-8">
        <div className="container mx-auto px-4">
          <div className="text-center">
            <div className="flex items-center justify-center mb-4">
              <div className="w-8 h-8 mr-3">📍</div>
              <h1 className="text-4xl font-bold">
                {response.source} → {response.target}
              </h1>
            </div>
            <p className="text-xl opacity-90">
              Total Transit Time: <span className="font-bold">{response.recommended_routes[0]?.total_transit_days || 0} days</span>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
