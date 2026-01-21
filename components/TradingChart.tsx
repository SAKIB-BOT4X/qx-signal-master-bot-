import React, { useEffect, useRef } from 'react';
import { createChart, ColorType, LineStyle, LastPriceAnimationMode } from 'lightweight-charts';
import { Candle, Signal } from '../types';

interface TradingChartProps {
  candles: Candle[];
  assetName: string;
  precision: number;
  currentPrice: number;
  currentSignal: Signal | null;
  showIndicators: boolean;
}

const TradingChart: React.FC<TradingChartProps> = ({ candles, assetName, precision, currentPrice, currentSignal, showIndicators }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const candlestickSeriesRef = useRef<any>(null);
  
  const r1Ref = useRef<any>(null);
  const s1Ref = useRef<any>(null);
  const tenkanRef = useRef<any>(null);
  const kijunRef = useRef<any>(null);

  const calculateIndicators = (data: any[]) => {
    if (data.length < 30) return { r1: [], s1: [], tenkan: [], kijun: [] };
    const results: any = { r1: [], s1: [], tenkan: [], kijun: [] };
    
    data.forEach((d, i) => {
      if (i < 26) return;
      const prev = data[i-1];
      const pp = (prev.high + prev.low + prev.close) / 3;
      results.r1.push({ time: d.time, value: 2 * pp - prev.low });
      results.s1.push({ time: d.time, value: 2 * pp - prev.high });

      const slice9 = data.slice(i - 9, i);
      const slice26 = data.slice(i - 26, i);
      results.tenkan.push({ time: d.time, value: (Math.max(...slice9.map(x => x.high)) + Math.min(...slice9.map(x => x.low))) / 2 });
      results.kijun.push({ time: d.time, value: (Math.max(...slice26.map(x => x.high)) + Math.min(...slice26.map(x => x.low))) / 2 });
    });
    return results;
  };

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: { background: { type: ColorType.Solid, color: '#0b0e11' }, textColor: '#d1d4dc', fontSize: 10 },
      grid: { vertLines: { color: 'rgba(255, 255, 255, 0.02)' }, horzLines: { color: 'rgba(255, 255, 255, 0.02)' } },
      crosshair: { mode: 0 },
      rightPriceScale: { borderColor: '#1c2127', autoScale: true },
      timeScale: { borderColor: '#1c2127', timeVisible: true, fixLeftEdge: true },
    });

    const chartAny = chart as any;
    candlestickSeriesRef.current = chartAny.addCandlestickSeries({
      upColor: '#26a69a', downColor: '#ef5350', borderVisible: false,
      wickUpColor: '#26a69a', wickDownColor: '#ef5350',
      lastPriceAnimation: LastPriceAnimationMode.OnDataUpdate,
    });

    r1Ref.current = chartAny.addLineSeries({ color: 'rgba(239, 83, 80, 0.3)', lineWidth: 1, lineStyle: LineStyle.Dashed });
    s1Ref.current = chartAny.addLineSeries({ color: 'rgba(38, 166, 154, 0.3)', lineWidth: 1, lineStyle: LineStyle.Dashed });
    tenkanRef.current = chartAny.addLineSeries({ color: '#facc15', lineWidth: 1 });
    kijunRef.current = chartAny.addLineSeries({ color: '#6366f1', lineWidth: 1 });

    chartRef.current = chart;
    return () => chart.remove();
  }, [precision]);

  useEffect(() => {
    if (candlestickSeriesRef.current && candles.length > 0) {
      const formattedData = candles.map(c => ({
        time: c.time / 1000 as any,
        open: c.open, high: c.high, low: c.low, close: c.close
      }));
      
      candlestickSeriesRef.current.setData(formattedData);

      if (showIndicators) {
        const indData = calculateIndicators(formattedData);
        r1Ref.current?.setData(indData.r1);
        s1Ref.current?.setData(indData.s1);
        tenkanRef.current?.setData(indData.tenkan);
        kijunRef.current?.setData(indData.kijun);
      } else {
        r1Ref.current?.setData([]); s1Ref.current?.setData([]);
        tenkanRef.current?.setData([]); kijunRef.current?.setData([]);
      }

      if (currentSignal && currentSignal.type !== 'NEUTRAL') {
        const lastCandle = formattedData[formattedData.length - 1];
        candlestickSeriesRef.current.setMarkers([{
          time: lastCandle.time,
          position: currentSignal.type === 'CALL' ? 'belowBar' : 'aboveBar',
          color: currentSignal.type === 'CALL' ? '#26a69a' : '#ef5350',
          shape: currentSignal.type === 'CALL' ? 'arrowUp' : 'arrowDown',
          text: currentSignal.type,
          size: 1.5,
        }]);
      } else {
        candlestickSeriesRef.current.setMarkers([]);
      }
    }
  }, [candles, currentSignal, showIndicators]);

  return (
    <div className="w-full bg-[#161a1e] rounded-xl border border-white/5 overflow-hidden flex flex-col shadow-2xl relative">
      <div className="flex justify-between items-center px-3 py-2 bg-white/5 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
          <span className="text-white font-bold text-[10px] uppercase tracking-wider">{assetName}</span>
        </div>
        <span className="text-emerald-400 font-mono text-sm font-black tabular-nums">
          {currentPrice.toFixed(precision)}
        </span>
      </div>
      <div ref={chartContainerRef} className="h-[320px] w-full" />
    </div>
  );
};

export default TradingChart;