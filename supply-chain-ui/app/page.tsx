// "use client";

// import { useEffect, useState } from "react";
// import DeckGL from "@deck.gl/react";
// import { ArcLayer, ScatterplotLayer, BitmapLayer } from "@deck.gl/layers";
// import { TileLayer } from "@deck.gl/geo-layers";

// // 1. Strict Data Interfaces
// interface SupplyNode {
//   node_id: number;
//   name: string;
//   lat: number;
//   lon: number;
//   is_tier_1: boolean;
//   features: number[];
// }

// interface SupplyEdge {
//   source: number;
//   target: number;
//   mode: string;
//   weight: number;
//   category: string;
//   features: number[];
// }

// interface VisualEdge extends SupplyEdge {
//   sourcePosition: [number, number];
//   targetPosition: [number, number];
// }

// // 2. Strict Tooltip Interface
// interface HoverData {
//   x: number;
//   y: number;
//   object: {
//     name?: string;
//     node_id?: number;
//     is_tier_1?: boolean;
//     mode?: string;
//     category?: string;
//     weight?: number;
//   };
//   layer: {
//     id: string;
//   };
// }

// const INITIAL_VIEW_STATE = {
//   longitude: -74.0,
//   latitude: 40.7,
//   zoom: 3,
//   pitch: 45,
//   bearing: 0,
// };

// export default function Home() {
//   const [nodes, setNodes] = useState<SupplyNode[]>([]);
//   const [edges, setEdges] = useState<VisualEdge[]>([]);
//   const [isLoading, setIsLoading] = useState(true);
//   const [hoverInfo, setHoverInfo] = useState<HoverData | null>(null);

//   useEffect(() => {
//     async function loadGraphData() {
//       try {
//         const nodesRes = await fetch("/data/nodes.json");
//         const rawNodes: SupplyNode[] = await nodesRes.json();
        
//         const edgesRes = await fetch("/data/edges.json");
//         const rawEdges: SupplyEdge[] = await edgesRes.json();

//         const nodeMap = new Map<number, { lon: number; lat: number; isTier1: boolean }>();
//         rawNodes.forEach((node) => {
//           nodeMap.set(node.node_id, { lon: node.lon, lat: node.lat, isTier1: node.is_tier_1 });
//         });

//         const visualEdges: VisualEdge[] = [];
//         const seenRoutes = new Set<string>();
        
//         // NEW: Strict counters for our ML visual audit
//         let airCount = 0;
//         let oceanCount = 0;
//         let truckCount = 0;

//         rawEdges.forEach((edge) => {
//           const sourceNode = nodeMap.get(edge.source);
//           const targetNode = nodeMap.get(edge.target);

//           if (sourceNode && targetNode) {
//             const routeKey = `${edge.source}_${edge.target}_${edge.mode}`;
            
//             // Ensure we don't draw duplicate lines over each other
//             if (!seenRoutes.has(routeKey)) {
//               let added = false;
              
//               if (edge.mode === "Air" && airCount < 10) {
//                 airCount++;
//                 added = true;
//               } else if (edge.mode === "Ocean" && oceanCount < 10) {
//                 oceanCount++;
//                 added = true;
//               } else if (edge.mode === "Truck" && truckCount < 10) {
//                 truckCount++;
//                 added = true;
//               }

//               if (added) {
//                 seenRoutes.add(routeKey);
//                 visualEdges.push({
//                   ...edge,
//                   sourcePosition: [sourceNode.lon, sourceNode.lat],
//                   targetPosition: [targetNode.lon, targetNode.lat],
//                 });
//               }
//             }
//           }
//         });

//         setNodes(rawNodes);
//         setEdges(visualEdges);
//         setIsLoading(false);
//       } catch (error) {
//         console.error("Failed to load graph data:", error);
//       }
//     }

//     loadGraphData();
//   }, []);

//   const layers = [
//     // 1. The Native Basemap
//     new TileLayer({
//       data: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
//       // eslint-disable-next-line @typescript-eslint/no-explicit-any
//       getTileData: (tile: any) => {
//         const { x, y, z } = tile.index;
//         return `https://a.basemaps.cartocdn.com/dark_all/${z}/${x}/${y}.png`;
//       },
//       // eslint-disable-next-line @typescript-eslint/no-explicit-any
//       renderSubLayers: (props: any) => {
//         const { west, south, east, north } = props.tile.bbox;
//         return new BitmapLayer(props, {
//           data: undefined,
//           image: props.data,
//           bounds: [west, south, east, north]
//         });
//       }
//     }),

