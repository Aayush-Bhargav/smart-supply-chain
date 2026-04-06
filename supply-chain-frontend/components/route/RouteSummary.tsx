'use client';

import { useState, useEffect } from 'react';
import { Brain, Loader2, AlertCircle, Clock, MapPin, TrendingUp, Ship } from 'lucide-react';
import { RouteResponse } from '@/types/route';

interface RouteSummaryProps {
  response: RouteResponse;
}

interface SummaryData {
  overview: string;
  crossDockHubs: string[];
  timeAnalysis: string[];
  delayReasons: string[];
}

export default function RouteSummary({ response }: RouteSummaryProps) {
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (response) {
      generateSummary();
    }
  }, [response]);

  const generateSummary = async () => {
    setLoading(true);
    setError(null);

    try {
      const apiResponse = await fetch('/api/generate-summary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          route: response,
        }),
      });

      if (!apiResponse.ok) {
        throw new Error('Failed to generate summary');
      }

      const data = await apiResponse.json();
      setSummary(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate summary');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-blue-400 mr-3" />
          <span className="text-gray-300">Generating AI-powered route summary...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <div className="flex items-center text-red-400 mb-4">
          <AlertCircle className="w-5 h-5 mr-2" />
          <span className="font-semibold">Error generating summary</span>
        </div>
        <p className="text-gray-300">{error}</p>
        <button
          onClick={generateSummary}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-blue-400">AI Route Summary</h3>
          <button
            onClick={generateSummary}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Brain className="w-4 h-4 mr-2" />
            Generate Summary
          </button>
        </div>
        <p className="text-gray-400 text-center py-8">
          Click "Generate Summary" to get AI-powered insights about your route
        </p>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
      <div className="flex items-center mb-6">
        <Brain className="w-6 h-6 mr-3 text-blue-400" />
        <h3 className="text-xl font-bold text-blue-400">AI Route Summary</h3>
      </div>

      {/* Overview */}
      <div className="mb-6">
        <h4 className="text-lg font-semibold text-white mb-3 flex items-center">
          <MapPin className="w-5 h-5 mr-2 text-gray-400" />
          Route Overview
        </h4>
        <p className="text-gray-300 leading-relaxed">{summary.overview}</p>
      </div>

      {/* Cross-Dock Hubs */}
      {summary.crossDockHubs.length > 0 && (
        <div className="mb-6">
          <h4 className="text-lg font-semibold text-white mb-3 flex items-center">
            <Ship className="w-5 h-5 mr-2 text-gray-400" />
            Cross-Dock Hubs
          </h4>
          <div className="space-y-2">
            {summary.crossDockHubs.map((hub, index) => (
              <div key={index} className="flex items-center p-3 bg-gray-700 rounded-lg">
                <div className="w-3 h-3 bg-yellow-400 rounded-full mr-3"></div>
                <span className="text-gray-300">{hub}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Time Analysis */}
      <div className="mb-6">
        <h4 className="text-lg font-semibold text-white mb-3 flex items-center">
          <Clock className="w-5 h-5 mr-2 text-gray-400" />
          Time Analysis
        </h4>
        <div className="space-y-2">
          {summary.timeAnalysis.map((analysis, index) => (
            <div key={index} className="p-3 bg-gray-700 rounded-lg">
              <p className="text-gray-300">{analysis}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Delay Reasons */}
      {summary.delayReasons.length > 0 && (
        <div>
          <h4 className="text-lg font-semibold text-white mb-3 flex items-center">
            <TrendingUp className="w-5 h-5 mr-2 text-gray-400" />
            Delay Factors
          </h4>
          <div className="space-y-2">
            {summary.delayReasons.map((reason, index) => (
              <div key={index} className="p-3 bg-red-900/30 border border-red-700/50 rounded-lg">
                <p className="text-red-300">{reason}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={generateSummary}
        className="mt-6 w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
      >
        Regenerate Summary
      </button>
    </div>
  );
}
