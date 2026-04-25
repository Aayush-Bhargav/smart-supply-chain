'use client';
import { useAuth } from "@/context/AuthContext";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { MapPin, Package, Clock, Calendar, Loader2, Truck, BarChart3, AlertTriangle } from 'lucide-react';
import { RouteRequest } from '@/types/route';
import CityAutocomplete from '@/components/CityAutocomplete';
import TransitHubs from '@/components/TransitHubs';
import Link from 'next/link';
import { apiUrl } from '@/lib/api';
import CustomSelect from '@/components/route/CustomSelect';

const CATEGORIES = [
  "Accessories", "As Seen on TV!", "Baby", "Baseball & Softball", "Basketball",
  "Books", "Boxing & MMA", "CDs", "Cameras", "Camping & Hiking", "Cardio Equipment",
  "Children's Clothing", "Cleats", "Computers", "Consumer Electronics", "Crafts",
  "DVDs", "Electronics", "Fishing", "Fitness Accessories", "Garden", "Girls' Apparel",
  "Golf Apparel", "Golf Bags & Carts", "Golf Balls", "Golf Gloves", "Golf Shoes",
  "Health and Beauty", "Hockey", "Hunting & Shooting", "Indoor/Outdoor Games",
  "Kids' Golf Clubs", "Lacrosse", "Men's Clothing", "Men's Footwear", "Men's Golf Clubs",
  "Music", "Pet Supplies", "Shop By Sport", "Soccer", "Sporting Goods",
  "Strength Training", "Tennis & Racquet", "Toys", "Trade-In", "Video Games",
  "Water Sports", "Women's Apparel", "Women's Clothing", "Women's Golf Clubs",
];

const DISASTER_VECTORS = [
  { value: "Weather", label: "Hurricane / Storm" },
  { value: "Logistics", label: "Labour Strike / Port Closure" },
  { value: "Geopolitical", label: "Border / Conflict Blockade" },
];

const DELIVERY_TYPES = [
  { value: "Only Ocean", label: "Only Ocean" },
  { value: "Only Air",   label: "Only Air" },
  { value: "Only Truck", label: "Only Truck" },
  { value: "No Ocean",   label: "No Ocean" },
  { value: "No Air",     label: "No Air" },
  { value: "No Truck",       label: "No Truck" },
  { value: "Any",       label: "Any" },
];

const PRIORITY_LEVELS = [
  { value: "Standard Class", label: "Standard Class" },
  { value: "Second Class",   label: "Second Class" },
  { value: "First Class",    label: "First Class" },
];

const inputClass = "w-full bg-white/10 border border-zinc-800 text-white rounded-xl px-4 py-3 pt-2 outline-none focus:border-blue-400 transition-all";
const selectClass = `${inputClass} appearance-none`;
const labelClass = "block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2";

