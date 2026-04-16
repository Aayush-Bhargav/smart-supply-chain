import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

// Helper function to extract cities from route segments
const extractCitiesFromRoute = (routeSegments: any[]) => {
  const cities = [];
  if (routeSegments.length > 0) {
    cities.push(routeSegments[0].from); // Add first "from" city
    routeSegments.forEach(segment => {
      cities.push(segment.to); // Add each "to" city
    });
  }
  return Array.from(new Set(cities)); // Remove duplicates with Array.from for compatibility
};

export const saveShipment = async ({
  userId,
  source,
  target,
  category_name,
  quantity,
  delivery_type,
  priority_level,
  dispatch_date,
  transit_hubs,
  recommended_routes,
  selected_option,
  node_risks,
  
  ai_recommendation, // Add AI recommendation
}: any) => {
  try {
    console.log('🔍 Save Debug - recommended_routes:', recommended_routes);
    console.log('🔍 Save Debug - selected_option:', selected_option);
    
    // 🔹 Find selected route
    const selectedRouteData = recommended_routes?.find(
      (r: any) => r.option === selected_option
    );
    
    console.log('🔍 Save Debug - selectedRouteData:', selectedRouteData);
    
    // 🔹 Handle case where selected route is not found
    if (!selectedRouteData) {
      console.warn('⚠️ Selected route not found, using first route as fallback');
      // Use first route as fallback
      const firstRoute = recommended_routes?.[0];
      if (firstRoute) {
        const cities = extractCitiesFromRoute(firstRoute.route);
        
        // Create route with mode information for fallback case
        const trackingRoute = cities.map((city: string, index: number) => {
          const edge = firstRoute.route.find((e: any) => e.from === city);
          const cityData: any = {
            city,
            status: index === 0 ? "active" : "pending",
          };
          // Only add mode and days if they exist (Firebase doesn't accept undefined)
          if (edge?.mode) cityData.mode = edge.mode;
          if (edge?.days) cityData.days = edge.days;
          return cityData;
        });
        
        const docRef = await addDoc(collection(db, "user_shipments"), {
          userId,
          source,
          target,
          category_name,
          quantity,
          delivery_type,
          priority_level,
          dispatch_date,
          transit_hubs,
          recommended_routes,
          selected_route_option: firstRoute.option, // Use fallback option
          node_risks,
          
          ai_recommendation,
          selected_route: {
            option: firstRoute.option,
            route: trackingRoute,
            current_index: 0,
          },
          alerts: [],
          status: "in_transit",
          created_at: serverTimestamp(),
          updated_at: serverTimestamp(),
        });

        return docRef.id;
      } else {
        console.error('❌ No routes available to save');
        throw new Error('No routes available to save');
      }
    }
    
    // 🔹 Convert route → tracking format with mode information
    const cities = extractCitiesFromRoute(selectedRouteData.route);

    // Create route with mode information (mode represents transport to next city)
    const trackingRoute = cities.map((city: string, index: number) => {
      // Find the corresponding edge that starts from this city
      const edge = selectedRouteData.route.find((e: any) => e.from === city);
      
      const cityData: any = {
        city,
        status: index === 0 ? "active" : "pending",
      };
      // Only add mode and days if they exist (Firebase doesn't accept undefined)
      if (edge?.mode) cityData.mode = edge.mode;
      if (edge?.days) cityData.days = edge.days;
      return cityData;
    });

    const docRef = await addDoc(collection(db, "user_shipments"), {
      userId,

      // 📦 Shipment Info
      source,
      target,
      category_name,
      quantity,
      delivery_type,
      priority_level,
      dispatch_date,

      transit_hubs,

      // 🛣️ AI Output
      recommended_routes,
      ai_recommendation, // AI analysis from select_best_route
      selected_route_option: selected_option, // User's choice

      // ✅ Selected Route (for tracking)
      selected_route: {
        option: selected_option,
        route: trackingRoute,
        current_index: 0,
      },

      // 📊 Risk + Geo
      node_risks,
      // city_coordinates,

      // 🚨 Alerts (empty initially)
      alerts: [],

      // 📌 Status
      status: "in_transit",

      // ⏱️ Timestamps
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    });

    return docRef.id;
  } catch (error) {
    console.error("Error saving shipment:", error);
  }
};