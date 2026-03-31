import React, { useState } from 'react';
import { useAuth } from '../App';
import { calculateAnnualVacationDays } from '../lib/vacation';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Calendar, Clock, CheckCircle, XCircle, Plus, Send, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { RequestType } from '../types';

export default function Dashboard() {
  const { profile } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    type: 'vacation' as RequestType,
    startDate: '',
    endDate: '',
    reason: '',
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  if (!profile) return (
    <div className="flex flex-col items-center justify-center h-64 space-y-4">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      <p className="text-slate-500 font-medium text-center">
        Cargando tu perfil... <br/>
        <span className="text-xs">Si esto tarda mucho, intenta recargar la página.</span>
      </p>
    </div>
  );

  const annualDays = calculateAnnualVacationDays(profile.entryDate);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await addDoc(collection(db, 'requests'), {
        userUid: profile.uid,
        userName: profile.displayName,
        managerUid: profile.managerUid || '',
        type: formData.type,
        startDate: formData.startDate,
        endDate: formData.endDate,
        reason: formData.reason,
        status: 'pending_manager',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      setSuccess(true);
      setTimeout(() => {
        setIsModalOpen(false);
        setSuccess(false);
        setFormData({ type: 'vacation', startDate: '', endDate: '', reason: '' });
      }, 2000);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'requests');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Hola, {profile.displayName}</h1>
          <p className="text-slate-500">Gestiona tus vacaciones y permisos desde aquí.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-blue-200 transition-all flex items-center justify-center gap-2"
        >
          <Plus size={20} />
          Nueva Solicitud
        </button>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <motion.div 
          whileHover={{ y: -5 }}
          className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-5"
        >
          <div className="bg-blue-50 p-4 rounded-xl text-blue-600">
            <Calendar size={28} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Derecho Anual</p>
            <p className="text-2xl font-bold text-slate-900">{annualDays} días</p>
          </div>
        </motion.div>

        <motion.div 
          whileHover={{ y: -5 }}
          className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-5"
        >
          <div className="bg-green-50 p-4 rounded-xl text-green-600">
            <CheckCircle size={28} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Días Usados</p>
            <p className="text-2xl font-bold text-slate-900">{profile.usedVacationDays} días</p>
          </div>
        </motion.div>

        <motion.div 
          whileHover={{ y: -5 }}
          className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-5"
        >
          <div className="bg-orange-50 p-4 rounded-xl text-orange-600">
            <Clock size={28} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Días Pendientes</p>
            <p className="text-2xl font-bold text-slate-900">{profile.pendingVacationDays} días</p>
          </div>
        </motion.div>
      </div>

      {/* Info Section */}
      <div className="bg-blue-50 border border-blue-100 p-6 rounded-2xl flex gap-4 items-start">
        <Info className="text-blue-600 shrink-0 mt-1" size={24} />
        <div className="text-sm text-blue-800 space-y-2">
          <p className="font-bold">Información sobre la Ley de Ecuador:</p>
          <p>Según el Código de Trabajo, tienes derecho a 15 días de vacaciones anuales. A partir del quinto año de servicio, recibes un día adicional por cada año excedente, hasta un máximo de 15 días adicionales (total 30 días).</p>
        </div>
      </div>

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-900">Nueva Solicitud</h2>
                <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <XCircle size={24} />
                </button>
              </div>

              {success ? (
                <div className="p-12 text-center space-y-4">
                  <div className="bg-green-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto text-green-600">
                    <CheckCircle size={32} />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900">¡Solicitud Enviada!</h3>
                  <p className="text-slate-500">Tu solicitud ha sido registrada y está pendiente de aprobación.</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Tipo de Solicitud</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, type: 'vacation' })}
                        className={`py-2 px-4 rounded-lg border font-medium transition-all ${formData.type === 'vacation' ? 'bg-blue-600 border-blue-600 text-white shadow-md' : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300'}`}
                      >
                        Vacaciones
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, type: 'permission' })}
                        className={`py-2 px-4 rounded-lg border font-medium transition-all ${formData.type === 'permission' ? 'bg-blue-600 border-blue-600 text-white shadow-md' : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300'}`}
                      >
                        Permiso
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Desde</label>
                      <input
                        type="date"
                        value={formData.startDate}
                        onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Hasta</label>
                      <input
                        type="date"
                        value={formData.endDate}
                        onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Motivo / Observaciones</label>
                    <textarea
                      value={formData.reason}
                      onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none min-h-[100px]"
                      placeholder="Describe el motivo de tu solicitud..."
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-blue-200 transition-all flex items-center justify-center gap-2"
                  >
                    {loading ? 'Enviando...' : (
                      <>
                        <Send size={20} />
                        Enviar Solicitud
                      </>
                    )}
                  </button>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
