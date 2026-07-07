import React, { useState, useEffect } from 'react';
import { Client } from './types';
import { ClientList } from './components/ClientList';
import { ClientDetail } from './components/ClientDetail';
import { Sparkles, Users, User, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [appMode, setAppMode] = useState<'pt' | 'single'>('pt');

  // Load clients and app mode from localStorage on mount
  useEffect(() => {
    const storedClients = localStorage.getItem('aesthetic_clients');
    if (storedClients) {
      try {
        setClients(JSON.parse(storedClients));
      } catch (e) {
        console.error("Failed to parse clients", e);
      }
    }

    const storedMode = localStorage.getItem('aesthetic_app_mode');
    if (storedMode === 'pt' || storedMode === 'single') {
      setAppMode(storedMode);
    }
  }, []);

  // Save clients to localStorage when updated
  useEffect(() => {
    localStorage.setItem('aesthetic_clients', JSON.stringify(clients));
  }, [clients]);

  // Save app mode when changed
  useEffect(() => {
    localStorage.setItem('aesthetic_app_mode', appMode);
    
    if (appMode === 'single') {
      // Look for a special single user client, or create one
      const singleUser = clients.find(c => c.id === 'single-user-profile');
      if (!singleUser) {
        const newUser: Client = {
          id: 'single-user-profile',
          name: 'Mio Profilo Utente',
          createdAt: Date.now(),
        };
        setClients(prev => [...prev, newUser]);
        setSelectedClientId('single-user-profile');
      } else {
        setSelectedClientId('single-user-profile');
      }
    } else {
      // In PT mode, if the selected client is the single-user, reset selection
      if (selectedClientId === 'single-user-profile') {
        setSelectedClientId(null);
      }
    }
  }, [appMode]);

  const handleCreateClient = (name: string) => {
    const newClient: Client = {
      id: crypto.randomUUID(),
      name,
      createdAt: Date.now(),
    };
    setClients(prev => [...prev, newClient]);
    setSelectedClientId(newClient.id);
  };

  const handleUpdateClient = (updatedClient: Client) => {
    setClients(prev => prev.map(c => c.id === updatedClient.id ? updatedClient : c));
  };

  const selectedClient = clients.find(c => c.id === selectedClientId);

  return (
    <div className="min-h-screen bg-[#FAF9F6] font-sans text-slate-800 selection:bg-emerald-100 flex flex-col">
      {/* Super Minimal Premium Header */}
      <header className="w-full bg-[#FAF9F6] border-b border-slate-100 px-6 py-5 flex flex-col md:flex-row items-center justify-between gap-4 max-w-5xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-xs">
            <Sparkles size={20} className="animate-pulse" />
          </div>
          <div>
            <span className="text-[10px] tracking-wider uppercase font-semibold text-slate-400 block">AI CLINICAL SCANNER</span>
            <h1 className="text-xl font-bold tracking-tight text-slate-800">AestheticFit Pro</h1>
          </div>
        </div>

        {/* Super Minimal Segmented Switch */}
        <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200/40 shadow-xs">
          <button 
            onClick={() => setAppMode('pt')}
            className={`flex items-center gap-2 px-5 py-2.5 text-xs font-semibold rounded-xl transition duration-200 ${appMode === 'pt' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <Users size={14} /> Modale PT + Clienti
          </button>
          <button 
            onClick={() => setAppMode('single')}
            className={`flex items-center gap-2 px-5 py-2.5 text-xs font-semibold rounded-xl transition duration-200 ${appMode === 'single' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <User size={14} /> Modale Utente Singolo
          </button>
        </div>
      </header>

      {/* Tech info badge - Google Gemini 3.1 Pro Preview */}
      <div className="w-full max-w-2xl mx-auto px-6 pt-4">
        <div className="bg-emerald-50/60 border border-emerald-100/80 rounded-2xl p-3 flex items-center gap-3 text-emerald-800">
          <ShieldCheck size={16} className="text-emerald-500 flex-shrink-0" />
          <p className="text-[11px] leading-relaxed font-medium">
            Diagnostica premium integrata con il modello d'eccellenza <b>Google Gemini 3.1 Pro</b>. Calcolo biometrico standardizzato basato sulle scale cliniche <b>SkinPlus</b>, <b>Hintime</b> e <b>Nürnberger-Müller</b>.
          </p>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-6">
        <AnimatePresence mode="wait">
          {selectedClient ? (
            <motion.div
              key="detail"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <ClientDetail 
                client={selectedClient}
                onBack={appMode === 'single' ? () => {} : () => setSelectedClientId(null)}
                showBackButton={appMode !== 'single'}
                onUpdateClient={handleUpdateClient}
              />
            </motion.div>
          ) : (
            <motion.div
              key="list"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <ClientList 
                clients={clients}
                onSelectClient={(c) => setSelectedClientId(c.id)}
                onCreateClient={handleCreateClient}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
