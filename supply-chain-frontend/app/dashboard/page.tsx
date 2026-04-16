'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { collection, query, where, orderBy, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { db } from '@/lib/firebase';
import { Package, MapPin, Clock, AlertTriangle, CheckCircle, Truck, Zap, RefreshCw, Trash2 } from 'lucide-react';
import axios from 'axios';
import Link from 'next/link';
import Notification from '@/components/dashboard/Notification';
import LiveTrackingToggle from '@/components/dashboard/LiveTrackingToggle';
import ReRouteNotification from '@/components/dashboard/ReRouteNotification';
import RouteCard from '@/components/dashboard/RouteCard';
import ReRoutePreview from '@/components/dashboard/ReRoutePreview';
import { apiUrl } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────
interface RouteCity {
  city: string;
  status: string;
  mode?: string;
  days?: number;
}

interface RouteEdge {
  from: string;
  to: string;
  mode: string;
  days: number;
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
}

interface ReRoutePreviewData {
  updated_route: RouteCity[];
  recommended_routes: any[];
  message: string;
  high_risk_cities: string[];
}

// ─── localStorage key for persisting active live-tracking shipment IDs ────────
const LS_KEY = 'live_tracking_shipments';

// ─── Helper: build POST payload from a shipment ───────────────────────────────
function buildPayload(shipment: Shipment) {
  const lastCompletedIndex =
    shipment.selected_route.route
      .map((city, idx) => ({ idx, status: city.status }))
      .filter((item) => item.status === 'completed')
      .pop()?.idx ?? -1;

  return {
    route_id: shipment.id,
    cities: shipment.selected_route.route.map((city: any, idx: number) => ({
      city_name: city.city,
      status: city.status,
      order: idx + 1,
    })),
    current_city_index: lastCompletedIndex,
    delivery_type: shipment.delivery_type,
    category: shipment.category_name,
    dispatch_date: shipment.dispatch_date,
  };
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

  // Per-shipment live tracking state: { [shipmentId]: boolean }
  const [liveTrackingMap, setLiveTrackingMap] = useState<Record<string, boolean>>({});

  // Per-shipment re-route notification: { [shipmentId]: boolean }
  const [reRoutedMap, setReRoutedMap] = useState<Record<string, boolean>>({});

  // Per-shipment re-route preview data: { [shipmentId]: previewData }
  const [reRoutePreview, setReRoutePreview] = useState<Record<string, ReRoutePreviewData>>({});

  // Global notification (errors, etc.)
  const [notification, setNotification] = useState<{
    show: boolean;
    message: string;
    type?: 'success' | 'error' | 'warning' | 'info';
  }>({ show: false, message: '' });

  const [deleteConfirmFor, setDeleteConfirmFor] = useState<string | null>(null);

  // Refs for the queue runner — we use refs so the interval closure always
  // sees the latest shipments state without re-registering the interval.
  const shipmentsRef = useRef<Shipment[]>([]);
  const liveTrackingMapRef = useRef<Record<string, boolean>>({});
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isRunningRef = useRef(false); // prevents overlapping queue runs

  // Delete shipment handler
  const handleDeleteShipment = useCallback(async (shipmentId: string) => {
    try {
      await deleteDoc(doc(db, 'user_shipments', shipmentId));
      setShipments((prev) => prev.filter((s) => s.id !== shipmentId));
    } catch (err) {
      console.error('Error deleting shipment:', err);
    }
  }, []);

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
      const updatedRouteWithPreserved = [
        ...completedCities.map((city: any) => ({ ...city, status: 'completed' })),
        ...cityRouteWithModes
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
      const payload = buildPayload(shipment);
      console.log('🚀 Live track →', shipmentId, payload);

      const response = await axios.post(apiUrl('/live_track'), payload, {
        headers: { 'Content-Type': 'application/json' },
      });

      console.log('✅ Live track response:', response.data);

      // If backend signals a re-route (flag=1), show preview notification
      if (response.data?.flag === 1) {
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
                .map(([city]) => city) : []
          }
        }));
      }
    } catch (err) {
      console.error('❌ Live track error for', shipmentId, err);
    }
  }, []);

  // ─── Queue runner: sequentially process all ON shipments ─────────────────
  // Called once every 30 min by the interval, AND immediately when a toggle turns ON.
  const runQueue = useCallback(async () => {
    if (isRunningRef.current) return; // already running, skip this tick
    isRunningRef.current = true;

    const activeIds = Object.entries(liveTrackingMapRef.current)
      .filter(([, on]) => on)
      .map(([id]) => id);

    console.log(`🔁 Queue run — ${activeIds.length} active shipment(s)`);

    for (const id of activeIds) {
      // Re-check: user might have toggled OFF while we were running
      if (!liveTrackingMapRef.current[id]) continue;
      await triggerBackendCall(id); // awaited → sequential
    }

    isRunningRef.current = false;
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
    const key = `${shipmentId}-${cityIndex}`;
    setUpdatingCity((prev) => ({ ...prev, [key]: true }));
    try {
      const shipment = shipments.find((s) => s.id === shipmentId);
      if (!shipment) return;

      const isCrossed = currentStatus === 'completed';
      const newStatus = isCrossed ? 'active' : 'completed';

      const updatedRoute = shipment.selected_route.route.map((city, idx) => {
        if (idx === cityIndex) return { ...city, status: newStatus };
        if (!isCrossed && idx === cityIndex + 1 && city.status === 'pending')
          return { ...city, status: 'active' };
        return city;
      });

      await updateDoc(doc(db, 'user_shipments', shipmentId), {
        'selected_route.route': updatedRoute,
        'selected_route.current_index': cityIndex + (isCrossed ? 0 : 1),
        updated_at: new Date(),
      });

      setShipments((prev) =>
        prev.map((s) =>
          s.id === shipmentId
            ? { ...s, selected_route: { ...s.selected_route, route: updatedRoute, current_index: cityIndex + (isCrossed ? 0 : 1) } }
            : s
        )
      );
    } catch (err) {
      console.error('Error updating city status:', err);
    } finally {
      setUpdatingCity((prev) => ({ ...prev, [`${shipmentId}-${cityIndex}`]: false }));
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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
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
                        <span className="text-sm font-semibold">Route has been updated by Live AI</span>
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
                          {shipment.source} → {shipment.target}
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
                          <div className="absolute right-0 mt-2 w-48 bg-white/95 backdrop-blur-lg border border-white/20 rounded-xl shadow-2xl p-3 z-10">
                            <p className="text-sm text-gray-700 mb-2">Are you sure you want to delete?</p>
                            <div className="flex gap-2">
                              <button
                                onClick={() => {
                                  handleDeleteShipment(shipment.id);
                                  setDeleteConfirmFor(null);
                                }}
                                className="flex-1 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-colors"
                              >
                                Yes
                              </button>
                              <button
                                onClick={() => setDeleteConfirmFor(null)}
                                className="flex-1 px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm font-medium rounded-lg transition-colors"
                              >
                                No
                              </button>
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
                                  disabled={updatingCity[cityKey] || (!isCompleted && !isActive)}
                                  className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                                    isCompleted ? 'bg-green-500 border-green-500'
                                    : isActive   ? 'border-blue-400 bg-transparent hover:bg-blue-500/20 cursor-pointer'
                                    :              'border-gray-600 bg-transparent cursor-not-allowed opacity-40'
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

      <style jsx>{`
        .animation-delay-2000 { animation-delay: 2s; }
        .animation-delay-4000 { animation-delay: 4s; }
        @keyframes spin-slow { to { transform: rotate(360deg); } }
        .animate-spin-slow { animation: spin-slow 3s linear infinite; }
      `}</style>
    </div>
  );
}
