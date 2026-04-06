'use client';

import { useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { RouteResponse } from '@/types/route';

const Map = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false });
const Polyline = dynamic(() => import('react-leaflet').then(mod => mod.Polyline), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(mod => mod.Popup), { ssr: false });

interface RouteMapProps {
  response: RouteResponse;
}

const CITY_COORDINATES: { [key: string]: [number, number] } = {
  'New York': [40.7128, -74.0060],
  'Los Angeles': [34.0522, -118.2437],
  'Chicago': [41.8781, -87.6298],
  'Houston': [29.7604, -95.3698],
  'Phoenix': [33.4484, -112.0740],
  'Philadelphia': [39.9526, -75.1652],
  'San Antonio': [29.4241, -98.4936],
  'San Diego': [32.7157, -117.1611],
  'Dallas': [32.7767, -96.7970],
  'San Jose': [37.3382, -121.8863],
  'Austin': [30.2672, -97.7431],
  'Jacksonville': [30.3322, -81.6557],
  'Fort Worth': [32.7555, -97.3308],
  'Columbus': [39.9612, -82.9988],
  'Charlotte': [35.2271, -80.8431],
  'San Francisco': [37.7749, -122.4194],
  'Indianapolis': [39.7684, -86.1581],
  'Seattle': [47.6062, -122.3321],
  'Denver': [39.7392, -104.9903],
  'Boston': [42.3601, -71.0589],
  'El Paso': [31.7619, -106.4850],
  'Detroit': [42.3314, -83.0458],
  'Nashville': [36.1627, -86.7816],
  'Portland': [45.5152, -122.6784],
  'Memphis': [35.1495, -90.0490],
  'Oklahoma City': [35.4676, -97.5164],
  'Las Vegas': [36.1699, -115.1398],
  'Baltimore': [39.2904, -76.6122],
  'Milwaukee': [43.0389, -87.9065],
  'Albuquerque': [35.0844, -106.6504],
  'Tucson': [32.2226, -110.9747],
  'Fresno': [36.7378, -119.7871],
  'Sacramento': [38.5816, -121.4944],
  'Kansas City': [39.0997, -94.5786],
  'Mesa': [33.4152, -111.8315],
  'Atlanta': [33.7490, -84.3880],
  'Omaha': [41.2565, -95.9345],
  'Colorado Springs': [38.8339, -104.8214],
  'Raleigh': [35.7796, -78.6382],
  'Miami': [25.7617, -80.1918],
  'Oakland': [37.8044, -122.2711],
  'Minneapolis': [44.9778, -93.2650],
  'Tulsa': [36.1540, -95.9928],
  'Cleveland': [41.4993, -81.6944],
  'Wichita': [37.6872, -97.3301],
  'Arlington': [32.7357, -97.1081],
  'New Orleans': [29.9511, -90.0715],
  'Bakersfield': [35.3733, -119.0187],
  'Tampa': [27.9506, -82.4572],
  'Honolulu': [21.3099, -157.8581],
  'Anaheim': [33.8366, -117.9143],
  'Santa Ana': [33.7455, -117.8677],
  'Riverside': [33.9533, -117.3962],
  'Corpus Christi': [27.8006, -97.3964],
  'Lexington': [38.0406, -84.5037],
  'Pittsburgh': [40.4406, -79.9959],
  'Anchorage': [61.2181, -149.9003],
  'Stockton': [37.9577, -121.2908],
  'Cincinnati': [39.1031, -84.5120],
  'Saint Paul': [44.9537, -93.0900],
  'Toledo': [41.6528, -83.5379],
  'Greensboro': [36.0726, -79.7920],
  'Newark': [40.7357, -74.1724],
  'Plano': [33.0198, -96.6989],
  'Henderson': [36.0397, -114.9817],
  'Lincoln': [40.8136, -96.7026],
  'Buffalo': [42.8864, -78.8784],
  'Jersey City': [40.7178, -74.0431],
  'Chula Vista': [32.6401, -117.0842],
  'Orlando': [28.5383, -81.3792],
  'Norfolk': [36.8468, -76.2852],
  'Chesapeake': [36.7682, -76.2875],
  'Laredo': [27.5064, -99.5075],
  'Madison': [43.0731, -89.4012],
  'Gilbert': [33.3528, -111.7890],
  'Lubbock': [33.5779, -101.8553],
  'Boise': [43.6150, -116.2023],
  'Birmingham': [33.5207, -86.8025],
    
  'Paris': [48.8566, 2.3522],
  'Berlin': [52.5200, 13.4050],
  'Tokyo': [35.6762, 139.6503],
  'Shanghai': [31.2304, 121.4737],
  'Mumbai': [19.0760, 72.8777],
  'Delhi': [28.7041, 77.1025],
  'São Paulo': [-23.5505, -46.6333],
  'Mexico City': [19.4326, -99.1332],
  'Cairo': [30.0444, 31.2357],
  'Lagos': [6.5244, 3.3792],
  'Moscow': [55.7558, 37.6173],
  'Beijing': [39.9042, 116.4074],
  'Hong Kong': [22.3193, 114.1694],
  'Singapore': [1.3521, 103.8198],
  'Sydney': [-33.8688, 151.2093],
  'Melbourne': [-37.8136, 144.9631],
  'Toronto': [43.6532, -79.3832],
  'Vancouver': [49.2827, -123.1207],
  'Montreal': [45.5017, -73.5673],
  'Calgary': [51.0447, -114.0719],
  'Edmonton': [53.5461, -113.4938],
  'Winnipeg': [49.8951, -97.1384],
  'Quebec City': [46.8139, -71.2080],
  'Hamilton': [43.2557, -79.8711],
  'Kitchener': [43.4516, -80.4925],
  'London': [42.9837, -81.2497],
  'Halifax': [44.6488, -63.5752],
  'Victoria': [48.4284, -123.3656],
  'Ottawa': [45.4215, -75.6972],
  'Windsor': [42.3149, -83.0703],
  'Saskatoon': [52.1579, -106.6702],
  'Regina': [50.4452, -104.6189],
  'Sherbrooke': [45.4042, -71.9028],
  'St. John\'s': [47.5615, -52.7126],
  'Barrie': [44.3894, -79.6903],
  'Kelowna': [49.8880, -119.4960],
  'Abbotsford': [49.0504, -122.3045],
  'Kingston': [44.2312, -76.4860],
  'Sudbury': [46.4917, -80.9903],
  'Saguenay': [48.4167, -71.0675],
  'Trois-Rivières': [46.3432, -72.7444],
  'Guelph': [43.5448, -80.2482],
  'Moncton': [46.0878, -64.7782],
  'Brantford': [43.1394, -80.2644],
  'Saint John': [45.2796, -66.0633],
  'Thunder Bay': [48.3809, -89.2477],
  'Cape Breton': [46.1469, -60.1821],
  'Fredericton': [45.9636, -66.6431],
  'Charlottetown': [46.2382, -63.1311],
  'Summerside': [46.3959, -63.7954],
  'Corner Brook': [48.9499, -57.9535],
  'Gander': [48.9533, -54.6130],
  'Happy Valley-Goose Bay': [53.3097, -60.1583],
  'Coimbatore': [11.0168, 76.9558],
  'Veracruz': [19.1738, -96.1342],
};

