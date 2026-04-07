'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin, Package, Clock, Calendar, TrendingUp, Loader2, Truck } from 'lucide-react';
import { RouteRequest, RouteResponse } from '@/types/route';
import CityAutocomplete from '@/components/CityAutocomplete';
import TransitHubs from '@/components/TransitHubs';

const CATEGORIES = [
  "Accessories",
  "As Seen on TV!",
  "Baby",
  "Baseball & Softball",
  "Basketball",
  "Books",
  "Boxing & MMA",
  "CDs",
  "Cameras",
  "Camping & Hiking",
  "Cardio Equipment",
  "Children's Clothing",
  "Cleats",
  "Computers",
  "Consumer Electronics",
  "Crafts",
  "DVDs",
  "Electronics",
  "Fishing",
  "Fitness Accessories",
  "Garden",
  "Girls' Apparel",
  "Golf Apparel",
  "Golf Bags & Carts",
  "Golf Balls",
  "Golf Gloves",
  "Golf Shoes",
  "Health and Beauty",
  "Hockey",
  "Hunting & Shooting",
  "Indoor/Outdoor Games",
  "Kids' Golf Clubs",
  "Lacrosse",
  "Men's Clothing",
  "Men's Footwear",
  "Men's Golf Clubs",
  "Music",
  "Pet Supplies",
  "Shop By Sport",
  "Soccer",
  "Sporting Goods",
  "Strength Training",
  "Tennis & Racquet",
  "Toys",
  "Trade-In",
  "Video Games",
  "Water Sports",
  "Women's Apparel",
  "Women's Clothing",
  "Women's Golf Clubs"
];

const DELIVERY_TYPES = [
  { value: "Only Ocean", label: "Only Ocean" },
  { value: "Only Air", label: "Only Air" },
  { value: "Only Truck", label: "Only Truck" },
  { value: "No Air", label: "No Air" },
  { value: "No Ocean", label: "No Ocean" },
  { value: "None", label: "None" },
];

const PRIORITY_LEVELS = [
  { value: "Standard Class", label: "Standard Class (4 days)" },
  { value: "Second Class", label: "Second Class (3 days)" },
  { value: "First Class", label: "First Class (2 days)" },
  { value: "Same Day", label: "Same Day (1 day)" },
];

export default function Home() {
  const router = useRouter();
  const [formData, setFormData] = useState<RouteRequest>({
    source_city: '',
    target_city: '',
    category_name: CATEGORIES[0], // Now uses "Accessories" as first category
    quantity: 1,
    priority_level: "Standard Class",
    dispatch_date: new Date().toISOString().slice(0, 16),
    scheduled_days: null,
    delivery_type: "None",
    transit_hubs: [],
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('http://localhost:8000/find_route', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || 'Failed to find route');
      }

      const data = await res.json();
      
      // Redirect to route page with data
      const encodedData = encodeURIComponent(JSON.stringify(data));
      router.push(`/route?data=${encodedData}`);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof RouteRequest, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
  };

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
                {/* Source City */}
                <div>
                  <CityAutocomplete
                    value={formData.source_city}
                    onChange={(value) => handleInputChange('source_city', value)}
                    placeholder="e.g., New York"
                  />
                </div>

                {/* Target City */}
                <div>
                  <CityAutocomplete
                    value={formData.target_city}
                    onChange={(value) => handleInputChange('target_city', value)}
                    placeholder="e.g., Los Angeles"
                  />
                </div>

                {/* Category */}
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
                    {CATEGORIES.map(category => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Quantity and Priority */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="form-label">
                      Quantity
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="0.1"
                      required
                      className="input-field"
                      value={formData.quantity}
                      onChange={(e) => handleInputChange('quantity', parseFloat(e.target.value))}
                    />
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
                      {DELIVERY_TYPES.map(deliveryType => (
                        <option key={deliveryType.value} value={deliveryType.value}>
                          {deliveryType.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Transit Hubs */}
                  <TransitHubs
                    value={formData.transit_hubs}
                    onChange={(hubs) => handleInputChange('transit_hubs', hubs)}
                  />
                </div>

                {/* Dispatch Date */}
                <div>
                  <label className="form-label">
                    <Calendar className="inline w-5 h-5 mr-2 text-blue-600" />
                    Dispatch Date & Time
                  </label>
                  <input
                    type="datetime-local"
                    required
                    className="input-field"
                    value={formData.dispatch_date}
                    onChange={(e) => handleInputChange('dispatch_date', e.target.value)}
                  />
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary w-full flex items-center justify-center text-lg"
                >
                  {loading ? (
                    <>
                      <img 
                        src="https://true2thecode.com/cdn/shop/products/truck-cbec39e7ac0d42a6e1cf001e6c9c4978.gif?crop=center&height=500&v=1574017682&width=600"
                        alt="Loading truck..."
                        className="w-8 h-8 mr-3"
                      />
                      Finding Optimal Route<span className="loading-dots"></span>
                    </>
                  ) : (
                    'Find Route'
                  )}
                </button>
              </form>

              {/* Error Display */}
              {error && (
                <div className="mt-6 p-4 bg-red-50 border-2 border-red-200 rounded-xl">
                  <p className="text-red-700 font-semibold">Error: {error}</p>
                </div>
              )}
            </div>
          </div>

          {/* Map Section */}
          <div className="card p-6 h-[600px] hover-lift">
            <h2 className="text-3xl font-bold mb-6 gradient-text">Route Visualization</h2>
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <Loader2 className="w-16 h-16 animate-spin text-blue-600 mx-auto mb-6" />
                  <p className="text-gray-600 text-lg font-medium">Calculating optimal route<span className="loading-dots"></span></p>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center text-gray-500">
                  <MapPin className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg">Configure route parameters and submit to see visualization</p>
                  <p className="text-sm mt-2">Your route will appear on a dedicated page with detailed analysis</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
