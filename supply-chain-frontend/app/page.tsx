'use client';
import { useAuth } from "@/context/AuthContext";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { MapPin, Package, Clock, Calendar, Loader2, Truck, BarChart3 } from 'lucide-react';
import { RouteRequest } from '@/types/route';
import CityAutocomplete from '@/components/CityAutocomplete';
import TransitHubs from '@/components/TransitHubs';
import Link from 'next/link';
import { apiUrl } from '@/lib/api';

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

const DELIVERY_TYPES = [
  { value: "Only Ocean", label: "Only Ocean" },
  { value: "Only Air",   label: "Only Air" },
  { value: "Only Truck", label: "Only Truck" },
  { value: "No Air",     label: "No Air" },
  { value: "No Ocean",   label: "No Ocean" },
  { value: "None",       label: "None" },
];

const PRIORITY_LEVELS = [
  { value: "Standard Class", label: "Standard Class" },
  { value: "Second Class",   label: "Second Class" },
  { value: "First Class",    label: "First Class" },

];

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
    delivery_type:        'None',
    transit_hubs:         [],
    mock_disruption_city: null,
    mock_disruption_type: null,
  });

  const [isSimulationMode, setIsSimulationMode] = useState(false);
  const [loader, setLoader] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoader(true);
    setError(null);

    // Clear stale data so a failed mid-flight request never shows old results
    sessionStorage.removeItem('currentRouteData');

    try {
      console.log('🚨 FRONTEND TRIGGER: Calling /find_route API');
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
  // use effect for user authentication session testing


  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading]);




  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-8">

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold gradient-text mb-3">
            Supply Chain Route Optimizer
          </h1>
          <p className="text-xl text-gray-600 font-medium">
            AI-powered route optimization for global logistics
          </p>
          <div className="flex items-center space-x-4">
            <Link
              href="/dashboard"
              className="flex items-center px-4 py-2 text-gray-700 hover:text-white hover:bg-blue-600 transition-all duration-200 rounded-lg font-medium"
            >
              <BarChart3 className="w-4 h-4 mr-2" />
              Dashboard
            </Link>
            <button onClick={() => signOut(auth)} className="flex items-center px-4 py-2 text-gray-700 hover:text-white hover:bg-blue-600 transition-all duration-200 rounded-lg font-medium">
              Logout
            </button>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">

          {/* Form Section */}
          <div className="space-y-6">
            <div className="card p-8 hover-lift">
              <h2 className="text-3xl font-bold mb-8 flex items-center gradient-text">
                <Package className="mr-3 text-blue-600" size={32} />
                Route Configuration
              </h2>

              <form onSubmit={handleSubmit} className="form-section">

                <div>
                  <label className="form-label">Origin City</label>
                  <CityAutocomplete
                    value={formData.source_city}
                    onChange={(value) => handleInputChange('source_city', value)}
                    placeholder="e.g., New York City"
                  />
                </div>

                <div>
                  <label className="form-label">Destination City</label>
                  <CityAutocomplete
                    value={formData.target_city}
                    onChange={(value) => handleInputChange('target_city', value)}
                    placeholder="e.g., Los Angeles"
                  />
                </div>

                <div>
                  <label className="form-label">
                    <Package className="inline w-5 h-5 mr-2 text-blue-600" />
                    Product Category
                  </label>
                  <select
                    className="input-field"
                    value={formData.category_name}
                    onChange={(e) => handleInputChange('category_name', e.target.value)}
                  >
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="form-label">Quantity</label>
                    <input
                      type="number" min="1" step="0.1" required
                      className="input-field"
                      value={formData.quantity}
                      onChange={(e) => handleInputChange('quantity', parseFloat(e.target.value))}
                    />
                  </div>

                  <div>
                    <label className="form-label">
                      <Clock className="inline w-5 h-5 mr-2 text-blue-600" />
                      Priority Level
                    </label>
                    <select
                      className="input-field"
                      value={formData.priority_level}
                      onChange={(e) => handleInputChange('priority_level', e.target.value)}
                    >
                      {PRIORITY_LEVELS.map(p => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="form-label">
                      <Truck className="inline w-5 h-5 mr-2 text-blue-600" />
                      Delivery Type
                    </label>
                    <select
                      className="input-field"
                      value={formData.delivery_type}
                      onChange={(e) => handleInputChange('delivery_type', e.target.value)}
                    >
                      {DELIVERY_TYPES.map(d => (
                        <option key={d.value} value={d.value}>{d.label}</option>
                      ))}
                    </select>
                  </div>

                  <TransitHubs
                    value={formData.transit_hubs ?? []}
                    onChange={(hubs) => handleInputChange('transit_hubs', hubs)}
                  />
                </div>

                <div>
                  <label className="form-label">
                    <Calendar className="inline w-5 h-5 mr-2 text-blue-600" />
                    Dispatch Date &amp; Time
                  </label>
                  <input
                    type="datetime-local" required
                    className="input-field"
                    value={formData.dispatch_date}
                    onChange={(e) => handleInputChange('dispatch_date', e.target.value)}
                  />
                </div>

                {/* Chaos Engine Simulator */}
                <div className="mt-8 p-6 bg-slate-900 border border-blue-500/30 rounded-xl">
                  <div className="flex items-center justify-between mb-4">
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
                      <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-500" />
                    </label>
                  </div>

                  {isSimulationMode && (
                    <div className="grid grid-cols-2 gap-4 animate-fadeIn">
                      <div>
                        <label className="form-label !text-white">Target City</label>
                        <CityAutocomplete
                          value={formData.mock_disruption_city || ''}
                          onChange={(value) => handleInputChange('mock_disruption_city', value)}
                          placeholder="e.g., Miami"
                        />
                      </div>
                      <div>
                        <label className="form-label !text-white">Disaster Type</label>
                        <select
                          className="input-field bg-slate-800 text-white border-slate-700"
                          value={formData.mock_disruption_type || ''}
                          onChange={(e) => handleInputChange('mock_disruption_type', e.target.value)}
                        >
                          <option value="">Select Disaster...</option>
                          <option value="Weather">Category 5 Hurricane</option>
                          <option value="Logistics">Massive Port Strike</option>
                          <option value="Geopolitical">Border Blockade</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading || loader}
                  className="btn-primary w-full flex items-center justify-center text-lg mt-6"
                >
                  {loader ? (
                    <>
                      <Loader2 className="w-6 h-6 animate-spin mr-3" />
                      Analyzing Routes &amp; Risks...
                    </>
                  ) : (
                    'Find Optimal Route'
                  )}
                </button>
              </form>

              {error && (
                <div className="mt-6 p-4 bg-red-50 border-2 border-red-200 rounded-xl">
                  <p className="text-red-700 font-semibold">Error: {error}</p>
                </div>
              )}
            </div>
          </div>

          {/* Map / Empty State */}
          <div className="card p-6 h-[920px] hover-lift">
            <h2 className="text-3xl font-bold mb-6 gradient-text">Route Visualization</h2>
            {loader ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="relative mb-8">
                    <div className="w-20 h-20 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto"></div>
                    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                      <Loader2 className="w-8 h-8 text-blue-600 animate-pulse" />
                    </div>
                  </div>
                  <p className="text-gray-700 text-xl font-medium mb-2">Please wait, Our agents are calculating the perfect route for you</p>
                  <p className="text-gray-500 text-sm">This may take a few moments...</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center text-gray-500">
                  <MapPin className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg">
                    Configure route parameters and submit to see visualization
                  </p>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
