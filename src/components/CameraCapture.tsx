import React, { useState, useRef, useEffect } from 'react';
import { Camera, X, RefreshCw, Upload, Image as ImageIcon, Sparkles, AlertCircle } from 'lucide-react';
import { generateDemoScans } from '../utils/demoScans';

interface CameraCaptureProps {
  steps: string[];
  mode: 'face' | 'body';
  onComplete: (imagesBase64: string[]) => void;
  onCancel: () => void;
}

export function CameraCapture({ steps, mode, onComplete, onCancel }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [images, setImages] = useState<string[]>([]);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [activeTab, setActiveTab] = useState<'camera' | 'upload'>('camera');
  const [cameraError, setCameraError] = useState<boolean>(false);

  useEffect(() => {
    if (activeTab === 'camera') {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [facingMode, activeTab]);

  const startCamera = async () => {
    stopCamera();
    setCameraError(false);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 640 }, height: { ideal: 640 } }
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      setCameraError(true);
      setActiveTab('upload'); // fallback to upload
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const toggleCamera = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };

  // Resize and compress base64 image helper
  const resizeImage = (src: string, maxWidth = 400, maxHeight = 400): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.7)); // 0.7 quality saves tons of space
        } else {
          resolve(src);
        }
      };
      img.onerror = () => resolve(src);
      img.src = src;
    });
  };

  const captureImage = async () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      const size = Math.min(video.videoWidth, video.videoHeight);
      canvas.width = size;
      canvas.height = size;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const sx = (video.videoWidth - size) / 2;
        const sy = (video.videoHeight - size) / 2;
        ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size);
        
        const rawData = canvas.toDataURL('image/jpeg', 0.9);
        const compressedData = await resizeImage(rawData);
        
        const newImages = [...images, compressedData];
        setImages(newImages);
        
        if (currentStep < steps.length - 1) {
          setCurrentStep(currentStep + 1);
        } else {
          stopCamera();
          onComplete(newImages);
        }
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const reader = new FileReader();
    reader.onload = async (event) => {
      const result = event.target?.result as string;
      if (result) {
        const compressedData = await resizeImage(result);
        const newImages = [...images, compressedData];
        setImages(newImages);
        
        if (currentStep < steps.length - 1) {
          setCurrentStep(currentStep + 1);
        } else {
          onComplete(newImages);
        }
      }
    };
    reader.readAsDataURL(file);
    if (e.target) e.target.value = '';
  };

  const handleDemoSimulation = () => {
    const demoPics = generateDemoScans(mode);
    onComplete(demoPics);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-md z-50 flex flex-col font-sans items-center justify-center p-4">
      {/* Container Card */}
      <div className="w-full max-w-lg bg-[#FAF9F6] rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        
        {/* Top Header */}
        <div className="p-5 border-b border-slate-150 flex justify-between items-center bg-white">
          <button 
            onClick={onCancel} 
            className="p-3 bg-slate-100 hover:bg-slate-200 rounded-2xl text-slate-700 transition active:scale-95 flex items-center justify-center border border-slate-200"
          >
            <X size={18} />
          </button>
          <div className="text-center">
            <span className="text-[10px] text-slate-400 font-bold tracking-widest block uppercase">Fase {currentStep + 1} di {steps.length}</span>
            <span className="text-sm font-black text-slate-800 mt-0.5 block">{steps[currentStep]}</span>
          </div>
          <div className="w-11" /> {/* Spacer */}
        </div>

        {/* Tabs - Beautiful pastel pill selectors */}
        <div className="flex bg-slate-100 p-1 rounded-2xl my-4 mx-6 border border-slate-200/50">
          <button 
            onClick={() => setActiveTab('camera')}
            className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition duration-200 flex items-center justify-center gap-1.5 ${activeTab === 'camera' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <Camera size={14} /> Usa Fotocamera
          </button>
          <button 
            onClick={() => setActiveTab('upload')}
            className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition duration-200 flex items-center justify-center gap-1.5 ${activeTab === 'upload' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <Upload size={14} /> Carica Immagine
          </button>
        </div>

        {/* Main View Area */}
        <div className="flex-1 overflow-y-auto px-6 pb-6 flex flex-col justify-center items-center">
          
          {activeTab === 'camera' ? (
            <div className="w-full max-w-xs aspect-square bg-slate-900 rounded-[2rem] overflow-hidden relative border border-slate-200 shadow-inner flex items-center justify-center">
              {cameraError ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-slate-400 bg-slate-900">
                  <AlertCircle size={36} className="text-amber-500 mb-2.5" />
                  <p className="font-bold text-white text-sm mb-1">Fotocamera disattivata</p>
                  <p className="text-[11px] leading-relaxed max-w-[200px]">Permessi negati o nessun dispositivo video. Usa il caricamento file o la simulazione demo.</p>
                </div>
              ) : (
                <>
                  <video 
                    ref={videoRef} 
                    autoPlay 
                    playsInline 
                    muted 
                    className="w-full h-full object-cover scale-x-[-1]" 
                  />
                  <canvas ref={canvasRef} className="hidden" />
                  
                  {/* Grid overlay */}
                  <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4">
                    <div className="flex justify-between">
                      <div className="w-4 h-4 border-t-2 border-l-2 border-emerald-500/70" />
                      <div className="w-4 h-4 border-t-2 border-r-2 border-emerald-500/70" />
                    </div>
                    
                    {/* Circle guide */}
                    <div className="absolute inset-0 m-auto w-44 h-44 border-2 border-dashed border-emerald-500/40 rounded-full flex items-center justify-center">
                      <div className="w-36 h-36 border border-emerald-500/20 rounded-full flex items-center justify-center">
                        <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping" />
                      </div>
                    </div>

                    <div className="flex justify-between">
                      <div className="w-4 h-4 border-b-2 border-l-2 border-emerald-500/70" />
                      <div className="w-4 h-4 border-b-2 border-r-2 border-emerald-500/70" />
                    </div>
                  </div>

                  {/* Flip button */}
                  <button 
                    onClick={toggleCamera} 
                    className="absolute bottom-4 right-4 p-3 rounded-xl bg-slate-950/80 hover:bg-slate-900 text-white transition active:scale-95 border border-slate-800"
                  >
                    <RefreshCw size={16} />
                  </button>
                </>
              )}
            </div>
          ) : (
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="w-full max-w-xs aspect-square bg-white border-2 border-dashed border-slate-250 rounded-[2rem] flex flex-col items-center justify-center p-6 text-center cursor-pointer hover:border-emerald-500 hover:bg-emerald-50/5 transition duration-300 group"
            >
              <input 
                type="file" 
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept="image/*"
                className="hidden"
              />
              <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 mb-3.5 group-hover:bg-emerald-50 group-hover:text-emerald-600 transition duration-300 border border-slate-100">
                <ImageIcon size={24} />
              </div>
              <p className="font-bold text-slate-800 text-sm mb-1">Seleziona o trascina la foto</p>
              <p className="text-[11px] text-slate-400 leading-relaxed mb-4">Carica un'immagine nitida e luminosa per:<br /><span className="text-emerald-600 font-bold">{steps[currentStep]}</span></p>
              <span className="bg-slate-900 text-white text-[11px] font-bold px-4 py-2.5 rounded-xl hover:bg-slate-800 transition active:scale-95">
                Sfoglia File
              </span>
            </div>
          )}

          {/* Simulated scanning shortcuts */}
          <div className="mt-6 text-center w-full max-w-xs border-t border-slate-200/50 pt-5">
            <p className="text-[10px] text-slate-400 font-medium mb-2.5">Non hai foto sottomano? Prova la nostra tecnologia istantaneamente:</p>
            <button 
              onClick={handleDemoSimulation}
              className="w-full bg-[#EBF7F2] border border-[#DCF2E8] text-[#1b6145] hover:bg-[#d8efe5] py-3 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition duration-200 active:scale-98"
            >
              <Sparkles size={14} className="animate-spin text-emerald-600" />
              ESEGUI DIAGNOSI INTEGRATA DEMO
            </button>
          </div>
        </div>

        {/* Capture trigger button */}
        {activeTab === 'camera' && !cameraError && (
          <div className="p-5 border-t border-slate-150 bg-white flex justify-center items-center">
            <button 
              onClick={captureImage}
              className="w-16 h-16 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full flex items-center justify-center transition duration-200 active:scale-90 border-4 border-emerald-100/50 shadow-md"
            >
              <Camera size={24} />
            </button>
          </div>
        )}

        {/* Capture Indicators Progress Bar */}
        {images.length > 0 && (
          <div className="bg-slate-50 p-3 flex justify-center gap-2.5 border-t border-slate-100">
            {steps.map((_, idx) => (
              <div 
                key={idx} 
                className={`h-2.5 rounded-full transition-all duration-300 ${
                  idx < images.length ? 'w-8 bg-emerald-500' : 'w-2.5 bg-slate-200'
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
