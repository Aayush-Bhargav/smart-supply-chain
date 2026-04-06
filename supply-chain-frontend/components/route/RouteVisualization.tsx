'use client';

import { useState } from 'react';
import DeckGL from '@deck.gl/react';
import { ArcLayer, ScatterplotLayer, BitmapLayer } from '@deck.gl/layers';
import { TileLayer } from '@deck.gl/geo-layers';
import { RouteResponse } from '@/types/route';
import { Compass } from 'lucide-react';

interface VisualEdge {
  sourcePosition: [number, number];
  targetPosition: [number, number];
  from: string;
  to: string;
  mode: string;
  days: number;
  base_time: number;
}

interface VisualNode {
  position: [number, number];
  name: string;
  isOrigin?: boolean;
  isDestination?: boolean;
}

interface HoverData {
  x: number;
  y: number;
  object: {
    name?: string;
    mode?: string;
    days?: number;
    base_time?: number;
    from?: string;
    to?: string;
    isOrigin?: boolean;
    isDestination?: boolean;
  };
  layer: { id: string };
}

interface RouteVisualizationProps {
  response: RouteResponse;
  cityCoordinates: { [key: string]: [number, number] };
}

const getTransportModeColor = (mode: string): number[] => {
  if (mode === "Air") return [255, 80, 80, 220];      // red
  if (mode === "Ocean") return [50, 160, 255, 200];   // blue
  return [80, 255, 140, 180];                           // green = Truck/Rail
};

