import React, { useEffect, useState } from 'react';
import { useAuth } from '../App';
import { collection, query, where, onSnapshot, orderBy, doc, updateDoc, getDoc, increment } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { VacationRequest } from '../types';
import { FileDown, Clock, CheckCircle, XCircle, Calendar, AlertCircle, Ban } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { generateRequestPDF } from '../lib/pdf';
import { toast, Toaster } from 'sonner';
import { formatDate, parseDate } from '../lib/vacation';

export default function Requests() {
  const { profile, user } = useAuth();
  const [requests, setRequests] = useState<VacationRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'requests'),
      where('userUid', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const reqs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as VacationRequest));
      setRequests(reqs);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'requests');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancellationReason, setCancellationReason] = useState('');

  const handleCancel = async (request: VacationRequest) => {
    if (!cancellationReason.trim()) {
      toast.error('Por favor, ingresa el motivo de la cancelación');
      return;
    }

    const promise = async () => {
      const requestRef = doc(db, 'requests', request.id);
      
      try {
        await updateDoc(requestRef, {
          status: 'cancelled',
          cancellationReason: cancellationReason.trim(),
          cancelledAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });

        // If it's a vacation, we need to return the days
        if (request.type === 'vacation') {
          const userRef = doc(db, 'users', request.userUid);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            const start = parseDate(request.startDate);
            const end = parseDate(request.endDate);
            const diffTime = Math.abs(end.getTime() - start.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

            if (request.status === 'approved') {
              await updateDoc(userRef, {
                usedVacationDays: increment(-diffDays),
              });
            } else if (request.status.startsWith('pending_')) {
              await updateDoc(userRef, {
                pendingVacationDays: increment(-diffDays),
              });
            }
          }
        }
        setCancellingId(null);
        setCancellationReason('');
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `requests/${request.id}`);
        throw err;
      }
    };

    toast.promise(promise(), {
      loading: 'Cancelando solicitud...',
      success: 'Solicitud cancelada correctamente',
      error: 'Error al cancelar la solicitud',
    });
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending_manager': return 'Pendiente Jefe';
      case 'pending_gerencia': return 'Pendiente Gerencia';
      case 'pending_replacement': return 'Pendiente Reemplazo';
      case 'pending_hr': return 'Pendiente RRHH';
      case 'approved': return 'Aprobado';
      case 'rejected': return 'Rechazado';
      case 'cancelled': return 'Cancelado';
      default: return status.toUpperCase();
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'bg-green-100 text-green-700 border-green-200';
      case 'rejected': return 'bg-red-100 text-red-700 border-red-200';
      case 'cancelled': return 'bg-slate-100 text-slate-700 border-slate-200';
      case 'pending_gerencia': return 'bg-indigo-100 text-indigo-700 border-indigo-200';
      case 'pending_hr': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'pending_replacement': return 'bg-purple-100 text-purple-700 border-purple-200';
      default: return 'bg-orange-100 text-orange-700 border-orange-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved': return <CheckCircle size={16} />;
      case 'rejected': return <XCircle size={16} />;
      case 'cancelled': return <Ban size={16} />;
      default: return <Clock size={16} />;
    }
  };

  if (loading) return <div className="flex justify-center p-12">Cargando solicitudes...</div>;

  return (
    <div className="space-y-6">
      <Toaster position="top-right" richColors />
      <header>
        <h1 className="text-3xl font-bold text-slate-900">Mis Solicitudes</h1>
        <p className="text-slate-500">Historial de tus vacaciones y permisos solicitados.</p>
      </header>

      {requests.length === 0 ? (
        <div className="bg-white p-12 rounded-2xl border border-dashed border-slate-300 text-center space-y-4">
          <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto text-slate-400">
            <Calendar size={32} />
          </div>
          <p className="text-slate-500 font-medium">No tienes solicitudes registradas aún.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          <AnimatePresence>
            {requests.map((req, index) => (
              <motion.div
                key={req.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-6"
              >
                <div className="flex items-start gap-4">
                  <div className={`p-3 rounded-xl ${req.type === 'vacation' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'}`}>
                    <Calendar size={24} />
                  </div>
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-bold text-slate-900 capitalize">{req.type === 'vacation' ? 'Vacaciones' : 'Permiso'}</h3>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1.5 ${getStatusColor(req.status)}`}>
                        {getStatusIcon(req.status)}
                        {getStatusLabel(req.status)}
                      </span>
                    </div>
                    <p className="text-sm text-slate-500 flex items-center gap-2">
                      <Calendar size={14} />
                      {formatDate(req.startDate)} - {formatDate(req.endDate)}
                    </p>
                    <p className="text-sm text-slate-600 mt-2 line-clamp-1">{req.reason}</p>
                  </div>
                </div>

                <div className="flex flex-col md:items-end gap-3">
                  {req.status !== 'cancelled' && req.status !== 'rejected' && (
                    <>
                      {cancellingId === req.id ? (
                        <motion.div 
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="flex flex-col gap-2 w-full md:w-64"
                        >
                          <textarea
                            placeholder="Motivo de cancelación..."
                            value={cancellationReason}
                            onChange={(e) => setCancellationReason(e.target.value)}
                            className="w-full p-2 text-xs border border-red-200 rounded-lg focus:ring-1 focus:ring-red-500 outline-none resize-none h-20"
                          />
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => handleCancel(req)}
                              className="flex-1 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 transition-colors"
                            >
                              Confirmar Cancelación
                            </button>
                            <button 
                              onClick={() => {
                                setCancellingId(null);
                                setCancellationReason('');
                              }}
                              className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs font-bold hover:bg-slate-200 transition-colors"
                            >
                              No
                            </button>
                          </div>
                        </motion.div>
                      ) : (
                        <button 
                          onClick={() => setCancellingId(req.id)}
                          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 font-medium transition-all text-sm border border-red-100"
                        >
                          <Ban size={18} />
                          Cancelar
                        </button>
                      )}
                    </>
                  )}
                  <button 
                    onClick={() => profile && generateRequestPDF(req, profile)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 font-medium transition-all text-sm border border-slate-200"
                  >
                    <FileDown size={18} />
                    Exportar PDF
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
