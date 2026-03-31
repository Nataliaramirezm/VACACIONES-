import React, { useEffect, useState } from 'react';
import { useAuth } from '../App';
import { collection, query, onSnapshot, doc, updateDoc, getDoc, increment, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { VacationRequest, UserProfile, RequestStatus } from '../types';
import { CheckCircle, XCircle, Calendar, User, FileText, AlertCircle, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast, Toaster } from 'sonner';

export default function ManageRequests() {
  const { profile } = useAuth();
  const [requests, setRequests] = useState<VacationRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const isSuperAdmin = profile?.email === 'nmrm01@gmail.com';
  const canManageHR = profile?.role === 'hr' || isSuperAdmin;
  const canManageManager = profile?.role === 'manager' || isSuperAdmin;

  useEffect(() => {
    if (!profile) return;

    let q;
    if (profile.role === 'hr' || profile.email === 'nmrm01@gmail.com') {
      // HR and Super Admin see everything
      q = query(collection(db, 'requests'));
    } else if (profile.role === 'manager') {
      // Managers only see requests where they are the manager
      q = query(collection(db, 'requests'), where('managerUid', '==', profile.uid));
    } else {
      // Employees shouldn't really be here, but just in case
      q = query(collection(db, 'requests'), where('userUid', '==', profile.uid));
    }
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const reqs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as VacationRequest));
      setRequests(reqs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'requests');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [profile]);

  const handleAction = async (request: VacationRequest, action: 'approve' | 'reject') => {
    const promise = async () => {
      const requestRef = doc(db, 'requests', request.id);
      let nextStatus: RequestStatus = request.status;

      if (action === 'reject') {
        nextStatus = 'rejected';
      } else {
        if (request.status === 'pending_manager') {
          nextStatus = 'pending_hr';
        } else if (request.status === 'pending_hr') {
          nextStatus = 'approved';
        }
      }

      const updateData: any = {
        status: nextStatus,
        updatedAt: new Date().toISOString(),
      };

      // Determine which signature to add
      if (request.status === 'pending_manager' && canManageManager) {
        updateData.managerApproverUid = profile?.uid;
        updateData.managerApproverName = profile?.displayName;
      } else if (request.status === 'pending_hr' && canManageHR) {
        updateData.hrApproverUid = profile?.uid;
        updateData.hrApproverName = profile?.displayName;
      }

      try {
        await updateDoc(requestRef, updateData);

        // If fully approved and it's a vacation, update user's days
        if (nextStatus === 'approved' && request.type === 'vacation') {
          const userRef = doc(db, 'users', request.userUid);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            const start = new Date(request.startDate);
            const end = new Date(request.endDate);
            const diffTime = Math.abs(end.getTime() - start.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

            await updateDoc(userRef, {
              usedVacationDays: increment(diffDays),
              pendingVacationDays: increment(-diffDays),
            });
          }
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `requests/${request.id}`);
      }
    };

    toast.promise(promise(), {
      loading: 'Procesando solicitud...',
      success: `Solicitud ${action === 'approve' ? 'aprobada' : 'rechazada'} correctamente`,
      error: (err) => `Error: ${err.message || 'No tienes permisos para esta acción'}`,
    });
  };

  if (loading) return <div className="flex justify-center p-12">Cargando solicitudes...</div>;

  const pendingRequests = requests.filter(r => 
    (canManageManager && r.status === 'pending_manager') ||
    (canManageHR && r.status === 'pending_hr')
  );
  
  const processedRequests = requests.filter(r => 
    r.status === 'approved' || r.status === 'rejected' || 
    (canManageManager && r.status === 'pending_hr' && !canManageHR)
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending_manager': return <span className="px-2 py-1 rounded-full text-[10px] font-bold uppercase bg-orange-100 text-orange-700">Pendiente Jefe</span>;
      case 'pending_hr': return <span className="px-2 py-1 rounded-full text-[10px] font-bold uppercase bg-blue-100 text-blue-700">Pendiente RRHH</span>;
      case 'approved': return <span className="px-2 py-1 rounded-full text-[10px] font-bold uppercase bg-green-100 text-green-700">Aprobado</span>;
      case 'rejected': return <span className="px-2 py-1 rounded-full text-[10px] font-bold uppercase bg-red-100 text-red-700">Rechazado</span>;
      default: return null;
    }
  };

  return (
    <div className="space-y-8">
      <Toaster position="top-right" richColors />
      <header>
        <h1 className="text-3xl font-bold text-slate-900">Gestión de Solicitudes</h1>
        <p className="text-slate-500">Revisa y aprueba las solicitudes de vacaciones y permisos.</p>
      </header>

      <section className="space-y-4">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <Clock className="text-orange-500" size={20} />
          Pendientes ({pendingRequests.length})
        </h2>
        
        {pendingRequests.length === 0 ? (
          <div className="bg-white p-8 rounded-2xl border border-slate-100 text-center text-slate-500">
            No hay solicitudes pendientes por procesar.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {pendingRequests.map(req => (
              <motion.div
                key={req.id}
                layout
                className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-6"
              >
                <div className="flex items-start gap-4">
                  <div className="bg-slate-50 p-3 rounded-xl text-slate-400">
                    <User size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900">{req.userName}</h3>
                    <p className="text-sm text-slate-500 capitalize">{req.type === 'vacation' ? 'Vacaciones' : 'Permiso'}</p>
                    <p className="text-sm text-slate-600 mt-1 flex items-center gap-2">
                      <Calendar size={14} />
                      {new Date(req.startDate).toLocaleDateString()} - {new Date(req.endDate).toLocaleDateString()}
                    </p>
                    <p className="text-sm text-slate-700 mt-2 italic">"{req.reason}"</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => handleAction(req, 'reject')}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 font-bold transition-all text-sm border border-red-100"
                  >
                    <XCircle size={18} />
                    Rechazar
                  </button>
                  <button 
                    onClick={() => handleAction(req, 'approve')}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-bold transition-all text-sm shadow-lg shadow-green-100"
                  >
                    <CheckCircle size={18} />
                    {req.status === 'pending_manager' ? 'Aprobar (Pasar a RRHH)' : 'Aprobar Final'}
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <CheckCircle className="text-green-500" size={20} />
          Historial Reciente
        </h2>
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-100">
              <tr>
                <th className="px-6 py-4">Empleado</th>
                <th className="px-6 py-4">Tipo</th>
                <th className="px-6 py-4">Fechas</th>
                <th className="px-6 py-4">Estado</th>
                <th className="px-6 py-4">Procesado por</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {processedRequests.slice(0, 10).map(req => (
                <tr key={req.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 font-medium text-slate-900">{req.userName}</td>
                  <td className="px-6 py-4 capitalize">{req.type}</td>
                  <td className="px-6 py-4 text-slate-500">
                    {new Date(req.startDate).toLocaleDateString()} - {new Date(req.endDate).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    {getStatusBadge(req.status)}
                  </td>
                  <td className="px-6 py-4 text-slate-500">
                    <div className="flex flex-col text-[10px]">
                      {req.managerApproverName && <span>Jefe: {req.managerApproverName}</span>}
                      {req.hrApproverName && <span>RRHH: {req.hrApproverName}</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
