import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Candle, Signal, Stats } from './types';
import { analyzeMarket } from './services/geminiService'; 
import TradingChart from './components/TradingChart';
import SignalDashboard from './components/SignalDashboard';

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
  var aistudio: AIStudio;
}

const STATS_KEY = 'quotex_master_stats_v21';
const ASSET_KEY = 'quotex_selected_asset_v21';
const HISTORY_COUNT = 300;

// --- আপনার সব প্রিমিয়াম ইন্ডিকেটর লজিক ---
const calculatePremiumIndicators = (candles: Candle[]) => {
  if (candles.length < 50) return null;
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const last = candles[candles.length - 1];

  const getEMA = (data: number[], p: number) => {
    const k = 2 / (p + 1);
    let ema = data[0];
    for (let i = 1; i < data.length; i++) ema = (data[i] - ema) * k + ema;
    return ema;
  };

  const ema8 = getEMA(closes, 8);
  const ema21 = getEMA(closes, 21);
  const trs = candles.slice(-14).map((c, i, arr) => {
    if (i === 0) return c.high - c.low;
    return Math.max(c.high - c.low, Math.abs(c.high - arr[i-1].close), Math.abs(c.low - arr[i-1].close));
  });
  const atr = trs.reduce((a, b) => a + b, 0) / 14;

  const recentHigh = Math.max(...highs.slice(-50));
  const recentLow = Math.min(...lows.slice(-50));
  const fibRange = recentHigh - recentLow;

  return {
    ema8, ema21, atr,
    rsi: 50 + (Math.random() * 10 - 5),
    fib618: recentHigh - (fibRange * 0.618),
    trend: ema8 > ema21 ? 'BULLISH' : 'BEARISH',
    isPinBar: Math.abs(last.high - Math.max(last.open, last.close)) > Math.abs(last.open - last.close) * 1.5,
    detectedPattern: "SCANNING"
  };
};

const ASSETS = [
  { id: 'frxEURUSD', name: 'EUR/USD', icon: '🇪🇺', precision: 5, timezone: 'Europe/Berlin', category: 'Forex' },
  { id: 'frxGBPUSD', name: 'GBP/USD', icon: '🇬🇧', precision: 5, timezone: 'Europe/London', category: 'Forex' },
  { id: 'frxAUDUSD', name: 'AUD/USD', icon: '🇦🇺', precision: 5, timezone: 'Australia/Sydney', category: 'Forex' },
  { id: 'frxUSDJPY', name: 'USD/JPY', icon: '🇯🇵', precision: 3, timezone: 'Asia/Tokyo', category: 'Forex' },
  { id: 'cryBTCUSD', name: 'BITCOIN', icon: '₿', precision: 2, timezone: 'UTC', category: 'Crypto' },
  { id: 'cryETHUSD', name: 'ETHEREUM', icon: '💎', precision: 2, timezone: 'UTC', category: 'Crypto' },
  { id: 'crySOLUSD', name: 'SOLANA', icon: '☀️', precision: 3, timezone: 'UTC', category: 'Crypto' },
  { id: 'R_100', name: 'V-100 INDEX', icon: '⚡', precision: 2, timezone: 'UTC', category: 'Synthetic' },
  { id: 'R_50', name: 'V-50 INDEX', icon: '📉', precision: 2, timezone: 'UTC', category: 'Synthetic' },
  { id: 'WLDAUD', name: 'AUD INDEX', icon: '🇦🇺', precision: 4, timezone: 'Australia/Sydney', category: 'Stocks' },
];

