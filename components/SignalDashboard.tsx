import React from 'react';
import { Signal } from '../types';

interface SignalDashboardProps {
  signal: Signal | null;
  isAnalyzing: boolean;
  onVote: (signalId: string, result: 'TRUE' | 'FALSE') => void;
}

const SignalDashboard: React.FC<SignalDashboardProps> = ({ signal, isAnalyzing, onVote }) => {
  if (isAnalyzing) {
    return (
      <div className="bg-white/5 backdrop-blur-md p-8 rounded-3xl border border-indigo-500/30 text-center overflow-hidden relative shadow-lg mt-4 min-h-[140px] flex flex-col items-center justify-center">
        <div className="w-10 h-10 border-4 border-indigo-500/20 border-t-indigo-400 rounded-full animate-spin mb-4"></div>
        <div className="space-y-1">
          <p className="text-indigo-400 font-black text-[10px] tracking-widest uppercase">Analyzing Psychology</p>
          <p className="text-gray-500 font-medium text-[8px] uppercase tracking-tighter animate-pulse">Confirming Next Candle...</p>
        </div>
      </div>
    );
  }

  if (!signal) {
    return (
      <div className="bg-white/5 p-6 rounded-3xl border border-dashed border-white/10 text-center opacity-40 mt-4">
        <p className="text-[9px] text-gray-500 uppercase font-bold tracking-widest italic">Awaiting Market Trigger</p>
      </div>
    );
  }

  if (signal.type === 'NEUTRAL') {
    return (
      <div className="bg-rose-950/20 p-6 rounded-3xl border border-rose-500/40 shadow-xl animate-in fade-in zoom-in duration-300 mt-4">
        <div className="flex items-center gap-3 mb-3">
           <div className="w-8 h-8 rounded-xl bg-rose-600 flex items-center justify-center text-white text-lg font-black shadow-md">!</div>
           <div>
             <h3 className="text-rose-400 font-black uppercase text-xs tracking-wider">Unstable Market</h3>
             <p className="text-rose-100/40 text-[8px] uppercase font-bold">{signal.pattern}</p>
           </div>
        </div>
        <p className="text-rose-200 text-xs leading-relaxed font-medium italic bg-rose-500/5 p-3 rounded-xl border border-rose-500/10">
          {signal.description}
        </p>
      </div>
    );
  }

  const isCall = signal.type === 'CALL';

  return (
    <div className={`p-6 rounded-3xl border-2 shadow-2xl relative overflow-hidden transition-all duration-500 mt-4 animate-in slide-in-from-bottom-5 ${isCall ? 'bg-emerald-950/30 border-emerald-500/40' : 'bg-rose-950/30 border-rose-500/40'}`}>
      <div className={`absolute -top-10 -right-10 w-40 h-40 blur-[60px] opacity-20 ${isCall ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
      
      <div className="flex justify-between items-start mb-4 relative z-10">
        <div>
          <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase mb-2 inline-block shadow-md ${isCall ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
            ⚡ {signal.category}
          </span>
          <h2 className={`text-5xl font-black italic tracking-tighter mb-1 ${isCall ? 'text-emerald-500 drop-shadow-md' : 'text-rose-500 drop-shadow-md'}`}>
            {signal.type}
          </h2>
          <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">{signal.pattern}</p>
        </div>
        <div className="text-right">
           <p className={`text-3xl font-black tracking-tighter leading-none ${signal.confidence > 90 ? 'text-white' : 'text-gray-400'}`}>
             {signal.confidence}%
           </p>
           <div className="h-1 w-16 bg-gray-800 rounded-full mt-2 overflow-hidden ml-auto">
              <div className={`h-full rounded-full ${isCall ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: `${signal.confidence}%` }}></div>
           </div>
           <p className="text-[8px] text-gray-500 font-black uppercase tracking-widest mt-2">Accuracy</p>
        </div>
      </div>
      
      <div className="bg-black/40 p-4 rounded-2xl mb-4 border border-white/5 backdrop-blur-md relative z-10">
        <p className="text-xs text-gray-200 leading-relaxed italic">
          <span className="text-indigo-400 font-black mr-2 uppercase text-[9px] not-italic tracking-wider">AI:</span>
          {signal.description}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 relative z-10">
        <button 
          onClick={() => onVote(signal.id, 'TRUE')} 
          disabled={signal.voted}
          className={`py-3 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all border-b-4 active:translate-y-0.5 ${signal.voted && signal.result === 'TRUE' ? 'bg-emerald-600 text-white border-emerald-800' : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-600 hover:text-white'}`}
        >
          {signal.voted && signal.result === 'TRUE' ? 'WIN ✓' : 'WIN (ITM)'}
        </button>
        <button 
          onClick={() => onVote(signal.id, 'FALSE')} 
          disabled={signal.voted}
          className={`py-3 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all border-b-4 active:translate-y-0.5 ${signal.voted && signal.result === 'FALSE' ? 'bg-rose-600 text-white border-rose-800' : 'bg-rose-500/10 text-rose-500 border-rose-500/20 hover:bg-rose-600 hover:text-white'}`}
        >
          {signal.voted && signal.result === 'FALSE' ? 'LOSS ✗' : 'LOSS (OTM)'}
        </button>
      </div>
    </div>
  );
};

export default SignalDashboard;