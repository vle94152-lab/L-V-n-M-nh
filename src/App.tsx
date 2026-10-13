import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  where, 
  orderBy,
  Timestamp,
  getDoc,
  getDocFromServer,
  setDoc,
  arrayUnion
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged,
  User,
  updateProfile
} from 'firebase/auth';
import { db, auth } from './firebase';
import { Station, Report, Tab, ValidationWarning, EquipmentDict, TaskGroup, ReportDetail, SurveyParameter, Campaign, AppUser, AppRole, Assignment } from './types';
import { 
  MapPin, 
  Phone, 
  User as UserIcon, 
  Plus, 
  Trash2, 
  Route, 
  ClipboardList, 
  History, 
  LogOut, 
  ChevronRight,
  Calendar,
  CheckCircle2,
  Clock,
  Navigation,
  Search,
  ArrowRight,
  Menu,
  X,
  Upload,
  LayoutDashboard,
  Map,
  List,
  ChevronDown,
  Eye,
  EyeOff,
  ClipboardCheck,
  Share2,
  Copy,
  Mail,
  MessageCircle,
  Download,
  FileSpreadsheet,
  Settings,
  Award,
  Bell,
  QrCode,
  Building2,
  PlusCircle,
  Receipt,
  CarFront,
  Settings2,
  Car,
  Home,
  Cloud,
  FileText,
  BookOpen,
  Wallet,
  Shield,
  Database,
  Zap,
  Ticket,
  Percent,
  Star,
  Activity,
  Layers,
  Save
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, startOfMonth, endOfMonth, isSameMonth, parseISO, startOfWeek, endOfWeek, isWithinInterval } from 'date-fns';
import { cn } from './lib/utils';
import { GoogleGenAI } from "@google/genai";
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, Tooltip as LeafletTooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

import { OperationType, FirestoreErrorInfo, handleFirestoreError } from './lib/firebase-utils';

// Fix for default marker icon in react-leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

import { Button } from './components/ui/Button';
import { Input } from './components/ui/Input';
import { Card } from './components/ui/Card';
import { getStationIcon, formatStationName } from './lib/constants';

// --- Components ---

