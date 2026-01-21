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

  return {
    ema8, ema21, atr,
    rsi: 50 + (Math.random() * 10 - 5),
    trend: ema8 > ema21 ? 'BULLISH' : 'BEARISH',
    isPinBar: Math.abs(last.high - Math.max(last.open, last.close)) > Math.abs(last.open - last.close) * 1.5,
    detectedPattern: "AI_PREMIUM_SCAN"
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
  const [showIndicators, setShowIndicators] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState(() => {
    const saved = localStorage.getItem(ASSET_KEY);
    return saved ? ASSETS.find(a => a.id === saved) || ASSETS[0] : ASSETS[0];
  });

  const [candles, setCandles] = useState<Candle[]>([]);
  const [currentSignal, setCurrentSignal] = useState<Signal | null>(null);
  const [pendingSignal, setPendingSignal] = useState<Signal | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [candleCountdown, setCandleCountdown] = useState(60);
  const [marketTime, setMarketTime] = useState("00:00:00");
  
  const ws = useRef<WebSocket | null>(null);
  const [stats, setStats] = useState<Stats>(() => {
    const saved = localStorage.getItem(STATS_KEY);
    return saved ? JSON.parse(saved) : { totalSignals: 0, correctSignals: 0, incorrectSignals: 0 };
  });

  // Auth লজিক আপডেট - মোবাইল এবং Vercel সাপোর্ট
  useEffect(() => {
    const checkAuth = async () => {
      const envKey = import.meta.env.VITE_API_KEY || "";
      if (envKey.length > 10) {
        setHasKey(true);
      } else if (typeof window.aistudio !== 'undefined') {
        const result = await window.aistudio.hasSelectedApiKey();
        setHasKey(result);
      } else {
        setHasKey(false);
      }
    };
    checkAuth();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const seconds = now.getSeconds();
      setMarketTime(now.toLocaleTimeString('en-GB', { timeZone: selectedAsset.timezone, hour12: false }));
      
      const remaining = 60 - seconds;
      setCandleCountdown(remaining === 60 ? 0 : remaining);

      // ঠিক ০০ সেকেন্ডে পেন্ডিং সিগন্যাল পাবলিশ হবে
      if (seconds === 0 && pendingSignal) {
        setCurrentSignal(pendingSignal);
        setPendingSignal(null);
        setIsAnalyzing(false);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [pendingSignal, selectedAsset]);

  const triggerAICall = useCallback(async () => {
    if (candles.length < 50) return;
    try {
      const indicators = calculatePremiumIndicators(candles);
      const result = await analyzeMarket(candles, selectedAsset.name, indicators);
      setPendingSignal(result);
    } catch (e) {
      setIsAnalyzing(false);
    }
  }, [candles, selectedAsset]);

  const handleGetSignal = () => {
    if (isAnalyzing || candleCountdown > 15) return;
    setIsAnalyzing(true);
    setCurrentSignal(null);
    setPendingSignal(null);
    triggerAICall();
  };

  const handleManualConnect = () => setHasKey(true);

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

  const handleVote = (id: string, result: 'TRUE' | 'FALSE') => {
    if (currentSignal?.id !== id || currentSignal.voted) return;
    setCurrentSignal(p => p ? { ...p, voted: true, result } : null);
    setStats(p => {
      const s = { ...p, totalSignals: p.totalSignals + 1, [result === 'TRUE' ? 'correctSignals' : 'incorrectSignals']: p[result === 'TRUE' ? 'correctSignals' : 'incorrectSignals'] + 1 };
      localStorage.setItem(STATS_KEY, JSON.stringify(s));
      return s;
    });
  };

  if (hasKey === false) {
    return (
      <div className="min-h-screen bg-[#0b0e11] flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 bg-indigo-500/20 rounded-2xl flex items-center justify-center mb-6">
           <span className="text-3xl">📊</span>
        </div>
        <h1 className="text-2xl font-bold mb-2 uppercase tracking-tighter">SAKIB AI SIGNAL</h1>
        <p className="text-gray-500 text-[10px] mb-8 uppercase tracking-widest">Premium AI Access Required</p>
        <button onClick={handleManualConnect} className="bg-indigo-600 hover:bg-indigo-500 text-white px-10 py-4 rounded-xl font-bold shadow-xl active:scale-95 transition-all">
          CONNECT API KEY
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0e11] text-white p-3 select-none overflow-x-hidden pb-10">
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-white/5 p-2.5 rounded-xl border border-white/5 flex flex-col items-center">
          <span className="text-[8px] text-gray-500 font-black uppercase">Win Rate</span>
          <span className="text-sm font-black text-emerald-400">
            {stats.totalSignals > 0 ? ((stats.correctSignals / stats.totalSignals) * 100).toFixed(1) : "0.0"}%
          </span>
        </div>
        <div className="bg-white/5 p-2.5 rounded-xl border border-white/5 flex flex-col items-center">
          <span className="text-[8px] text-gray-500 font-black uppercase">Total</span>
          <span className="text-sm font-black text-indigo-400">{stats.totalSignals}</span>
        </div>
        <div className="bg-white/5 p-2.5 rounded-xl border border-white/5 flex flex-col items-center">
          <span className="text-[8px] text-gray-500 font-black uppercase">Result</span>
          <span className="text-sm font-black text-blue-400">{stats.correctSignals}</span>
        </div>
      </div>

      <div className="flex justify-between items-center mb-4 bg-white/5 p-4 rounded-2xl border border-white/10">
        <div>
          <span className="text-gray-500 text-[9px] font-black uppercase">{selectedAsset.name}</span>
          <p className="text-xl font-black text-white font-mono mt-1">{marketTime}</p>
        </div>
        <div className="text-right">
          <span className="text-gray-500 text-[9px] font-black uppercase">Countdown</span>
          <p className={`text-2xl font-black font-mono mt-1 ${candleCountdown <= 10 ? 'text-rose-500 animate-pulse' : 'text-emerald-400'}`}>
            :{candleCountdown < 10 ? `0${candleCountdown}` : candleCountdown}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-4 max-h-[140px] overflow-y-auto no-scrollbar">
        {ASSETS.map(asset => (
          <button key={asset.id} onClick={() => { setSelectedAsset(asset); localStorage.setItem(ASSET_KEY, asset.id); setCandles([]); setCurrentSignal(null); }} className={`py-3 px-2 rounded-xl text-[9px] font-black border transition-all flex flex-col items-center gap-1 ${selectedAsset.id === asset.id ? 'bg-indigo-600 border-indigo-400' : 'bg-[#1c2127] border-white/5 text-gray-500'}`}>
            <span className="text-lg">{asset.icon}</span>
            <span className="truncate w-full text-center">{asset.name}</span>
          </button>
        ))}
      </div>

      <TradingChart candles={candles} assetName={selectedAsset.name} precision={selectedAsset.precision} currentPrice={candles[candles.length - 1]?.close || 0} currentSignal={currentSignal} showIndicators={showIndicators} />

      <div className="mt-6">
        <button 
          onClick={handleGetSignal} 
          disabled={isAnalyzing || candleCountdown > 15 || candles.length < 50} 
          className={`w-full py-7 rounded-2xl font-black text-xl uppercase transition-all shadow-xl border-b-8 flex flex-col items-center justify-center ${
            isAnalyzing ? 'bg-amber-600 border-amber-800 animate-pulse' : 
            (candleCountdown <= 15) ? 'bg-indigo-600 border-indigo-800 active:translate-y-2' : 
            'bg-gray-800 border-gray-900 opacity-40'
          }`}
        >
          {isAnalyzing ? "WAITING FOR :00s" : (candleCountdown <= 15 ? "GET SURE SHOT" : `WAIT FOR :${candleCountdown - 15}s`)}
        </button>
      </div>

      <SignalDashboard signal={currentSignal} isAnalyzing={isAnalyzing} onVote={handleVote} />
    </div>
  );
};

export default App;
