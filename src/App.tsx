import React, { createContext, useContext, useEffect, useState, Component } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebase';
import { UserProfile } from './types';
import { LogOut, User as UserIcon, Calendar, ClipboardList, Settings, Menu, X, FileText, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getDocFromServer } from 'firebase/firestore';
import { Toaster } from 'sonner';

// --- Error Boundary ---
class ErrorBoundary extends Component<any, any> {
  state: any;
  props: any;

  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  render() {
    if ((this.state as any).hasError) {
      let errorMessage = "Algo salió mal.";
      try {
        const parsed = JSON.parse((this.state as any).error.message);
        if (parsed.error) errorMessage = `Error de Base de Datos: ${parsed.error}`;
      } catch (e) {
        errorMessage = (this.state as any).error.message || errorMessage;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
          <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full border border-red-100 text-center">
            <div className="bg-red-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-red-600">
              <AlertTriangle size={32} />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Error de Aplicación</h2>
            <p className="text-slate-600 mb-6">{errorMessage}</p>
            <button 
              onClick={() => window.location.reload()}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700 transition-all"
            >
              Recargar Página
            </button>
          </div>
        </div>
      );
    }
    return (this.props as any).children;
  }
}

// --- Context ---
interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isHR: boolean;
  isManager: boolean;
  isGerencia: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isHR: false,
  isManager: false,
  isGerencia: false,
});

export const useAuth = () => useContext(AuthContext);

// --- Components ---
const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, profile, isHR, isManager, isGerencia } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  if (!user || !profile) return <>{children}</>;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      {/* Sidebar / Mobile Nav */}
      <nav className="bg-slate-900 text-white w-full md:w-64 flex-shrink-0 md:min-h-screen">
        <div className="p-6 flex items-center justify-between">
          <Link to="/" className="text-xl font-bold tracking-tight flex items-center gap-2">
            <Calendar className="text-blue-400" />
            <span>Vacaciones EC</span>
          </Link>
          <button className="md:hidden" onClick={() => setIsMenuOpen(!isMenuOpen)}>
            {isMenuOpen ? <X /> : <Menu />}
          </button>
        </div>

        <div className={`px-4 pb-6 space-y-2 ${isMenuOpen ? 'block' : 'hidden md:block'}`}>
          <Link to="/" className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-slate-800 transition-colors">
            <ClipboardList size={20} />
            <span>Dashboard</span>
          </Link>
          <Link to="/requests" className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-slate-800 transition-colors">
            <FileText size={20} />
            <span>Mis Solicitudes</span>
          </Link>
          {(isHR || isGerencia || isManager) && (
            <Link to="/manage" className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-slate-800 transition-colors">
              <Settings size={20} />
              <span>Gestionar</span>
            </Link>
          )}
          {(isHR || isGerencia) && (
            <Link to="/admin" className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-slate-800 transition-colors">
              <Settings size={20} />
              <span>Administración</span>
            </Link>
          )}
          
          <div className="pt-6 mt-6 border-t border-slate-800">
            <div className="px-4 py-3 flex items-center gap-3 text-slate-400">
              <UserIcon size={20} />
              <div className="overflow-hidden">
                <p className="text-sm font-medium text-white truncate">{profile?.displayName || 'Usuario'}</p>
                <p className="text-xs truncate">{profile?.role?.toUpperCase() || 'SIN PERFIL'}</p>
              </div>
            </div>
            <button 
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-red-900/30 text-red-400 transition-colors mt-2"
            >
              <LogOut size={20} />
              <span>Cerrar Sesión</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
};

// --- Pages ---
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Requests from './pages/Requests';
import ManageRequests from './pages/ManageRequests';
import Admin from './pages/Admin';
import CompleteProfile from './pages/CompleteProfile';

const PrivateRoute: React.FC<{ children: React.ReactNode; role?: string }> = ({ children, role }) => {
  const { user, profile, loading, isHR } = useAuth();
  
  if (loading) return <div className="flex items-center justify-center h-screen">Cargando...</div>;
  if (!user) return <Navigate to="/login" />;
  
  // If user is logged in but has no profile, redirect to complete-profile
  // unless they are already on that page
  if (!profile && window.location.hash !== '#/complete-profile') {
    return <Navigate to="/complete-profile" />;
  }

  if (role === 'hr' && !isHR) return <Navigate to="/" />;
  if (role && role !== 'hr' && profile?.role !== role && !isHR) return <Navigate to="/" />;
  
  return <>{children}</>;
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
      setLoading(true);
      setUser(u);
      
      if (unsubProfile) {
        unsubProfile();
        unsubProfile = null;
      }

      if (u) {
        const profileRef = doc(db, 'users', u.uid);
        unsubProfile = onSnapshot(profileRef, async (docSnap) => {
          console.log('Profile Snapshot:', docSnap.exists() ? 'Exists' : 'Not Found');
          if (docSnap.exists()) {
            const data = docSnap.data() as UserProfile;
            setProfile(data);
          } else {
            setProfile(null);
          }
          setLoading(false);
        }, (error) => {
          console.error('Profile Snapshot Error:', error);
          setLoading(false);
        });
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubProfile) unsubProfile();
    };
  }, []);

  const value = {
    user,
    profile,
    loading,
    isHR: profile?.role === 'hr' || profile?.role === 'gerencia' || user?.email === 'nmrm01@gmail.com' || user?.email === 'asis.tthh@compufacil.com.ec',
    isManager: profile?.role === 'manager' || profile?.role === 'gerencia' || profile?.role === 'hr' || user?.email === 'nmrm01@gmail.com' || user?.email === 'asis.tthh@compufacil.com.ec',
    isGerencia: profile?.role === 'gerencia' || user?.email === 'nmrm01@gmail.com' || user?.email === 'asis.tthh@compufacil.com.ec',
  };

  return (
    <ErrorBoundary>
      <Toaster position="top-right" richColors />
      <AuthContext.Provider value={value}>
        <Router>
          <Layout>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/complete-profile" element={user ? <CompleteProfile /> : <Navigate to="/login" />} />
              <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
              <Route path="/requests" element={<PrivateRoute><Requests /></PrivateRoute>} />
              <Route path="/manage" element={<PrivateRoute><ManageRequests /></PrivateRoute>} />
              <Route path="/admin" element={<PrivateRoute role="hr"><Admin /></PrivateRoute>} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </Layout>
        </Router>
      </AuthContext.Provider>
    </ErrorBoundary>
  );
}
