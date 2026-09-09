'use client';

import { useEffect, useState, useRef } from 'react';

interface Match {
  id: string;
  league: string;
  day: string;
  time: string;
  home: { name: string; logo: string };
  away: { name: string; logo: string };
  pickOdds: number;
  prediction: {
    homeWin: number;
    draw: number;
    awayWin: number;
    predictedScore: string;
    bestBet: string;
    confidence: string;
    keyAbsences: string;
    tacticalEdge: string;
  };
}

interface HistoryItem {
  id: string;
  league: string;
  home: { name: string; logo: string };
  away: { name: string; logo: string };
  bestBet: string;
  predictedScore: string;
  finalScore: string;
  status: 'WON' | 'LOST' | 'PENDING';
  odds?: number;
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<'picks' | 'history'>('picks');
  const [matches, setMatches] = useState<Match[]>([]);
  const [history, setHistory] = useState<Record<string, HistoryItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedHistoryDate, setExpandedHistoryDate] = useState<string | null>(null);
  const [pushStatus, setPushStatus] = useState<string | null>(null);

  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);
  const touchEndX = useRef<number>(0);
  const touchEndY = useRef<number>(0);

  const fetchData = async () => {
    try {
      const res = await fetch('/api/predictions');
      const data = await res.json();
      setMatches(data.matches || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }

    try {
      const histRes = await fetch('/api/predictions?type=history');
      const histData = await histRes.json();
      setHistory(histData.history || {});
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleManualUpdate = async () => {
    setRefreshing(true);
    try {
      await fetch('/api/cron/tips');
      await fetchData();
    } catch (err) {
      console.error('Failed to update predictions', err);
    } finally {
      setRefreshing(false);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const toggleHistoryExpand = (dateKey: string) => {
    setExpandedHistoryDate((prev) => (prev === dateKey ? null : dateKey));
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX;
    touchStartY.current = e.targetTouches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX;
    touchEndY.current = e.targetTouches[0].clientY;
  };

  const handleTouchEnd = () => {
    const diffX = touchStartX.current - touchEndX.current;
    const diffY = Math.abs(touchStartY.current - touchEndY.current);
    const minSwipeDistance = 60;

    if (Math.abs(diffX) > minSwipeDistance && Math.abs(diffX) > diffY * 1.5) {
      if (diffX > 0 && activeTab === 'picks') {
        setActiveTab('history');
      } else if (diffX < 0 && activeTab === 'history') {
        setActiveTab('picks');
      }
    }
  };

  const handleBellClick = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPushStatus('Push not supported');
      setTimeout(() => setPushStatus(null), 4000);
      return;
    }

    if (Notification.permission === 'denied') {
      setPushStatus('Notifications blocked in browser');
      setTimeout(() => setPushStatus(null), 5000);
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        const registration = await navigator.serviceWorker.register('/sw.js');
        const publicVapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        
        if (!publicVapidKey) {
          setPushStatus('Notifications active 🔔');
          setTimeout(() => setPushStatus(null), 4000);
          return;
        }

        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: publicVapidKey,
        });

        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(subscription),
        });

        setPushStatus('Notifications Enabled 🔔');
        setTimeout(() => setPushStatus(null), 4000);
      } else {
        setPushStatus('Permission dismissed');
        setTimeout(() => setPushStatus(null), 4000);
      }
    } catch {
      setPushStatus('Failed to enable push');
      setTimeout(() => setPushStatus(null), 4000);
    }
  };

  const STARTING_BANKROLL = 10.0;
  const DAILY_STAKE = 10.0;

  const todayCombinedOdds = matches.length > 0
    ? matches.reduce((acc, m) => acc * (m.pickOdds || 1.85), 1)
    : 1.0;
  const todayPotentialPayout = Number((DAILY_STAKE * todayCombinedOdds).toFixed(2));

  let netPnL = 0;
  let totalProfit = 0;

  const parlayDays = Object.entries(history).map(([dateKey, items]) => {
    const isCompleted = items.length > 0 && items.every((i) => i.status !== 'PENDING');
    const isWin = items.length > 0 && items.every((i) => i.status === 'WON');
    const isLost = items.some((i) => i.status === 'LOST');

    const combinedOdds = items.reduce((acc, curr) => acc * (curr.odds || 1.85), 1);
    const payout = isWin ? Number((DAILY_STAKE * combinedOdds).toFixed(2)) : 0;
    const profit = isWin ? payout - DAILY_STAKE : isLost ? -DAILY_STAKE : 0;

    if (isCompleted) {
      netPnL += profit;
      totalProfit += profit;
    }

    return {
      dateKey,
      items,
      isCompleted,
      isWin,
      isLost,
      payout,
      profit,
      combinedOdds: combinedOdds.toFixed(2),
    };
  });

  const currentBalance = Number((STARTING_BANKROLL + netPnL).toFixed(2));
  const isPositiveTotal = totalProfit >= 0;
  const totalDiffNum = Math.abs(totalProfit);
  const totalDiff = totalDiffNum.toFixed(2);
  const percentReturn = ((totalDiffNum / STARTING_BANKROLL) * 100).toFixed(1);

  return (
    <div className="min-h-screen bg-[#000000] text-white flex justify-center font-[SF Pro Display, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif] antialiased selection:bg-[#32d74b] selection:text-black">
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600;700&display=swap');
        .font-sans {
          font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
        }
        .font-mono {
          font-family: 'JetBrains Mono', monospace;
        }
      `}</style>

      {/* Main Liquid Glass Mobile Container */}
      <div 
        className="w-full max-w-[390px] min-h-screen relative flex flex-col pb-28 shadow-2xl overflow-hidden bg-[#000000]"
        style={{
          background: 'radial-gradient(circle at 50% -10%, rgba(50, 215, 75, 0.06) 0%, rgba(0, 0, 0, 1) 60%)'
        }}
      >
        
        {/* Top Header */}
        <header className="px-5 pt-8 pb-3 flex items-center justify-between relative z-10 shrink-0">
          <div className="flex flex-col">
            <h2 className="text-[26px] font-extrabold text-white tracking-tight leading-tight">Welcome back!</h2>
          </div>

          <div className="flex items-center">
            <button 
              onClick={handleBellClick}
              className="w-11 h-11 rounded-full bg-[#121214] border border-[#232328] flex items-center justify-center text-white hover:text-[#32d74b] transition-all shadow-lg"
              title="Notifications"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </button>
          </div>
        </header>

        {pushStatus && (
          <div className="mx-5 mt-2 bg-[#32d74b]/15 backdrop-blur-xl border border-[#32d74b]/30 text-[#32d74b] text-[11px] font-medium py-2 px-3 rounded-2xl text-center shadow-lg z-20 font-mono">
            {pushStatus}
          </div>
        )}

        {/* SWIPABLE CONTENT VIEWS */}
        <div 
          className="flex-1 flex flex-col min-h-0 relative overflow-hidden"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div 
            className="flex w-[200%] h-full transition-transform duration-300 ease-out"
            style={{ transform: activeTab === 'picks' ? 'translateX(0%)' : 'translateX(-50%)' }}
          >
            
            {/* ===================== TAB 1: PICKS / HOME ===================== */}
            <div className="w-1/2 h-full flex flex-col shrink-0 overflow-y-auto px-5 pb-6 space-y-3.5">
              
              {/* Available Balance Liquid Glass Card */}
              <div className="bg-[#121214]/80 backdrop-blur-2xl border border-white/[0.08] rounded-[28px] p-5 shadow-2xl relative overflow-hidden">
                <div className="flex items-start justify-between">
                  <span className="text-[13px] font-medium text-[#8e8e93] tracking-wide">
                    Available Balance
                  </span>
                  <div className="w-7 h-7 rounded-full bg-white/[0.06] border border-white/[0.1] flex items-center justify-center text-[#8e8e93]">
                    <svg className="w-3.5 h-3.5 rotate-45" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
                  </div>
                </div>

                <div className="text-[34px] font-extrabold text-white tracking-tight leading-none mt-2 font-mono">
                  €{currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace('.', ',')}
                </div>
                
                <div className="mt-2.5 flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1 text-[12px] font-bold font-mono ${
                    isPositiveTotal ? 'text-[#32d74b]' : 'text-[#ff453a]'
                  }`}>
                    ↗ {isPositiveTotal ? `+€${totalDiff}` : `-€${totalDiff}`} ({percentReturn}%)
                  </span>
                </div>
              </div>

              {/* Dual Side-by-Side Liquid Glass Cards (Parlay Odds & Winnings) */}
              <div className="grid grid-cols-2 gap-3.5">
                
                {/* Parlay Odds Card */}
                <div className="bg-[#121214]/80 backdrop-blur-2xl border border-white/[0.08] rounded-[22px] p-3.5 flex items-center gap-3 shadow-lg">
                  <div className="w-9 h-9 rounded-full bg-white/[0.06] border border-white/[0.1] flex items-center justify-center text-white shrink-0">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                  </div>
                  <div className="min-w-0">
                    <span className="text-[11px] text-[#8e8e93] font-medium block truncate">Parlay Odds</span>
                    <div className="text-[16px] font-extrabold text-white tracking-tight font-mono mt-0.5">
                      {todayCombinedOdds.toFixed(2)}x
                    </div>
                  </div>
                </div>

                {/* Possible Winnings Card */}
                <div className="bg-[#121214]/80 backdrop-blur-2xl border border-white/[0.08] rounded-[22px] p-3.5 flex items-center gap-3 shadow-lg">
                  <div className="w-9 h-9 rounded-full bg-white/[0.06] border border-white/[0.1] flex items-center justify-center text-[#32d74b] shrink-0">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </div>
                  <div className="min-w-0">
                    <span className="text-[11px] text-[#8e8e93] font-medium block truncate">Winnings</span>
                    <div className="text-[16px] font-extrabold text-[#32d74b] tracking-tight font-mono mt-0.5">
                      €{todayPotentialPayout.toFixed(2)}
                    </div>
                  </div>
                </div>

              </div>

              {/* Transactions / Fixtures Header with Manual Refresh Button */}
              <div className="pt-3 flex items-center justify-between">
                <span className="text-base font-bold text-white tracking-tight">Today's Fixtures</span>
                <button
                  onClick={handleManualUpdate}
                  disabled={refreshing}
                  className="flex items-center gap-1.5 text-xs font-semibold text-[#32d74b] bg-[#32d74b]/10 hover:bg-[#32d74b]/20 border border-[#32d74b]/30 px-3 py-1.5 rounded-xl transition-all disabled:opacity-50 font-mono shadow-sm"
                  title="Reload/Update Tips via API"
                >
                  <svg className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span>{refreshing ? 'Updating...' : 'Refresh'}</span>
                </button>
              </div>

              {/* Games / Fixtures List */}
              <div className="space-y-3">
                {loading ? (
                  <div className="py-10 flex flex-col items-center justify-center gap-2">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span className="text-[11px] text-[#8e8e93] font-mono">Loading matches...</span>
                  </div>
                ) : matches.length === 0 ? (
                  <div className="text-center py-8 text-[#8e8e93] text-xs font-mono">
                    No active fixtures today
                  </div>
                ) : (
                  matches.map((m) => {
                    const isExpanded = expandedId === m.id;

                    return (
                      <div
                        key={m.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpand(m.id);
                        }}
                        className="bg-[#121214]/80 backdrop-blur-2xl border border-white/[0.08] hover:border-white/[0.15] rounded-[20px] p-4 cursor-pointer transition-all shadow-lg"
                      >
                        <div className="flex items-center justify-between">
                          
                          <div className="flex items-center gap-3.5 min-w-0 pr-2">
                            <div className="flex flex-col gap-1 shrink-0">
                              {[m.home, m.away].map((team) => (
                                <div
                                  key={team.name}
                                  className="w-7 h-7 rounded-[8px] bg-white/[0.06] border border-white/[0.1] flex items-center justify-center p-1 overflow-hidden"
                                >
                                  {team.logo ? (
                                    <img
                                      src={team.logo}
                                      alt=""
                                      className="w-full h-full object-contain"
                                      referrerPolicy="no-referrer"
                                    />
                                  ) : (
                                    <span className="text-[10px] font-bold text-white">{team.name[0]}</span>
                                  )}
                                </div>
                              ))}
                            </div>

                            {/* Stacked Teams Name (Home on top, Away under) */}
                            <div className="flex flex-col gap-1 min-w-0">
                              <span className="text-xs font-bold text-white truncate tracking-tight">
                                {m.home.name}
                              </span>
                              <span className="text-xs font-bold text-zinc-300 truncate tracking-tight">
                                {m.away.name}
                              </span>
                              <span className="text-[10px] text-[#8e8e93] font-mono mt-0.5">
                                {m.time} • {m.league}
                              </span>
                            </div>
                          </div>

                          {/* Best Bet & Odds */}
                          <div className="flex flex-col items-end shrink-0 pl-2">
                            <span className="text-xs font-extrabold text-[#32d74b] bg-[#32d74b]/10 px-2.5 py-0.5 rounded-lg border border-[#32d74b]/20 font-mono">
                              {m.prediction.bestBet}
                            </span>
                            <span className="text-[11px] font-bold text-white mt-1.5 font-mono">
                              {m.pickOdds ? m.pickOdds.toFixed(2) : '1.85'}x
                            </span>
                          </div>

                        </div>

                        {isExpanded && (
                          <div className="mt-3 pt-3 border-t border-white/[0.08] text-xs space-y-1.5 animate-fadeIn">
                            <div className="flex justify-between text-[11px] text-[#8e8e93] font-mono">
                              <span>Projected: <strong className="text-white">{m.prediction.predictedScore}</strong></span>
                              <span>Confidence: <strong className="text-[#32d74b]">{m.prediction.confidence}</strong></span>
                            </div>
                            <p className="text-[#a0a8be] text-[11px] bg-black/40 p-2.5 rounded-[14px] border border-white/[0.04] leading-relaxed">
                              {m.prediction.tacticalEdge}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

            </div>

            {/* ===================== TAB 2: HISTORY ===================== */}
            <div className="w-1/2 h-full flex flex-col shrink-0 overflow-y-auto px-5 pb-6">
              
              <div className="pt-3 pb-3">
                <span className="text-base font-bold text-white tracking-tight">Transaction Logs</span>
              </div>

              <div className="space-y-3 flex-1">
                {parlayDays.length === 0 ? (
                  <div className="text-center py-20 text-[#8e8e93] text-xs font-mono">
                    No history recorded yet
                  </div>
                ) : (
                  parlayDays
                    .sort((a, b) => b.dateKey.localeCompare(a.dateKey))
                    .map((day) => {
                      const isPending = !day.isCompleted;
                      const isHistoryExpanded = expandedHistoryDate === day.dateKey;

                      return (
                        <div
                          key={day.dateKey}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleHistoryExpand(day.dateKey);
                          }}
                          className="bg-[#121214]/80 backdrop-blur-2xl border border-white/[0.08] rounded-[20px] p-4 cursor-pointer transition-all shadow-lg"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-white/[0.06] border border-white/[0.1] flex items-center justify-center text-white font-bold text-xs font-mono">
                                📅
                              </div>
                              <div>
                                <span className="text-xs font-bold text-white block font-mono">{day.dateKey}</span>
                                <span className="text-[11px] text-[#8e8e93] font-mono">{day.items.length} legs • {day.combinedOdds}x</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {isPending ? (
                                <span className="text-[11px] font-medium text-[#ff9f0a] bg-[#ff9f0a]/15 border border-[#ff9f0a]/30 px-2.5 py-1 rounded-lg font-mono">Pending</span>
                              ) : day.isWin ? (
                                <span className="text-[11px] font-bold text-[#32d74b] bg-[#32d74b]/15 border border-[#32d74b]/30 px-2.5 py-1 rounded-lg font-mono">+€{day.profit.toFixed(2)}</span>
                              ) : (
                                <span className="text-[11px] font-bold text-[#ff453a] bg-[#ff453a]/15 border border-[#ff453a]/30 px-2.5 py-1 rounded-lg font-mono">-€10.00</span>
                              )}
                              <svg className={`w-4 h-4 text-[#8e8e93] transition-transform ${isHistoryExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                            </div>
                          </div>

                          {isHistoryExpanded && (
                            <div className="mt-3 pt-3 border-t border-white/[0.08] space-y-2 text-xs" onClick={(e) => e.stopPropagation()}>
                              {day.items.map((leg) => (
                                <div key={leg.id} className="bg-black/40 border border-white/[0.04] rounded-[14px] p-2.5 flex items-center justify-between">
                                  <div className="flex flex-col gap-0.5 min-w-0 pr-2">
                                    <span className="text-white font-semibold truncate">{leg.home.name} vs {leg.away.name}</span>
                                    <span className="text-[11px] text-[#8e8e93] font-mono">Pick: <strong className="text-[#32d74b]">{leg.bestBet}</strong></span>
                                  </div>
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 font-mono ${leg.status === 'WON' ? 'text-[#32d74b] bg-[#32d74b]/15' : leg.status === 'LOST' ? 'text-[#ff453a] bg-[#ff453a]/15' : 'text-[#ff9f0a] bg-[#ff9f0a]/15'}`}>
                                    {leg.status}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })
                )}
              </div>

            </div>

          </div>
        </div>

        {/* Floating Bottom Menu Bar (Picks / History Navigation) */}
        <div className="fixed bottom-4 max-w-[390px] w-full px-5 z-40">
          <nav className="bg-[#121214]/90 backdrop-blur-2xl border border-white/[0.1] p-1.5 rounded-2xl shadow-2xl flex items-center justify-between relative">
            
            <div 
              className={`absolute top-1.5 bottom-1.5 w-[calc(50%-6px)] rounded-xl bg-[#32d74b] shadow-lg shadow-[#32d74b]/20 transition-transform duration-300 ease-out ${
                activeTab === 'history' ? 'translate-x-[calc(100%+4px)]' : 'translate-x-0'
              }`} 
            />

            <button
              onClick={() => setActiveTab('picks')}
              className={`relative z-10 flex-1 py-3 flex items-center justify-center gap-2 text-xs font-bold tracking-wider transition-colors ${
                activeTab === 'picks' ? 'text-black' : 'text-[#8e8e93] hover:text-white'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              <span>PICKS</span>
            </button>

            <button
              onClick={() => setActiveTab('history')}
              className={`relative z-10 flex-1 py-3 flex items-center justify-center gap-2 text-xs font-bold tracking-wider transition-colors ${
                activeTab === 'history' ? 'text-black' : 'text-[#8e8e93] hover:text-white'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span>LOGS</span>
            </button>

          </nav>
        </div>

      </div>
    </div>
  );
}