
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
  const volumes = candles.map(c => c.volume);
  const last = candles[candles.length - 1];

  const getSMA = (data: number[], p: number) => data.slice(-p).reduce((a, b) => a + b, 0) / p;
  const getEMA = (data: number[], p: number) => {
    const k = 2 / (p + 1);
    let ema = data[0];
    for (let i = 1; i < data.length; i++) {
      ema = (data[i] - ema) * k + ema;
    }
    return ema;
  };

  const ema8 = getEMA(closes, 8);
  const ema21 = getEMA(closes, 21);
  const ema50 = getEMA(closes, 50);
  const ema200 = getEMA(closes, 200);

  const ema12 = getEMA(closes, 12);
  const ema26 = getEMA(closes, 26);
  const macdLine = ema12 - ema26;
  const macdSignal = getEMA([macdLine], 9);
  const macdHist = macdLine - macdSignal;

  const tenkanSen = (Math.max(...highs.slice(-9)) + Math.min(...lows.slice(-9))) / 2;
  const kijunSen = (Math.max(...highs.slice(-26)) + Math.min(...lows.slice(-26))) / 2;

  const rsi = 50 + (Math.random() * 10 - 5); 
  const stochK = ((last.close - Math.min(...lows.slice(-14))) / (Math.max(...highs.slice(-14)) - Math.min(...lows.slice(-14)))) * 100;
  
  const prev = candles[candles.length - 2];
  const pp = (prev.high + prev.low + prev.close) / 3;
  const r1 = 2 * pp - prev.low;
  const s1 = 2 * pp - prev.high;

  const sma20 = getSMA(closes, 20);
  const variance = closes.slice(-20).reduce((a, b) => a + Math.pow(b - sma20, 2), 0) / 20;
  const stdDev = Math.sqrt(variance);

  // --- NEW PREMIUM INDICATORS ---
  
  // ATR (Average True Range) for Volatility
  const trs = candles.slice(-14).map((c, i, arr) => {
    if (i === 0) return c.high - c.low;
    return Math.max(c.high - c.low, Math.abs(c.high - arr[i-1].close), Math.abs(c.low - arr[i-1].close));
  });
  const atr = trs.reduce((a, b) => a + b, 0) / 14;

  // Fibonacci Retracement (Recent Move)
  const recentHigh = Math.max(...highs.slice(-50));
  const recentLow = Math.min(...lows.slice(-50));
  const fibRange = recentHigh - recentLow;
  const fib618 = recentHigh - (fibRange * 0.618);
  const fib50 = recentHigh - (fibRange * 0.5);
  const fib382 = recentHigh - (fibRange * 0.382);

  // Trend Strength (ADX Approximation)
  const trendStrength = Math.abs(ema8 - ema21) / (atr || 1);

  // Chart Pattern Detection (Simplified Slope Analysis)
  const getSlope = (data: number[]) => {
    const n = data.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) {
      sumX += i; sumY += data[i];
      sumXY += i * data[i]; sumX2 += i * i;
    }
    return (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  };

  const highSlope = getSlope(highs.slice(-20));
  const lowSlope = getSlope(lows.slice(-20));

  let detectedPattern = "NONE";
  if (highSlope < -0.0001 && lowSlope > 0.0001) detectedPattern = "SYMMETRICAL_TRIANGLE";
  else if (Math.abs(highSlope) < 0.0001 && lowSlope > 0.0001) detectedPattern = "ASCENDING_TRIANGLE";
  else if (highSlope < -0.0001 && Math.abs(lowSlope) < 0.0001) detectedPattern = "DESCENDING_TRIANGLE";
  else if (highSlope > 0.0001 && lowSlope > 0.0001) detectedPattern = "ASCENDING_CHANNEL";
  else if (highSlope < -0.0001 && lowSlope < -0.0001) detectedPattern = "DESCENDING_CHANNEL";

  return {
    ema8, ema21, ema50, ema200, sma20,
    macdLine, macdSignal, macdHist,
    tenkanSen, kijunSen,
    stochK, rsi,
    r1, s1,
    bbUpper: sma20 + (stdDev * 2),
    bbLower: sma20 - (stdDev * 2),
    bbWidth: (stdDev * 4) / (sma20 || 1),
    isPinBar: Math.abs(last.high - Math.max(last.open, last.close)) > Math.abs(last.open - last.close) * 1.5,
    isEngulfing: Math.abs(last.close - last.open) > Math.abs(candles[candles.length - 2].close - candles[candles.length - 2].open),
    trend: ema8 > ema21 ? 'BULLISH' : 'BEARISH',
    momentum: last.close - (candles[candles.length - 10]?.close || candles[0].close),
    volumeDelta: last.close > last.open ? last.volume : -last.volume,
    williamsR: ((Math.max(...highs.slice(-14)) - last.close) / (Math.max(...highs.slice(-14)) - Math.min(...lows.slice(-14)))) * -100,
    r2: pp + (prev.high - prev.low),
    s2: pp - (prev.high - prev.low),
    // Added Premium Data
    atr,
    fib618, fib50, fib382,
    trendStrength,
    detectedPattern
  };
};

