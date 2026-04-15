'use client';

import 'leaflet/dist/leaflet.css';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { RouteResponse } from '@/types/route';

const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false });
const TileLayer   = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer),   { ssr: false });
const Polyline    = dynamic(() => import('react-leaflet').then(mod => mod.Polyline),    { ssr: false });
const Marker      = dynamic(() => import('react-leaflet').then(mod => mod.Marker),      { ssr: false });
const Popup       = dynamic(() => import('react-leaflet').then(mod => mod.Popup),       { ssr: false });

interface RouteVisualizationProps {
  response: any;                    // accepts legacyFormatResponse from new page.tsx
}

const TRANSPORT_COLORS: Record<string, string> = {
  Truck: '#f59e0b',
  Ocean: '#3b82f6',
  Air:   '#10b981',
  Rail:  '#8b5cf6',
};

export default function RouteVisualization({ response }: RouteVisualizationProps) {
  const mapRef = useRef<any>(null);
  const [cityCoordinates, setCityCoordinates] = useState<Record<string, [number, number]>>({});

  // Load city coordinates from JSON file
  useEffect(() => {
    fetch('/data/city_coords_cache.json')
      .then(res => res.json())
      .then(data => setCityCoordinates(data))
      .catch(err => console.error('Error loading city coordinates:', err));
  }, []);

  // Fix Leaflet icons
  useEffect(() => {
    if (typeof window !== 'undefined') {
      import('leaflet').then((L) => {
        delete (L.Icon.Default.prototype as any)._getIconUrl;
        L.Icon.Default.mergeOptions({
          iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
          iconUrl:       'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
          shadowUrl:     'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        });
      });
    }
  }, []);

  const currentRoute = response.route || [];

  const getCityCoordinates = (city: string): [number, number] => {
    const coord = cityCoordinates[city];
    if (coord) return coord; // JSON format is [lat, lng] array
    console.warn(`⚠️ Missing coordinates for city: ${city}`);
    return [20, 78]; // fallback
  };

  const routeCoordinates: [number, number][] = [];
  currentRoute.forEach((segment: any) => {
    if (routeCoordinates.length === 0) routeCoordinates.push(getCityCoordinates(segment.from));
    routeCoordinates.push(getCityCoordinates(segment.to));
  });

  const center = routeCoordinates.length > 0 ? routeCoordinates[0] : [20, 78];

  if (routeCoordinates.length === 0) {
    return (
      <div className="h-[520px] bg-slate-900 rounded-3xl flex items-center justify-center border border-slate-700">
        <p className="text-gray-400">No route to display yet</p>
      </div>
    );
  }

  return (
    <div className="card p-2 h-[520px] hover-lift">
      <MapContainer
        ref={mapRef}
        center={center}
        zoom={5}
        style={{ height: '100%', width: '100%', borderRadius: '20px' }}
        className="rounded-3xl"
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />

        {/* Route lines */}
        {currentRoute.map((segment: any, index: number) => {
          const fromCoords = getCityCoordinates(segment.from);
          const toCoords = getCityCoordinates(segment.to);

          return (
            <Polyline
              key={`poly-${index}`}
              positions={[fromCoords, toCoords]}
              color={TRANSPORT_COLORS[segment.mode] || '#6b7280'}
              weight={6}
              opacity={0.85}
            >
              <Popup>
                <div className="text-sm min-w-[180px]">
                  <p className="font-semibold">{segment.from} → {segment.to}</p>
                  <p>Mode: <span className="font-medium">{segment.mode}</span></p>
                  <p>Duration: <span className="font-medium">{segment.days} days</span></p>
                  <p>Risk: <span className="font-medium">{segment.risk_score}</span></p>
                </div>
              </Popup>
            </Polyline>
          );
        })}

        {/* Markers */}
        {currentRoute.map((segment: any, index: number) => {
          const fromCoords = getCityCoordinates(segment.from);
          const isLast = index === currentRoute.length - 1;
          const toCoords = getCityCoordinates(segment.to);

          return (
            <div key={`markers-${index}`}>
              <Marker position={fromCoords}>
                <Popup>
                  <div className="text-sm">
                    <p className="font-semibold">{segment.from}</p>
                    <p className="text-green-600">Departure / Transit</p>
                  </div>
                </Popup>
              </Marker>

              {isLast && (
                <Marker position={toCoords}>
                  <Popup>
                    <div className="text-sm">
                      <p className="font-semibold">{segment.to}</p>
                      <p className="text-red-600">Final Destination</p>
                    </div>
                  </Popup>
                </Marker>
              )}
            </div>
          );
        })}
      </MapContainer>
    </div>
  );
}