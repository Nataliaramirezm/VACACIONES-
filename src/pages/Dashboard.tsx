import React, { useState, useEffect } from 'react';
import { useAuth } from '../App';
import { calculateTotalEarnedDays, calculateVacationPeriod, calculatePeriodToUse, calculateProportionalDays } from '../lib/vacation';
import { addDoc, collection, getDocs, query, where, doc, updateDoc, increment } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Calendar, Clock, CheckCircle, XCircle, Plus, Send, Info, Users, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { RequestType, UserProfile, VacationRequest, RequestStatus } from '../types';
import { toast, Toaster } from 'sonner';
import { formatDate, parseDate } from '../lib/vacation';

export default function Dashboard() {
  const { profile } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [formData, setFormData] = useState({
    type: 'vacation' as RequestType,
    startDate: '',
    endDate: '',
    reason: '',
    replacementUid: '',
    gerenciaUid: '',
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const q = query(collection(db, 'users'));
        const snapshot = await getDocs(q);
        const usersList = snapshot.docs
          .map(doc => doc.data() as UserProfile)
          .filter(u => u.uid !== profile?.uid); // Don't allow self-replacement
        setUsers(usersList);
      } catch (error) {
        console.error("Error fetching users:", error);
      }
    };
    if (isModalOpen) fetchUsers();
  }, [isModalOpen, profile?.uid]);

  if (!profile) return (
    <div className="flex flex-col items-center justify-center h-64 space-y-4">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      <p className="text-slate-500 font-medium text-center">
        Cargando tu perfil... <br/>
        <span className="text-xs">Si esto tarda mucho, intenta recargar la página.</span>
      </p>
    </div>
  );


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const replacement = users.find(u => u.uid === formData.replacementUid);
      
      const start = parseDate(formData.startDate);
      const end = parseDate(formData.endDate);
      const diffTime = Math.abs(end.getTime() - start.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

      if (formData.type === 'vacation') {
        const balance = profile.totalVacationDays - profile.usedVacationDays - profile.pendingVacationDays;
        if (diffDays > balance) {
          toast.error(`Saldo insuficiente. Tienes ${balance} días disponibles y solicitaste ${diffDays}.`);
          setLoading(false);
          return;
        }
      }

      let initialStatus: RequestStatus = 'pending_manager';
      let requestManagerUid = profile.managerUid || '';

      if (profile.role === 'manager') {
        initialStatus = 'pending_gerencia';
        requestManagerUid = profile.managerUid || formData.gerenciaUid;
        if (!requestManagerUid) {
          toast.error('Debes tener un Gerente asignado o seleccionarlo.');
          setLoading(false);
          return;
        }
      } else if (profile.role === 'gerencia' || profile.role === 'hr') {
        initialStatus = 'pending_replacement';
      }

      try {
        await addDoc(collection(db, 'requests'), {
          userUid: profile.uid,
          userName: profile.displayName,
          managerUid: requestManagerUid,
          replacementUid: formData.replacementUid,
          replacementName: replacement?.displayName || 'No asignado',
          type: formData.type,
          startDate: formData.startDate,
          endDate: formData.endDate,
          reason: formData.reason,
          status: initialStatus,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, 'requests');
        return;
      }

      if (formData.type === 'vacation') {
        try {
          const userRef = doc(db, 'users', profile.uid);
          await updateDoc(userRef, {
            pendingVacationDays: increment(diffDays)
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, `users/${profile.uid}`);
          return;
        }
      }

      setSuccess(true);
      setTimeout(() => {
        setIsModalOpen(false);
        setSuccess(false);
        setFormData({ type: 'vacation', startDate: '', endDate: '', reason: '', replacementUid: '', gerenciaUid: '' });
      }, 2000);
    } catch (error) {
      // General error fallback
      console.error("Error in handleSubmit:", error);
    } finally {
      setLoading(false);
    }
  };

  const recalculateBalance = async () => {
    if (!profile) return;
    const promise = async () => {
      const q = query(collection(db, 'requests'), where('userUid', '==', profile.uid));
      const snapshot = await getDocs(q);
      const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as VacationRequest));
      
      let used = 0;
      let pending = 0;
      
      requests.forEach(req => {
        if (req.type === 'vacation' && req.status !== 'rejected' && req.status !== 'cancelled') {
          const start = parseDate(req.startDate);
          const end = parseDate(req.endDate);
          const diffTime = Math.abs(end.getTime() - start.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
          
          if (req.status === 'approved') {
            used += diffDays;
          } else if (req.status.startsWith('pending_')) {
            pending += diffDays;
          }
        }
      });
      
      const annualDays = calculateTotalEarnedDays(profile.entryDate);
      
      const userRef = doc(db, 'users', profile.uid);
      await updateDoc(userRef, {
        usedVacationDays: used,
        pendingVacationDays: pending,
        totalVacationDays: annualDays
      });
    };

    toast.promise(promise(), {
      loading: 'Recalculando saldos...',
      success: 'Saldos actualizados correctamente',
      error: 'Error al recalcular saldos'
    });
  };

  return (
    <div className="space-y-8">
      <Toaster position="top-right" richColors />
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Hola, {profile.displayName}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <p className="text-slate-500">Gestiona tus vacaciones y permisos desde aquí.</p>
            <div className="flex gap-2">
              <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border border-amber-200">
                A Utilizar: {profile.manualVacationPeriod || calculatePeriodToUse(profile.entryDate, profile.usedVacationDays)}
              </span>
              <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border border-blue-200">
                En Acumulación: {calculateVacationPeriod(profile.entryDate)}
              </span>
              <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border border-emerald-200" title="Días proporcionales ganados en el periodo actual en acumulación">
                Días Proporcionales: {calculateProportionalDays(profile.entryDate)}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={recalculateBalance}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold transition-all text-xs"
            title="Recalcular saldos si ves valores incorrectos"
          >
            <RotateCcw size={14} />
            Recalcular Saldo
          </button>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-blue-200 transition-all flex items-center justify-center gap-2"
          >
            <Plus size={20} />
            Nueva Solicitud
          </button>
        </div>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <motion.div 
          whileHover={{ y: -5 }}
          className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4"
        >
          <div className="bg-blue-50 p-3 rounded-xl text-blue-600">
            <Calendar size={24} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Ganados</p>
            <p className="text-xl font-bold text-slate-900">{profile.totalVacationDays} días</p>
          </div>
        </motion.div>

        <motion.div 
          whileHover={{ y: -5 }}
          className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4"
        >
          <div className="bg-green-50 p-3 rounded-xl text-green-600">
            <CheckCircle size={24} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Días Usados</p>
            <p className="text-xl font-bold text-slate-900">{profile.usedVacationDays} días</p>
          </div>
        </motion.div>

        <motion.div 
          whileHover={{ y: -5 }}
          className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4"
        >
          <div className="bg-orange-50 p-3 rounded-xl text-orange-600">
            <Clock size={24} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">En Trámite</p>
            <p className="text-xl font-bold text-slate-900">{profile.pendingVacationDays} días</p>
          </div>
        </motion.div>

        <motion.div 
          whileHover={{ y: -5 }}
          className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 ring-2 ring-blue-600 ring-offset-2"
        >
          <div className="bg-blue-600 p-3 rounded-xl text-white">
            <Info size={24} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Saldo Disponible</p>
            <p className="text-xl font-bold text-blue-600">{profile.totalVacationDays - profile.usedVacationDays - profile.pendingVacationDays} días</p>
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
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Reemplazo (Persona que cubrirá tus funciones)</label>
                    <div className="relative">
                      <Users className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <select
                        value={formData.replacementUid}
                        onChange={(e) => setFormData({ ...formData, replacementUid: e.target.value })}
                        className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none appearance-none"
                        required
                      >
                        <option value="">Selecciona un reemplazo...</option>
                        {users.map(user => (
                          <option key={user.uid} value={user.uid}>
                            {user.displayName} ({user.position})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {profile.role === 'manager' && !profile.managerUid && (
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Gerencia (Quién aprobará tu solicitud)</label>
                      <div className="relative">
                        <Users className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <select
                          value={formData.gerenciaUid}
                          onChange={(e) => setFormData({ ...formData, gerenciaUid: e.target.value })}
                          className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none appearance-none"
                          required
                        >
                          <option value="">Selecciona Gerencia...</option>
                          {users
                            .filter(u => u.role === 'gerencia')
                            .map(user => (
                              <option key={user.uid} value={user.uid}>
                                {user.displayName} ({user.position})
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>
                  )}

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
