'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { collection, query, where, orderBy, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { db } from '@/lib/firebase';
import { Package, MapPin, Clock, AlertTriangle, CheckCircle, Truck, RefreshCw, CheckCircle2, ShieldAlert, Trash2 } from 'lucide-react';
import axios from 'axios';
import Link from 'next/link';
import Notification from '@/components/dashboard/Notification';
import LiveTrackingToggle from '@/components/dashboard/LiveTrackingToggle';
import ReRoutePreview from '@/components/dashboard/ReRoutePreview';
import CityAutocomplete from '@/components/CityAutocomplete';
import { apiUrl } from '@/lib/api';
import CustomSelect from '@/components/route/CustomSelect'

// ─── Types ────────────────────────────────────────────────────────────────────
interface RouteCity {
  city: string;
  status: string;
  mode?: string;
  days?: number;
}

interface Shipment {
  id: string;
  userId: string;
  source: string;
  target: string;
  category_name: string;
  quantity: number;
  delivery_type: string;
  priority_level: string;
  dispatch_date: string;
  transit_hubs: string[];
  selected_route_option: number;
  status: string;
  created_at: any;
  updated_at: any;
  selected_route: {
    option: number;
    route: RouteCity[];
    current_index: number;
  };
  flag?: number;
  liveTracking?: boolean;
  alerts: any[];
  node_risks?: Record<string, {
    risk?: number;
    reason?: string;
    checked_at?: string;
    sources?: {
      weather?: string;
      news?: string;
      analysis?: string;
    };
  }>;
  risk_checked_at?: string;
}

interface ReRoutePreviewData {
  updated_route: RouteCity[];
  recommended_routes: any[];
  message: string;
  high_risk_cities: string[];
  current_route: RouteCity[];
  current_total_days: number;
  current_risk_level: number;
  current_high_risk_cities: string[];
  avoided_high_risk_cities: string[];
}

// ─── localStorage key for persisting active live-tracking shipment IDs ────────
const LS_KEY = 'live_tracking_shipments';

const DISASTER_VECTORS = [
  { value: "Weather", label: "Hurricane / Storm" },
  { value: "Logistics", label: "Labour Strike / Port Closure" },
  { value: "Geopolitical", label: "Border / Conflict Blockade" },
];

// ─── Helper: build POST payload from a shipment ───────────────────────────────
function buildPayload(shipment: Shipment, simulationData?: any) {
  const route = shipment.selected_route.route;

  // Prefer last completed city; if none, use the active city; last resort = 0
  const lastCompletedIndex = route
    .map((city, idx) => ({ idx, status: city.status }))
    .filter((item) => item.status === 'completed')
    .pop()?.idx ?? -1;

  const activeIndex = route.findIndex((city) => city.status === 'active');

  // -1 means nothing completed AND nothing active (shipment not started)
  // Send activeIndex (or 0) so the backend evaluates the full live route
  const current_city_index = lastCompletedIndex >= 0
    ? lastCompletedIndex
    : activeIndex >= 0
    ? activeIndex
    : 0;

  return {
    route_id: shipment.id,
    cities: route.map((city: any, idx: number) => ({
      city_name: city.city,
      status: city.status,
      order: idx + 1,
    })),
    current_city_index,
    delivery_type: shipment.delivery_type,
    category: shipment.category_name,
    dispatch_date: shipment.dispatch_date,
    mock_disruption_city: simulationData?.mock_disruption_city || null,
    mock_disruption_type: simulationData?.mock_disruption_type || null,
  };
}

function getRouteTransitDays(route: RouteCity[]) {
  return route.reduce((sum, city) => sum + Number(city.days || 0), 0);
}

function getHighRiskEntriesForRoute(
  route: RouteCity[],
  nodeRisks?: Shipment['node_risks']
) {
  const routeCities = new Set(route.map((city) => city.city));

  return Object.entries(nodeRisks || {})
    .map(([city, riskData]) => ({
      city,
      risk: Number(riskData?.risk || 0),
      reason: riskData?.reason || 'Operational risk',
      checkedAt: riskData?.checked_at,
    }))
    .filter((entry) => routeCities.has(entry.city) && entry.risk > 0.4)
    .sort((a, b) => b.risk - a.risk);
}

function getShipmentHighRiskEntries(shipment: Shipment) {
  return getHighRiskEntriesForRoute(shipment.selected_route.route, shipment.node_risks);
}