//     // 2. The Routes (Arcs)
//     new ArcLayer({
//       id: "arcs-layer",
//       data: edges,
//       getSourcePosition: (d: VisualEdge) => d.sourcePosition,
//       getTargetPosition: (d: VisualEdge) => d.targetPosition,
//       getSourceColor: (d: VisualEdge) => {
//         if (d.mode.includes("Air")) return [255, 50, 50, 180];      
//         if (d.mode.includes("Ocean")) return [50, 150, 255, 150];    
//         return [50, 255, 150, 80];                                   
//       },
//       getTargetColor: (d: VisualEdge) => {
//         if (d.mode.includes("Air")) return [255, 50, 50, 180];      
//         if (d.mode.includes("Ocean")) return [50, 150, 255, 150];    
//         return [50, 255, 150, 80];                                   
//       },
//       getWidth: 2,
//       getHeight: (d: VisualEdge) => d.mode.includes("Air") ? 0.5 : 0.1,
//       pickable: true,
//       autoHighlight: true,
//       onHover: (info) => setHoverInfo(info as HoverData)
//     }),
    
//     // 3. The Hubs (Dots)
//     new ScatterplotLayer({
//       id: "nodes-layer",
//       data: nodes,
//       getPosition: (d: SupplyNode) => [d.lon, d.lat],
//       getFillColor: (d: SupplyNode) => d.is_tier_1 ? [255, 200, 0, 255] : [100, 150, 255, 200],
//       getRadius: (d: SupplyNode) => d.is_tier_1 ? 30000 : 10000,
//       radiusMinPixels: 2,
//       radiusMaxPixels: 10,
//       pickable: true,
//       autoHighlight: true,
//       onHover: (info) => setHoverInfo(info as HoverData)
//     }),
//   ];

//   if (isLoading) {
//     return (
//       <div className="flex items-center justify-center min-h-screen bg-gray-950 text-white">
//         <h1 className="text-2xl font-mono animate-pulse">Initializing Global Control Tower...</h1>
//       </div>
//     );
//   }

//   return (
//     <main className="relative w-full h-screen bg-gray-950 overflow-hidden">
//       <div className="absolute top-0 left-0 z-10 p-6 pointer-events-none">
//         <h1 className="text-4xl font-bold text-white drop-shadow-md">Supply Chain Digital Twin</h1>
//         <p className="text-gray-400 mt-2 font-mono">
//           Nodes: {nodes.length} | Visual Audit Active (30 Routes Max)
//         </p>
//       </div>

//       <DeckGL
//         initialViewState={INITIAL_VIEW_STATE}
//         controller={true}
//         layers={layers}
//       />

//       {/* The Floating Hover Tooltip UI */}
//       {hoverInfo && hoverInfo.object && (
//         <div
//           className="absolute z-50 p-4 font-mono text-sm text-white bg-gray-900 border border-gray-700 rounded-lg shadow-2xl pointer-events-none backdrop-blur-sm bg-opacity-90"
//           style={{ left: hoverInfo.x + 15, top: hoverInfo.y + 15 }}
//         >
//           {hoverInfo.layer.id === 'nodes-layer' ? (
//             <>
//               <div className="font-bold text-blue-400 mb-1 border-b border-gray-700 pb-1">
//                 📍 {hoverInfo.object.name || `Node ${hoverInfo.object.node_id}`}
//               </div>
//               <div className="mt-1">
//                 <span className="text-gray-400">Type:</span> {hoverInfo.object.is_tier_1 ? '🌟 Tier 1 Hub' : '🏢 Regional Facility'}
//               </div>
//             </>
//           ) : (
//             <>
//               <div className="font-bold text-green-400 mb-1 border-b border-gray-700 pb-1">
//                 🛣️ Route Details
//               </div>
//               <div className="mt-1">
//                 <span className="text-gray-400">Transport:</span> {hoverInfo.object.mode}
//               </div>
//               <div>
//                 <span className="text-gray-400">Category:</span> {hoverInfo.object.category}
//               </div>
//               <div>
//                 <span className="text-gray-400">Transit Time:</span> {hoverInfo.object.weight?.toFixed(1)} Days
//               </div>
//             </>
//           )}
//         </div>
//       )}
//     </main>
//   );
// }

"use client";