export default function RouteVisualization({ response, cityCoordinates }: RouteVisualizationProps) {
  const [hoverInfo, setHoverInfo] = useState<HoverData | null>(null);

  // Calculate bounds for centering the map
  const calculateViewState = () => {
    if (!response || Object.keys(cityCoordinates).length === 0) {
      return {
        longitude: -74.0,
        latitude: 40.7,
        zoom: 3,
        pitch: 45,
        bearing: 0,
      };
    }
    
    const allPositions: [number, number][] = [];
    
    // Add source position
    if (cityCoordinates[response.source]) {
      allPositions.push([cityCoordinates[response.source][1], cityCoordinates[response.source][0]]);
    }
    
    // Add all route segment positions
    response.route.forEach((segment) => {
      if (cityCoordinates[segment.from]) {
        allPositions.push([cityCoordinates[segment.from][1], cityCoordinates[segment.from][0]]);
      }
      if (cityCoordinates[segment.to]) {
        allPositions.push([cityCoordinates[segment.to][1], cityCoordinates[segment.to][0]]);
      }
    });
    
    if (allPositions.length === 0) {
      return {
        longitude: -74.0,
        latitude: 40.7,
        zoom: 3,
        pitch: 45,
        bearing: 0,
      };
    }
    
    // Calculate center
    const avgLng = allPositions[0][0];
    const avgLat = allPositions[0][1];
    
    // Calculate appropriate zoom based on route spread
    const lngs = allPositions.map(pos => pos[0]);
    const lats = allPositions.map(pos => pos[1]);
    const lngRange = Math.max(...lngs) - Math.min(...lngs);
    const latRange = Math.max(...lats) - Math.min(...lats);
    const maxRange = Math.max(lngRange, latRange);
    
    // Adjust zoom based on the spread of the route
    let zoom = 3;
    if (maxRange < 10) zoom = 8;
    else if (maxRange < 30) zoom = 6;
    else if (maxRange < 60) zoom = 4;
    else if (maxRange < 120) zoom = 2;
    
    return {
      longitude: avgLng,
      latitude: avgLat,
      zoom: zoom,
      pitch: 45,
      bearing: 0,
    };
  };

  const viewState = calculateViewState();

  const visualEdges: VisualEdge[] = response.route.map((segment) => {
    const sourcePos = cityCoordinates[segment.from] ? [cityCoordinates[segment.from][1], cityCoordinates[segment.from][0]] as [number, number] : [0, 0];
    const targetPos = cityCoordinates[segment.to] ? [cityCoordinates[segment.to][1], cityCoordinates[segment.to][0]] as [number, number] : [0, 0];
    
    console.log(`${segment.from} -> ${segment.to}:`, {
      original: cityCoordinates[segment.from],
      converted: sourcePos,
      targetOriginal: cityCoordinates[segment.to],
      targetConverted: targetPos
    });
    
    return {
      sourcePosition: sourcePos,
      targetPosition: targetPos,
      from: segment.from,
      to: segment.to,
      mode: segment.mode,
      days: segment.days,
      base_time: segment.base_time,
    };
  });

  const visualNodes: VisualNode[] = [];
  const seenNodes = new Set<string>();

  response.route.forEach((segment, index) => {
    if (!seenNodes.has(segment.from)) {
      seenNodes.add(segment.from);
      visualNodes.push({
        position: cityCoordinates[segment.from] ? [cityCoordinates[segment.from][1], cityCoordinates[segment.from][0]] as [number, number] : [0, 0],
        name: segment.from,
        isOrigin: index === 0,
        isDestination: false,
      });
    }
    if (index === response.route.length - 1) {
      visualNodes.push({
        position: cityCoordinates[segment.to] ? [cityCoordinates[segment.to][1], cityCoordinates[segment.to][0]] as [number, number] : [0, 0],
        name: segment.to,
        isOrigin: false,
        isDestination: true,
      });
    }
  });

  const layers = [
    new TileLayer({
      data: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
      getTileData: (tile: any) => {
        const { x, y, z } = tile.index;
        return `https://a.basemaps.cartocdn.com/dark_all/${z}/${x}/${y}.png`;
      },
      renderSubLayers: (props: any) => {
        const { west, south, east, north } = props.tile.bbox;
        return new BitmapLayer(props, {
          data: undefined,
          image: props.data,
          bounds: [west, south, east, north],
        });
      },
    }),
    new ArcLayer({
      id: "arcs-layer",
      data: visualEdges,
      getSourcePosition: (d: VisualEdge) => d.sourcePosition,
      getTargetPosition: (d: VisualEdge) => d.targetPosition,
      getSourceColor: (d: VisualEdge) => getTransportModeColor(d.mode),
      getTargetColor: (d: VisualEdge) => getTransportModeColor(d.mode),
      getWidth: 3,
      getHeight: (d: VisualEdge) => d.mode === "Air" ? 0.5 : 0.2,
      pickable: true,
      autoHighlight: true,
      onHover: (info: any) => setHoverInfo(info as HoverData),
    }),
    new ScatterplotLayer({
      id: "nodes-layer",
      data: visualNodes,
      getPosition: (d: VisualNode) => d.position,
      getFillColor: (d: VisualNode) => {
        if (d.isOrigin) return [255, 100, 100, 255];
        if (d.isDestination) return [100, 255, 100, 255];
        return [100, 150, 255, 200];
      },
      getRadius: (d: VisualNode) => {
        if (d.isOrigin || d.isDestination) return 15000;
        return 8000;
      },
      radiusMinPixels: 3,
      radiusMaxPixels: 10,
      pickable: true,
      autoHighlight: true,
      onHover: (info: any) => setHoverInfo(info as HoverData),
    }),
  ];

  return (
    <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-blue-400">Route Visualization</h2>
        <button
          onClick={() => window.location.reload()}
          className="flex items-center px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          title="Center map on route"
        >
          <Compass className="w-4 h-4 mr-2" />
          Center Map
        </button>
      </div>
      <div className="relative w-full h-[600px] rounded-lg overflow-hidden">
        <DeckGL
          initialViewState={viewState}
          controller={true}
          layers={layers}
        />

        {hoverInfo && hoverInfo.object && (
          <div
            className="absolute z-50 p-4 font-mono text-sm text-white bg-gray-900 border border-gray-700 rounded-xl shadow-2xl pointer-events-none backdrop-blur-sm bg-opacity-95 max-w-[280px]"
            style={{ left: hoverInfo.x + 18, top: hoverInfo.y + 18 }}
          >
            {hoverInfo.layer.id === 'nodes-layer' ? (
              <>
                <div className="font-bold text-blue-400 mb-2 border-b border-gray-700 pb-1 flex items-center gap-2">
                  📍 {hoverInfo.object.name}
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Type:</span>
                  <span>
                    {hoverInfo.object.isOrigin && '🔴 Origin'}
                    {hoverInfo.object.isDestination && '🟢 Destination'}
                    {!hoverInfo.object.isOrigin && !hoverInfo.object.isDestination && '🔵 Transit Hub'}
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="font-bold text-emerald-400 mb-2 border-b border-gray-700 pb-1 flex items-center gap-2">
                  🛣️ Route Details
                </div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Route:</span>
                    <span className="font-medium">{hoverInfo.object.from} → {hoverInfo.object.to}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Transport:</span>
                    <span className="font-medium">
                      {hoverInfo.object.mode === 'Truck' && '🚚'}
                      {hoverInfo.object.mode === 'Ocean' && '🚢'}
                      {hoverInfo.object.mode === 'Air' && '✈️'}
                      {hoverInfo.object.mode === 'Rail' && '🚂'}
                      {' ' + hoverInfo.object.mode}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Duration:</span>
                    <span className="font-medium">{hoverInfo.object.days?.toFixed(1)} days</span>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
