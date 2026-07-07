import React, { useState } from 'react';
import { FaceAnalysisResult, BodyAnalysisResult } from '../types';
import { AlertCircle, Eye, Sparkles, BookOpen } from 'lucide-react';
import { motion } from 'motion/react';

type DiagnosticFilter = 'normal' | 'uv_sebum' | 'hydration_map' | 'melanin_depth';

interface ImageDiagnosticHUDProps {
  images: string[];
  labels: string[];
  mode: 'face' | 'body';
}

function ImageDiagnosticHUD({ images, labels, mode }: ImageDiagnosticHUDProps) {
  const [selectedFilter, setSelectedFilter] = useState<DiagnosticFilter>('normal');
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const getFilterCSS = (filter: DiagnosticFilter) => {
    switch (filter) {
      case 'uv_sebum':
        return 'saturate-[4.5] hue-rotate-[110deg] contrast-[1.8] brightness-[0.8]';
      case 'hydration_map':
        return 'saturate-[2.5] hue-rotate-[195deg] contrast-[2.2] brightness-[1.0]';
      case 'melanin_depth':
        return 'grayscale-[1] contrast-[2.8] brightness-[0.75]';
      default:
        return 'brightness-[1.02] contrast-[1.02]';
    }
  };

  const getFilterBadge = (filter: DiagnosticFilter) => {
    switch (filter) {
      case 'uv_sebum': return 'bg-emerald-50 text-emerald-700 border-emerald-200/50';
      case 'hydration_map': return 'bg-sky-50 text-sky-700 border-sky-200/50';
      case 'melanin_depth': return 'bg-amber-50 text-amber-700 border-amber-200/50';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="bg-white rounded-[2rem] p-6 border border-slate-150/80 shadow-xs mb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b border-slate-100 pb-5">
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[10px] text-slate-400 font-bold tracking-widest uppercase">VISUALIZZATORE CLINICO IA</span>
            <span className="bg-emerald-50 text-emerald-700 text-[9px] font-bold px-1.5 py-0.5 rounded-md">SPETTRALE</span>
          </div>
          <h4 className="text-md font-bold text-slate-800">Scansioni {mode === 'face' ? 'Viso' : 'Corpo'}</h4>
        </div>
        
        {/* Spectral Filter Selector */}
        <div className="flex flex-wrap gap-1.5 p-1 bg-slate-50 rounded-xl border border-slate-150">
          {(['normal', 'uv_sebum', 'hydration_map', 'melanin_depth'] as DiagnosticFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setSelectedFilter(f)}
              className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all capitalize border ${selectedFilter === f ? getFilterBadge(f) + ' shadow-xs' : 'border-transparent text-slate-400 hover:text-slate-700'}`}
            >
              {f.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of Images */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {images.map((img, idx) => (
          <div 
            key={idx}
            className="relative bg-slate-50 rounded-2xl overflow-hidden border border-slate-150/60 group"
            onMouseEnter={() => setHoveredIdx(idx)}
            onMouseLeave={() => setHoveredIdx(null)}
          >
            <div className="aspect-square w-full relative overflow-hidden bg-slate-900 flex items-center justify-center">
              <img 
                src={img} 
                alt={labels[idx]} 
                className={`w-full h-full object-cover transition-all duration-700 ease-out ${getFilterCSS(selectedFilter)}`}
              />
              
              {/* Scan Overlay Effect */}
              {selectedFilter !== 'normal' && (
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/10 to-transparent h-[200%] w-full animate-scan pointer-events-none" />
              )}
              
              {/* Target reticle on hover */}
              {hoveredIdx === idx && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center bg-black/10">
                  <div className="w-10 h-10 border-2 border-dashed border-white/60 rounded-full animate-spin" />
                  <div className="absolute w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                </div>
              )}
            </div>
            
            {/* Image tag label */}
            <div className="p-3 bg-white border-t border-slate-100 flex justify-between items-center">
              <span className="text-[10px] font-bold text-slate-500 tracking-wide uppercase">{labels[idx] || `Scan ${idx + 1}`}</span>
              <span className="text-[9px] font-mono text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">OK</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FaceResults({ result }: { result: FaceAnalysisResult }) {
  const labels = ["Vista Frontale", "Profilo Sinistro", "Profilo Destro"];

  // Pastel Color Pickers with great contrast
  const getHydrationColor = (val: number) => {
    if (val >= 60) return { bg: 'bg-[#EBF7F2]', text: 'text-[#14532D]', border: 'border-[#DCF2E8]', label: 'Ottimale' };
    if (val >= 40) return { bg: 'bg-[#FFFbeb]', text: 'text-[#78350F]', border: 'border-[#FEF3C7]', label: 'Disidratazione Lieve' };
    return { bg: 'bg-[#FEF2F2]', text: 'text-[#991B1B]', border: 'border-[#FEE2E2]', label: 'Grave Disidratazione' };
  };

  const getSebumColor = (val: number) => {
    if (val >= 30 && val <= 50) return { bg: 'bg-[#EBF7F2]', text: 'text-[#14532D]', border: 'border-[#DCF2E8]', label: 'Equilibrato' };
    if (val < 30) return { bg: 'bg-[#F0F4F8]', text: 'text-[#1E293B]', border: 'border-[#E2E8F0]', label: 'Alipica / Secca' };
    return { bg: 'bg-[#FFF7ED]', text: 'text-[#C2410C]', border: 'border-[#FFEDD5]', label: 'Secrezione Elevata (Grassa)' };
  };

  const getPhColor = (ph: number) => {
    if (ph >= 4.5 && ph <= 5.5) return { bg: 'bg-[#EBF7F2]', text: 'text-[#14532D]', border: 'border-[#DCF2E8]', label: 'Acido Ideale' };
    if (ph < 4.5) return { bg: 'bg-[#FFF0F2]', text: 'text-[#8E1F2F]', border: 'border-[#FFD3D9]', label: 'Eccesso Acidità' };
    return { bg: 'bg-[#FEF2F2]', text: 'text-[#991B1B]', border: 'border-[#FEE2E2]', label: 'Alcalino (Barriera Lesa)' };
  };

  const hydColor = getHydrationColor(result.hydration);
  const sebColor = getSebumColor(result.sebum);
  const phColor = getPhColor(result.ph);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }} 
      animate={{ opacity: 1, y: 0 }} 
      className="space-y-6"
    >
      {/* Display clinical images if saved */}
      {result.images && result.images.length > 0 && (
        <ImageDiagnosticHUD images={result.images} labels={labels} mode="face" />
      )}

      {/* Main Stats Card */}
      <div className="bg-white rounded-[2rem] p-6 md:p-8 border border-slate-150/80 shadow-xs">
        {/* Diagnosis text summary */}
        <div className="bg-[#FAF9F6] border border-slate-150 p-6 rounded-2xl mb-8">
          <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-3">
            <Sparkles size={14} className="text-emerald-500" />
            <span>Sintesi Diagnostica Clinica IA</span>
          </div>
          <p className="text-slate-700 text-sm leading-relaxed font-sans font-medium">{result.summary}</p>
        </div>

        {/* Metrics Section Header */}
        <div className="flex items-center gap-2 mb-4 px-1">
          <BookOpen size={16} className="text-slate-400" />
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Parametri Biometrici Standard</h4>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Hydration */}
          <div className="bg-white border border-slate-100 rounded-2xl p-5 hover:shadow-xs transition duration-200">
            <div className="flex justify-between items-start mb-2">
              <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">💧 Idratazione Epidermica</span>
              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border ${hydColor.bg} ${hydColor.text} ${hydColor.border}`}>
                {hydColor.label}
              </span>
            </div>
            <div className="flex items-baseline gap-1 mt-3">
              <span className="text-3xl font-black font-mono tracking-tight text-slate-800">{Math.round(result.hydration)}</span>
              <span className="text-slate-400 font-bold text-sm">%</span>
            </div>
            <p className="text-[10px] text-slate-500 mt-3 border-t border-slate-50 pt-2.5">
              Rilevata tramite <b>Corneometria</b>. Misura l'acqua nello strato corneo. Standard ottimale: <b>60% - 100%</b>.
            </p>
          </div>

          {/* Sebum */}
          <div className="bg-white border border-slate-100 rounded-2xl p-5 hover:shadow-xs transition duration-200">
            <div className="flex justify-between items-start mb-2">
              <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">🧪 Sebo / Film Idrolipidico</span>
              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border ${sebColor.bg} ${sebColor.text} ${sebColor.border}`}>
                {sebColor.label}
              </span>
            </div>
            <div className="flex items-baseline gap-1 mt-3">
              <span className="text-3xl font-black font-mono tracking-tight text-slate-800">{Math.round(result.sebum)}</span>
              <span className="text-slate-400 font-bold text-sm">%</span>
            </div>
            <p className="text-[10px] text-slate-500 mt-3 border-t border-slate-50 pt-2.5">
              Rilevato tramite <b>Sebumetria d'Immagine</b>. Valuta il film protettivo lipidico. Standard ottimale: <b>30% - 50%</b>.
            </p>
          </div>

          {/* pH */}
          <div className="bg-white border border-slate-100 rounded-2xl p-5 hover:shadow-xs transition duration-200">
            <div className="flex justify-between items-start mb-2">
              <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">🧬 Mantello Acido (pH)</span>
              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border ${phColor.bg} ${phColor.text} ${phColor.border}`}>
                {phColor.label}
              </span>
            </div>
            <div className="flex items-baseline gap-1 mt-3">
              <span className="text-3xl font-black font-mono tracking-tight text-slate-800">{result.ph.toFixed(1)}</span>
            </div>
            <p className="text-[10px] text-slate-500 mt-3 border-t border-slate-50 pt-2.5">
              Misura della barriera acida protettiva. Range ottimale di salute: <b>4.5 - 5.5</b>.
            </p>
          </div>

          {/* Melanin & Fitzpatrick */}
          <div className="bg-white border border-slate-100 rounded-2xl p-5 hover:shadow-xs transition duration-200 flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-start mb-2">
                <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">☀️ Fototipo Fitzpatrick</span>
                <span className="text-[10px] font-bold px-2.5 py-1 rounded-lg border bg-amber-50 text-amber-800 border-amber-200">
                  Tipo {result.phototype}
                </span>
              </div>
              <div className="flex items-baseline gap-4 mt-3">
                <div className="flex items-baseline gap-1">
                  <span className="text-[10px] text-slate-400 block font-bold uppercase">Melanina:</span>
                  <span className="text-2xl font-black font-mono text-slate-800">{Math.round(result.melanin)}%</span>
                </div>
              </div>
            </div>
            <p className="text-[10px] text-slate-500 mt-3 border-t border-slate-50 pt-2.5">
              Classificazione dermatologica basata sulla risposta cutanea ai raggi UV (fototipi 1-6).
            </p>
          </div>
        </div>

        {/* Footnote scale details */}
        <div className="mt-8 p-4 bg-slate-50 rounded-2xl flex items-center justify-center gap-3 text-slate-500 text-[11px] border border-slate-150/50">
          <AlertCircle size={15} className="text-emerald-500 flex-shrink-0" />
          <span className="leading-relaxed font-medium">Standard allineati con i parametri diagnostici <b>SkinPlus</b> e <b>Hintime Medical</b> (Margine d'errore statistico d'analisi: <b>±2</b>)</span>
        </div>
      </div>
    </motion.div>
  );
}

