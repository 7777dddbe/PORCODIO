import { useState } from 'react';
import { Client, FaceAnalysisResult, BodyAnalysisResult } from '../types';
import { ArrowLeft, Camera, User, Loader2, Sparkles, CheckCircle2 } from 'lucide-react';
import { CameraCapture } from './CameraCapture';
import { FaceResults, BodyResults } from './AnalysisResults';
import { motion, AnimatePresence } from 'motion/react';

interface ClientDetailProps {
  client: Client;
  onBack: () => void;
  showBackButton?: boolean;
  onUpdateClient: (client: Client) => void;
}

export function ClientDetail({ client, onBack, showBackButton = true, onUpdateClient }: ClientDetailProps) {
  const [activeTab, setActiveTab] = useState<'face' | 'body'>('face');
  const [isCapturing, setIsCapturing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const faceSteps = ["Viso: Vista Frontale", "Viso: Profilo Sinistro", "Viso: Profilo Destro"];
  const bodySteps = ["Corpo: Vista Frontale", "Corpo: Vista Posteriore", "Corpo: Profilo Sinistro", "Corpo: Profilo Destro"];

  const handleCaptureComplete = async (imagesBase64: string[]) => {
    setIsCapturing(false);
    setIsAnalyzing(true);
    setError(null);

    try {
      const endpoint = activeTab === 'face' ? '/api/analyze-face' : '/api/analyze-body';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: imagesBase64 })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Errore di connessione al server.");
      }

      if (data.error) {
        throw new Error(data.error); // Diagnostic validation error from Gemini (e.g. face covered)
      }

      const updatedClient = { ...client };
      
      if (activeTab === 'face') {
        const result: FaceAnalysisResult = {
          date: Date.now(),
          hydration: data.hydration,
          sebum: data.sebum,
          ph: data.ph,
          melanin: data.melanin,
          phototype: data.phototype,
          summary: data.summary,
          images: imagesBase64,
        };
        updatedClient.faceAnalysis = result;
      } else {
        const result: BodyAnalysisResult = {
          date: Date.now(),
          waterRetention: data.waterRetention,
          cellulite: data.cellulite,
          tone: data.tone,
          phototype: data.phototype,
          summary: data.summary,
          images: imagesBase64,
        };
        updatedClient.bodyAnalysis = result;
      }

      onUpdateClient(updatedClient);

    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto pb-24">
      {/* Super Minimal Premium Card Info */}
      <div className="bg-white rounded-[2rem] p-6 border border-slate-150/80 shadow-xs mb-8 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {showBackButton && (
            <button 
              onClick={onBack} 
              className="p-3 bg-slate-50 hover:bg-slate-100 rounded-2xl text-slate-600 transition active:scale-95 flex items-center justify-center border border-slate-100"
              title="Indietro alla lista"
            >
              <ArrowLeft size={18} />
            </button>
          )}
          <div className="w-12 h-12 rounded-2xl bg-emerald-50/70 text-emerald-600 flex items-center justify-center font-bold border border-emerald-100/30 shadow-xs">
            {client.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-800">{client.name}</h2>
            <p className="text-xs text-slate-400 font-medium">Profilo creato il {new Date(client.createdAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </div>
        </div>

        <div className="flex gap-2">
          {client.faceAnalysis && (
            <span className="bg-[#EAF7F2] text-[#1b6145] text-xs font-semibold px-4 py-2 rounded-xl border border-[#d2edd6]">Viso Completo ✓</span>
          )}
          {client.bodyAnalysis && (
            <span className="bg-[#FFF0F2] text-[#8e2435] text-xs font-semibold px-4 py-2 rounded-xl border border-[#ffd2d9]">Corpo Completo ✓</span>
          )}
        </div>
      </div>

      {/* Tabs - Pill style with beautiful pastel accents */}
      <div className="flex bg-slate-100 p-1 rounded-2xl mb-8 border border-slate-200/30">
        <button 
          className={`flex-1 py-3.5 text-xs font-bold rounded-xl transition duration-300 flex items-center justify-center gap-2 ${activeTab === 'face' ? 'bg-white shadow-xs text-slate-800' : 'text-slate-500 hover:text-slate-800'}`}
          onClick={() => setActiveTab('face')}
        >
          🔍 Analisi Viso (Dermatologica)
        </button>
        <button 
          className={`flex-1 py-3.5 text-xs font-bold rounded-xl transition duration-300 flex items-center justify-center gap-2 ${activeTab === 'body' ? 'bg-white shadow-xs text-[#8e2435]' : 'text-slate-500 hover:text-slate-800'}`}
          onClick={() => setActiveTab('body')}
        >
          🧍 Analisi Corpo (Antropometrica)
        </button>
      </div>

      {error && (
        <div className="mb-8 p-5 bg-[#fbf0f0] text-[#5e2023] rounded-[1.5rem] text-xs font-medium leading-relaxed border border-[#f5d0d2] shadow-sm flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm font-bold text-[#8c2a30]">
            <span>⚠️ Diagnostica AI Sospesa</span>
          </div>
          <p>{error}</p>
          <p className="opacity-80 text-[11px] mt-1 font-sans">Suggerimento: Assicurati che l'illuminazione sia uniforme, la fotocamera sia a fuoco e che il soggetto mantenga la posa corretta senza capelli che coprano gli elementi chiave.</p>
        </div>
      )}

      {isAnalyzing ? (
        <div className="flex flex-col items-center justify-center py-24 bg-white rounded-[2rem] border border-slate-100 shadow-sm">
          <div className="relative flex items-center justify-center mb-6">
            <Loader2 size={54} className="animate-spin text-emerald-400" />
            <Sparkles size={22} className="absolute text-emerald-500 animate-pulse" />
          </div>
          <h3 className="text-md font-bold text-slate-800">Elaborazione Bio-Metrica IA ad Alta Precisione...</h3>
          <p className="text-xs text-slate-400 mt-2 text-center max-w-sm px-6 leading-relaxed">
            Il modello d'eccellenza <b>Google Gemini 3.1 Pro</b> sta analizzando ad altissima risoluzione i canali cromatici e i dettagli strutturali per stimare l'idratazione profonda, la melanina e il tono tissutale.
          </p>
        </div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.25 }}
          >
            {/* Super Minimal Big Action Button with gorgeous pastel hover states */}
            <button 
              onClick={() => setIsCapturing(true)}
              className={`w-full text-left rounded-[2rem] p-8 flex flex-col md:flex-row items-center justify-between gap-6 transition-all duration-300 active:scale-[0.99] border mb-8 ${
                activeTab === 'face' 
                  ? 'bg-gradient-to-r from-emerald-500/10 to-teal-500/10 hover:from-emerald-500/15 hover:to-teal-500/15 border-emerald-500/30 text-[#1b3d32] hover:shadow-md'
                  : 'bg-gradient-to-r from-rose-500/10 to-pink-500/10 hover:from-rose-500/15 hover:to-pink-500/15 border-rose-500/30 text-[#5e2023] hover:shadow-md'
              }`}
            >
              <div className="flex items-center gap-5">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-xs ${
                  activeTab === 'face' ? 'bg-white text-emerald-600' : 'bg-white text-rose-600'
                }`}>
                  <Camera size={26} />
                </div>
                <div>
                  <h3 className="text-lg font-bold tracking-tight">
                    {activeTab === 'face' 
                      ? 'Inizia Diagnosi Viso' 
                      : 'Inizia Diagnosi Corpo'}
                  </h3>
                  <p className="text-xs opacity-80 mt-1">
                    {activeTab === 'face' 
                      ? 'Richiede 3 foto in sequenza guidata per idratazione, sebo e pH.' 
                      : 'Richiede 4 foto della silhouette per ritenzione idrica e cellulite.'}
                  </p>
                </div>
              </div>

              <div className={`px-5 py-2.5 rounded-xl text-xs font-bold bg-white/80 backdrop-blur-xs border transition ${
                activeTab === 'face' ? 'border-emerald-500/20 text-emerald-700' : 'border-rose-500/20 text-rose-700'
              }`}>
                {activeTab === 'face' ? 'Esegui 3 Foto →' : 'Esegui 4 Foto →'}
              </div>
            </button>

            {/* Diagnostics and results */}
            {activeTab === 'face' && client.faceAnalysis && (
              <div className="space-y-6">
                <div className="flex items-center gap-2 px-2">
                  <CheckCircle2 size={16} className="text-emerald-500" />
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Report Dermatologico Clinico</span>
                </div>
                <FaceResults result={client.faceAnalysis} />
              </div>
            )}
            
            {activeTab === 'body' && client.bodyAnalysis && (
              <div className="space-y-6">
                <div className="flex items-center gap-2 px-2">
                  <CheckCircle2 size={16} className="text-rose-500" />
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Report Antropometrico Clinico</span>
                </div>
                <BodyResults result={client.bodyAnalysis} />
              </div>
            )}
            
            {activeTab === 'face' && !client.faceAnalysis && (
               <div className="text-center py-16 bg-white rounded-[2rem] border border-slate-100/80 shadow-xs text-slate-400">
                 <p className="font-semibold text-slate-500 mb-1">Nessuna diagnosi viso completata</p>
                 <p className="text-xs max-w-xs mx-auto">Premi il pulsante sopra per avviare l'acquisizione delle immagini guidate.</p>
               </div>
            )}
            
            {activeTab === 'body' && !client.bodyAnalysis && (
               <div className="text-center py-16 bg-white rounded-[2rem] border border-slate-100/80 shadow-xs text-slate-400">
                 <p className="font-semibold text-slate-500 mb-1">Nessuna diagnosi corpo completata</p>
                 <p className="text-xs max-w-xs mx-auto">Premi il pulsante sopra per avviare l'acquisizione delle immagini guidate.</p>
               </div>
            )}

          </motion.div>
        </AnimatePresence>
      )}

      {isCapturing && (
        <CameraCapture 
          steps={activeTab === 'face' ? faceSteps : bodySteps}
          mode={activeTab}
          onComplete={handleCaptureComplete}
          onCancel={() => setIsCapturing(false)}
        />
      )}
    </div>
  );
}
