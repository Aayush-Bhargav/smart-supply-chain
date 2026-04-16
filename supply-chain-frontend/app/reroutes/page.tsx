'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { ArrowLeft, AlertTriangle, CheckCircle, Save, Trash2, Route } from 'lucide-react';
import Link from 'next/link';
import { doc, updateDoc, collection, query, where, getDocs, deleteDoc, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface ReRouteData {
  id: string;
  route_id: string;
  source: string;
  target: string;
  category_name: string;
  delivery_type: string;
  dispatch_date: string;
  recommended_routes: any[];
  node_risks: any;
  flag: number;
}

export default function ReRoutesPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [reRoutes, setReRoutes] = useState<ReRouteData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ show: boolean; message: string }>({ show: false, message: '' });
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }

    // Fetch re-routed shipments (flag=1)
    const fetchReRoutes = async () => {
      try {
        const q = query(
          collection(db, 'user_shipments'),
          where('userId', '==', user.uid),
          where('flag', '==', 1), // Only fetch re-routed shipments
          orderBy('created_at', 'desc')
        );
        
        const querySnapshot = await getDocs(q);
        const reRoutesData = querySnapshot.docs.map((docSnapshot) => ({
          id: docSnapshot.id,
          ...(docSnapshot.data() as Omit<ReRouteData, 'id'>),
        }));
        
        setReRoutes(reRoutesData);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching re-routes:', err);
        setError('Failed to load re-routed shipments');
        setLoading(false);
      }
    };

    fetchReRoutes();
  }, [user, router]);

  const handleSaveRoute = async (routeData: ReRouteData) => {
    try {
      const routeRef = doc(db, 'user_shipments', routeData.route_id);
      await updateDoc(routeRef, {
        flag: 0, // Reset flag after saving
        recommended_routes: routeData.recommended_routes,
        node_risks: routeData.node_risks,
        updated_at: new Date()
      });

      setNotification({ show: true, message: 'Route saved successfully!' });
      setTimeout(() => setNotification({ show: false, message: '' }), 3000);
    } catch (err) {
      console.error('Error saving route:', err);
      setNotification({ show: true, message: 'Failed to save route' });
      setTimeout(() => setNotification({ show: false, message: '' }), 3000);
    }
  };

  const handleDeleteRoute = async (routeId: string) => {
    if (!confirm('Are you sure you want to delete this shipment?')) {
      return;
    }

    try {
      setDeletingId(routeId);
      await deleteDoc(doc(db, 'user_shipments', routeId));
      setReRoutes(prev => prev.filter(route => route.id !== routeId));
      setNotification({ show: true, message: 'Shipment deleted successfully!' });
      setTimeout(() => setNotification({ show: false, message: '' }), 3000);
    } catch (err) {
      console.error('Error deleting route:', err);
      setNotification({ show: true, message: 'Failed to delete shipment' });
      setTimeout(() => setNotification({ show: false, message: '' }), 3000);
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-white text-center">
          <div className="w-16 h-16 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
          <p className="mt-4 text-xl">Loading Re-routed Routes...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-white text-center">
          <AlertTriangle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <p className="text-xl">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse animation-delay-2000"></div>
      </div>

      {/* Header */}
      <div className="relative z-10">
        <div className="bg-gray-900/10 backdrop-blur-lg border-b border-white/10">
          <div className="container mx-auto px-4 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <Route className="w-8 h-8 text-blue-400" />
                <div>
                  <h1 className="text-3xl font-bold text-white">Re-routed Routes</h1>
                  <p className="text-gray-300">Routes re-calculated due to high-risk cities</p>
                </div>
              </div>
              
              <div className="flex items-center space-x-4">
                <Link
                  href="/dashboard"
                  className="flex items-center px-4 py-2 text-gray-300 hover:text-white transition-colors rounded-lg"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Dashboard
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Notification */}
      {notification.show && (
        <div className="fixed top-4 right-4 z-50 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg animate-pulse">
          <div className="flex items-center">
            <CheckCircle className="w-5 h-5 mr-2" />
            <span>{notification.message}</span>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="relative z-10 container mx-auto px-4 py-8">
        {reRoutes.length === 0 ? (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-24 h-24 bg-gray-800 rounded-full mb-8">
              <Route className="w-12 h-12 text-gray-400" />
            </div>
            <h2 className="text-2xl font-semibold text-white mb-4">No Re-routed Routes</h2>
            <p className="text-gray-300 mb-8">No routes have been re-calculated due to high-risk cities.</p>
            <Link
              href="/dashboard"
              className="inline-flex items-center px-6 py-3 bg-blue-600 rounded-xl hover:bg-blue-700 transition text-white font-semibold"
            >
              <Route className="w-5 h-5 mr-2" />
              Back to Dashboard
            </Link>
          </div>
        ) : (
          <div className="grid gap-6">
            {reRoutes.map((route) => (
              <div
                key={route.id}
                className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-2xl p-6 hover:shadow-2xl transition-all duration-300"
              >
                {/* Route Header */}
                <div className="flex items-start justify-between mb-6">
                  <div className="flex-1">
                    <div className="flex items-center mb-2">
                      <div className="w-3 h-3 bg-orange-400 rounded-full mr-2"></div>
                      <h3 className="text-xl font-bold text-white">
                        {route.source} → {route.target}
                      </h3>
                    </div>
                    <div className="flex items-center space-x-4 text-sm text-gray-300">
                      <span className="flex items-center">
                        <Route className="w-4 h-4 mr-1" />
                        {route.category_name}
                      </span>
                      <span>•</span>
                      <span>{route.delivery_type}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleSaveRoute(route)}
                      className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      Save Route
                    </button>
                    
                    <button
                      onClick={() => handleDeleteRoute(route.id)}
                      disabled={deletingId === route.id}
                      className="flex items-center px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                    >
                      {deletingId === route.id ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Route Details */}
                <div className="space-y-4">
                  <div className="bg-gray-800/50 rounded-lg p-4">
                    <h4 className="text-lg font-semibold text-white mb-3">Re-routing Details</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-gray-400 mb-1">Source</p>
                        <p className="text-white font-medium">{route.source}</p>
                      </div>
                      <div>
                        <p className="text-gray-400 mb-1">Target</p>
                        <p className="text-white font-medium">{route.target}</p>
                      </div>
                      <div>
                        <p className="text-gray-400 mb-1">Category</p>
                        <p className="text-white font-medium">{route.category_name}</p>
                      </div>
                      <div>
                        <p className="text-gray-400 mb-1">Delivery Type</p>
                        <p className="text-white font-medium">{route.delivery_type}</p>
                      </div>
                      <div>
                        <p className="text-gray-400 mb-1">Dispatch Date</p>
                        <p className="text-white font-medium">{route.dispatch_date}</p>
                      </div>
                    </div>
                  </div>

                  {/* Risk Assessment */}
                  {route.node_risks && Object.keys(route.node_risks).length > 0 && (
                    <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-4">
                      <h4 className="text-lg font-semibold text-red-300 mb-3 flex items-center">
                        <AlertTriangle className="w-5 h-5 mr-2" />
                        Risk Assessment
                      </h4>
                      <div className="space-y-2">
                        {Object.entries(route.node_risks).map(([city, riskData]: [string, any]) => (
                          <div key={city} className="flex justify-between items-center">
                            <span className="text-red-200">{city}</span>
                            <span className={`px-2 py-1 rounded text-xs font-semibold ${
                              riskData.risk > 0.4 ? 'bg-red-600 text-white' : 'bg-yellow-600 text-white'
                            }`}>
                              Risk: {riskData.risk?.toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Alternative Routes */}
                  {route.recommended_routes && route.recommended_routes.length > 0 && (
                    <div className="bg-blue-500/20 border border-blue-500/30 rounded-lg p-4">
                      <h4 className="text-lg font-semibold text-blue-300 mb-3">Alternative Routes</h4>
                      <div className="space-y-3">
                        {route.recommended_routes.map((altRoute: any, index: number) => (
                          <div key={index} className="bg-gray-800/50 rounded-lg p-3">
                            <div className="flex items-center justify-between">
                              <span className="text-blue-200 font-medium">Option {altRoute.option}</span>
                              <span className="text-gray-400 text-sm">
                                {altRoute.route && altRoute.route.length > 0
                                  ? `${altRoute.route[0]} → ${altRoute.route[altRoute.route.length - 1]}`
                                  : 'Route data unavailable'
                                }
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Custom styles */}
      <style jsx>{`
        .animation-delay-2000 {
          animation-delay: 2s;
        }
      `}</style>
    </div>
  );
}