import { MapUpdater } from './components/MapComponents';
import { ReportsTab } from './pages/ReportsTab';
import { StationsTab } from './pages/StationsTab';
import { PlannerTab } from './pages/PlannerTab';
import { AdminTab } from './pages/AdminTab';
import { DashboardTab } from './pages/DashboardTab';
import { ReportManagementTab } from './pages/ReportManagementTab';

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('planner');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('all');
  const [stations, setStations] = useState<Station[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [equipmentDict, setEquipmentDict] = useState<EquipmentDict[]>([]);
  const [taskGroups, setTaskGroups] = useState<TaskGroup[]>([]);
  const [workspaces, setWorkspaces] = useState<{id: string, name: string}[]>([]);
  const [surveyParameters, setSurveyParameters] = useState<SurveyParameter[]>([]);
  const [validationWarnings, setValidationWarnings] = useState<ValidationWarning[] | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isCreateReportModalOpen, setIsCreateReportModalOpen] = useState(false);

  // Auth & User Management
  const [appUsers, setAppUsers] = useState<AppUser[]>([]);
  const [currentAppUser, setCurrentAppUser] = useState<AppUser | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);

  const [prefilledStationId, setPrefilledStationId] = useState<string>('');
  const [prefilledAssignmentId, setPrefilledAssignmentId] = useState<string>('');

  // Define clear role roles: Admin / Manager vs Staff
  const isAdminOrManager = user?.email === 'vle94152@gmail.com' || currentAppUser?.role === 'admin' || currentAppUser?.role === 'manager';
  const isStaff = !isAdminOrManager;

  // Helper to check permission
  const checkPermission = (permId: string) => {
    if (user?.email === 'vle94152@gmail.com') return true;
    if (!currentAppUser) return false;
    if (currentAppUser.role === 'admin') return true;
    
    const userRole = roles.find(r => r.id === currentAppUser.role);
    if (userRole) {
      return userRole.permissions?.includes(permId) || false;
    }

    return currentAppUser.permissions?.includes(permId) || false;
  };

  const hasAdminAccess = user?.email === 'vle94152@gmail.com' || currentAppUser?.role === 'admin' || (isAdminOrManager && (checkPermission('admin.users') || checkPermission('admin.campaigns') || checkPermission('admin.stations') || checkPermission('admin.tasks')));
  const canAccessPlanner = isAdminOrManager;
  const canAccessReports = isAdminOrManager || checkPermission('view.reports');

  // Auto-redirect unauthorized users from restricted tabs
  useEffect(() => {
    if (activeTab === 'admin' && currentAppUser && !hasAdminAccess) {
      setActiveTab('dashboard');
    }
    if (activeTab === 'planner' && currentAppUser && !canAccessPlanner) {
      setActiveTab('dashboard');
    }
    if (activeTab === 'reportManager' && currentAppUser && !canAccessReports) {
      setActiveTab('dashboard');
    }
  }, [activeTab, currentAppUser, hasAdminAccess, canAccessPlanner, canAccessReports]);

  // Auto-reset selected campaign if it gets closed
  useEffect(() => {
    if (selectedCampaignId !== 'all') {
      const camp = campaigns.find(c => c.id === selectedCampaignId);
      if (!camp || camp.status === 'closed') {
        setSelectedCampaignId('all');
      }
    }
  }, [campaigns, selectedCampaignId]);

  // Auto-select latest active campaign when loaded
  useEffect(() => {
    if (campaigns.length > 0 && selectedCampaignId === 'all') {
      const activeCampaigns = campaigns.filter(c => c.status === 'active');
      if (activeCampaigns.length > 0) {
        // Sort by creation date descending
        activeCampaigns.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setSelectedCampaignId(activeCampaigns[0].id);
      }
    }
  }, [campaigns]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const userRef = doc(db, 'users', u.uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          const newUser: AppUser = {
            id: u.uid,
            email: u.email,
            displayName: u.displayName,
            role: 'staff', // Revert to staff by default
            createdAt: new Date().toISOString()
          };
          await setDoc(userRef, newUser);
          setCurrentAppUser(newUser);
        } else {
          const existingData = userSnap.data() as AppUser;
          // Auto-promote owner to admin so you have module access
          if (existingData.role !== 'admin' && existingData.email === 'vle94152@gmail.com') {
             await updateDoc(userRef, { role: 'admin' });
             existingData.role = 'admin';
          }
          // Backwards compatibility: treat worker as staff
          if (existingData.role === 'worker') {
            existingData.role = 'staff';
          }
          setCurrentAppUser(existingData);
        }
      } else {
        setCurrentAppUser(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) return;
    const usersUnsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
      const usersList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AppUser));
      setAppUsers(usersList);
      if (user) {
        const current = usersList.find(u => u.id === user.uid);
        if (current) setCurrentAppUser(current);
      }
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'users'));

    const rolesUnsubscribe = onSnapshot(collection(db, 'roles'), (snapshot) => {
      setRoles(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AppRole)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'roles'));

    return () => {
      usersUnsubscribe();
      rolesUnsubscribe();
    };
  }, [user]);

  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const login = async () => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error: any) {
      if (error.code !== 'auth/cancelled-popup-request') {
        console.error('Login failed:', error);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };
  const logout = () => signOut(auth);

  // Firestore Data
  useEffect(() => {
    if (!user) return;

    const campaignsUnsubscribe = onSnapshot(collection(db, 'campaigns'), (snapshot) => {
      setCampaigns(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Campaign)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'campaigns'));

    const stationsUnsubscribe = onSnapshot(collection(db, 'stations'), (snapshot) => {
      setStations(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Station)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'stations');
    });

    const reportsUnsubscribe = onSnapshot(
      query(collection(db, 'reports'), where('userId', '==', user.uid), orderBy('date', 'desc')), 
      (snapshot) => {
        setReports(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Report)));
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'reports');
      }
    );

    const assignmentsUnsubscribe = onSnapshot(
      collection(db, 'assignments'),
      (snapshot) => {
        setAssignments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Assignment)));
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'assignments');
      }
    );

    const equipUnsubscribe = onSnapshot(collection(db, 'equipment_dictionary'), async (snapshot) => {
      if (snapshot.empty) {
        // Seed initial data if empty
        const initialEquipments: Omit<EquipmentDict, 'id'>[] = [
          { name: 'Khối Baseband', validSpaces: ['Indoor'] },
          { name: 'Khối Nguồn', validSpaces: ['Indoor'] },
          { name: 'Khối MU', validSpaces: ['Indoor'] },
          { name: 'Khối RF', validSpaces: ['Outdoor', 'Indoor'] },
          { name: 'RRU', validSpaces: ['Outdoor'] },
          { name: 'Anten', validSpaces: ['Outdoor'] },
          { name: 'Sợi quang', validSpaces: ['Indoor', 'Outdoor'] },
          { name: 'Jumper', validSpaces: ['Indoor', 'Outdoor'] },
          { name: 'Dây nguồn', validSpaces: ['Indoor', 'Outdoor'] },
          { name: 'Dây Jet', validSpaces: ['Indoor', 'Outdoor'] },
          { name: 'Dây tiếp đất', validSpaces: ['Indoor', 'Outdoor'] }
        ];
        try {
          for (const eq of initialEquipments) {
            await addDoc(collection(db, 'equipment_dictionary'), eq);
          }
        } catch (e) {
          console.error("Failed to seed equipment dictionary", e);
        }
      } else {
        const dict = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EquipmentDict));
        setEquipmentDict(dict);
        
        // Ensure missing required items exist
        const requiredMissing = [];
        if (!dict.some(d => d.name.toLowerCase() === 'dây jet')) {
          requiredMissing.push({ name: 'Dây Jet', validSpaces: ['Indoor', 'Outdoor'] });
        }
        if (!dict.some(d => d.name.toLowerCase() === 'dây tiếp đất')) {
          requiredMissing.push({ name: 'Dây tiếp đất', validSpaces: ['Indoor', 'Outdoor'] });
        }
        if (requiredMissing.length > 0) {
          requiredMissing.forEach(eq => addDoc(collection(db, 'equipment_dictionary'), eq).catch(console.error));
        }
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'equipment_dictionary');
    });

    const taskGroupUnsubscribe = onSnapshot(collection(db, 'task_groups'), async (snapshot) => {
      if (snapshot.empty) {
        const initialTaskGroups = [
          { name: 'Lắp đặt', modules: ['EQUIPMENT', 'NOTE'] }, 
          { name: 'Tích hợp', modules: ['EQUIPMENT', 'NOTE'] }, 
          { name: 'Sửa chữa', modules: ['EQUIPMENT', 'NOTE'] }, 
          { name: 'Khảo sát', modules: ['NOTE'] },
          { name: 'Thu hồi', modules: ['EQUIPMENT', 'NOTE'] }
        ];
        for (const tg of initialTaskGroups) {
          await addDoc(collection(db, 'task_groups'), tg);
        }
      } else {
        setTaskGroups(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TaskGroup)));
      }
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'task_groups'));

    const workspacesUnsubscribe = onSnapshot(collection(db, 'workspaces'), async (snapshot) => {
      if (snapshot.empty) {
        const initialWorkspaces = [{ name: 'Indoor' }, { name: 'Outdoor' }];
        for (const ws of initialWorkspaces) {
          await addDoc(collection(db, 'workspaces'), ws);
        }
      } else {
        setWorkspaces(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as {id: string, name: string})));
      }
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'workspaces'));

    const surveyParamsUnsubscribe = onSnapshot(collection(db, 'survey_parameters'), (snapshot) => {
      setSurveyParameters(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SurveyParameter)).sort((a, b) => a.order - b.order));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'survey_parameters'));

    return () => {
      campaignsUnsubscribe();
      stationsUnsubscribe();
      reportsUnsubscribe();
      assignmentsUnsubscribe();
      equipUnsubscribe();
      taskGroupUnsubscribe();
      workspacesUnsubscribe();
      surveyParamsUnsubscribe();
    };
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6 text-center">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full"
        >
          <div className="bg-blue-600 w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-lg shadow-blue-200">
            <Route className="text-white w-10 h-10" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Telecom Station Manager</h1>
          <p className="text-gray-600 mb-8">Quản lý trạm viễn thông, tối ưu hóa tuyến đường và báo cáo công việc hàng ngày.</p>
          <Button onClick={login} disabled={isLoggingIn} className="w-full py-4 text-lg">
            {isLoggingIn ? 'Đang mở đăng nhập...' : 'Đăng nhập với Google'}
          </Button>
        </motion.div>
      </div>
    );
  }

  const activeCampaignIds = campaigns.filter(c => c.status === 'active').map(c => c.id);
  
  let baseFilteredStations = selectedCampaignId === 'all' 
    ? stations.filter(s => !s.campaignId || activeCampaignIds.includes(s.campaignId)) 
    : stations.filter(s => s.campaignId === selectedCampaignId);

  // Apply Role Base Access Control for staff
  if (!isAdminOrManager && !checkPermission('view.all_stations')) {
    baseFilteredStations = baseFilteredStations.filter(s => s.assigneeId === user?.uid);
  }

  const filteredStations = baseFilteredStations;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#bde0fe] via-[#e0f2fe] to-gray-50 pb-24">
      {/* Header */}
      {activeTab !== 'dashboard' && (
        <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
          <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="bg-blue-600 p-1.5 rounded-lg">
                <Route className="text-white w-5 h-5" />
              </div>
              <span className="font-bold text-gray-900 hidden sm:inline">TSM App</span>
            </div>

            <div className="flex-1 max-w-xs mx-4">
              <div className="relative">
                 <select
                    className="w-full appearance-none bg-gray-50 border border-gray-200 text-gray-700 py-1.5 px-3 pr-8 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                    value={selectedCampaignId}
                    onChange={(e) => setSelectedCampaignId(e.target.value)}
                 >
                    <option value="all">-- Tất cả (Đang mở) --</option>
                    {campaigns.filter(c => c.status === 'active').map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                 </select>
                 <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
              </div>
            </div>
            
            <div className="flex items-center gap-2 sm:gap-4">
              <span className="text-sm text-gray-500 hidden sm:block">{user.displayName}</span>
              <button onClick={logout} className="p-2 text-gray-400 hover:text-red-600 transition-colors">
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </header>
      )}

      {/* Main Content */}
      <main className={cn("mx-auto relative", activeTab === 'dashboard' ? "pb-24" : (activeTab === 'planner' || activeTab === 'admin') ? "p-3 sm:p-6 pb-24 w-full" : "p-3 sm:p-6 pb-24 max-w-4xl")}>
        {activeTab === 'dashboard' && <DashboardTab key="dashboard" stations={filteredStations} reports={reports} assignments={assignments} currentAppUser={currentAppUser} user={user} logout={logout} validationWarnings={validationWarnings} setValidationWarnings={setValidationWarnings} setActiveTab={setActiveTab} campaigns={campaigns} selectedCampaignId={selectedCampaignId} setSelectedCampaignId={setSelectedCampaignId} onOpenCreateReport={(stationId, assignmentId) => { setPrefilledStationId(stationId); setPrefilledAssignmentId(assignmentId || ''); setActiveTab('reports'); }} />}
        {activeTab === 'planner' && <PlannerTab key="planner" stations={filteredStations} assignments={assignments} appUsers={appUsers} user={user} reports={reports} taskGroups={taskGroups} currentAppUser={currentAppUser} roles={roles} campaigns={campaigns} selectedCampaignId={selectedCampaignId} onOpenCreateReport={(stationId, assignmentId) => { setPrefilledStationId(stationId); setPrefilledAssignmentId(assignmentId || ''); setActiveTab('reports'); }} />}
        {activeTab === 'admin' && <AdminTab key="admin" equipmentDict={equipmentDict} taskGroups={taskGroups} workspaces={workspaces} surveyParameters={surveyParameters} stations={filteredStations} reports={reports} validationWarnings={validationWarnings} setValidationWarnings={setValidationWarnings} campaigns={campaigns} selectedCampaignId={selectedCampaignId} appUsers={appUsers} currentAppUser={currentAppUser} roles={roles} />}
        {activeTab === 'reports' && <ReportsTab key="reports" stations={filteredStations} user={user} equipmentDict={equipmentDict} taskGroups={taskGroups} workspaces={workspaces} technologies={['2G', '3G', '4G', '5G']} initialStationId={prefilledStationId} initialAssignmentId={prefilledAssignmentId} reports={reports} surveyParameters={surveyParameters} assignments={assignments} />}
        {activeTab === 'reportManager' && canAccessReports && <ReportManagementTab key="reportManager" reports={reports} stations={stations} taskGroups={taskGroups} equipmentDict={equipmentDict} />}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white shadow-[0_-10px_40px_rgba(0,0,0,0.08)] rounded-t-[2rem] z-40 pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-4xl mx-auto flex justify-around items-end px-2 sm:px-6 relative h-[4.5rem]">
          <NavButton 
            active={activeTab === 'dashboard'} 
            onClick={() => setActiveTab('dashboard')} 
            icon={<Home />} 
            label="Trang chủ" 
          />
          {canAccessPlanner && (
            <NavButton 
              active={activeTab === 'planner'} 
              onClick={() => setActiveTab('planner')} 
              icon={<Route />} 
              label="Lộ trình" 
            />
          )}
          
          <div 
             className="relative -top-5 flex flex-col items-center group cursor-pointer w-14 sm:w-16" 
             onClick={() => { setPrefilledStationId(''); setPrefilledAssignmentId(''); setActiveTab('reports'); }}
          >
            <div className={cn(
              "w-12 h-12 sm:w-14 sm:h-14 bg-white rounded-full flex items-center justify-center shadow-lg transform transition-transform group-hover:scale-105 border-[3px] border-gray-50",
               activeTab === 'reports' ? "shadow-blue-500/30" : "shadow-gray-200/50"
            )}>
               <div className={cn(
                 "w-full h-full rounded-full flex items-center justify-center transition-colors", 
                 activeTab === 'reports' ? "bg-gradient-to-tr from-blue-600 to-cyan-500 text-white" : "text-gray-500"
               )}>
                  <span className="transform -rotate-12"><Activity className="w-5 h-5 sm:w-6 sm:h-6" /></span>
               </div>
            </div>
            <span className={cn(
               "text-[9px] sm:text-[10px] mt-1 whitespace-nowrap transition-all", 
               activeTab === 'reports' ? "font-bold text-blue-600" : "font-medium text-gray-500"
            )}>Khảo sát</span>
          </div>

          {canAccessReports && (
            <NavButton 
              active={activeTab === 'reportManager'} 
              onClick={() => setActiveTab('reportManager')} 
              icon={<FileSpreadsheet />} 
              label="Thống kê" 
            />
          )}
          {hasAdminAccess && (
            <NavButton 
              active={activeTab === 'admin'} 
              onClick={() => setActiveTab('admin')} 
              icon={<Database />} 
              label="Danh mục" 
            />
          )}
        </div>
      </nav>

      {/* Bottom Navigation */}
    </div>
  );
}

function NavButton({ active, onClick, icon, label }: any) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        'flex flex-col items-center gap-1 pb-2 transition-all duration-300 w-12 sm:w-14 overflow-hidden group',
        active ? 'text-blue-600' : 'text-gray-500 hover:text-gray-900'
      )}
    >
      <div className={cn(
        "relative w-8 h-8 flex items-center justify-center transition-all duration-300",
        active ? "text-blue-600" : "text-gray-500"
      )}>
        {React.cloneElement(icon, { 
          className: cn(
            'w-6 h-6 flex-shrink-0 transition-all duration-300', 
            active ? 'stroke-[2.5px]' : 'stroke-1 relative top-[1px]'
          ) 
        })}
      </div>
      <div className="nav-text-container w-full px-0.5">
        <span className={cn(
          "text-[9px] sm:text-[10px] whitespace-nowrap overflow-hidden text-ellipsis block text-center transition-all duration-300", 
          active ? "font-bold" : "font-medium"
        )}>{label}</span>
      </div>
    </button>
  );
}