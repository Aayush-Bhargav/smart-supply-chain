'use client';

import React from 'react';
import { AlertTriangle, CheckCircle, X, MapPin, ArrowRight, TrendingDown, TrendingUp, Clock, Shield } from 'lucide-react';

interface ReRoutePreviewProps {
  shipmentId: string;
  previewData: {
    updated_route: any[];
    recommended_routes: any[];
    message: string;
    high_risk_cities: string[];
    current_route: Array<{
      city: string;
      status: string;
      mode?: string;
      days?: number;
    }>;
    current_total_days: number;
    current_risk_level: number;
    current_high_risk_cities: string[];
    avoided_high_risk_cities: string[];
  };
  onApply: (shipmentId: string) => void;
  onDismiss: (shipmentId: string) => void;
}

export default function ReRoutePreview({
  shipmentId,
  previewData,
  onApply,
  onDismiss
}: ReRoutePreviewProps) {
  const {
    updated_route,
    recommended_routes,
    message,
    high_risk_cities,
    current_route,
    current_total_days,
    current_risk_level,
    current_high_risk_cities,
    avoided_high_risk_cities,
  } = previewData;

  const proposedRoute = recommended_routes[0];
  const proposedTransitDays = Number(proposedRoute?.total_transit_days || 0);
  const proposedRiskLevel = Number(proposedRoute?.route_risk_level || 0);
  const transitDelta = proposedTransitDays - current_total_days;
  const riskDelta = proposedRiskLevel - current_risk_level;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(2, 8, 20, 0.85)', backdropFilter: 'blur(8px)' }}>
      
      {/* Modal */}
      <div
        className="relative w-full mx-4 rounded-2xl overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto"
        style={{
          maxWidth: '780px',
          background: 'linear-gradient(145deg, #0a1628 0%, #0d1f3c 50%, #091525 100%)',
          border: '1px solid rgba(56, 189, 248, 0.15)',
          boxShadow: '0 0 0 1px rgba(56,189,248,0.05), 0 32px 64px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)',
        }}
      >
        {/* Top accent bar */}
        <div style={{ height: '2px', background: 'linear-gradient(90deg, transparent, #38bdf8 30%, #06b6d4 60%, transparent)', opacity: 0.8 }} />

        {/* Subtle grid texture overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(circle at 70% 20%, rgba(56,189,248,0.04) 0%, transparent 60%), radial-gradient(circle at 20% 80%, rgba(6,182,212,0.03) 0%, transparent 50%)',
          }}
        />

        <div className="relative p-6">

          {/* ── Header ── */}
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-4">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.2)' }}
              >
                <AlertTriangle className="w-5 h-5" style={{ color: '#fbbf24' }} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white tracking-tight">Route Update Available</h3>
                <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>AI-detected disruption on current path</p>
              </div>
            </div>
            <button
              onClick={() => onDismiss(shipmentId)}
              className="p-2 rounded-lg transition-all"
              style={{ color: '#475569' }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)';
                (e.currentTarget as HTMLElement).style.color = '#94a3b8';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = 'transparent';
                (e.currentTarget as HTMLElement).style.color = '#475569';
              }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* ── High Risk Cities ── */}
          {high_risk_cities.length > 0 && (
            <div
              className="mb-5 p-4 rounded-xl flex items-start gap-3"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
            >
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: '#f87171' }} />
              <div>
                <p className="text-xs font-semibold mb-2" style={{ color: '#fca5a5', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  High-risk nodes detected
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {high_risk_cities.map((city, i) => (
                    <span
                      key={i}
                      className="px-2.5 py-1 rounded-md text-xs font-medium"
                      style={{ background: 'rgba(239,68,68,0.15)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.25)' }}
                    >
                      {city}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Route Comparison ── */}
          <div className="mb-5 grid lg:grid-cols-2 gap-3">

            {/* Current route */}
            <div
              className="rounded-xl p-4"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              <p className="text-xs font-semibold mb-3" style={{ color: '#64748b', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                Current route
              </p>
              <div className="space-y-2">
                {current_route.slice(0, 6).map((stop, i) => {
                  const isRisk = current_high_risk_cities.includes(stop.city);
                  return (
                    <div key={i} className="flex items-center gap-2.5">
                      <div
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ background: isRisk ? '#f87171' : 'rgba(148,163,184,0.4)' }}
                      />
                      <span
                        className="text-sm"
                        style={{ color: isRisk ? '#fca5a5' : '#94a3b8' }}
                      >
                        {stop.city}
                      </span>
                      {stop.mode && i < current_route.length - 1 && (
                        <span
                          className="ml-auto text-[10px] px-1.5 py-0.5 rounded"
                          style={{ background: 'rgba(255,255,255,0.05)', color: '#475569', border: '1px solid rgba(255,255,255,0.08)' }}
                        >
                          {stop.mode}
                        </span>
                      )}
                    </div>
                  );
                })}
                {current_route.length > 6 && (
                  <p className="text-xs" style={{ color: '#334155' }}>+{current_route.length - 6} more stops</p>
                )}
              </div>
            </div>

            {/* Proposed route */}
            <div
              className="rounded-xl p-4 relative overflow-hidden"
              style={{ background: 'rgba(56,189,248,0.05)', border: '1px solid rgba(56,189,248,0.15)' }}
            >
              <div
                className="absolute top-0 right-0 w-24 h-24 pointer-events-none"
                style={{ background: 'radial-gradient(circle, rgba(56,189,248,0.06) 0%, transparent 70%)' }}
              />
              <div className="flex items-center gap-2 mb-3">
                <MapPin className="w-3.5 h-3.5" style={{ color: '#38bdf8' }} />
                <p className="text-xs font-semibold" style={{ color: '#38bdf8', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  Proposed route
                </p>
              </div>
              <div className="space-y-2">
                {updated_route.slice(0, 6).map((stop: any, i: number) => (
                  <div key={i} className="flex items-center gap-2.5">
                    <div
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ background: 'rgba(56,189,248,0.6)' }}
                    />
                    <span className="text-sm" style={{ color: '#bae6fd' }}>
                      {stop.city || stop.from || stop}
                    </span>
                    {stop.mode && i < updated_route.length - 1 && (
                      <span
                        className="ml-auto text-[10px] px-1.5 py-0.5 rounded"
                        style={{ background: 'rgba(56,189,248,0.1)', color: '#7dd3fc', border: '1px solid rgba(56,189,248,0.2)' }}
                      >
                        {stop.mode}
                      </span>
                    )}
                  </div>
                ))}
                {updated_route.length > 6 && (
                  <p className="text-xs" style={{ color: '#1e3a5f' }}>+{updated_route.length - 6} more stops</p>
                )}
              </div>
            </div>
          </div>

          {/* ── Stats Row ── */}
          <div className="mb-5 grid grid-cols-2 xl:grid-cols-4 gap-3">
            {[
              {
                label: 'Current time',
                value: `${current_total_days.toFixed(1)} days`,
                sub: null,
                icon: <Clock className="w-3.5 h-3.5" />,
                accent: 'rgba(255,255,255,0.04)',
                border: 'rgba(255,255,255,0.07)',
                iconColor: '#475569',
              },
              {
                label: 'Proposed time',
                value: `${proposedTransitDays.toFixed(1)} days`,
                sub: transitDelta <= 0
                  ? `${Math.abs(transitDelta).toFixed(1)} days faster`
                  : `${transitDelta.toFixed(1)} days slower`,
                subColor: transitDelta <= 0 ? '#34d399' : '#fb923c',
                subIcon: transitDelta <= 0
                  ? <TrendingDown className="w-3 h-3" />
                  : <TrendingUp className="w-3 h-3" />,
                icon: <Clock className="w-3.5 h-3.5" />,
                accent: 'rgba(56,189,248,0.06)',
                border: 'rgba(56,189,248,0.15)',
                iconColor: '#38bdf8',
              },
              {
                label: 'Current risk',
                value: `${Math.round(current_risk_level * 100)}%`,
                sub: null,
                icon: <Shield className="w-3.5 h-3.5" />,
                accent: 'rgba(255,255,255,0.04)',
                border: 'rgba(255,255,255,0.07)',
                iconColor: '#475569',
              },
              {
                label: 'Proposed risk',
                value: `${Math.round(proposedRiskLevel * 100)}%`,
                sub: riskDelta <= 0
                  ? `${Math.round(Math.abs(riskDelta) * 100)}% lower`
                  : `${Math.round(Math.abs(riskDelta) * 100)}% higher`,
                subColor: riskDelta <= 0 ? '#34d399' : '#f87171',
                subIcon: riskDelta <= 0
                  ? <TrendingDown className="w-3 h-3" />
                  : <TrendingUp className="w-3 h-3" />,
                icon: <Shield className="w-3.5 h-3.5" />,
                accent: 'rgba(56,189,248,0.06)',
                border: 'rgba(56,189,248,0.15)',
                iconColor: '#38bdf8',
              },
            ].map((stat, i) => (
              <div
                key={i}
                className="rounded-xl p-4"
                style={{ background: stat.accent, border: `1px solid ${stat.border}` }}
              >
                <div className="flex items-center gap-1.5 mb-2" style={{ color: stat.iconColor }}>
                  {stat.icon}
                  <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#475569' }}>
                    {stat.label}
                  </p>
                </div>
                <p className="text-xl font-bold text-white">{stat.value}</p>
                {stat.sub && (
                  <div className="flex items-center gap-1 mt-1" style={{ color: stat.subColor }}>
                    {stat.subIcon}
                    <p className="text-xs font-medium">{stat.sub}</p>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* ── Exposure / Avoided ── */}
          <div className="mb-6 grid lg:grid-cols-2 gap-3">
            <div
              className="rounded-xl p-4"
              style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}
            >
              <p className="text-xs font-semibold mb-3" style={{ color: '#fca5a5', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Current exposure
              </p>
              {current_high_risk_cities.length === 0 ? (
                <p className="text-sm" style={{ color: '#64748b' }}>No flagged cities on current path.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {current_high_risk_cities.map((city) => (
                    <span
                      key={city}
                      className="px-2.5 py-1 rounded-md text-xs font-medium"
                      style={{ background: 'rgba(239,68,68,0.12)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.2)' }}
                    >
                      {city}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div
              className="rounded-xl p-4"
              style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.15)' }}
            >
              <p className="text-xs font-semibold mb-3" style={{ color: '#6ee7b7', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Impact avoided
              </p>
              {avoided_high_risk_cities.length === 0 ? (
                <p className="text-sm" style={{ color: '#64748b' }}>Reduces exposure severity on existing path.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {avoided_high_risk_cities.map((city) => (
                    <span
                      key={city}
                      className="px-2.5 py-1 rounded-md text-xs font-medium"
                      style={{ background: 'rgba(52,211,153,0.12)', color: '#6ee7b7', border: '1px solid rgba(52,211,153,0.2)' }}
                    >
                      {city}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Actions ── */}
          <div className="flex gap-3">
            <button
              onClick={() => onApply(shipmentId)}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold text-sm transition-all"
              style={{
                background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                color: '#fff',
                border: '1px solid rgba(56,189,248,0.3)',
                boxShadow: '0 4px 16px rgba(2,132,199,0.25)',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)';
                (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 24px rgba(14,165,233,0.35)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)';
                (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(2,132,199,0.25)';
              }}
            >
              <CheckCircle className="w-4 h-4" />
              Apply new route
            </button>

            <button
              onClick={() => onDismiss(shipmentId)}
              className="flex-1 px-4 py-3 rounded-xl font-semibold text-sm transition-all"
              style={{
                background: 'rgba(255,255,255,0.04)',
                color: '#94a3b8',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)';
                (e.currentTarget as HTMLElement).style.color = '#cbd5e1';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
                (e.currentTarget as HTMLElement).style.color = '#94a3b8';
              }}
            >
              Keep current
            </button>
          </div>

          {/* ── Footer note ── */}
          <p className="text-center text-xs mt-4" style={{ color: '#334155' }}>
            Completed checkpoints will be preserved if you apply the new route
          </p>

        </div>
      </div>
    </div>
  );
}