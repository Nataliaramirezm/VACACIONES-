import React, { useEffect, useState } from 'react';
import { useAuth } from '../App';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { VacationRequest } from '../types';
import { FileDown, Clock, CheckCircle, XCircle, Calendar, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { generateRequestPDF } from '../lib/pdf';

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

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending_manager': return 'Pendiente Jefe';
      case 'pending_hr': return 'Pendiente RRHH';
      case 'approved': return 'Aprobado';
      case 'rejected': return 'Rechazado';
      default: return status.toUpperCase();
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'bg-green-100 text-green-700 border-green-200';
      case 'rejected': return 'bg-red-100 text-red-700 border-red-200';
      case 'pending_hr': return 'bg-blue-100 text-blue-700 border-blue-200';
      default: return 'bg-orange-100 text-orange-700 border-orange-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved': return <CheckCircle size={16} />;
      case 'rejected': return <XCircle size={16} />;
      default: return <Clock size={16} />;
    }
  };

  if (loading) return <div className="flex justify-center p-12">Cargando solicitudes...</div>;

  return (
    <div className="space-y-6">
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
                      {new Date(req.startDate).toLocaleDateString()} - {new Date(req.endDate).toLocaleDateString()}
                    </p>
                    <p className="text-sm text-slate-600 mt-2 line-clamp-1">{req.reason}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
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