const TRANSPORT_COLORS = {
  'Truck': '#f59e0b', // amber
  'Ocean': '#3b82f6', // blue  
  'Air': '#10b981', // emerald
  'Rail': '#8b5cf6', // violet
};

const getTransportModeColor = (mode: string): string => {
  return TRANSPORT_COLORS[mode as keyof typeof TRANSPORT_COLORS] || '#6b7280';
};

export default function RouteMap({ response }: RouteMapProps) {
  const mapRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      import('leaflet').then((L) => {
        delete (L.Icon.Default.prototype as any)._getIconUrl;
        L.Icon.Default.mergeOptions({
          iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
          iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
          shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
          iconSize: [25, 41],
          iconAnchor: [12, 41],
          popupAnchor: [1, -34],
          shadowSize: [41, 41]
        });
      });
    }
  }, []);

  const getCityCoordinates = (city: string): [number, number] => {
    return CITY_COORDINATES[city] || [0, 0];
  };

  const routeCoordinates: [number, number][] = [];
  
  response.route.forEach((segment) => {
    const fromCoords = getCityCoordinates(segment.from);
    const toCoords = getCityCoordinates(segment.to);
    
    if (routeCoordinates.length === 0) {
      routeCoordinates.push(fromCoords);
    }
    routeCoordinates.push(toCoords);
  });

  if (typeof window === 'undefined') {
    return (
      <div className="flex items-center justify-center h-full bg-gray-100 rounded-lg">
        <div className="text-gray-500">Loading map...</div>
      </div>
    );
  }

  const L = require('leaflet');

  return (
    <Map
      ref={mapRef}
      center={[20, 0]}
      zoom={2}
      style={{ height: '500px', width: '100%' }}
      className="rounded-lg"
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />

      {/* Route segments with different colors */}
      {response.route.map((segment, index) => {
        const fromCoords = getCityCoordinates(segment.from);
        const toCoords = getCityCoordinates(segment.to);
        
        return (
          <Polyline
            key={index}
            positions={[fromCoords, toCoords]}
            color={getTransportModeColor(segment.mode)}
            weight={4}
            opacity={0.8}
          >
            <Popup>
              <div className="text-sm">
                <p className="font-semibold">{segment.from} → {segment.to}</p>
                <p>Mode: <span className="font-medium">{segment.mode}</span></p>
                <p>Duration: <span className="font-medium">{segment.days} days</span></p>
                <p>Base Time: <span className="font-medium">{segment.base_time} days</span></p>
              </div>
            </Popup>
          </Polyline>
        );
      })}

      {/* Markers for cities */}
      {response.route.map((segment, index) => {
        const fromCoords = getCityCoordinates(segment.from);
        const toCoords = getCityCoordinates(segment.to);
        
        return (
          <div key={`markers-${index}`}>
            <Marker position={fromCoords}>
              <Popup>
                <div className="text-sm">
                  <p className="font-semibold">{segment.from}</p>
                  <p>Departure point</p>
                </div>
              </Popup>
            </Marker>
            
            {index === response.route.length - 1 && (
              <Marker position={toCoords}>
                <Popup>
                  <div className="text-sm">
                    <p className="font-semibold">{segment.to}</p>
                    <p>Final destination</p>
                  </div>
                </Popup>
              </Marker>
            )}
          </div>
        );
      })}
    </Map>
  );
}