import { useEffect, useState } from "react";
import DeckGL from "@deck.gl/react";
import { ArcLayer, ScatterplotLayer, BitmapLayer } from "@deck.gl/layers";
import { TileLayer } from "@deck.gl/geo-layers";

// =============================================
// 1. DATA INTERFACES (updated for latest pipeline)
// =============================================
interface SupplyNode {
  node_id: number;
  name: string;
  country?: string;
  lat: number;
  lon: number;
  is_tier_1: boolean;
  features: number[];
}

interface SupplyEdge {
  source: number;
  target: number;
  mode: string;
  weight: number;
  category: string;
  features: number[];
  cross_border?: number;
  source_country?: string;
  target_country?: string;
}

interface VisualEdge extends SupplyEdge {
  sourcePosition: [number, number];
  targetPosition: [number, number];
}

interface HoverData {
  x: number;
  y: number;
  object: {
    name?: string;
    node_id?: number;
    is_tier_1?: boolean;
    country?: string;
    mode?: string;
    category?: string;
    weight?: number;
    source_country?: string;
    target_country?: string;
    cross_border?: number;
  };
  layer: { id: string };
}

const INITIAL_VIEW_STATE = {
  longitude: -74.0,
  latitude: 40.7,
  zoom: 3,
  pitch: 45,
  bearing: 0,
};

