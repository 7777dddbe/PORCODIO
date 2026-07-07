import React, { useState, useMemo } from 'react';
import { Client } from '../types';
import { Search, Plus, User, ChevronRight, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ClientListProps {
  clients: Client[];
  onSelectClient: (client: Client) => void;
  onCreateClient: (name: string) => void;
}

export function ClientList({ clients, onSelectClient, onCreateClient }: ClientListProps) {
  const [search, setSearch] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');

  const filteredClients = useMemo(() => {
    // Filter out the special single-user profile to prevent duplicates in PT view
    return clients
      .filter(c => c.id !== 'single-user-profile')
      .filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [clients, search]);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (newName.trim()) {
      onCreateClient(newName.trim());
      setNewName('');
      setIsAdding(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Title */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Registro Clienti</h2>
        <p className="text-xs text-slate-400 font-medium mt-1">Seleziona o crea una scheda cliente per avviare la diagnostica.</p>
      </div>

      {/* Giant Search and Plus Row */}
      <div className="flex gap-4 mb-8">
        <div className="flex-1 relative">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Cerca un cliente..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-13 pr-5 py-4 bg-white border border-slate-150 rounded-[1.5rem] outline-none focus:ring-2 focus:ring-emerald-400/20 focus:border-emerald-400 text-slate-800 transition duration-200 text-sm font-medium shadow-xs"
          />
        </div>
        <button 
          onClick={() => setIsAdding(!isAdding)}
          className="bg-slate-900 text-white px-6 rounded-[1.5rem] hover:bg-slate-800 transition active:scale-95 flex items-center justify-center gap-2 font-bold text-xs shadow-xs"
        >
          <Plus size={18} /> Nuovo Cliente
        </button>
      </div>

      {/* Add Client Drawer Form */}
      <AnimatePresence>
        {isAdding && (
          <motion.form 
            initial={{ opacity: 0, height: 0 }} 
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={handleCreate} 
            className="overflow-hidden mb-8 p-5 bg-white rounded-[1.5rem] border border-slate-150 shadow-xs flex flex-col sm:flex-row gap-3"
          >
            <input 
              type="text" 
              placeholder="Nome e Cognome del Cliente" 
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="flex-1 px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-400/20 text-sm font-medium"
              autoFocus
            />
            <button 
              type="submit" 
              disabled={!newName.trim()}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3.5 rounded-xl font-bold text-xs disabled:opacity-50 transition active:scale-95"
            >
              Aggiungi Scheda
            </button>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Client List */}
      <div className="space-y-4">
        {filteredClients.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-[2rem] border border-slate-100/80 shadow-xs text-slate-400">
            <User size={36} className="mx-auto mb-3 text-slate-300" />
            <p className="font-semibold text-slate-500 text-sm">Nessun cliente registrato</p>
            <p className="text-xs max-w-xs mx-auto mt-1">Crea un profilo con il bottone "Nuovo Cliente" per iniziare a salvare le foto e le analisi.</p>
          </div>
        ) : (
          filteredClients.map(client => (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              key={client.id}
              onClick={() => onSelectClient(client)}
              className="bg-white p-5 rounded-[1.8rem] flex items-center justify-between gap-4 cursor-pointer hover:shadow-md transition-all duration-300 border border-slate-150 group active:scale-[0.99]"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-emerald-50 group-hover:text-emerald-600 transition duration-300 border border-slate-100 font-bold">
                  {client.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="font-bold text-slate-800 text-sm group-hover:text-slate-900 transition">{client.name}</div>
                  <div className="text-[10px] text-slate-400 mt-1 flex flex-wrap gap-2 font-medium">
                    {client.faceAnalysis ? (
                      <span className="bg-[#EAF7F2] text-[#1b6145] px-2 py-0.5 rounded-md border border-[#d2edd6]">Viso ✓</span>
                    ) : (
                      <span className="bg-slate-50 text-slate-400 px-2 py-0.5 rounded-md border border-slate-100">Viso non eseguito</span>
                    )}
                    {client.bodyAnalysis ? (
                      <span className="bg-[#FFF0F2] text-[#8e2435] px-2 py-0.5 rounded-md border border-[#ffd2d9]">Corpo ✓</span>
                    ) : (
                      <span className="bg-slate-50 text-slate-400 px-2 py-0.5 rounded-md border border-slate-100">Corpo non eseguito</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="text-slate-300 group-hover:text-slate-600 transition">
                <ChevronRight size={20} />
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