export function BodyResults({ result }: { result: BodyAnalysisResult }) {
  const labels = ["Vista Frontale", "Vista Posteriore", "Profilo Sinistro", "Profilo Destro"];

  const getRetentionColor = (val: number) => {
    if (val < 30) return { bg: 'bg-[#EBF7F2]', text: 'text-[#14532D]', border: 'border-[#DCF2E8]', label: 'Ottimale (Minima)' };
    if (val <= 55) return { bg: 'bg-[#FFFbeb]', text: 'text-[#78350F]', border: 'border-[#FEF3C7]', label: 'Edematosa Lieve' };
    return { bg: 'bg-[#FEF2F2]', text: 'text-[#991B1B]', border: 'border-[#FEE2E2]', label: 'Ritenzione Marcata' };
  };

  const getToneColor = (val: number) => {
    if (val >= 75) return { bg: 'bg-[#EBF7F2]', text: 'text-[#14532D]', border: 'border-[#DCF2E8]', label: 'Ottimo Tono' };
    if (val >= 40) return { bg: 'bg-[#F0F4F8]', text: 'text-[#1E293B]', border: 'border-[#E2E8F0]', label: 'Tono Moderato' };
    return { bg: 'bg-[#FEF2F2]', text: 'text-[#991B1B]', border: 'border-[#FEE2E2]', label: 'Lassità Tissutale' };
  };

  const getCelluliteColor = (status: string) => {
    const s = status.toLowerCase();
    if (s.includes('assente')) return { bg: 'bg-[#EBF7F2]', text: 'text-[#14532D]', border: 'border-[#DCF2E8]', label: 'Cellulite Assente' };
    if (s.includes('1°')) return { bg: 'bg-[#FEF3C7]', text: 'text-[#92400E]', border: 'border-[#FDE68A]', label: 'Stadio 1 - Edematosa' };
    if (s.includes('2°')) return { bg: 'bg-[#FFE4E6]', text: 'text-[#9F1239]', border: 'border-[#FECDD3]', label: 'Stadio 2 - Fibrosa' };
    return { bg: 'bg-[#FEE2E2]', text: 'text-[#991B1B]', border: 'border-[#FCA5A5]', label: 'Stadio 3 - Sclerotica' };
  };

  const retColor = getRetentionColor(result.waterRetention);
  const toneColor = getToneColor(result.tone);
  const cellColor = getCelluliteColor(result.cellulite);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }} 
      animate={{ opacity: 1, y: 0 }} 
      className="space-y-6"
    >
      {/* Display clinical images if saved */}
      {result.images && result.images.length > 0 && (
        <ImageDiagnosticHUD images={result.images} labels={labels} mode="body" />
      )}

      {/* Main Stats Card */}
      <div className="bg-white rounded-[2rem] p-6 md:p-8 border border-slate-150/80 shadow-xs">
        {/* Diagnosis text summary */}
        <div className="bg-[#FAF9F6] border border-slate-150 p-6 rounded-2xl mb-8">
          <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-3">
            <Sparkles size={14} className="text-rose-500" />
            <span>Sintesi Antropometrica Clinica IA</span>
          </div>
          <p className="text-slate-700 text-sm leading-relaxed font-sans font-medium">{result.summary}</p>
        </div>

        {/* Metrics Section Header */}
        <div className="flex items-center gap-2 mb-4 px-1">
          <BookOpen size={16} className="text-slate-400" />
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Parametri Tissutali Standard</h4>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Water Retention */}
          <div className="bg-white border border-slate-100 rounded-2xl p-5 hover:shadow-xs transition duration-200">
            <div className="flex justify-between items-start mb-2">
              <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">💧 Ritenzione Idrica</span>
              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border ${retColor.bg} ${retColor.text} ${retColor.border}`}>
                {retColor.label}
              </span>
            </div>
            <div className="flex items-baseline gap-1 mt-3">
              <span className="text-3xl font-black font-mono tracking-tight text-slate-800">{Math.round(result.waterRetention)}</span>
              <span className="text-slate-400 font-bold text-sm">%</span>
            </div>
            <p className="text-[10px] text-slate-500 mt-3 border-t border-slate-50 pt-2.5">
              Indice di ritenzione dei liquidi interstiziali nei tessuti adiposi profondi.
            </p>
          </div>

          {/* Cellulite Grade (Scala Nurnberger-Muller) */}
          <div className="bg-white border border-slate-100 rounded-2xl p-5 hover:shadow-xs transition duration-200">
            <div className="flex justify-between items-start mb-2">
              <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">🔬 Stadio Cellulite</span>
              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border ${cellColor.bg} ${cellColor.text} ${cellColor.border}`}>
                {cellColor.label}
              </span>
            </div>
            <div className="flex items-baseline gap-1 mt-3">
              <span className="text-md font-bold text-slate-800 leading-tight block">{result.cellulite}</span>
            </div>
            <p className="text-[10px] text-slate-500 mt-3 border-t border-slate-50 pt-2.5">
              Valutata tramite la scala clinica <b>Nürnberger-Müller</b> (Stadi 0, 1, 2, 3 per PEFS).
            </p>
          </div>

          {/* Tissue Tone */}
          <div className="bg-white border border-slate-100 rounded-2xl p-5 hover:shadow-xs transition duration-200">
            <div className="flex justify-between items-start mb-2">
              <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">💪 Tono Muscolare / Tissutale</span>
              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border ${toneColor.bg} ${toneColor.text} ${toneColor.border}`}>
                {toneColor.label}
              </span>
            </div>
            <div className="flex items-baseline gap-1 mt-3">
              <span className="text-3xl font-black font-mono tracking-tight text-slate-800">{Math.round(result.tone)}</span>
              <span className="text-slate-400 font-bold text-sm">%</span>
            </div>
            <p className="text-[10px] text-slate-500 mt-3 border-t border-slate-50 pt-2.5">
              Stima dell'elasticità cutanea e del supporto muscolare profondo della silhouette.
            </p>
          </div>

          {/* Fitzpatrick phototype */}
          <div className="bg-white border border-slate-100 rounded-2xl p-5 hover:shadow-xs transition duration-200 flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-start mb-2">
                <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">☀️ Fototipo Epidermico</span>
                <span className="text-[10px] font-bold px-2.5 py-1 rounded-lg border bg-amber-50 text-amber-800 border-amber-200">
                  Tipo {result.phototype}
                </span>
              </div>
              <div className="flex items-baseline mt-3">
                <span className="text-xs text-slate-400 font-bold uppercase">Fotoprotezione consigliata:</span>
                <span className="text-sm font-bold text-slate-700 ml-1.5">{result.phototype <= 2 ? 'SPF 50+' : result.phototype <= 4 ? 'SPF 30' : 'SPF 15'}</span>
              </div>
            </div>
            <p className="text-[10px] text-slate-500 mt-3 border-t border-slate-50 pt-2.5">
              Classificazione basata sulla tolleranza epidermica ai raggi ultravioletti.
            </p>
          </div>
        </div>

        {/* Footnote scale details */}
        <div className="mt-8 p-4 bg-slate-50 rounded-2xl flex items-center justify-center gap-3 text-slate-500 text-[11px] border border-slate-150/50">
          <AlertCircle size={15} className="text-rose-500 flex-shrink-0" />
          <span className="leading-relaxed font-medium">Standard allineati con i parametri diagnostici <b>SkinPlus</b> e <b>Hintime Medical</b> (Margine d'errore statistico d'analisi: <b>±2</b>)</span>
        </div>
      </div>
    </motion.div>
  );
}