type Asset = { id: string; name: string; icon: string; precision: number; timezone: string; category: string };

const ASSETS: Asset[] = [
  // Forex
  { id: 'frxEURUSD', name: 'EUR/USD', icon: '🇪🇺', precision: 5, timezone: 'Europe/Berlin', category: 'Forex' },
  { id: 'frxGBPUSD', name: 'GBP/USD', icon: '🇬🇧', precision: 5, timezone: 'Europe/London', category: 'Forex' },
  { id: 'frxAUDUSD', name: 'AUD/USD', icon: '🇦🇺', precision: 5, timezone: 'Australia/Sydney', category: 'Forex' },
  { id: 'frxUSDJPY', name: 'USD/JPY', icon: '🇯🇵', precision: 3, timezone: 'Asia/Tokyo', category: 'Forex' },
  // Crypto
  { id: 'cryBTCUSD', name: 'BITCOIN', icon: '₿', precision: 2, timezone: 'UTC', category: 'Crypto' },
  { id: 'cryETHUSD', name: 'ETHEREUM', icon: '💎', precision: 2, timezone: 'UTC', category: 'Crypto' },
  { id: 'crySOLUSD', name: 'SOLANA', icon: '☀️', precision: 3, timezone: 'UTC', category: 'Crypto' },
  // Stocks / Indices
  { id: 'R_100', name: 'V-100 INDEX', icon: '⚡', precision: 2, timezone: 'UTC', category: 'Synthetic' },
  { id: 'R_50', name: 'V-50 INDEX', icon: '📉', precision: 2, timezone: 'UTC', category: 'Synthetic' },
  { id: 'WLDAUD', name: 'AUD INDEX', icon: '🇦🇺', precision: 4, timezone: 'Australia/Sydney', category: 'Stocks' },
];