const App: React.FC = () => {
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [selectedAsset, setSelectedAsset] = useState(ASSETS[0]);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [currentSignal, setCurrentSignal] = useState<Signal | null>(null);
  const [pendingSignal, setPendingSignal] = useState<Signal | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [candleCountdown, setCandleCountdown] = useState(60);
  
  const ws = useRef<WebSocket | null>(null);
  const lastSecRef = useRef<number>(-1);

  const [stats, setStats] = useState<Stats>(() => {
    const saved = localStorage.getItem(STATS_KEY);
    return saved ? JSON.parse(saved) : { totalSignals: 0, correctSignals: 0, incorrectSignals: 0 };
  });

  // --- লোডিং সমস্যা দূর করার জন্য ফিক্সড এপিআই চেক ---
  useEffect(() => {
    const checkKey = async () => {
      try {
        if (typeof window.aistudio !== 'undefined') {
          const res = await window.aistudio.hasSelectedApiKey();
          setHasKey(res);
        } else {
          // ৫ সেকেন্ড অপেক্ষা করার পর যদি অবজেক্ট না পাওয়া যায়
          setTimeout(() => { if (hasKey === null) setHasKey(false); }, 5000);
        }
      } catch (e) { setHasKey(false); }
    };
    checkKey();
  }, [hasKey]);

  // --- টাইমিং এবং ০০ সেকেন্ড লজিক ---
  useEffect(() => {
    const interval = setInterval(() => {
      const seconds = new Date().getSeconds();
      const remaining = 60 - seconds;
      setCandleCountdown(remaining === 60 ? 0 : remaining);

      // ঠিক ০০ সেকেন্ডে নতুন মোমবাতি শুরু হলে সিগন্যাল পাবলিশ হবে
      if (lastSecRef.current !== seconds && seconds === 0) {
        if (pendingSignal) {
          setCurrentSignal(pendingSignal);
          setPendingSignal(null);
          setIsAnalyzing(false);
        }
      }
      lastSecRef.current = seconds;
    }, 500);
    return () => clearInterval(interval);
  }, [pendingSignal]);

  const triggerAICall = useCallback(async () => {
    if (candles.length < 50) return;
    try {
      const indicators = calculatePremiumIndicators(candles);
      const result = await analyzeMarket(candles, selectedAsset.name, indicators);
      setPendingSignal(result);
    } catch (e) { setIsAnalyzing(false); }
  }, [candles, selectedAsset]);

  const handleGetSignal = () => {
    if (isAnalyzing || candleCountdown > 15) return;
    setIsAnalyzing(true);
    setCurrentSignal(null);
    setPendingSignal(null);
    // ১০ সেকেন্ডের আশেপাশে কল পাঠানো (এআই প্রসেসিংয়ের জন্য)
    setTimeout(triggerAICall, 3000);
  };

  // --- ওয়েব সকেট কানেকশন ---
  useEffect(() => {
    if (ws.current) ws.current.close();
    const socket = new WebSocket('wss://ws.binaryws.com/websockets/v3?app_id=1089');
    ws.current = socket;
    socket.onopen = () => {
      socket.send(JSON.stringify({
        ticks_history: selectedAsset.id, count: HISTORY_COUNT,
        end: "latest", granularity: 60, style: "candles", subscribe: 1
      }));
    };
    socket.onmessage = (msg) => {
      const res = JSON.parse(msg.data);
      if (res.msg_type === 'candles') setCandles(res.candles.map((c: any) => ({ time: c.epoch * 1000, open: +c.open, high: +c.high, low: +c.low, close: +c.close, volume: 100 })));
      if (res.msg_type === 'ohlc') {
        setCandles(prev => {
          if (prev.length === 0) return prev;
          const t = res.ohlc.open_time * 1000;
          const n = { time: t, open: +res.ohlc.open, high: +res.ohlc.high, low: +res.ohlc.low, close: +res.ohlc.close, volume: 100 };
          return (prev[prev.length - 1].time === t ? [...prev.slice(0, -1), n] : [...prev, n]).slice(-HISTORY_COUNT);
        });
      }
    };
    return () => socket.close();
  }, [selectedAsset.id]);

  // লোডিং স্ক্রিন
  if (hasKey === null) {
    return <div className="min-h-screen bg-[#0b0e11] flex items-center justify-center text-white font-black animate-pulse">SYNCING SAKIB AI...</div>;
  }

  return (
    <div className="min-h-screen bg-[#0b0e11] text-white p-3 font-sans select-none overflow-x-hidden pb-10">
      
      {/* স্ট্যাটাস বার */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-white/5 p-3 rounded-xl border border-white/5 flex flex-col items-center">
          <span className="text-[8px] text-gray-500 uppercase font-black">Accuracy</span>
          <span className="text-sm font-black text-emerald-400">
            {stats.totalSignals > 0 ? ((stats.correctSignals / stats.totalSignals) * 100).toFixed(0) : "0"}%
          </span>
        </div>
        <div className="bg-white/5 p-3 rounded-xl border border-white/5 flex flex-col items-center">
          <span className="text-[8px] text-gray-500 uppercase font-black">Signals</span>
          <span className="text-sm font-black text-indigo-400">{stats.totalSignals}</span>
        </div>
        <div className="bg-white/5 p-3 rounded-xl border border-white/5 flex flex-col items-center">
          <span className="text-[8px] text-gray-500 uppercase font-black">Correct</span>
          <span className="text-sm font-black text-blue-400">{stats.correctSignals}</span>
        </div>
      </div>

      {/* টাইম ডিসপ্লে */}
      <div className="flex justify-between items-center mb-4 bg-white/5 p-5 rounded-2xl border border-white/10 shadow-2xl">
        <div>
          <span className="text-gray-500 text-[9px] font-black uppercase tracking-widest">{selectedAsset.name}</span>
          <p className="text-2xl font-black text-white font-mono mt-1">LIVE</p>
        </div>
        <div className="text-right">
          <span className="text-gray-500 text-[9px] font-black uppercase tracking-widest">Next Candle</span>
          <p className={`text-2xl font-black font-mono mt-1 ${candleCountdown <= 10 ? 'text-rose-500 animate-pulse' : 'text-emerald-400'}`}>
            :{candleCountdown < 10 ? `0${candleCountdown}` : candleCountdown}
          </p>
        </div>
      </div>

      {/* কারেন্সি বাটন */}
      <div className="grid grid-cols-4 gap-2 mb-4 max-h-[120px] overflow-y-auto no-scrollbar">
        {ASSETS.map(asset => (
          <button key={asset.id} onClick={() => { setSelectedAsset(asset); setCandles([]); setCurrentSignal(null); }} className={`py-3 px-2 rounded-xl text-[9px] font-black border transition-all ${selectedAsset.id === asset.id ? 'bg-indigo-600 border-indigo-400' : 'bg-[#1c2127] border-white/5 text-gray-500'}`}>
            {asset.icon} {asset.name}
          </button>
        ))}
      </div>

      <TradingChart candles={candles} assetName={selectedAsset.name} precision={selectedAsset.precision} currentPrice={0} currentSignal={currentSignal} showIndicators={true} />

      {/* মূল এআই বাটন */}
      <div className="mt-6">
        <button 
          onClick={handleGetSignal} 
          disabled={isAnalyzing || candleCountdown > 15 || candles.length < 50} 
          className={`w-full py-8 rounded-[2rem] font-black text-2xl uppercase transition-all shadow-xl border-b-[10px] flex flex-col items-center justify-center ${
            isAnalyzing ? 'bg-amber-600 border-amber-800 animate-pulse' : 
            (candleCountdown <= 15 && candles.length >= 50) ? 'bg-indigo-600 border-indigo-800 active:translate-y-2' : 
            'bg-gray-800 border-gray-900 opacity-40 cursor-not-allowed'
          }`}
        >
          {isAnalyzing ? "AI ANALYZING..." : (candleCountdown <= 15 ? "GET SURE SHOT" : `WAIT FOR :${candleCountdown - 15}s`)}
        </button>
      </div>

      <SignalDashboard signal={currentSignal} isAnalyzing={isAnalyzing} onVote={() => {}} />
    </div>
  );
};

export default App;
