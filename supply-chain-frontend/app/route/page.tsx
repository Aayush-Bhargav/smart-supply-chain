'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { RouteResponse } from '@/types/route';
import { ControlTowerInsights, Header, RouteVisualization, RouteDetails, RouteSegments, RouteStats } from '@/components/route';
import { CheckCircle, BrainCircuit, AlertTriangle, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { saveShipment } from '@/lib/saveShipment';
import { apiUrl } from '@/lib/api';

export default function RoutePage() {
  const router = useRouter();
  const { user } = useAuth();

  const [response, setResponse]                 = useState<RouteResponse | null>(null);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [geminiDecision, setGeminiDecision]     = useState<any>(null);
  const [geminiLoading, setGeminiLoading]       = useState(false);   // NEW: spinner while Gemini thinks
  const [geminiError, setGeminiError]           = useState<string | null>(null); // NEW: surface errors
  const [loading, setLoading]                   = useState(true);
  const [error, setError]                       = useState<string | null>(null);
  const [saving, setSaving]                     = useState(false);
  const [saveSuccess, setSaveSuccess]             = useState(false);

  // Prevents React Strict Mode from firing the Gemini call twice in development
  const hasFetchedGemini = useRef(false);

  useEffect(() => {
    // Check authentication first
    if (!user) {
      router.push('/login');
      return;
    }

    const routeData = sessionStorage.getItem('currentRouteData');

    if (!routeData) {
      setError('No route data found. Please submit a new request.');
      setLoading(false);
      return;
    }

    try {
      const parsed = JSON.parse(routeData) as RouteResponse;
      console.log('Parsed route data:', parsed);
      setResponse(parsed);
    } catch (err) {
      setError('Failed to parse route data.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    console.log('Gemini useEffect triggered');
    console.log('hasFetchedGemini.current:', hasFetchedGemini.current);
    console.log('response:', response);
    console.log('response.recommended_routes:', response?.recommended_routes);
    console.log('response.node_risks:', response?.node_risks);
    
    // Only call API if we have all required data
    if (!hasFetchedGemini.current && response && response.recommended_routes && response.node_risks) {
      console.log('Conditions met, calling Gemini API...');
      hasFetchedGemini.current = true;
      setGeminiLoading(true);
      setGeminiError(null);

      console.log('DEBUG: About to call /select_best_route API');
      console.log('DEBUG: API call data:', {
        priority_level: response.priority_level,
        routes: response.recommended_routes,
        node_risks: response.node_risks,
      });

      console.log('DEBUG: Starting fetch to /select_best_route');
      fetch(apiUrl('/select_best_route'), {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priority_level: response.priority_level,
          routes:         response.recommended_routes,
          node_risks:     response.node_risks,
        }),
      })
        .then(res => {
          console.log('DEBUG: API response received');
          console.log('DEBUG: API response status:', res.status);
          console.log('DEBUG: API response ok:', res.ok);
          if (!res.ok) {
            console.log('DEBUG: API response not ok, throwing error');
            throw new Error(`Server returned ${res.status}`);
          }
          console.log('DEBUG: Parsing JSON response...');
          return res.json();
        })
        .then(decision => {
          console.log('Gemini Response:', decision);
          setGeminiDecision(decision);
          const recommendedIndex = Math.max(
            0,
            Math.min(
              (decision.recommended_option || 1) - 1,
              response.recommended_routes.length - 1
            )
          );
          setSelectedRouteIndex(recommendedIndex);
        })
        .catch(err => {
          console.error('Gemini failed:', err);
          setGeminiError(
            'AI recommendation unavailable - the model may be rate-limited. ' +
            'Route options are still shown below; Option 1 is the fastest by default.'
          );
        })
        .finally(() => setGeminiLoading(false));
    }
  }, [response]);

  const handleShare = () => {
    if (response) {
      navigator.clipboard.writeText(window.location.href);
      alert('Route URL copied to clipboard!');
    }
  };

  const handleExport = () => {
    if (response) {
      const dataStr  = JSON.stringify(response, null, 2);
      const dataUri  = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
      const link     = document.createElement('a');
      link.setAttribute('href', dataUri);
      link.setAttribute('download', `route-${response.source}-${response.target}.json`);
      link.click();
    }
  };

  const handleSaveShipment = async () => {
    if (!response || !user) return;
    
    setSaving(true);
    setSaveSuccess(false);
    console.log("saving");
    try {
      await saveShipment({
        userId: user.uid,
        source: response.source,
        target: response.target,
        category_name: response.category_name,
        quantity: response.quantity,
        delivery_type: response.delivery_type,
        priority_level: response.priority_level,
        dispatch_date: response.dispatch_date,
        transit_hubs: response.transit_hubs,
        recommended_routes: response.recommended_routes,
        selected_option: selectedRouteIndex + 1, // Use user-selected route (options are 1-indexed)
        node_risks: response.node_risks,
        risk_checked_at: response.risk_checked_at,
        risk_sources: response.risk_sources,
        // city_coordinates: response.city_coordinates,
        ai_recommendation: geminiDecision,
      });
      console.log("saved");
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000); // Hide after 3 seconds
    } catch (error) {
      console.error('Error saving shipment:', error);
    } finally {
      setSaving(false);
    }
  };

  // ── Loading / error states ──
  if (loading || !response) {
    return (
      <div className="text-white text-center mt-20 text-2xl animate-pulse">
        Loading Routing Engine...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-white gap-4">
        <AlertTriangle className="w-16 h-16 text-red-400" />
        <p className="text-xl">{error}</p>
        <button
          onClick={() => router.push('/')}
          className="mt-4 px-6 py-3 bg-blue-600 rounded-xl hover:bg-blue-700 transition"
        >
          ← Back to Search
        </button>
      </div>
    );
  }

  const currentRoute = response.recommended_routes[selectedRouteIndex];

  // Adapts multi-route response to the shape legacy components expect
  const legacyFormatResponse = {
    ...response,
    route:              currentRoute.route,
    total_transit_days: currentRoute.total_transit_days,
    city_coordinates:   response.city_coordinates || {}
  };

  return (
    <div className="min-h-screen bg-slate-950">
      <Header
        response={legacyFormatResponse}
        onBack={() => router.push('/')}
        onShare={handleShare}
        onExport={handleExport}
        onSave={handleSaveShipment}
        saving={saving}
      />

      <div className="container mx-auto px-4 py-8">

        {/* ── Save Success Message ── */}
        {saveSuccess && (
          <div className="mb-8 p-6 bg-green-900/30 border border-green-400 rounded-xl flex items-center gap-4">
            <CheckCircle className="w-6 h-6 text-green-400" />
            <div>
              <p className="font-semibold text-green-200">Shipment Saved Successfully!</p>
              <p className="text-green-300 text-sm">Your shipment has been saved to your account.</p>
            </div>
          </div>
        )}

        {/* ── Gemini AI Panel ── */}
        {geminiLoading && (
          <div className="mb-8 p-6 bg-slate-900 border border-blue-500/20 rounded-xl flex items-center gap-4">
            <Loader2 className="w-8 h-8 text-blue-400 animate-spin flex-shrink-0" />
            <p className="text-blue-200 text-lg">AI is analyzing your route options...</p>
          </div>
        )}

        {geminiError && !geminiLoading && (
          <div className="mb-8 p-5 bg-yellow-900/30 border border-yellow-500/40 rounded-xl flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-yellow-400 flex-shrink-0 mt-0.5" />
            <p className="text-yellow-200">{geminiError}</p>
          </div>
        )}

        {geminiDecision && !geminiLoading && (
          <div className="mb-8 p-6 bg-gradient-to-r from-blue-900/40 to-purple-900/40 border border-blue-500/30 rounded-xl">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-blue-500/20 rounded-lg">
                <BrainCircuit className="w-8 h-8 text-blue-400" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white mb-2">AI Recommendation</h2>
                <p className="text-lg text-blue-100 mb-4">{geminiDecision.executive_summary}</p>
                <ul className="space-y-2">
                  {geminiDecision.trade_offs?.map((tradeoff: string, i: number) => (
                    <li key={i} className="flex items-center text-gray-300">
                      <CheckCircle className="w-4 h-4 text-green-400 mr-2 flex-shrink-0" />
                      {tradeoff}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* ── Route option tabs ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 w-full">
          {response.recommended_routes.map((opt, idx) => (
            <button
              key={idx}
              onClick={() => setSelectedRouteIndex(idx)}
              className={`relative flex flex-col p-5 rounded-2xl border transition-all duration-300 text-left w-full group ${
                selectedRouteIndex === idx
                  ? 'bg-slate-800 border-blue-500 shadow-xl shadow-blue-900/20 ring-1 ring-blue-500/50'
                  : 'bg-slate-900 border-slate-800 hover:border-slate-600 hover:bg-slate-800/40'
              }`}
            >
              {/* Top Right Highlight Dot */}
              {selectedRouteIndex === idx && (
                <div className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-blue-500 rounded-full border-2 border-slate-900 z-10 shadow-lg shadow-blue-500/50" />
              )}

              {/* Header Row: Option & Transit Time */}
              <div className="flex justify-between items-end mb-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500 mb-1">Logistics Path</p>
                  <h3 className="text-xl font-bold text-white leading-none">Option {opt.option}</h3>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold uppercase tracking-tight text-blue-500/80">Est. Time</p>
                  <p className="text-lg font-semibold text-slate-100 leading-none">{opt.total_transit_days} Days</p>
                </div>
              </div>

              {/* Simple Divider */}
              <div className="h-px w-full bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800 mb-4" />

              {/* Clean Route Path */}
              <div className="flex flex-wrap items-center gap-y-4 gap-x-1">
          {opt.route.map((segment, sIdx) => (
            /* Use display: contents to let the children wrap naturally */
            <div key={sIdx} className="contents">
              {/* From City */}
              <span className="text-[13px] font-medium text-slate-200 whitespace-nowrap">
                {segment.from}
              </span>
              
              {/* Mode Icon & Arrow */}
              <div className="flex flex-col items-center px-2 text-slate-500">
                <span className="text-[10px] mb-0.5 filter grayscale group-hover:grayscale-0 transition-all">
                  {segment.mode === 'Truck' && '🚚'}
                  {segment.mode === 'Ocean' && '🚢'}
                  {segment.mode === 'Air' && '✈️'}
                  {segment.mode === 'Rail' && '🚂'}
                </span>
                <div className="h-[2px] w-6 bg-slate-700 rounded-full" />
              </div>

              {/* Show the final Destination only after the last segment */}
              {sIdx === opt.route.length - 1 && (
                <span className="text-[13px] font-medium text-slate-200 whitespace-nowrap">
                  {segment.to}
                </span>
              )}
            </div>
          ))}
        </div>

              {/* Subtle Hotspot Indicator (if any exist) */}
              {opt.route.some(s => (s.risk_score || 0) > 0.4) && (
                <div className="mt-4 flex items-center gap-1.5">
                  <div className="flex -space-x-1">
                    {opt.route.filter(s => (s.risk_score || 0) > 0.4).map((_, i) => (
                      <div key={i} className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.6)]" />
                    ))}
                  </div>
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">Security Alert</span>
                </div>
              )}
            </button>
          ))}
        </div>
        <div className="mb-8">
          <ControlTowerInsights
            response={response}
            selectedRouteIndex={selectedRouteIndex}
            recommendedOption={geminiDecision?.recommended_option ?? null}
          />
        </div>
        {currentRoute.has_high_risk_hub && (
  <div className="mb-6 p-4 bg-red-900/30 border border-red-400 rounded-2xl flex items-start gap-3">
    <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5" />
    <div>
      <p className="font-semibold text-red-200">High-Risk Hub Detected</p>
      <p className="text-red-300 text-sm">
        This route was forced through your selected transit hubs even though one or more currently have severe risk.
      </p>
    </div>
  </div>
)}

        {/* ── Main content grid ── */}
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-6">
            <RouteDetails    response={legacyFormatResponse} />
            <RouteSegments   response={legacyFormatResponse} />
            <RouteStats      response={legacyFormatResponse} />
          </div>
          <div className="lg:col-span-2 space-y-6">
            <RouteVisualization
          response={legacyFormatResponse}
        />
          </div>
        </div>

      </div>
    </div>
  );
}