export default function Home() {
  const [nodes, setNodes] = useState<SupplyNode[]>([]);
  const [edges, setEdges] = useState<VisualEdge[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hoverInfo, setHoverInfo] = useState<HoverData | null>(null);

  useEffect(() => {
    async function loadGraphData() {
      try {
        const nodesRes = await fetch("/data/nodes.json");
        const rawNodes: SupplyNode[] = await nodesRes.json();

        const edgesRes = await fetch("/data/edges.json");
        const rawEdges: SupplyEdge[] = await edgesRes.json();

        const nodeMap = new Map<number, { lon: number; lat: number; isTier1: boolean }>();
        rawNodes.forEach((node) => {
          nodeMap.set(node.node_id, { lon: node.lon, lat: node.lat, isTier1: node.is_tier_1 });
        });

        // ====================== BALANCED SAMPLING ======================
        const airEdges: VisualEdge[] = [];
        const oceanEdges: VisualEdge[] = [];
        const truckEdges: VisualEdge[] = [];
        const seen = new Set<string>();

        rawEdges.forEach((edge) => {
          const sourceNode = nodeMap.get(edge.source);
          const targetNode = nodeMap.get(edge.target);
          if (!sourceNode || !targetNode) return;

          const key = `${edge.source}_${edge.target}_${edge.mode}`;
          if (seen.has(key)) return;
          seen.add(key);

          const visualEdge: VisualEdge = {
            ...edge,
            sourcePosition: [sourceNode.lon, sourceNode.lat],
            targetPosition: [targetNode.lon, targetNode.lat],
          };

          if (edge.mode === "Air") airEdges.push(visualEdge);
          else if (edge.mode === "Ocean") oceanEdges.push(visualEdge);
          else if (edge.mode === "Truck") truckEdges.push(visualEdge);
        });

        // Take up to 20 from EACH mode → you will finally see ships & trucks
        const balancedEdges = [
          ...airEdges.slice(0, 20),
          ...oceanEdges.slice(0, 20),
          ...truckEdges.slice(0, 20),
        ];

        setNodes(rawNodes);
        setEdges(balancedEdges);
        setIsLoading(false);
      } catch (error) {
        console.error("Failed to load graph data:", error);
        setIsLoading(false);
      }
    }

    loadGraphData();
  }, []);

  const layers = [
    // 1. Dark basemap (exact same as your original)
    new TileLayer({
      data: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getTileData: (tile: any) => {
        const { x, y, z } = tile.index;
        return `https://a.basemaps.cartocdn.com/dark_all/${z}/${x}/${y}.png`;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      renderSubLayers: (props: any) => {
        const { west, south, east, north } = props.tile.bbox;
        return new BitmapLayer(props, {
          data: undefined,
          image: props.data,
          bounds: [west, south, east, north],
        });
      },
    }),

    // 2. Routes – NOW PROPER MODE COLORS + thicker for international
    new ArcLayer({
      id: "arcs-layer",
      data: edges,
      getSourcePosition: (d: VisualEdge) => d.sourcePosition,
      getTargetPosition: (d: VisualEdge) => d.targetPosition,
      getSourceColor: (d: VisualEdge) => {
        if (d.mode === "Air") return [255, 80, 80, 220];      // red
        if (d.mode === "Ocean") return [50, 160, 255, 200];   // blue
        return [80, 255, 140, 180];                           // green = Truck
      },
      getTargetColor: (d: VisualEdge) => {
        if (d.mode === "Air") return [255, 80, 80, 220];
        if (d.mode === "Ocean") return [50, 160, 255, 200];
        return [80, 255, 140, 180];
      },
      getWidth: (d: VisualEdge) => (d.cross_border && d.cross_border > 0 ? 3.5 : 2),
      getHeight: (d: VisualEdge) => (d.mode === "Air" ? 0.7 : 0.2),
      pickable: true,
      autoHighlight: true,
      onHover: (info) => setHoverInfo(info as HoverData),
    }),

    // 3. Nodes
    new ScatterplotLayer({
      id: "nodes-layer",
      data: nodes,
      getPosition: (d: SupplyNode) => [d.lon, d.lat],
      getFillColor: (d: SupplyNode) =>
        d.is_tier_1 ? [255, 215, 0, 255] : [100, 180, 255, 220],
      getRadius: (d: SupplyNode) => (d.is_tier_1 ? 32000 : 11000),
      radiusMinPixels: 3,
      radiusMaxPixels: 12,
      pickable: true,
      autoHighlight: true,
      onHover: (info) => setHoverInfo(info as HoverData),
    }),
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950 text-white">
        <h1 className="text-2xl font-mono animate-pulse">
          🚀 Initializing Global Supply Chain Digital Twin...
        </h1>
      </div>
    );
  }

  return (
    <main className="relative w-full h-screen bg-gray-950 overflow-hidden">
      <div className="absolute top-0 left-0 z-10 p-6 pointer-events-none">
        <h1 className="text-4xl font-bold text-white drop-shadow-md">
          Supply Chain Digital Twin
        </h1>
        <p className="text-gray-400 mt-1 font-mono text-sm">
          Nodes: {nodes.length} | Balanced visual audit (20 per mode)
        </p>
      </div>

      <DeckGL initialViewState={INITIAL_VIEW_STATE} controller={true} layers={layers} />

      {/* Tooltip */}
      {hoverInfo && hoverInfo.object && (
        <div
          className="absolute z-50 p-4 font-mono text-sm text-white bg-gray-900 border border-gray-700 rounded-xl shadow-2xl pointer-events-none backdrop-blur-md bg-opacity-95 max-w-[280px]"
          style={{ left: hoverInfo.x + 18, top: hoverInfo.y + 18 }}
        >
          {/* same rich tooltip as before – omitted for brevity but identical to last version */}
          {hoverInfo.layer.id === "nodes-layer" ? (
            // node tooltip (same as previous)
            <>
              <div className="font-bold text-blue-400 mb-2 border-b border-gray-700 pb-1 flex items-center gap-2">
                📍 {hoverInfo.object.name || `Node ${hoverInfo.object.node_id}`}
              </div>
              {hoverInfo.object.country && <div className="text-xs text-gray-400 mb-1">🌍 {hoverInfo.object.country}</div>}
              <div className="flex justify-between">
                <span className="text-gray-400">Type:</span>
                <span>{hoverInfo.object.is_tier_1 ? "🌟 Tier-1 Mega Hub" : "🏢 Regional Facility"}</span>
              </div>
            </>
          ) : (
            // edge tooltip (same as previous)
            <>
              <div className="font-bold text-emerald-400 mb-2 border-b border-gray-700 pb-1 flex items-center gap-2">
                🛣️ Route
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-400">Transport:</span>
                  <span className="font-medium">{hoverInfo.object.mode}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Category:</span>
                  <span>{hoverInfo.object.category}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Transit time:</span>
                  <span className="font-medium">{hoverInfo.object.weight?.toFixed(1)} days</span>
                </div>
                {/* country info */}
                {hoverInfo.object.source_country && hoverInfo.object.target_country && (
                  <>
                    <div className="pt-2 border-t border-gray-700 mt-2">
                      <div className="flex justify-between"><span className="text-gray-400">From:</span><span>{hoverInfo.object.source_country}</span></div>
                      <div className="flex justify-between"><span className="text-gray-400">To:</span><span>{hoverInfo.object.target_country}</span></div>
                    </div>
                    {hoverInfo.object.cross_border && hoverInfo.object.cross_border > 0 && (
                      <div className="text-red-400 text-[10px] mt-1">🌍 International</div>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </main>
  );
}