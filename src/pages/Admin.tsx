import React, { useEffect, useState } from 'react';
import { useAuth } from '../App';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot, doc, updateDoc, getDocs, query, where, deleteDoc, getDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { UserProfile, UserRole } from '../types';
import { Users, FileUp, Download, Search, AlertCircle, CheckCircle, Save, Trash2, Edit2, X, RotateCcw, Key } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import * as XLSX from 'xlsx';
import { toast, Toaster } from 'sonner';
import { calculateTotalEarnedDays, formatDate, parseDate, calculateVacationPeriod, calculatePeriodToUse, calculateProportionalDays } from '../lib/vacation';

export default function Admin() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [uploadStatus, setUploadStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  
  const isSuperAdmin = profile?.email === 'nmrm01@gmail.com';
  const canEdit = profile?.role === 'gerencia' || isSuperAdmin;
  
  // Edit Modal State
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [editFormData, setEditFormData] = useState<Partial<UserProfile>>({});
  
  // Delete Confirmation State
  const [userToDelete, setUserToDelete] = useState<string | null>(null);

  // Password Change State
  const [passwordUser, setPasswordUser] = useState<UserProfile | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  useEffect(() => {
    if (!profile) return;
    
    // Only fetch if HR, Gerencia or Super Admin
    const isSuperAdmin = profile.email === 'nmrm01@gmail.com' || profile.email === 'asis.tthh@compufacil.com.ec';
    const canAccessAdmin = profile.role === 'hr' || profile.role === 'gerencia' || isSuperAdmin;
    
    if (!canAccessAdmin) {
      setLoading(false);
      return;
    }

    const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
      const u = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
      setUsers(u);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [profile]);

  const handleExportRequests = async () => {
    try {
      const q = query(collection(db, 'requests'));
      const snapshot = await getDocs(q);
      const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));

      if (requests.length === 0) {
        toast.error('No hay solicitudes para exportar');
        return;
      }

      const exportData = requests.map(req => ({
        'ID': req.id,
        'Empleado': req.userName,
        'Tipo': req.type === 'vacation' ? 'Vacaciones' : 'Permiso',
        'Desde': formatDate(req.startDate),
        'Hasta': formatDate(req.endDate),
        'Estado': req.status.replace('pending_', 'Pendiente ').replace('approved', 'Aprobado').replace('rejected', 'Rechazado').replace('cancelled', 'Cancelado'),
        'Motivo': req.reason,
        'Reemplazo': req.replacementName || 'N/A',
        'Aprobador Jefe': req.managerApproverName || 'Pendiente',
        'Aprobador Gerencia': req.gerenciaApproverName || 'Pendiente',
        'Aprobador Reemplazo': req.replacementApproverName || 'Pendiente',
        'Aprobador RRHH': req.hrApproverName || 'Pendiente',
        'Fecha Creación': new Date(req.createdAt).toLocaleString(),
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Solicitudes");
      XLSX.writeFile(wb, `Reporte_Global_Solicitudes_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success('Reporte de solicitudes exportado correctamente');
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'requests');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

        let updatedCount = 0;
        let errorCount = 0;

        for (const row of jsonData) {
          const email = row.email || row.Email;
          if (!email) continue;

          // Find user by email
          const q = query(collection(db, 'users'), where('email', '==', email));
          const querySnapshot = await getDocs(q);

          if (!querySnapshot.empty) {
            const userDoc = querySnapshot.docs[0];
            const userRef = doc(db, 'users', userDoc.id);
            
            const updateData: any = {};
            if (row.totalVacationDays !== undefined) updateData.totalVacationDays = Number(row.totalVacationDays);
            if (row.usedVacationDays !== undefined) updateData.usedVacationDays = Number(row.usedVacationDays);
            if (row.pendingVacationDays !== undefined) updateData.pendingVacationDays = Number(row.pendingVacationDays);
            if (row.position !== undefined) updateData.position = row.position;
            if (row.manualVacationPeriod !== undefined) updateData.manualVacationPeriod = String(row.manualVacationPeriod);

            await updateDoc(userRef, updateData);
            updatedCount++;
          } else {
            errorCount++;
          }
        }

        setUploadStatus({ 
          type: 'success', 
          message: `Se actualizaron ${updatedCount} usuarios correctamente. ${errorCount > 0 ? `${errorCount} correos no encontrados.` : ''}` 
        });
      } catch (error) {
        console.error('Error processing Excel:', error);
        setUploadStatus({ type: 'error', message: 'Error al procesar el archivo. Verifica el formato.' });
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleRoleChange = async (uid: string, newRole: UserRole) => {
    try {
      await updateDoc(doc(db, 'users', uid), { role: newRole });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
    }
  };

  const handleManagerChange = async (uid: string, newManagerUid: string) => {
    try {
      await updateDoc(doc(db, 'users', uid), { managerUid: newManagerUid });
      toast.success('Jefe actualizado correctamente');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    
    const user = users.find(u => u.uid === userToDelete);
    const isSuperAdmin = user?.email === 'nmrm01@gmail.com' || user?.email === 'asis.tthh@compufacil.com.ec';
    
    if (isSuperAdmin && auth.currentUser?.email !== 'nmrm01@gmail.com') {
      toast.error('No tienes permisos para eliminar una cuenta de Súper Administrador.');
      setUserToDelete(null);
      return;
    }

    if (user?.email === 'nmrm01@gmail.com') {
      toast.error('No se puede eliminar la cuenta principal del Súper Administrador por seguridad.');
      setUserToDelete(null);
      return;
    }

    const promise = async () => {
      // 1. Delete from Firestore first (while we still have the Auth token)
      try {
        // Delete user's requests
        const requestsQuery = query(collection(db, 'requests'), where('userUid', '==', userToDelete));
        const requestsSnapshot = await getDocs(requestsQuery);
        const deletePromises = requestsSnapshot.docs.map(doc => deleteDoc(doc.ref));
        await Promise.all(deletePromises);

        // Delete user profile
        await deleteDoc(doc(db, 'users', userToDelete));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `users/${userToDelete}`);
      }

      // 2. Delete from Auth via our API
      const response = await fetch('/api/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: userToDelete }),
      });
      
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Error al eliminar cuenta de acceso');
      }

      if (data.warning) {
        toast.warning(data.warning);
      }

      // If the user deleted themselves, sign out
      if (userToDelete === auth.currentUser?.uid) {
        await signOut(auth);
        navigate('/login');
      }
      
      setUserToDelete(null);
    };

    toast.promise(promise(), {
      loading: 'Eliminando usuario...',
      success: 'Usuario eliminado correctamente',
      error: (err) => err.message || 'Error al eliminar usuario',
    });
  };

  const handleEditClick = (user: UserProfile) => {
    setEditingUser(user);
    setEditFormData({
      displayName: user.displayName,
      position: user.position,
      totalVacationDays: user.totalVacationDays,
      usedVacationDays: user.usedVacationDays,
      pendingVacationDays: user.pendingVacationDays,
      managerUid: user.managerUid || '',
    });
  };

  const handleSaveEdit = async () => {
    if (!editingUser) return;
    const promise = async () => {
      try {
        const userRef = doc(db, 'users', editingUser.uid);
        await updateDoc(userRef, editFormData);
        setEditingUser(null);
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${editingUser.uid}`);
      }
    };

    toast.promise(promise(), {
      loading: 'Guardando cambios...',
      success: 'Usuario actualizado correctamente',
      error: 'Error al actualizar usuario',
    });
  };

  const managers = users.filter(u => u.role === 'manager' || u.role === 'hr' || u.role === 'gerencia');

  const filteredUsers = users.filter(u => 
    u.displayName.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleUpdatePassword = async () => {
    if (!passwordUser || !newPassword) return;
    if (newPassword.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const response = await fetch('/api/admin/update-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminUid: profile?.uid,
          targetUid: passwordUser.uid,
          newPassword
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      toast.success('Contraseña actualizada correctamente');
      setPasswordUser(null);
      setNewPassword('');
    } catch (error: any) {
      console.error('Error updating password:', error);
      toast.error(`Error: ${error.message}`);
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  if (loading) return <div className="flex justify-center p-12">Cargando usuarios...</div>;

  return (
    <div className="space-y-8 pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">
            Panel de {profile?.role === 'gerencia' ? 'Gerencia' : 'Administración'}
          </h1>
          <p className="text-slate-500">Control total de usuarios, permisos y saldos de vacaciones.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={handleExportRequests}
            className="bg-emerald-50 border border-emerald-200 hover:border-emerald-500 text-emerald-700 px-4 py-2.5 rounded-xl font-bold transition-all flex items-center gap-2 shadow-sm"
          >
            <Download size={20} className="text-emerald-600" />
            <span>Exportar Solicitudes</span>
          </button>

          <button
            onClick={async () => {
              const promise = async () => {
                const usersSnap = await getDocs(collection(db, 'users'));
                const requestsSnap = await getDocs(collection(db, 'requests'));
                const allRequests = requestsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
                
                for (const userDoc of usersSnap.docs) {
                  const userData = userDoc.data() as UserProfile;
                  const userRequests = allRequests.filter(r => r.userUid === userDoc.id);
                  
                  let used = 0;
                  let pending = 0;
                  
                  userRequests.forEach(req => {
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
                  
                  const annualDays = calculateTotalEarnedDays(userData.entryDate);
                  await updateDoc(userDoc.ref, {
                    usedVacationDays: used,
                    pendingVacationDays: pending,
                    totalVacationDays: annualDays
                  });
                }
              };

              toast.promise(promise(), {
                loading: 'Recalculando todos los saldos...',
                success: 'Saldos de todos los usuarios actualizados',
                error: 'Error al recalcular saldos'
              });
            }}
            className="bg-orange-50 border border-orange-200 hover:border-orange-500 text-orange-700 px-4 py-2.5 rounded-xl font-bold transition-all flex items-center gap-2 shadow-sm"
          >
            <RotateCcw size={20} className="text-orange-600" />
            <span>Recalcular Todo</span>
          </button>

          <label className="bg-white border border-slate-200 hover:border-blue-500 text-slate-700 px-4 py-2.5 rounded-xl font-bold transition-all flex items-center gap-2 cursor-pointer shadow-sm">
            <FileUp size={20} className="text-blue-600" />
            <span>Actualizar vía Excel</span>
            <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleFileUpload} />
          </label>
        </div>
      </header>

      {uploadStatus && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`p-4 rounded-xl border flex items-center gap-3 ${uploadStatus.type === 'success' ? 'bg-green-50 border-green-100 text-green-700' : 'bg-red-50 border-red-100 text-red-700'}`}
        >
          {uploadStatus.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
          <span className="text-sm font-medium">{uploadStatus.message}</span>
          <button onClick={() => setUploadStatus(null)} className="ml-auto text-xs font-bold uppercase tracking-wider">Cerrar</button>
        </motion.div>
      )}

      {/* Search and Filters */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Buscar por nombre o correo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
          />
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-100">
              <tr>
                <th className="px-6 py-4">Usuario</th>
                <th className="px-6 py-4">Cargo / Rol</th>
                <th className="px-6 py-4">Ingreso</th>
                <th className="px-6 py-4">Periodos</th>
                <th className="px-6 py-4 text-center">Totales</th>
                <th className="px-6 py-4 text-center">Usados</th>
                <th className="px-6 py-4 text-center">Pendientes</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredUsers.map(u => (
                <tr key={u.uid} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="bg-blue-100 text-blue-600 w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs">
                        {u.displayName.charAt(0)}
                      </div>
                      <div>
                        <p className="font-bold text-slate-900">{u.displayName}</p>
                        <p className="text-xs text-slate-500">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-slate-700 font-medium">{u.position}</p>
                    <div className="flex flex-col gap-1 mt-1">
                      {canEdit ? (
                        <select 
                          value={u.role}
                          onChange={(e) => handleRoleChange(u.uid, e.target.value as UserRole)}
                          className="text-[10px] uppercase font-bold bg-slate-100 border-none rounded px-1.5 py-0.5 focus:ring-1 focus:ring-blue-500 outline-none"
                        >
                          <option value="employee">Empleado</option>
                          <option value="manager">Jefe</option>
                          <option value="gerencia">Gerencia</option>
                          <option value="hr">RRHH</option>
                        </select>
                      ) : (
                        <span className="text-[10px] uppercase font-bold bg-slate-100 text-slate-600 rounded px-1.5 py-0.5">
                          {u.role === 'employee' ? 'Empleado' : u.role === 'manager' ? 'Jefe' : u.role === 'gerencia' ? 'Gerencia' : 'RRHH'}
                        </span>
                      )}
                      
                      {(u.role === 'employee' || u.role === 'manager') && (
                        canEdit ? (
                          <select 
                            value={u.managerUid || ''}
                            onChange={(e) => handleManagerChange(u.uid, e.target.value)}
                            className="text-[10px] font-medium bg-blue-50 border-none rounded px-1.5 py-0.5 focus:ring-1 focus:ring-blue-500 outline-none"
                          >
                            <option value="">{u.role === 'manager' ? 'Sin Gerencia' : 'Sin Jefe'}</option>
                            {users.filter(m => m.uid !== u.uid && (m.role === 'manager' || m.role === 'gerencia' || m.role === 'hr')).map(m => (
                              <option key={m.uid} value={m.uid}>{m.displayName} ({m.role === 'gerencia' ? 'Gerencia' : 'Jefe'})</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-[10px] font-medium bg-blue-50 text-blue-700 rounded px-1.5 py-0.5">
                            {users.find(m => m.uid === u.managerUid)?.displayName || (u.role === 'manager' ? 'Sin Gerencia' : 'Sin Jefe')}
                          </span>
                        )
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-500">
                    {formatDate(u.entryDate)}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] font-bold bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full uppercase tracking-wider border border-amber-100">
                        A Utilizar: {u.manualVacationPeriod || calculatePeriodToUse(u.entryDate, u.usedVacationDays)}
                      </span>
                      <span className="text-[9px] font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full uppercase tracking-wider border border-blue-100">
                        Acumulando: {calculateVacationPeriod(u.entryDate)}
                      </span>
                      <span className="text-[9px] font-bold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full uppercase tracking-wider border border-emerald-100" title="Días proporcionales ganados en el periodo actual en acumulación">
                        Proporcionales: {calculateProportionalDays(u.entryDate)}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center font-bold text-slate-900">{u.totalVacationDays}</td>
                  <td className="px-6 py-4 text-center font-bold text-green-600">{u.usedVacationDays}</td>
                  <td className="px-6 py-4 text-center font-bold text-orange-600">{u.pendingVacationDays}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {canEdit && (
                        <>
                          <button 
                            onClick={() => setPasswordUser(u)}
                            className="p-2 text-slate-400 hover:text-amber-600 transition-colors"
                            title="Cambiar Contraseña"
                          >
                            <Key size={18} />
                          </button>
                          <button 
                            onClick={() => handleEditClick(u)}
                            className="p-2 text-slate-400 hover:text-blue-600 transition-colors"
                          >
                            <Edit2 size={18} />
                          </button>
                          {u.email !== 'nmrm01@gmail.com' && (
                            <button 
                              onClick={() => setUserToDelete(u.uid)}
                              className="p-2 text-slate-400 hover:text-red-600 transition-colors"
                            >
                              <Trash2 size={18} />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Help Card */}
      <div className="bg-slate-900 text-white p-8 rounded-3xl flex flex-col md:flex-row items-center gap-8">
        <div className="bg-blue-600/20 p-6 rounded-2xl text-blue-400">
          <Download size={48} />
        </div>
        <div className="flex-1 space-y-2 text-center md:text-left">
          <h3 className="text-xl font-bold">Formato de Excel para Carga Masiva</h3>
          <p className="text-slate-400 text-sm">El archivo debe contener las columnas: <code className="bg-slate-800 px-2 py-1 rounded text-blue-400">email</code>, <code className="bg-slate-800 px-2 py-1 rounded text-blue-400">totalVacationDays</code>, <code className="bg-slate-800 px-2 py-1 rounded text-blue-400">usedVacationDays</code>, <code className="bg-slate-800 px-2 py-1 rounded text-blue-400">pendingVacationDays</code>, <code className="bg-slate-800 px-2 py-1 rounded text-blue-400">manualVacationPeriod</code>.</p>
        </div>
        <button 
          onClick={() => {
            const ws = XLSX.utils.json_to_sheet([{ email: 'ejemplo@empresa.com', totalVacationDays: 15, usedVacationDays: 0, pendingVacationDays: 15, manualVacationPeriod: 'Enero 2023 - Enero 2024' }]);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Plantilla");
            XLSX.writeFile(wb, "Plantilla_Vacaciones.xlsx");
          }}
          className="bg-white text-slate-900 px-6 py-3 rounded-xl font-bold hover:bg-slate-100 transition-all shrink-0"
        >
          Descargar Plantilla
        </button>
      </div>

      {/* Edit User Modal */}
      <AnimatePresence>
        {editingUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-900">Editar Usuario</h2>
                <button onClick={() => setEditingUser(null)} className="text-slate-400 hover:text-slate-600">
                  <X size={24} />
                </button>
              </div>
              
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Nombre</label>
                  <input 
                    type="text" 
                    value={editFormData.displayName || ''} 
                    onChange={(e) => setEditFormData({...editFormData, displayName: e.target.value})}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Cargo</label>
                    <input 
                      type="text" 
                      value={editFormData.position || ''} 
                      onChange={(e) => setEditFormData({...editFormData, position: e.target.value})}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Jefe Inmediato</label>
                    <select
                      value={editFormData.managerUid || ''}
                      onChange={(e) => setEditFormData({...editFormData, managerUid: e.target.value})}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value="">Sin Jefe</option>
                      {users
                        .filter(u => (u.role === 'manager' || u.role === 'hr' || u.role === 'gerencia') && u.uid !== editingUser.uid)
                        .map(m => (
                          <option key={m.uid} value={m.uid}>{m.displayName} ({m.role})</option>
                        ))
                      }
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Fecha de Ingreso</label>
                  <input 
                    type="date" 
                    value={editFormData.entryDate || ''} 
                    onChange={(e) => setEditFormData({...editFormData, entryDate: e.target.value})}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Periodo Manual (Opcional)</label>
                  <input 
                    type="text" 
                    value={editFormData.manualVacationPeriod || ''} 
                    onChange={(e) => setEditFormData({...editFormData, manualVacationPeriod: e.target.value})}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="Ej: Enero 2023 - Enero 2024"
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1 text-center">Totales</label>
                    <input 
                      type="number" 
                      value={editFormData.totalVacationDays || 0} 
                      onChange={(e) => setEditFormData({...editFormData, totalVacationDays: Number(e.target.value)})}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-center focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1 text-center">Usados</label>
                    <input 
                      type="number" 
                      value={editFormData.usedVacationDays || 0} 
                      onChange={(e) => setEditFormData({...editFormData, usedVacationDays: Number(e.target.value)})}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-center focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1 text-center">Pendientes</label>
                    <input 
                      type="number" 
                      value={editFormData.pendingVacationDays || 0} 
                      onChange={(e) => setEditFormData({...editFormData, pendingVacationDays: Number(e.target.value)})}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-center focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                </div>
              </div>
              
              <div className="p-6 bg-slate-50 flex justify-end gap-3">
                <button 
                  onClick={() => setEditingUser(null)}
                  className="px-6 py-2 text-slate-600 font-bold hover:text-slate-900"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleSaveEdit}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
                >
                  Guardar Cambios
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {userToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 text-center"
            >
              <div className="bg-red-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 text-red-600">
                <Trash2 size={32} />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">¿Eliminar Usuario?</h2>
              <p className="text-slate-500 mb-8">Esta acción es permanente y no se puede deshacer. Se eliminará toda la información del usuario de la base de datos.</p>
              
              <div className="flex flex-col gap-3">
                <button 
                  onClick={handleDeleteUser}
                  className="w-full py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-200"
                >
                  Sí, eliminar definitivamente
                </button>
                <button 
                  onClick={() => setUserToDelete(null)}
                  className="w-full py-3 text-slate-500 font-bold hover:text-slate-700"
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Admin Password Change Modal */}
      <AnimatePresence>
        {passwordUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-900">Cambiar Contraseña</h2>
                <button onClick={() => setPasswordUser(null)} className="text-slate-400 hover:text-slate-600">
                  <X size={24} />
                </button>
              </div>
              
              <div className="p-8 space-y-6">
                <div className="text-center">
                  <div className="bg-amber-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-amber-600">
                    <Key size={32} />
                  </div>
                  <p className="text-slate-600">Establecer nueva contraseña para:</p>
                  <p className="font-bold text-slate-900">{passwordUser.displayName}</p>
                  <p className="text-xs text-slate-400">{passwordUser.email}</p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nueva Contraseña</label>
                  <input 
                    type="password" 
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    autoFocus
                  />
                </div>
              </div>

              <div className="p-6 bg-slate-50 flex flex-col gap-3">
                <button 
                  onClick={handleUpdatePassword}
                  disabled={isUpdatingPassword || !newPassword}
                  className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 disabled:opacity-50"
                >
                  {isUpdatingPassword ? 'Actualizando...' : 'Actualizar Contraseña'}
                </button>
                <button 
                  onClick={() => setPasswordUser(null)}
                  className="w-full py-3 text-slate-500 font-bold hover:text-slate-700"
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <Toaster position="top-right" richColors />
    </div>
  );
}
