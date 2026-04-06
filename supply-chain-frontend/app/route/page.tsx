'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { RouteResponse } from '@/types/route';
import { Header, RouteVisualization, RouteDetails, RouteSegments, RouteStats, RouteSummary } from '@/components/route';

export default function RoutePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [response, setResponse] = useState<RouteResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cityCoordinates, setCityCoordinates] = useState<{ [key: string]: [number, number] }>({});

  // Load city coordinates from JSON file
  useEffect(() => {
    async function loadCityCoordinates() {
      try {
        const response = await fetch('/data/city_coords_cache.json');
        const coords = await response.json();
        setCityCoordinates(coords);
        console.log('Loaded city coordinates:', coords);
        console.log('Mumbai coords:', coords['Mumbai']);
      } catch (err) {
        console.error('Failed to load city coordinates:', err);
        setError('Failed to load city coordinates');
      }
    }

    loadCityCoordinates();
  }, []);

  useEffect(() => {
    const routeData = searchParams.get('data');
    if (routeData) {
      try {
        const parsedData = JSON.parse(decodeURIComponent(routeData));
        setResponse(parsedData);
      } catch (err) {
        setError('Invalid route data');
      }
    } else {
      setError('No route data provided');
    }
    setLoading(false);
  }, [searchParams]);

  const handleShare = () => {
    if (response) {
      const url = window.location.href;
      navigator.clipboard.writeText(url);
      alert('Route URL copied to clipboard!');
    }
  };

  const handleExport = () => {
    if (response) {
      const dataStr = JSON.stringify(response, null, 2);
      const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
      const exportFileDefaultName = `route-${response.source}-${response.target}.json`;
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();
    }
  };

  if (loading || Object.keys(cityCoordinates).length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950 text-white">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-xl">Loading route visualization...</p>
        </div>
      </div>
    );
  }

  if (error || !response) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950 text-white">
        <div className="text-center">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h1 className="text-3xl font-bold mb-2">Route Error</h1>
          <p className="text-gray-400 mb-4">{error || 'No route data available'}</p>
          <button
            onClick={() => router.push('/')}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Header 
        response={response}
        onBack={() => router.push('/')}
        onShare={handleShare}
        onExport={handleExport}
      />

      <div className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-6">
            <RouteDetails response={response} />
            <RouteSegments response={response} />
            <RouteStats response={response} />
          </div>

          <div className="lg:col-span-2 space-y-6">
            <RouteVisualization 
              response={response}
              cityCoordinates={cityCoordinates}
            />
            <RouteSummary response={response} />
          </div>
        </div>
      </div>
    </div>
  );
}