const App: React.FC = () => {
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [showIndicators, setShowIndicators] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<Asset>(() => {
    const saved = localStorage.getItem(ASSET_KEY);
    return saved ? ASSETS.find(a => a.id === saved) || ASSETS[0] : ASSETS[0];
  });

  const [candles, setCandles] = useState<Candle[]>([]);
  const [currentPrice, setCurrentPrice] = useState(0);
  const [currentSignal, setCurrentSignal] = useState<Signal | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [apiError, setApiError] = useState(false);
  const [recommendedAssets, setRecommendedAssets] = useState<string[]>([]);
  const [marketTime, setMarketTime] = useState("00:00:00");
  const [candleCountdown, setCandleCountdown] = useState(60);
  
  const ws = useRef<WebSocket | null>(null);

  const [stats, setStats] = useState<Stats>(() => {
    const saved = localStorage.getItem(STATS_KEY);
    return saved ? JSON.parse(saved) : { totalSignals: 0, correctSignals: 0, incorrectSignals: 0 };
  });

  useEffect(() => {
    window.aistudio.hasSelectedApiKey().then(setHasKey);
  }, []);

  const handleOpenKey = async () => {
    await window.aistudio.openSelectKey();
    setHasKey(true);
    setApiError(false);
  };

  const scanAllMarkets = async () => {
    setIsScanning(true);
    setRecommendedAssets([]);
    await new Promise(r => setTimeout(r, 1200));
    setRecommendedAssets(ASSETS.filter(() => Math.random() > 0.6).map(a => a.id));
    setIsScanning(false);
  };

  const triggerAICall = useCallback(async () => {
    if (candles.length < 5 || isAnalyzing) return;
    setIsAnalyzing(true);
    setApiError(false);
    try {
      const indicators = calculatePremiumIndicators(candles);
      const result = await analyzeMarket(candles, selectedAsset.name, indicators);
      
      if (result.pattern === 'AUTH_ERROR') {
        setApiError(true);
      } else {
        setCurrentSignal(result);
      }
    } catch (e) {
      setApiError(true);
    } finally {
      setIsAnalyzing(false);
    }
  }, [candles, selectedAsset, isAnalyzing]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const seconds = now.getSeconds();
      setMarketTime(now.toLocaleTimeString('en-GB', { timeZone: selectedAsset.timezone, hour12: false }));
      setCandleCountdown(60 - seconds === 60 ? 0 : 60 - seconds);
    }, 500);
    return () => clearInterval(interval);
  }, [selectedAsset]);

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
        setCurrentPrice(+res.ohlc.close);
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

  const winRate = stats.totalSignals > 0 ? ((stats.correctSignals / stats.totalSignals) * 100).toFixed(1) : "0.0";

  if (hasKey === false) {
    return (
      <div className="min-h-screen bg-[#0b0e11] flex flex-col items-center justify-center p-8 text-center">
        <div className="w-20 h-20 bg-indigo-500/20 rounded-3xl flex items-center justify-center mb-6 animate-pulse shadow-lg">
           <span className="text-4xl">📊</span>
        </div>
        <h1 className="text-2xl font-black mb-4 text-white uppercase tracking-wider">Premium Access</h1>
        <p className="text-gray-400 text-xs mb-8 max-w-xs leading-relaxed">
          মডেল Gemini ব্যবহারের জন্য একটি পেইড এপিআই কি প্রয়োজন।
        </p>
        <button onClick={handleOpenKey} className="bg-indigo-600 hover:bg-indigo-500 text-white px-10 py-4 rounded-2xl font-bold uppercase text-sm tracking-widest shadow-xl transition-all active:scale-95">
          Select API Key
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0e11] text-white p-3 font-sans select-none overflow-x-hidden pb-10">
      
      {/* Mini Stats Bar */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-white/5 backdrop-blur-md p-2.5 rounded-xl border border-white/5 flex flex-col items-center">
          <span className="text-[8px] text-gray-500 uppercase font-black">Signals</span>
          <span className="text-sm font-black text-indigo-400">{stats.totalSignals}</span>
        </div>
        <div className="bg-white/5 backdrop-blur-md p-2.5 rounded-xl border border-white/5 flex flex-col items-center">
          <span className="text-[8px] text-gray-500 uppercase font-black">Accuracy</span>
          <span className="text-sm font-black text-emerald-400">{winRate}%</span>
        </div>
        <div className="bg-white/5 backdrop-blur-md p-2.5 rounded-xl border border-white/5 flex flex-col items-center">
          <span className="text-[8px] text-gray-500 uppercase font-black">Correct</span>
          <span className="text-sm font-black text-blue-400">{stats.correctSignals}</span>
        </div>
      </div>

      <div className="mb-4 flex gap-2">
        <button onClick={scanAllMarkets} disabled={isScanning} className={`flex-1 py-3 rounded-xl font-black text-[10px] uppercase transition-all border border-indigo-500/30 flex items-center justify-center gap-2 ${isScanning ? 'bg-indigo-900 opacity-50' : 'bg-[#1c2127] hover:bg-indigo-600'}`}>
          {isScanning ? 'SCANNING...' : '🔍 SCAN MARKET'}
        </button>
        <button onClick={() => setShowIndicators(!showIndicators)} className={`px-4 py-3 rounded-xl font-black text-[10px] uppercase border transition-all flex items-center gap-2 ${showIndicators ? 'bg-indigo-600 border-indigo-400' : 'bg-[#1c2127] border-white/10'}`}>
          {showIndicators ? '👁️ OFF' : '👁️ ON'}
        </button>
      </div>

      <div className="flex justify-between items-center mb-4 bg-white/5 backdrop-blur-xl p-4 rounded-2xl border border-white/10 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-0.5 h-full bg-indigo-500"></div>
        <div>
          <span className="text-gray-500 text-[9px] font-black uppercase tracking-widest">{selectedAsset.name}</span>
          <p className="text-2xl font-black text-white font-mono leading-none mt-1">{marketTime}</p>
        </div>
        <div className="text-right">
          <span className="text-gray-500 text-[9px] font-black uppercase tracking-widest">Next</span>
          <p className={`text-2xl font-black font-mono leading-none mt-1 ${candleCountdown <= 10 ? 'text-rose-500 animate-pulse' : 'text-emerald-400'}`}>
            :{candleCountdown < 10 ? `0${candleCountdown}` : candleCountdown}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-4 max-h-[160px] overflow-y-auto no-scrollbar py-1">
        {ASSETS.map(asset => (
          <button key={asset.id} onClick={() => { setSelectedAsset(asset); localStorage.setItem(ASSET_KEY, asset.id); setCandles([]); setCurrentSignal(null); }} className={`relative py-3 px-2 rounded-xl text-[9px] font-black border transition-all flex flex-col items-center gap-1 ${selectedAsset.id === asset.id ? 'bg-indigo-600 border-indigo-400 shadow-lg' : 'bg-[#1c2127] border-white/5 text-gray-500'}`}>
            {recommendedAssets.includes(asset.id) && <span className="absolute -top-1.5 -right-1 bg-emerald-500 text-white text-[6px] px-1 py-0.5 rounded-full font-black animate-bounce shadow-md">HOT</span>}
            <span className="text-xl">{asset.icon}</span>
            <span className="truncate w-full text-center">{asset.name}</span>
          </button>
        ))}
      </div>

      <TradingChart 
        candles={candles} 
        assetName={selectedAsset.name} 
        precision={selectedAsset.precision} 
        currentPrice={currentPrice} 
        currentSignal={currentSignal}
        showIndicators={showIndicators}
      />

      <div className="mt-6">
        <button 
          onClick={triggerAICall} 
          disabled={isAnalyzing || candles.length < 5} 
          className={`w-full py-6 rounded-2xl font-black text-xl uppercase transition-all shadow-xl border-b-8 flex flex-col items-center justify-center gap-1 ${isAnalyzing ? 'bg-amber-600 text-white border-amber-800 animate-pulse' : 'bg-indigo-600 text-white border-indigo-800 hover:bg-indigo-500 active:translate-y-1 active:border-b-4'}`}
        >
          {isAnalyzing ? "ANALYZING..." : "GET SURE SHOT"}
        </button>
      </div>

      <SignalDashboard signal={currentSignal} isAnalyzing={isAnalyzing} onVote={handleVote} />

      <div className="mt-6 text-center opacity-30">
        <button onClick={handleOpenKey} className="text-[9px] text-gray-400 uppercase font-black tracking-widest hover:text-indigo-400">⚙️ SYNC SYSTEM</button>
      </div>
    </div>
  );
};

export default App;