export default function Home() {
  const router = useRouter();
  const { user, loading } = useAuth();

  const [formData, setFormData] = useState<RouteRequest>({
    source_city:          '',
    target_city:          '',
    category_name:        CATEGORIES[0],
    quantity:             1,
    priority_level:       'Standard Class',
    dispatch_date:        new Date().toISOString().slice(0, 16),
    scheduled_days:       null,
    delivery_type:        'Any',
    transit_hubs:         [],
    mock_disruption_city: null,
    mock_disruption_type: null,
  });

  const [isSimulationMode, setIsSimulationMode] = useState(false);
  const [loader, setLoader] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoader(true);
    setError(null);
    sessionStorage.removeItem('currentRouteData');
    try {
      const res = await fetch(apiUrl('/find_route'), {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(formData),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || 'Failed to find route');
      }
      const data = await res.json();
      sessionStorage.setItem('currentRouteData', JSON.stringify(data));
      router.push('/route');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoader(false);
    }
  };

  const handleInputChange = (field: keyof RouteRequest, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-slate-900 to-indigo-950">

      {/* Ambient blobs — same as dashboard */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse animation-delay-2000" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-500 rounded-full mix-blend-multiply filter blur-xl opacity-10 animate-pulse animation-delay-4000" />
      </div>

      <div className="relative z-10 container mx-auto px-4 py-8">

        {/* Header */}
        <div className="mb-10">
          <div className="bg-white/5 backdrop-blur-lg border-b border-white/10 -mx-4 px-4 py-5 mb-8 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Package className="w-7 h-7 text-blue-400" />
              <div>
                <h1 className="text-2xl font-bold text-white">Supply Chain Route Optimizer</h1>
                <p className="text-sm text-slate-400">AI-powered route optimization for global logistics</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/dashboard"
                className="flex items-center gap-2 px-4 py-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg text-sm font-medium transition-all"
              >
                <BarChart3 className="w-4 h-4" /> Dashboard
              </Link>
              <button
                onClick={() => signOut(auth)}
                className="flex items-center px-4 py-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg text-sm font-medium transition-all"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">

          {/* ── Form ── */}
          <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-2xl p-8">
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-3">
              <Package className="w-5 h-5 text-blue-400" />
              Route Configuration
            </h2>

            <form onSubmit={handleSubmit} className="space-y-5">

              <div>
                <label className={`${labelClass} flex items-center`}>
                        <MapPin className="w-3.5 h-3.5 mr-2 text-sky-400" />
                        source city
                </label>
                <CityAutocomplete
                  value={formData.source_city}
                  onChange={(v) => handleInputChange('source_city', v)}
                  placeholder="e.g., New York City"
                />
              </div>

              <div>
              <label className={`${labelClass} flex items-center`}>
                        <MapPin className="w-3.5 h-3.5 mr-2 text-sky-400" />
                        destination city
                </label>
                <CityAutocomplete
                  value={formData.target_city}
                  onChange={(v) => handleInputChange('target_city', v)}
                  placeholder="e.g., Los Angeles"
                />
              </div>

              <TransitHubs
                  value={formData.transit_hubs ?? []}
                  onChange={(hubs) => handleInputChange('transit_hubs', hubs)}
                />

              <CustomSelect
                label="Product Category"
                icon={Package}
                value={formData.category_name}
                options={CATEGORIES}
                onChange={(val) => handleInputChange('category_name', val)}
              />

              <div className="grid grid-cols-8 gap-4">
                {/* Quantity: Takes 1/7th of the space */}
                <div className="col-span-2">
                  <label className={labelClass}>Quantity</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    required
                    className={inputClass}
                    value={formData.quantity}
                    onChange={(e) => handleInputChange('quantity', parseFloat(e.target.value))}
                  />
                </div>

                {/* Priority Level: Takes 3/7ths of the space */}
                <div className="col-span-3">
                  <CustomSelect
                    label="Priority Level"
                    icon={Clock}
                    value={formData.priority_level}
                    options={PRIORITY_LEVELS}
                    onChange={(val) => handleInputChange('priority_level', val)}
                  />
                </div>

                {/* Delivery Type: Takes 3/7ths of the space */}
                <div className="col-span-3">
                  <CustomSelect
                    label="Delivery Type"
                    icon={Truck}
                    value={formData.delivery_type}
                    options={DELIVERY_TYPES}
                    onChange={(val) => handleInputChange('delivery_type', val)}
                  />
                </div>
              </div>

              <div>
              <label className={`${labelClass} flex items-center`}>
                        <Calendar className="w-3.5 h-3.5 mr-2 text-sky-400" />
                        dispatch date & time
                </label>
                <input
                  type="datetime-local" required
                  className={inputClass}
                  value={formData.dispatch_date}
                  onChange={(e) => handleInputChange('dispatch_date', e.target.value)}
                />
              </div>

              {/* Chaos Simulator — matches dashboard version */}
              <div className={`rounded-2xl border p-5 transition-all duration-500 ${
                isSimulationMode
                  ? 'border-red-500/40 bg-red-950/20'
                  : 'border-white/10 bg-white/5'
              }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <div className={`h-2.5 w-2.5 rounded-full ${isSimulationMode ? 'bg-red-500 animate-ping' : 'bg-slate-600'}`} />
                      <span className="text-xs font-bold uppercase tracking-widest text-white">Chaos Simulator</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {isSimulationMode ? 'Targeting nodes for synthetic disruption.' : 'Running on real-world telemetry.'}
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={isSimulationMode}
                      onChange={() => {
                        setIsSimulationMode(!isSimulationMode);
                        if (isSimulationMode) {
                          handleInputChange('mock_disruption_city', null);
                          handleInputChange('mock_disruption_type', null);
                        }
                      }}
                    />
                    <div className="w-10 h-5 bg-slate-700 rounded-full peer peer-checked:after:translate-x-5 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-red-500" />
                  </label>
                </div>

                {isSimulationMode && (
                  <div className="grid grid-cols-2 gap-3 mt-4">
                    <div>
                      <label className={labelClass}>Target Zone</label>
                      <CityAutocomplete
                        value={formData.mock_disruption_city || ''}
                        onChange={(v) => handleInputChange('mock_disruption_city', v)}
                        placeholder="Search city..."
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
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={loading || loader}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all shadow-lg shadow-blue-900/30 text-sm"
              >
                {loader ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Analysing routes &amp; risks...</>
                ) : (
                  'Find Optimal Route'
                )}
              </button>

              {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
                  <p className="text-red-400 text-sm font-medium">Error: {error}</p>
                </div>
              )}
            </form>
          </div>

          {/* ── Map / Empty State ── */}
          <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-2xl p-8 h-[920px] flex flex-col">
            <h2 className="text-xl font-bold text-white mb-6">Route Visualisation</h2>
            <div className="flex-1 flex items-center justify-center">
              {loader ? (
                <div className="text-center">
                  <div className="relative mb-8 mx-auto w-20 h-20">
                    <div className="w-20 h-20 border-4 border-white/10 border-t-blue-400 rounded-full animate-spin" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Loader2 className="w-7 h-7 text-blue-400 animate-pulse" />
                    </div>
                  </div>
                  <p className="text-white font-medium mb-2">Calculating optimal route...</p>
                  <p className="text-slate-500 text-sm">Our agents are analysing risks and paths</p>
                </div>
              ) : (
                <div className="text-center">
                  <div className="w-20 h-20 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-5">
                    <MapPin className="w-9 h-9 text-slate-600" />
                  </div>
                  <p className="text-slate-400 text-sm">Configure parameters and submit to see the route visualisation</p>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      <style jsx>{`
        .animation-delay-2000 { animation-delay: 2s; }
        .animation-delay-4000 { animation-delay: 4s; }
      `}</style>
    </div>
  );
}