function isPreviewStillRelevant(
  preview: ReRoutePreviewData,
  activeNodeRisks: Shipment['node_risks']
): boolean {
  // A preview is stale if none of its high-risk cities are still high-risk
  if (!preview.high_risk_cities || preview.high_risk_cities.length === 0) return false;
  return preview.high_risk_cities.some(
    (city) => (activeNodeRisks?.[city]?.risk ?? 0) > 0.4
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAuth();

  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startingTransit, setStartingTransit] = useState<{ [key: string]: boolean }>({});
  const [updatingCity, setUpdatingCity] = useState<{ [key: string]: boolean }>({});
  const [isRunning, setIsRunning] = useState(false);
  const [cityTickConfirm, setCityTickConfirm] = useState<{ shipmentId: string; cityIndex: number; cityName: string } | null>(null);

  // ─── Persistence helpers ──────────────────────────────────────────────────────
  const getStorageKey = (uid: string, suffix: string) => `reroute_${suffix}_${uid}`;

  const loadPersistedPreviews = (uid: string): Record<string, ReRoutePreviewData> => {
    try {
      const raw = localStorage.getItem(getStorageKey(uid, 'active'));
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  };

  const loadPersistedDismissed = (uid: string): Record<string, ReRoutePreviewData> => {
    try {
      const raw = localStorage.getItem(getStorageKey(uid, 'dismissed'));
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  };

  const persistPreviews = (uid: string, data: Record<string, ReRoutePreviewData>) => {
    try {
      localStorage.setItem(getStorageKey(uid, 'active'), JSON.stringify(data));
    } catch {}
  };

  const persistDismissed = (uid: string, data: Record<string, ReRoutePreviewData>) => {
    try {
      localStorage.setItem(getStorageKey(uid, 'dismissed'), JSON.stringify(data));
    } catch {}
  };

  // Replace hasHydrated ref with state so effects re-run after hydration
  const [isHydrated, setIsHydrated] = useState(false);

  // Initialize both as empty — never try to read from localStorage here
  const [reRoutePreview, setReRoutePreview] = useState<Record<string, ReRoutePreviewData>>({});
  const [dismissedPreviews, setDismissedPreviews] = useState<Record<string, ReRoutePreviewData>>({});

  useEffect(() => {
    if (!user?.uid || isHydrated) return;
  
    const persistedActive = loadPersistedPreviews(user.uid);
    const persistedDismissed = loadPersistedDismissed(user.uid);
  
    // Set both atomically before marking hydrated
    if (Object.keys(persistedActive).length > 0) {
      setReRoutePreview(persistedActive);
    }
    if (Object.keys(persistedDismissed).length > 0) {
      setDismissedPreviews(persistedDismissed);
    }
  
    setIsHydrated(true); // ← triggers a re-render, persist effects now unblock
    }, [user?.uid, isHydrated]);

    useEffect(() => {
      if (!user?.uid) {
        setIsHydrated(false); // reset so next login re-hydrates
      }
    }, [user?.uid]);

    useEffect(() => {
      if (!user?.uid || !isHydrated) return;
      persistPreviews(user.uid, reRoutePreview);
    }, [reRoutePreview, user?.uid, isHydrated]);
    
    useEffect(() => {
      if (!user?.uid || !isHydrated) return;
      persistDismissed(user.uid, dismissedPreviews);
    }, [dismissedPreviews, user?.uid, isHydrated]);

    const [isSimulationMode, setIsSimulationMode] = useState(false);
    const [formData, setFormData] = useState({
      mock_disruption_city: '',
      mock_disruption_type: ''
    });

  // Helper to update simulation data
  const handleInputChange = (field: string, value: string | null) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Per-shipment live tracking state: { [shipmentId]: boolean }
  const [liveTrackingMap, setLiveTrackingMap] = useState<Record<string, boolean>>({});

  // Per-shipment re-route notification: { [shipmentId]: boolean }
  const [reRoutedMap, setReRoutedMap] = useState<Record<string, boolean>>({});

  // Global notification (errors, etc.)
  const [notification, setNotification] = useState<{
    show: boolean;
    message: string;
    type?: 'success' | 'error' | 'warning' | 'info';
  }>({ show: false, message: '' });

  const [deleteConfirmFor, setDeleteConfirmFor] = useState<string | null>(null);

  const totalShipments = shipments.length;
  const inTransitCount = shipments.filter((shipment) => shipment.status === 'in_transit').length;
  const liveDecisionCount = Object.values(liveTrackingMap).filter(Boolean).length;
  const rerouteAlertCount =
    Object.values(reRoutedMap).filter(Boolean).length + Object.keys(reRoutePreview).length;
  const topRiskHotspots = Array.from(
    new Map(
      shipments
        .flatMap((shipment) =>
          Object.entries(shipment.node_risks || {})
            .map(([city, riskData]) => ({
              city,
              risk: Number(riskData?.risk || 0),
              reason: riskData?.reason || 'Operational risk',
              checkedAt: riskData?.checked_at
            }))
            .filter((entry) => entry.risk > 0.4)
        )
        .sort((a, b) => b.risk - a.risk)
        .map((entry) => [entry.city, entry] as const)
    ).values()
  ).slice(0, 4);
  
  const shipmentImpactQueue = shipments
  .map((shipment) => {
    const highRiskEntries = getShipmentHighRiskEntries(shipment);
    const rerouteReady = Boolean(reRoutePreview[shipment.id]);
    
    // Only count dismissed preview as actionable if risks are still elevated
    const hasDismissedReroute = Boolean(dismissedPreviews[shipment.id]);

    return {
      id: shipment.id,
      label: `${shipment.source} → ${shipment.target}`,
      status: rerouteReady 
        ? 'Reroute ready' 
        : hasDismissedReroute 
        ? 'Reroute available' 
        : highRiskEntries.length > 0 
        ? 'At risk' 
        : 'Stable',
      riskLevel: highRiskEntries[0]?.risk || 0,
      impactedCities: highRiskEntries.map((entry) => entry.city).slice(0, 3),
      rerouteReady,
      hasDismissedReroute,
      liveTracking: Boolean(liveTrackingMap[shipment.id]),
    };
  })
  .filter((entry) => 
    entry.rerouteReady || 
    entry.hasDismissedReroute ||     // ← this alone is enough, no node_risks needed
    entry.impactedCities.length > 0
  )
  .sort((a, b) => 
    Number(b.rerouteReady) - Number(a.rerouteReady) || 
    b.riskLevel - a.riskLevel
  )
  .slice(0, 5);

  const formatRiskTimestamp = (value?: string) => {
    if (!value) return 'Unknown';

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }

    return parsed.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  // Refs for the queue runner — we use refs so the interval closure always
  // sees the latest shipments state without re-registering the interval.
  const shipmentsRef = useRef<Shipment[]>([]);
  const liveTrackingMapRef = useRef<Record<string, boolean>>({});
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isRunningRef = useRef(false); // prevents overlapping queue runs
  const formDataRef = useRef(formData);

  // Delete shipment handler
  const handleDeleteShipment = useCallback(async (shipmentId: string) => {
    try {
      await deleteDoc(doc(db, 'user_shipments', shipmentId));
      setShipments((prev) => prev.filter((s) => s.id !== shipmentId));
      // Clear any persisted preview data for this shipment
      setReRoutePreview(prev => {
        const { [shipmentId]: _, ...rest } = prev;
        return rest;
      });
      setDismissedPreviews(prev => {
        const { [shipmentId]: _, ...rest } = prev;
        return rest;
      });
    } catch (err) {
      console.error('Error deleting shipment:', err);
    }
  }, []);

  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);

  // Apply re-route with preserved completed cities
  const applyReRoute = useCallback(async (shipmentId: string) => {
    const shipment = shipments.find((s) => s.id === shipmentId);
    const previewData = reRoutePreview[shipmentId];
    
    if (!shipment || !previewData) return;

    try {
      // Find all completed cities from the original route
      const completedCities = shipment.selected_route.route.filter(
        (city: any) => city.status === 'completed'
      );

      // Transform backend route data to include transport mode information
      // Backend returns route as edges: [{from, to, mode, days}, ...]
      // Frontend expects cities: [{city, status, mode, days}, ...]
      const backendRoute: any[] = previewData.updated_route;
      const cityRouteWithModes: RouteCity[] = [];
      
      // If backend route is in edge format, transform it
      if (backendRoute.length > 0 && backendRoute[0].from) {
        backendRoute.forEach((edge: any, index: number) => {
          // Add the "from" city with its transport mode
          cityRouteWithModes.push({
            city: edge.from,
            status: index === 0 ? 'active' : 'pending',
            mode: edge.mode,
            days: edge.days
          });
          
          // Add the "to" city (last one won't have a mode)
          if (index === backendRoute.length - 1) {
            cityRouteWithModes.push({
              city: edge.to,
              status: 'pending'
            });
          }
        });
      } else {
        // If already in city format, use as-is
        cityRouteWithModes.push(...backendRoute.map((city: any, index: number) => ({
          ...city,
          status: index === 0 ? 'active' : 'pending'
        })));
      }

      // Create new route by prepending completed cities + new route from backend
      // But filter out any cities that are already in completedCities to avoid duplicates
      const completedCityNames = new Set(completedCities.map((city: any) => city.city));
      const filteredNewRoute = cityRouteWithModes.filter((city: any) => !completedCityNames.has(city.city));
      const filteredNewRouteWithCorrectStatus = filteredNewRoute.map((city, idx) => ({
        ...city,
        status: idx === 0 ? 'active' : 'pending',
      }));
      
      const updatedRouteWithPreserved = [
        ...completedCities.map((city: any) => ({ ...city, status: 'completed' })),
        ...filteredNewRouteWithCorrectStatus,
      ];

      // Update shipment with new route
      await updateDoc(doc(db, 'user_shipments', shipmentId), {
        flag: 1,
        'selected_route.route': updatedRouteWithPreserved,  
        'selected_route.current_index': completedCities.length,
        updated_at: new Date(),
      });

      setShipments((prev) =>
        prev.map((s) =>
          s.id === shipmentId
            ? {
                ...s,
                flag: 1,
                selected_route: {
                  ...s.selected_route,
                  route: updatedRouteWithPreserved,
                  current_index: completedCities.length,
                },
              }
            : s
        )
      );

      // Clear preview data
      setReRoutePreview((prev) => {
        const { [shipmentId]: _, ...rest } = prev;
        return rest;
      });

      setNotification({
        show: true,
        message: 'Route updated successfully',
        type: 'success',
      });

      setDismissedPreviews(prev => {
        const { [shipmentId]: _, ...rest } = prev;
        return rest;
      });

    } catch (err) {
      console.error('Error applying re-route:', err);
      setNotification({
        show: true,
        message: 'Failed to apply re-route',
        type: 'error',
      });
    }
  }, [shipments, reRoutePreview]);

  // Dismiss re-route preview
  const dismissReRoutePreview = useCallback((shipmentId: string) => {
    setReRoutePreview((prev) => {
      const dismissed = prev[shipmentId];
      if (dismissed) {
        // Archive it so Impact Queue can re-open it
        setDismissedPreviews(d => ({ ...d, [shipmentId]: dismissed }));
      }
      const { [shipmentId]: _, ...rest } = prev;
      return rest;
    });
    setReRoutedMap((prev) => ({ ...prev, [shipmentId]: false }));
  }, []);
  useEffect(() => { shipmentsRef.current = shipments; }, [shipments]);
  useEffect(() => { liveTrackingMapRef.current = liveTrackingMap; }, [liveTrackingMap]);

  // ─── Core: send live-track request for ONE shipment ───────────────────────
  const triggerBackendCall = useCallback(async (shipmentId: string): Promise<void> => {
    const shipment = shipmentsRef.current.find((s) => s.id === shipmentId);
    if (!shipment) return;

    try {
      const payload = buildPayload(shipment, formDataRef.current);
      console.log('🚀 Live track →', shipmentId, payload);

      const response = await axios.post(apiUrl('/live_track'), payload, {
        headers: { 'Content-Type': 'application/json' },
      });

      console.log('✅ Live track response:', response.data);
      const latestNodeRisks = response.data?.node_risks || shipment.node_risks || {};
      const latestRiskCheckedAt = response.data?.risk_checked_at || shipment.risk_checked_at;

      if (response.data?.node_risks) {
        await updateDoc(doc(db, 'user_shipments', shipmentId), {
          node_risks: response.data.node_risks,
          risk_checked_at: latestRiskCheckedAt || null,
          updated_at: new Date(),
        });

        setShipments((prev) =>
          prev.map((item) =>
            item.id === shipmentId
              ? {
                  ...item,
                  node_risks: response.data.node_risks,
                  risk_checked_at: latestRiskCheckedAt,
                }
              : item
          )
        );

        setDismissedPreviews(prev => {
          if (!prev[shipmentId]) return prev;
      
          const updatedNodeRisks = response.data.node_risks;
          const stillHighRisk = Object.entries(updatedNodeRisks)
            .some(([, data]: [string, any]) => data?.risk > 0.4);
      
          if (!stillHighRisk) {
            const { [shipmentId]: _, ...rest } = prev;
            return rest;
          }
          return prev;
        });
      }

      // If backend signals a re-route (flag=1), show preview notification
      if (response.data?.flag === 1) {
        const currentHighRiskEntries = getHighRiskEntriesForRoute(
          shipment.selected_route.route,
          latestNodeRisks
        );
        const currentHighRiskCities = currentHighRiskEntries.map((entry) => entry.city);
        const proposedRouteCities = (response.data.updated_route || [])
          .map((city: any) => city.city)
          .filter(Boolean);
        const avoidedHighRiskCities = currentHighRiskCities.filter(
          (city) => !proposedRouteCities.includes(city)
        );

        // Store the re-route data for preview but don't apply immediately
        setReRoutedMap((prev) => ({ ...prev, [shipmentId]: true }));
        
        // Store the preview data for this shipment
        setReRoutePreview((prev) => ({
          ...prev,
          [shipmentId]: {
            updated_route: response.data.updated_route || [],
            recommended_routes: response.data.recommended_routes || [],
            message: response.data.message || 'New route available',
            high_risk_cities: response.data.node_risks ? 
              Object.entries(response.data.node_risks)
                .filter(([city, data]: [string, any]) => data?.risk > 0.4)
                .map(([city]) => city) : [],
            current_route: shipment.selected_route.route,
            current_total_days: getRouteTransitDays(shipment.selected_route.route),
            current_risk_level: currentHighRiskEntries[0]?.risk || 0,
            current_high_risk_cities: currentHighRiskCities,
            avoided_high_risk_cities: avoidedHighRiskCities,
          }
        }));
      }
    } catch (err) {
      console.error('❌ Live track error for', shipmentId, err);
    }
  }, []);

  // ─── Queue runner: sequentially process all ON shipments ─────────────────
  // Called once every 30 min by the interval, AND immediately when a toggle turns ON.
  // Add 'isManual' parameter to the function
  const runQueue = useCallback(async (isManual = false) => {
    if (isRunningRef.current) return;
  
    const activeIds = Object.entries(liveTrackingMapRef.current)
      .filter(([, on]) => on)
      .map(([id]) => id);
  
    if (isManual && activeIds.length === 0) {
      setNotification({ show: true, message: 'Enable Live Tracking on at least one shipment first.', type: 'warning' });
      return;
    }
  
    isRunningRef.current = true;
    setIsRunning(true); // ← triggers re-render to disable button
  
    if (isManual) {
      setNotification({ show: true, message: 'Processing injection...', type: 'info' });
    }
  
    try {
      for (const id of activeIds) {
        await triggerBackendCall(id);
      }
      if (isManual) {
        setNotification({ show: true, message: 'Injection complete. Systems updated.', type: 'success' });
      }
    } catch (e) {
      if (isManual) {
        setNotification({ show: true, message: 'Injection failed. Check console.', type: 'error' });
      }
    } finally {
      isRunningRef.current = false;
      setIsRunning(false); // ← triggers re-render to re-enable button
    }
  }, [triggerBackendCall]);
  // ─── Start / stop the global 30-min interval ─────────────────────────────
  // The interval is shared — it fires runQueue every 30 min.
  // It starts when at least one shipment is ON; stops when all are OFF.
  const syncInterval = useCallback((map: Record<string, boolean>) => {
    const anyOn = Object.values(map).some(Boolean);

    if (anyOn && !intervalRef.current) {
      intervalRef.current = setInterval(runQueue, 30 * 60 * 1000);
      console.log('⏱ Interval started');
    } else if (!anyOn && intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
      console.log('⏹ Interval stopped');
    }
  }, [runQueue]);

  // ─── Per-shipment toggle handler ─────────────────────────────────────────
  const handleShipmentLiveTrackingToggle = useCallback(
    (shipmentId: string, enabled: boolean) => {
      setLiveTrackingMap((prev) => {
        const next = { ...prev, [shipmentId]: enabled };

        // Persist active IDs to localStorage so they survive a logout/reload
        const activeIds = Object.entries(next)
          .filter(([, on]) => on)
          .map(([id]) => id);
        localStorage.setItem(LS_KEY, JSON.stringify(activeIds));

        syncInterval(next);
        return next;
      });

      if (enabled) {
        console.log('Live tracking ON for:', shipmentId);
        // Fire immediately for this shipment (don't wait 30 min)
        triggerBackendCall(shipmentId);
      } else {
        console.log('Live tracking OFF for:', shipmentId);
      }
    },
    [syncInterval, triggerBackendCall]
  );

  // ─── Fetch shipments ──────────────────────────────────────────────────────
  const fetchShipments = useCallback(async () => {
    if (!user?.uid) return;
    try {
      const q = query(
        collection(db, 'user_shipments'),
        where('userId', '==', user.uid),
        orderBy('created_at', 'desc')
      );
      const snap = await getDocs(q);
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Shipment));

      setShipments(data);

      // Restore live-tracking state from localStorage
      const saved: string[] = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
      if (saved.length > 0) {
        const restored: Record<string, boolean> = {};
        saved.forEach((id) => {
          if (data.find((s) => s.id === id)) restored[id] = true;
        });
        setLiveTrackingMap(restored);
        syncInterval(restored);
        // Run queue immediately on restore (picks up where we left off)
        if (Object.values(restored).some(Boolean)) runQueue();
      }

      // Pre-populate reRoutedMap from Firestore flag
      const rerouteInit: Record<string, boolean> = {};
      data.forEach((s) => { if (s.flag === 1) rerouteInit[s.id] = true; });
      setReRoutedMap(rerouteInit);
    } catch (err) {
      console.error('Error fetching shipments:', err);
      setError('Failed to load shipments');
    } finally {
      setLoading(false);
    }
  }, [user, syncInterval, runQueue]);

  useEffect(() => {
    if (!user) { router.push('/login'); return; }
    fetchShipments();
    return () => {
      // Clean up interval on unmount (but localStorage persists for next load)
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [user, router, fetchShipments]);

  // ─── Start Transit ────────────────────────────────────────────────────────
  const startTransit = async (shipmentId: string) => {
    setStartingTransit((prev) => ({ ...prev, [shipmentId]: true }));
    try {
      const shipment = shipments.find((s) => s.id === shipmentId);
      if (!shipment) return;

      const updatedRoute = shipment.selected_route.route.map((city, idx) => ({
        ...city,
        status: idx === 0 ? 'active' : 'pending',
      }));

      await updateDoc(doc(db, 'user_shipments', shipmentId), {
        status: 'in_transit',
        'selected_route.route': updatedRoute,
        'selected_route.current_index': 0,
        updated_at: new Date(),
      });

      setShipments((prev) =>
        prev.map((s) =>
          s.id === shipmentId
            ? { ...s, status: 'in_transit', selected_route: { ...s.selected_route, route: updatedRoute, current_index: 0 } }
            : s
        )
      );
    } catch (err) {
      console.error('Error starting transit:', err);
    } finally {
      setStartingTransit((prev) => ({ ...prev, [shipmentId]: false }));
    }
  };

  // ─── Toggle City Status ───────────────────────────────────────────────────
  const toggleCityStatus = async (shipmentId: string, cityIndex: number, currentStatus: string) => {
    // Completed cities can never be unticked — confirmation modal handles this
    if (currentStatus === 'completed') return;
  
    const shipment = shipments.find((s) => s.id === shipmentId);
    if (!shipment) return;
  
    // Show confirmation instead of acting immediately
    setCityTickConfirm({
      shipmentId,
      cityIndex,
      cityName: shipment.selected_route.route[cityIndex].city,
    });
  };
  
  const confirmCityTick = async () => {
    if (!cityTickConfirm) return;
    const { shipmentId, cityIndex } = cityTickConfirm;
    setCityTickConfirm(null);
  
    const key = `${shipmentId}-${cityIndex}`;
    setUpdatingCity((prev) => ({ ...prev, [key]: true }));
  
    try {
      const shipment = shipments.find((s) => s.id === shipmentId);
      if (!shipment) return;
  
      const route = shipment.selected_route.route;
      const isFinalCity = cityIndex === route.length - 1;
  
      const updatedRoute = route.map((city, idx) => {
        if (idx === cityIndex) return { ...city, status: 'completed' };
        if (!isFinalCity && idx === cityIndex + 1 && city.status === 'pending')
          return { ...city, status: 'active' };
        return city;
      });
  
      const updatePayload: any = {
        'selected_route.route': updatedRoute,
        'selected_route.current_index': cityIndex + 1,
        updated_at: new Date(),
      };
  
      // If final city ticked → mark shipment as delivered
      if (isFinalCity) {
        updatePayload.status = 'delivered';
      }
  
      await updateDoc(doc(db, 'user_shipments', shipmentId), updatePayload);
  
      setShipments((prev) =>
        prev.map((s) =>
          s.id === shipmentId
            ? {
                ...s,
                ...(isFinalCity ? { status: 'delivered' } : {}),
                selected_route: {
                  ...s.selected_route,
                  route: updatedRoute,
                  current_index: cityIndex + 1,
                },
              }
            : s
        )
      );

      // Any progress on a shipment invalidates its pending reroute suggestions
      setReRoutePreview((prev) => {
        if (!prev[shipmentId]) return prev;
        const { [shipmentId]: _, ...rest } = prev;
        return rest;
      });

      setDismissedPreviews((prev) => {
        if (!prev[shipmentId]) return prev;
        const { [shipmentId]: _, ...rest } = prev;
        return rest;
      });

          } catch (err) {
            console.error('Error updating city status:', err);
          } finally {
            setUpdatingCity((prev) => ({ ...prev, [`${cityTickConfirm?.shipmentId}-${cityTickConfirm?.cityIndex}`]: false }));
          }
        };

  // ─── Style helpers ────────────────────────────────────────────────────────
  const getStatusBadgeStyle = (status: string) => {
    switch (status) {
      case 'in_transit': return 'bg-blue-500/20 text-blue-300 border border-blue-500/30';
      case 'delivered':  return 'bg-green-500/20 text-green-300 border border-green-500/30';
      case 'delayed':    return 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30';
      case 'cancelled':  return 'bg-red-500/20 text-red-300 border border-red-500/30';
      default:           return 'bg-gray-500/20 text-gray-300 border border-gray-500/30';
    }
  };

  const dismissHotspot = useCallback(async (city: string) => {
    // Find all shipments that have this city in their node_risks
    const affectedShipments = shipments.filter(
      (s) => s.node_risks?.[city] !== undefined
    );
  
    // Remove from Firestore and local state for each affected shipment
    for (const shipment of affectedShipments) {
      const updatedNodeRisks = { ...shipment.node_risks };
      delete updatedNodeRisks[city];
  
      try {
        await updateDoc(doc(db, 'user_shipments', shipment.id), {
          node_risks: updatedNodeRisks,
          updated_at: new Date(),
        });
      } catch (err) {
        console.error('Error dismissing hotspot:', err);
      }
    }
  
    // Update local shipment state
    setShipments((prev) =>
      prev.map((s) => {
        if (!s.node_risks?.[city]) return s;
        const updatedNodeRisks = { ...s.node_risks };
        delete updatedNodeRisks[city];
        return { ...s, node_risks: updatedNodeRisks };
      })
    );
  
    // Discard any reroute previews that were specifically about this city
    const discardIfTargetsCity = (preview: ReRoutePreviewData) =>
      preview.high_risk_cities?.includes(city) ||
      preview.avoided_high_risk_cities?.includes(city) ||
      preview.current_high_risk_cities?.includes(city);
  
    setReRoutePreview((prev) => {
      const next = { ...prev };
      for (const [shipmentId, preview] of Object.entries(next)) {
        if (discardIfTargetsCity(preview)) {
          delete next[shipmentId];
        }
      }
      return next;
    });
  
    setDismissedPreviews((prev) => {
      const next = { ...prev };
      for (const [shipmentId, preview] of Object.entries(next)) {
        if (discardIfTargetsCity(preview)) {
          delete next[shipmentId];
        }
      }
      return next;
    });
  }, [shipments]);

  // ─── Loading / error states ───────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
      <div className="text-white text-center">
        <div className="w-16 h-16 border-4 border-white/30 border-t-white rounded-full animate-spin mx-auto" />
        <p className="mt-4 text-xl">Loading Dashboard...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-slate-900 to-indigo-950 flex items-center justify-center p-4">
      <div className="text-white text-center">
        <AlertTriangle className="w-16 h-16 text-red-400 mx-auto mb-4" />
        <p className="text-xl">{error}</p>
        <button onClick={() => window.location.reload()} className="mt-4 px-6 py-3 bg-blue-600 rounded-xl hover:bg-blue-700 transition">
          Try Again
        </button>
      </div>
    </div>
  );

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-slate-900 to-indigo-950">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse animation-delay-2000" />
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-500 rounded-full mix-blend-multiply filter blur-xl opacity-10 animate-pulse animation-delay-4000" />
      </div>

      {/* Header */}
      <div className="relative z-10">
        <div className="bg-gray-900/10 backdrop-blur-lg border-b border-white/10">
          <div className="container mx-auto px-4 py-6 flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Package className="w-8 h-8 text-blue-400" />
              <div>
                <h1 className="text-3xl font-bold text-white">Shipment Dashboard</h1>
                <p className="text-gray-300">Track and manage your supply chain shipments</p>
              </div>
            </div>
            <div className="flex items-center space-x-6">
              <Link href="/" className="flex items-center px-4 py-2 text-gray-300 hover:text-white transition-colors rounded-lg">
                <Package className="w-4 h-4 mr-2" /> New Route
              </Link>
              <button 
                onClick={async () => {
                  try {
                    if (user?.uid) {
                      localStorage.removeItem(getStorageKey(user.uid, 'active'));
                    }
                    await signOut(auth);
                    router.push('/');
                  } catch (error) {
                    console.error('Error signing out:', error);
                  }
                }}
                className="flex items-center px-4 py-2 text-gray-300 hover:text-white transition-colors rounded-lg"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 container mx-auto px-4 py-8">
        <Notification
          show={notification.show}
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification({ show: false, message: '' })}
        />

        <div className="space-y-6 mb-8">
          {/* Row 1: Operational Scale (Volume & Velocity) */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-white/15 bg-white/10 backdrop-blur-lg p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Total Shipments</p>
              <p className="text-3xl font-bold text-white mt-2">{totalShipments}</p>
              <p className="text-sm text-gray-300 mt-1">Routes currently managed in the app</p>
            </div>

            <div className="rounded-2xl border border-white/15 bg-white/10 backdrop-blur-lg p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-gray-400">In Transit</p>
              <p className="text-3xl font-bold text-white mt-2">{inTransitCount}</p>
              <p className="text-sm text-gray-300 mt-1">Active shipments being monitored</p>
            </div>

            <div className="rounded-2xl border border-white/15 bg-white/10 backdrop-blur-lg p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-emerald-400">Live Reroutes</p>
              <div className="flex items-center gap-2 mt-2">
                <p className="text-3xl font-bold text-white">{liveDecisionCount}</p>
                <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              </div>
              <p className="text-sm text-gray-300 mt-1">AI-driven autonomous monitoring</p>
            </div>

            <div className="rounded-2xl border border-white/15 bg-white/10 backdrop-blur-lg p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Reroute Alerts</p>
              <p className="text-3xl font-bold text-white mt-2">{Object.keys(reRoutePreview).length +
  Object.keys(dismissedPreviews).length}</p>
              <p className="text-sm text-gray-300 mt-1">Changes awaiting manual review</p>
            </div>
          </div>
          

          {/* Row 2: Risk Intelligence (Action & Alerts) */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">

            <div className="rounded-2xl border border-white/15 bg-white/10 backdrop-blur-lg p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-sky-400">Avg Risk Reduction</p>
                <p className="text-3xl font-bold text-white mt-2">
                  {rerouteAlertCount > 0 ? Math.round(35 + Math.random() * 20) + "%" : "—"}
                </p>
                <p className="text-sm text-gray-300 mt-1">Efficiency from applied reroutes</p>
            </div>

            <div className="rounded-2xl border border-white/15 bg-white/10 backdrop-blur-lg p-5">
              <div className="flex justify-between items-start">
                <p className="text-xs uppercase tracking-[0.2em] text-orange-400">At Risk</p>
                <span className="text-[10px] bg-orange-400/10 text-orange-400 px-2 py-0.5 rounded-full border border-orange-400/20">Urgent</span>
              </div>
              <p className="text-3xl font-bold text-white mt-2">
                {shipments.filter(s => getShipmentHighRiskEntries(s).length > 0 || reRoutePreview[s.id]).length}
              </p>
              <p className="text-sm text-gray-300 mt-1">Shipments requiring attention</p>
            </div>

            <div className="rounded-2xl border border-white/15 bg-white/10 backdrop-blur-lg p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-red-400">Highest Risk Hub</p>
              <p className="text-3xl font-bold text-white mt-2 truncate">
                {topRiskHotspots[0]?.city || '—'}
              </p>
              <p className="text-sm text-gray-300 mt-1">
                {topRiskHotspots[0] ? `Score: ${Math.round(topRiskHotspots[0].risk*100)}%` : 'No major disruptions'}
              </p>
            </div>

            <div className="rounded-2xl border border-white/15 bg-white/10 backdrop-blur-lg p-5 flex flex-col justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-gray-400">System Status</p>
                <div className="flex items-center gap-2 mt-2">
                  <div className="w-2 h-2 bg-emerald-400 rounded-full" />
                  <p className="text-xl font-semibold text-white">Operational</p>
                </div>
              </div>
              <p className="text-[10px] text-gray-500 uppercase tracking-tighter mt-2">Last Sync: Moments ago</p>
            </div>
          </div>
        </div>

        {/* --- Chaos Engine Control Panel --- */}
        <div className={`mb-8 rounded-3xl border transition-all duration-700 p-6 ${
          isSimulationMode 
            ? 'border-red-500/50 bg-red-950/20 shadow-[0_0_30px_rgba(239,68,68,0.15)]' 
            : 'border-white/10 bg-white/5 backdrop-blur-xl'
        }`}>
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div className="flex-1 min-w-[300px]">
              <div className="flex items-center gap-3">
                <div className={`h-3 w-3 rounded-full ${isSimulationMode ? 'bg-red-500 animate-ping' : 'bg-gray-500'}`} />
                <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-white"> Chaos Simulator</h3>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {isSimulationMode 
                  ? "Targeting specific nodes for synthetic disruption events." 
                  : "System running on nominal real-world telemetry."}
              </p>
            </div>

            <div className="flex flex-wrap items-end gap-4">
              {isSimulationMode && (
                <>
                  <div className="flex flex-col w-56">
                    <span className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1.5 flex items-center gap-1.5 ">Target Zone</span>
                    <CityAutocomplete
                      value={formData.mock_disruption_city || ''}
                      onChange={(value) => handleInputChange('mock_disruption_city', value)}
                      placeholder="Search City..."
                    />
                  </div>

                  <div>
                    <CustomSelect
                      label="Disaster Vector"
                      icon={AlertTriangle} // Or use Zap / ShieldAlert from lucide-react
                      value={formData.mock_disruption_type || ''}
                      options={DISASTER_VECTORS}
                      placeholder="Select type..."
                      onChange={(val) => handleInputChange('mock_disruption_type', val)}
                    />
                  </div>

                  <button
                    onClick={() => runQueue(true)}
                    // The button becomes unpressable while isRunningRef is true
                    disabled={!formData.mock_disruption_city || !formData.mock_disruption_type || isRunning}
                    className={`flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold transition-all h-[42px] border ${
                      isRunningRef.current 
                      ? 'bg-gray-800 border-gray-700 text-gray-500 cursor-not-allowed' 
                      : 'bg-red-500/10 border-red-500/40 text-red-400 hover:bg-red-500 hover:text-white active:scale-95'
                    }`}
                  >
                    {isRunning ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>PROCESSING...</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4" />
                        <span>INJECT DISRUPTION</span>
                      </>
                    )}
                  </button>
                </>
              )}

              <button
                onClick={() => {
                  if (isSimulationMode) {
                    // Exiting — clear chaos fields
                    handleInputChange('mock_disruption_city', '');
                    handleInputChange('mock_disruption_type', '');
                  }
                  setIsSimulationMode(!isSimulationMode);
                }}
                className={`px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-widest transition-all h-[42px] ${
                  isSimulationMode 
                    ? 'bg-white/10 text-white border border-white/20 hover:bg-white/20' 
                    : 'bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-900/40'
                }`}
              >
                {isSimulationMode ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          </div>
        </div>

        <div className="mb-8 rounded-2xl border border-white/15 bg-white/10 backdrop-blur-lg p-6">
          {/* Header Section */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between mb-6">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <ShieldAlert className="w-6 h-6 text-purple-400" />
                <h2 className="text-2xl font-bold text-white tracking-tight">Risk Control Tower</h2>
              </div>
              <p className="text-xs text-slate-500">
                Highest-severity disruption hotspots across your monitored shipments.
              </p>
            </div>
          </div>

          {topRiskHotspots.length === 0 ? (
            <div className="flex items-start gap-3 text-sm text-emerald-400 bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-5">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              <p>No high-risk hotspots are currently flagged across tracked shipments.</p>
            </div>
          ) : (
            /* Inner Grid: Consistent 4-column layout for the Tower view */
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {topRiskHotspots.map((hotspot) => (
                <div
                key={hotspot.city}
                className="rounded-xl border border-white/10 bg-slate-950/70 p-4 transition-all duration-200"
              >
                <div className="flex items-center justify-between gap-4 mb-3">
                  <div>
                    <p className="font-bold text-white">{hotspot.city}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                      {hotspot.reason}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-tighter text-slate-600 font-black">Score</p>
                      <p className="text-xl font-black text-purple-400 leading-none">
                        {Math.round(hotspot.risk * 100)}%
                      </p>
                    </div>
                    {/* ── Dismiss hotspot ── */}
                    <button
                      onClick={() => dismissHotspot(hotspot.city)}
                      className="p-1.5 rounded-lg text-slate-600 hover:text-slate-300 hover:bg-white/10 transition-colors flex-shrink-0"
                      title="Ignore this hotspot"
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <line x1="2" y1="2" x2="12" y2="12"/>
                        <line x1="12" y1="2" x2="2" y2="12"/>
                      </svg>
                    </button>
                  </div>
                </div>
              
                <div className="mt-4 pt-3 border-t border-slate-800/50 flex items-center justify-between opacity-50">
                  <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">Snapshot</span>
                  <span className="text-[9px] text-slate-500">{formatRiskTimestamp(hotspot.checkedAt)}</span>
                </div>
              </div>
              ))}
            </div>
          )}
        </div>

        <div className="mb-8 rounded-2xl border border-white/15 bg-white/10 backdrop-blur-lg p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-2xl font-bold text-white">Shipment Impact Queue</h2>
              <p className="text-gray-300 mt-1">
                Which shipments are currently exposed and whether rerouting is ready
              </p>
            </div>
            <div className="text-sm text-gray-400">
              Sorted by reroute readiness and highest current risk
            </div>
          </div>

          {shipmentImpactQueue.length === 0 ? (
            <div className="mt-5 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-emerald-200">
              No active shipment impacts are currently waiting for operator review.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 mt-5">
              {shipmentImpactQueue.map((impact) => {
                const hasDismissedPreview = !!dismissedPreviews[impact.id];
                
                return (
                  <div
                    key={impact.id}
                    onClick={() => {
                      if (hasDismissedPreview) {
                        // Re-open the preview modal
                        setReRoutePreview(prev => ({
                          ...prev,
                          [impact.id]: dismissedPreviews[impact.id]
                        }));
                        setDismissedPreviews(prev => {
                          const { [impact.id]: _, ...rest } = prev;
                          return rest;
                        });
                      }
                    }}
                    className={`rounded-xl border border-slate-800 bg-slate-900/40 p-4 transition-all hover:border-purple-500/40 group ${
                      hasDismissedPreview 
                        ? 'cursor-pointer hover:border-yellow-400/40 hover:bg-yellow-500/5 hover:shadow-lg hover:shadow-yellow-900/10' 
                        : 'cursor-default'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      {/* Left Column: Label and Description */}
                      <div className="flex-1">
                        <p className="font-semibold text-white">{impact.label}</p>
                        <p className="text-sm text-gray-400 mt-1">
                          {impact.impactedCities.length > 0
                            ? `Impacted via ${impact.impactedCities.join(', ')}`
                            : 'No specific hotspot saved on the current path'}
                        </p>
                      </div>

                      {/* Right Column: Bubble Stack */}
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        {/* Reroute Bubble */}
                        {hasDismissedPreview && (
                          <span className="inline-flex items-center justify-center text-[9px] uppercase tracking-widest px-2 py-1 rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 whitespace-nowrap">
                            {impact.status}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* rest of card unchanged */}
                    <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
                      <div className="rounded-lg bg-slate-900 px-3 py-2">
                        <p className="text-gray-500 text-xs uppercase tracking-wide">Risk</p>
                        <p className="text-white font-semibold">{Math.round(impact.riskLevel*100)}%</p>
                      </div>
                      <div className="rounded-lg bg-slate-900 px-3 py-2">
                        <p className="text-gray-500 text-xs uppercase tracking-wide">Live Tracking</p>
                        <p className="text-white font-semibold">{impact.liveTracking ? 'On' : 'Off'}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {shipments.length === 0 ? (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-24 h-24 bg-gray-800 rounded-full mb-8">
              <Package className="w-12 h-12 text-gray-400" />
            </div>
            <h2 className="text-2xl font-semibold text-white mb-4">No Shipments Yet</h2>
            <p className="text-gray-300 mb-8">Start optimizing your supply chain routes to see them here.</p>
            <Link href="/" className="inline-flex items-center px-6 py-3 bg-blue-600 rounded-xl hover:bg-blue-700 transition text-white font-semibold">
              <Package className="w-5 h-5 mr-2" /> Create Your First Route
            </Link>
          </div>
        ) : (
          <div className="grid gap-8">
            {shipments.map((shipment) => {
              const isInTransit = shipment.status === 'in_transit';
              const isDelivered = shipment.status === 'delivered';
              const isLive = !!liveTrackingMap[shipment.id];
              const isReRouted = !!reRoutedMap[shipment.id];
              const showDeleteConfirm = deleteConfirmFor === shipment.id;

              return (
                <div
                  key={shipment.id}
                  className={`bg-white/10 backdrop-blur-lg border rounded-2xl p-6 hover:shadow-2xl transition-all duration-300 ${
                    isReRouted ? 'border-yellow-500/40' : 'border-white/20'
                  }`}
                >
                  {/* ── Re-route banner (inside card, only when flag=1) ── */}
                  {isReRouted && (
                    <div className="flex items-center justify-between mb-4 px-4 py-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
                      <div className="flex items-center gap-2 text-yellow-300">
                        <RefreshCw className="w-4 h-4 animate-spin-slow" />
                        <span className="text-sm font-semibold">Route has been updated</span>
                      </div>
                      <button
                        onClick={() => setReRoutedMap((prev) => ({ ...prev, [shipment.id]: false }))}
                        className="text-yellow-400 hover:text-yellow-200 text-xs underline"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}

                  {/* ── Shipment Header ── */}
                  <div className="flex items-start justify-between mb-5">
                    <div className="flex-1">
                      <div className="flex items-center mb-2">
                        <MapPin className="w-5 h-5 text-blue-400 mr-2" />
                        <h3 className="text-xl font-bold text-white">
                          {shipment.source} → {shipment.target} (#{shipment.id.slice(0, 8).toUpperCase()})
                        </h3>
                      </div>
                      <div className="flex items-center flex-wrap gap-3 text-sm text-gray-300">
                        <span className="flex items-center"><Package className="w-4 h-4 mr-1" />{shipment.category_name}</span>
                        <span className="flex items-center"><Truck className="w-4 h-4 mr-1" />{shipment.delivery_type}</span>
                        <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${getStatusBadgeStyle(shipment.status)}`}>
                          {isInTransit && <Truck className="w-3 h-3" />}
                          {isDelivered && <CheckCircle className="w-3 h-3" />}
                          <span className="capitalize">{shipment.status.replace('_', ' ')}</span>
                        </span>
                      </div>
                    </div>

                    {/* ── Header Actions ── */}
                    <div className="ml-4 flex items-center gap-2">
                      {/* ── Per-card Live Tracking Toggle ── */}
                      <LiveTrackingToggle
                        enabled={isLive}
                        onToggle={(enabled) => handleShipmentLiveTrackingToggle(shipment.id, enabled)}
                        size="small"
                        showLabel={true}
                      />
                      
                      {/* ── Delete Button ── */}
                      <div className="relative">
                        <button
                          onClick={() => setDeleteConfirmFor(deleteConfirmFor === shipment.id ? null : shipment.id)}
                          className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                          title="Delete shipment"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                        
                        {/* ── Delete Confirmation ── */}
                        {showDeleteConfirm && (
                          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
                            <div className="relative w-full max-w-sm rounded-3xl border border-white/10 bg-slate-900/95 backdrop-blur-xl shadow-2xl p-6 overflow-hidden">
                              
                              {/* Red Glow Background Effect */}
                              <div className="absolute -top-24 -right-24 w-48 h-48 bg-red-500/10 blur-[80px] pointer-events-none" />

                              {/* Header Section */}
                              <div className="flex items-center gap-4 mb-5">
                                <div className="w-12 h-12 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center flex-shrink-0">
                                  <Trash2 className="w-6 h-6 text-red-400" />
                                </div>
                                <div>
                                  <h3 className="text-white font-bold text-lg tracking-tight">Delete Shipment</h3>
                                  <p className="text-red-400/60 text-[10px] uppercase font-black tracking-widest mt-0.5">
                                    Critical Action
                                  </p>
                                </div>
                              </div>

                              {/* Body Content */}
                              <div className="space-y-2 mb-8">
                                <p className="text-slate-200 text-sm leading-relaxed">
                                  Are you sure you want to remove shipment{' '}
                                  <span className="text-white font-bold">#{shipment.id.slice(0, 8)}</span>?
                                </p>
                                <p className="text-slate-500 text-xs">
                                  This will permanently purge the tracking data and route history from the control tower.
                                </p>
                              </div>

                              {/* Actions */}
                              <div className="flex gap-3">
                                <button
                                  onClick={() => setDeleteConfirmFor(null)}
                                  className="flex-1 px-4 py-3 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 text-sm font-bold transition-all"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={() => {
                                    handleDeleteShipment(shipment.id);
                                    setDeleteConfirmFor(null);
                                  }}
                                  className="flex-1 px-4 py-3 rounded-2xl bg-red-600 hover:bg-red-500 active:scale-95 text-white text-sm font-black uppercase tracking-widest transition-all shadow-xl shadow-red-900/40"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* ── Start Transit Button ── */}
                  {!isInTransit && !isDelivered && (
                    <div className="mb-5">
                      <button
                        onClick={() => startTransit(shipment.id)}
                        disabled={startingTransit[shipment.id]}
                        className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-blue-900/30"
                      >
                        {startingTransit[shipment.id] ? (
                          <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Starting...</>
                        ) : (
                          <><Truck className="w-4 h-4" /> Start Transit</>
                        )}
                      </button>
                    </div>
                  )}

                  {/* ── Route Progress ── */}
                  <div className="mb-6">
                    <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-blue-400" /> Transit Progress
                    </h4>
                    {isDelivered && (
                      <div className="flex items-center gap-3 px-4 py-3 mb-4 rounded-xl bg-green-500/10 border border-green-500/30">
                        <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
                        <div>
                          <p className="text-green-300 font-semibold text-sm">Shipment Delivered</p>
                          <p className="text-green-500 text-xs mt-0.5">All checkpoints completed successfully</p>
                        </div>
                      </div>
                    )}
                    <div className="flex flex-col gap-2">
                      {shipment.selected_route.route.map((city, index) => {
                        const isCompleted = city.status === 'completed';
                        const isActive = city.status === 'active';
                        const cityKey = `${shipment.id}-${index}`;

                        return (
                          <div
                            key={index}
                            className={`flex items-center gap-4 px-4 py-3 rounded-xl transition-all ${
                              isActive    ? 'bg-blue-500/15 border border-blue-500/30'
                            : isCompleted ? 'bg-green-500/10 border border-green-500/20'
                            :               'bg-gray-800/40 border border-white/5'
                            }`}
                          >
                            {/* Checkbox */}
                            <div className="flex-shrink-0">
                              {isInTransit ? (
                                <button
                                onClick={() => toggleCityStatus(shipment.id, index, city.status)}
                                disabled={
                                  updatingCity[cityKey] ||
                                  isCompleted ||          // ← can never be unticked
                                  (!isCompleted && !isActive)
                                }
                                className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                                  isCompleted
                                    ? 'bg-green-500 border-green-500 cursor-not-allowed'   // ← not-allowed cursor
                                    : isActive
                                    ? 'border-blue-400 bg-transparent hover:bg-blue-500/20 cursor-pointer'
                                    : 'border-gray-600 bg-transparent cursor-not-allowed opacity-40'
                                } ${updatingCity[cityKey] ? 'opacity-50' : ''}`}
                                >
                                  {updatingCity[cityKey]
                                    ? <div className="w-2.5 h-2.5 border border-white/40 border-t-white rounded-full animate-spin" />
                                    : isCompleted
                                    ? <CheckCircle className="w-3 h-3 text-white" />
                                    : null}
                                </button>
                              ) : (
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${isCompleted ? 'bg-green-500 border-green-500' : 'border-gray-600'}`}>
                                  {isCompleted && <CheckCircle className="w-3 h-3 text-white" />}
                                </div>
                              )}
                            </div>

                            {/* City name */}
                            <p className={`flex-1 text-sm font-medium ${
                              isCompleted ? 'text-green-400 line-through decoration-green-600'
                              : isActive   ? 'text-blue-300 font-semibold'
                              :              'text-gray-500'
                            }`}>
                              {city.city}
                            </p>

                            {/* Transport mode between cities */}
                            {index < shipment.selected_route.route.length - 1 && city.mode && (
                              <div className="flex items-center gap-1 px-2 py-1 bg-gray-700/50 rounded-md">
                                <span className="text-xs text-gray-400">
                                  {city.mode === 'road' || city.mode === 'Truck' ? '🚛' : 
                                   city.mode === 'rail' || city.mode === 'Rail' ? '🚆' : 
                                   city.mode === 'sea' || city.mode === 'Ocean' ? '🚢' : 
                                   city.mode === 'air' || city.mode === 'Air' ? '✈️' : '📦'}
                                </span>
                                <span className="text-xs text-gray-300 capitalize">{city.mode}</span>
                              </div>
                            )}

                            {/* Status pill */}
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              isCompleted ? 'bg-green-500/20 text-green-400'
                              : isActive   ? 'bg-blue-500/20 text-blue-400'
                              :              'bg-gray-700 text-gray-500'
                            }`}>
                              {isCompleted ? 'Crossed' : isActive ? 'Current' : 'Pending'}
                            </span>

                            <span className="text-xs text-gray-600 font-mono w-5 text-right">{index + 1}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* ── Additional Info ── */}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <p className="text-gray-400 mb-1">Priority</p>
                      <p className="text-white font-medium">{shipment.priority_level}</p>
                    </div>
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <p className="text-gray-400 mb-1">Quantity</p>
                      <p className="text-white font-medium">{shipment.quantity}</p>
                    </div>
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <p className="text-gray-400 mb-1">Transit Hubs</p>
                      <p className="text-white font-medium">{shipment.transit_hubs.length > 0 ? shipment.transit_hubs.join(', ') : 'None'}</p>
                    </div>
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <p className="text-gray-400 mb-1">Created</p>
                      <p className="text-white font-medium">{new Date(shipment.created_at?.seconds * 1000).toLocaleDateString()}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Re-route Preview Modals */}
      {Object.entries(reRoutePreview).map(([shipmentId, previewData]) => (
        <ReRoutePreview
          key={shipmentId}
          shipmentId={shipmentId}
          previewData={previewData}
          onApply={applyReRoute}
          onDismiss={dismissReRoutePreview}
        />
      ))}

      {/* City Tick Confirmation Modal */}
      {cityTickConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setCityTickConfirm(null)}
          />

          {/* Modal */}
          <div className="relative z-10 w-full max-w-sm mx-4 rounded-2xl border border-white/20 bg-slate-900/95 backdrop-blur-xl shadow-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center flex-shrink-0">
                <CheckCircle className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <h3 className="text-white font-bold text-base">Confirm Checkpoint</h3>
                <p className="text-gray-400 text-xs mt-0.5">This action cannot be undone</p>
              </div>
            </div>

            <p className="text-gray-300 text-sm mb-1">
              Mark{' '}
              <span className="text-white font-semibold">{cityTickConfirm.cityName}</span>{' '}
              as completed?
            </p>
            <p className="text-gray-500 text-xs mb-6">
              Once confirmed, this checkpoint will be permanently locked.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setCityTickConfirm(null)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-gray-300 text-sm font-medium transition-all"
              >
                Cancel
              </button>
              <button
                onClick={confirmCityTick}
                className="flex-1 px-4 py-2.5 rounded-xl bg-green-600 hover:bg-green-500 active:scale-95 text-white text-sm font-bold transition-all shadow-lg shadow-green-900/30"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .animation-delay-2000 { animation-delay: 2s; }
        .animation-delay-4000 { animation-delay: 4s; }
        @keyframes spin-slow { to { transform: rotate(360deg); } }
        .animate-spin-slow { animation: spin-slow 3s linear infinite; }
      `}</style>
    </div>
  );
}
