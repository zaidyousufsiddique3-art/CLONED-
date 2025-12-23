
import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { UserRole, RequestStatus, DocRequest, User, DocumentType } from '../types';
import { subscribeToAllRequests, subscribeToAssignedRequests, subscribeToStudentRequests, subscribeToSportsRecommendationRequests } from '../firebase/requestService';
import { getPotentialAssignees } from '../firebase/userService';
import { sendNotification } from '../firebase/notificationService';
import { Link, useNavigate } from 'react-router-dom';
import { FileText, Clock, CheckCircle, User as UserIcon, AlertTriangle, Plus, ArrowRight, Calendar, Key, Trash2, X } from 'lucide-react';
import { collection, query, onSnapshot, doc, updateDoc, deleteDoc, writeBatch } from '@firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import Button from '../components/Button';
import { SPORTS_COORDINATOR_EMAIL } from '../constants';
import { getSportsCaptainApplications } from '../firebase/sportsCaptainService';
import { SportsCaptainApplication } from '../types';

const StatCard = ({ title, value, icon: Icon, colorClass, iconColor, className }: any) => (
  <div className={`bg-white dark:bg-[#070708] backdrop-blur-3xl rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-white/10 flex items-center justify-between hover:border-brand-500/30 dark:hover:border-brand-500/30 transition-all duration-300 group ${className}`}>
    <div>
      <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">{title}</p>
      <h3 className="text-4xl font-bold text-slate-900 dark:text-white">{value}</h3>
    </div>
    <div className={`w-14 h-14 rounded-2xl ${colorClass} bg-opacity-10 dark:bg-opacity-10 flex items-center justify-center transform group-hover:scale-110 transition-transform duration-300`}>
      <Icon className={`w-7 h-7 ${iconColor}`} />
    </div>
  </div>
);

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [requests, setRequests] = useState<DocRequest[]>([]);
  const [passwordRequests, setPasswordRequests] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({ total: 0, pending: 0, assigned: 0, completed: 0, actionNeeded: 0 });
  const [sportsApps, setSportsApps] = useState<SportsCaptainApplication[]>([]);
  const [activeTab, setActiveTab] = useState<'documents' | 'password'>('documents');

  const isSportsCoordinator = user?.email?.toLowerCase() === SPORTS_COORDINATOR_EMAIL.toLowerCase();

  // Password Modal State
  const [selectedPwdReq, setSelectedPwdReq] = useState<any>(null);
  const [assignees, setAssignees] = useState<User[]>([]);
  const [isPwdModalOpen, setIsPwdModalOpen] = useState(false);

  useEffect(() => {
    if (!user) return;

    let unsubscribe = () => { };
    let unsubscribePwd = () => { };

    // 1. Subscribe to Document Requests (Role-based logic already handled by service)
    const handleData = (data: DocRequest[]) => {
      setRequests(data);
    };

    if (user.role === UserRole.STUDENT) {
      unsubscribe = subscribeToStudentRequests(user.id, handleData);
    } else if (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN) {
      unsubscribe = subscribeToAllRequests(handleData);
    } else if (isSportsCoordinator) {
      // Sports Coordinator sees ONLY Sports Recommendation requests in dashboard
      unsubscribe = subscribeToSportsRecommendationRequests(handleData);
    } else {
      // Staff ONLY see assigned
      unsubscribe = subscribeToAssignedRequests(user.id, handleData);
    }

    // 2. Subscribe to Password Resets
    const q = query(collection(db, 'password_resets'));
    unsubscribePwd = onSnapshot(q, (snapshot) => {
      let pwdData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        isPasswordReset: true,
        type: 'Password Reset',
        studentName: `${doc.data().firstName} ${doc.data().lastName}`,
        studentAdmissionNo: doc.data().admissionNumber || doc.data().email,
        assignedToName: doc.data().assignedToName || 'Unassigned'
      }));

      // Strict Role-based filtering for Password Requests
      if (user.role === UserRole.STAFF) {
        pwdData = pwdData.filter((r: any) => r.assignedToId === user.id);
      } else if (user.role === UserRole.STUDENT) {
        pwdData = pwdData.filter((r: any) => r.email === user.email);
      }

      // Sort newest first
      pwdData.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setPasswordRequests(pwdData);
    });

    if (user.role !== UserRole.STUDENT) {
      getPotentialAssignees().then(setAssignees);
    }

    return () => {
      unsubscribe();
      unsubscribePwd();
    };
  }, [user]);

  useEffect(() => {
    if (isSportsCoordinator) {
      getSportsCaptainApplications().then(setSportsApps);
    }
  }, [isSportsCoordinator]);

  // Update Stats
  useEffect(() => {
    const visibleDocs = requests.filter(r => !r.hiddenFromUsers?.includes(user?.id || ''));

    const docTotal = visibleDocs.length;
    const docPending = visibleDocs.filter(r => r.status === RequestStatus.PENDING).length;
    const docAssigned = visibleDocs.filter(r => r.status === RequestStatus.ASSIGNED).length;
    const docCompleted = visibleDocs.filter(r => r.status === RequestStatus.COMPLETED).length;
    const docAction = visibleDocs.filter(r => r.status === RequestStatus.ACTION_NEEDED).length;

    const pwdPending = passwordRequests.filter(r => r.status === 'Pending').length;
    const pwdTotal = passwordRequests.length;
    const pwdCompleted = passwordRequests.filter(r => r.status === 'Completed').length;

    setStats({
      total: docTotal + pwdTotal,
      pending: docPending + pwdPending,
      assigned: docAssigned,
      completed: docCompleted + pwdCompleted,
      actionNeeded: docAction + (user?.role === UserRole.SUPER_ADMIN ? pwdPending : 0),
    });
  }, [requests, passwordRequests, user]);

  const handleClearDashboard = async (type: 'doc' | 'pwd') => {
    if (!window.confirm("Are you sure you want to clear these recent requests from the dashboard?")) return;

    try {
      const batch = writeBatch(db);

      if (type === 'doc') {
        const recentDocs = requests
          .filter(r => !r.dashboardHidden && !r.hiddenFromUsers?.includes(user?.id || ''))
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 5);

        if (recentDocs.length === 0) return;

        recentDocs.forEach(req => batch.update(doc(db, 'requests', req.id), { dashboardHidden: true }));
      } else {
        const recentPwds = passwordRequests
          .filter(r => !r.dashboardHidden)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 5);

        if (recentPwds.length === 0) return;

        recentPwds.forEach(req => batch.update(doc(db, 'password_resets', req.id), { dashboardHidden: true }));
      }

      await batch.commit();
    } catch (err) {
      console.error("Clear dashboard failed", err);
      alert("Failed to clear dashboard requests.");
    }
  };

  const handleDeleteRequest = async (id: string, isPwd: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!window.confirm("Are you sure you want to remove this request from the dashboard? It will still be visible in 'All Requests'.")) return;

    try {
      const collectionName = isPwd ? 'password_resets' : 'requests';
      // Soft delete from dashboard only
      await updateDoc(doc(db, collectionName, id), { dashboardHidden: true });

      // Update local state immediately for better UX
      if (isPwd) {
        setPasswordRequests(prev => prev.filter(r => r.id !== id));
      } else {
        setRequests(prev => prev.filter(r => r.id !== id));
      }
    } catch (err) {
      console.error("Delete failed", err);
      alert("Failed to remove request from dashboard.");
    }
  };

  const handlePwdUpdate = async (field: string, value: string) => {
    if (!selectedPwdReq) return;

    const updatePayload: any = {};
    if (field === 'status') updatePayload.status = value;
    if (field === 'assignedToId') {
      const assignee = assignees.find(u => u.id === value);
      updatePayload.assignedToId = value;
      updatePayload.assignedToName = assignee ? `${assignee.firstName} ${assignee.lastName}` : 'Unknown';
      if (value) sendNotification(value, `Password Reset Request assigned to you`, `/users`);
    }

    await updateDoc(doc(db, 'password_resets', selectedPwdReq.id), updatePayload);
    setSelectedPwdReq(prev => ({ ...prev, ...updatePayload }));
  };

  const openPwdModal = (req: any) => {
    setSelectedPwdReq(req);
    setIsPwdModalOpen(true);
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case RequestStatus.PENDING:
      case 'Pending': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200';
      case RequestStatus.ASSIGNED: return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200';
      case RequestStatus.IN_PROGRESS: return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border-purple-200';
      case RequestStatus.ACTION_NEEDED: return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200';
      case RequestStatus.COMPLETED:
      case 'Completed': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200';
      case RequestStatus.PENDING_ACTION: return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200';
      case RequestStatus.APPLICATION_RECEIVED: return 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400 border-cyan-200';
      case RequestStatus.REJECTED: return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200';
      case RequestStatus.IN_REVIEW: return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200';
      default: return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  const isWithin24Hours = (dateString: string) => {
    const requestDate = new Date(dateString).getTime();
    const now = new Date().getTime();
    const hoursDiff = (now - requestDate) / (1000 * 60 * 60);
    return hoursDiff <= 24;
  };

  // Get Recent (Last 24 Hours)
  const recentDocs = requests
    .filter(r => !r.dashboardHidden && !r.hiddenFromUsers?.includes(user?.id || '') && isWithin24Hours(r.createdAt))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const recentPwds = passwordRequests
    .filter(r => !r.dashboardHidden && isWithin24Hours(r.createdAt))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div className="space-y-8">

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        {isSportsCoordinator ? (
          <>
            <StatCard
              title="Applications Sent"
              value={requests.filter(r => r.type === DocumentType.SPORTS_CAPTAIN).length}
              icon={FileText}
              colorClass="bg-brand-500"
              iconColor="text-brand-500"
            />
            <StatCard
              title="Applications Received"
              value={sportsApps.length}
              icon={Clock}
              colorClass="bg-pink-500"
              iconColor="text-pink-500"
            />
            <StatCard
              title="In-Review"
              value={sportsApps.filter(a => a.status === 'In-review' || a.status === 'Pending').length}
              icon={AlertTriangle}
              colorClass="bg-amber-500"
              iconColor="text-amber-500"
            />
            <StatCard
              title="Rejected"
              value={sportsApps.filter(a => a.status === 'Rejected').length}
              icon={X}
              colorClass="bg-red-500"
              iconColor="text-red-500"
            />
            <StatCard
              title="Successful"
              value={sportsApps.filter(a => a.status === 'Accepted').length}
              icon={CheckCircle}
              colorClass="bg-emerald-500"
              iconColor="text-emerald-500"
            />
          </>
        ) : (
          <>
            <StatCard title="Total Requests" value={stats.total} icon={FileText} colorClass="bg-brand-500" iconColor="text-brand-500" className="" />
            {user?.role !== UserRole.STUDENT && stats.actionNeeded > 0 ? (
              <StatCard title="Action Needed" value={stats.actionNeeded} icon={AlertTriangle} colorClass="bg-red-500" iconColor="text-red-500" className="" />
            ) : (
              <StatCard title="Pending" value={stats.pending} icon={Clock} colorClass="bg-amber-500" iconColor="text-amber-500" className="" />
            )}
            <StatCard title="Assigned" value={stats.assigned} icon={UserIcon} colorClass="bg-blue-500" iconColor="text-blue-500" className="" />
            <StatCard title="Completed" value={stats.completed} icon={CheckCircle} colorClass="bg-emerald-500" iconColor="text-emerald-500" className="" />
          </>
        )}
      </div>

      {user?.role === UserRole.STUDENT && (
        <div className="bg-gradient-to-r from-brand-600 to-brand-800 rounded-3xl p-10 text-white shadow-xl relative overflow-hidden border border-white/5">
          <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <h3 className="text-3xl font-bold mb-2 tracking-tight">Need a Document?</h3>
              <p className="text-slate-100 max-w-lg text-lg">Request academic reports, certificates, and letters directly through the portal.</p>
            </div>
            <Link to="/new-request" className="bg-white text-brand-700 px-8 py-4 rounded-xl font-bold shadow-lg hover:bg-slate-50 transition-all flex items-center group">
              <Plus className="w-5 h-5 mr-2 group-hover:rotate-90 transition-transform" /> New Request
            </Link>
          </div>
        </div>
      )}

      {/* Tabs for Recent Sections */}
      <div className="flex flex-col md:flex-row justify-between items-end gap-4 mt-8">
        <div className="bg-slate-200 dark:bg-[#070708] p-1 rounded-xl flex shrink-0 border border-white/5">
          <button
            onClick={() => setActiveTab('documents')}
            className={`flex items-center px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'documents'
              ? 'bg-brand-600 text-white shadow-md'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
          >
            <FileText className="w-4 h-4 mr-2" />
            Recent Requests
          </button>
          <button
            onClick={() => setActiveTab('password')}
            className={`flex items-center px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'password'
              ? 'bg-brand-600 text-white shadow-md'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
          >
            <Key className="w-4 h-4 mr-2" />
            Recent Passwords
          </button>
        </div>

        <div className="flex items-center space-x-6">
          <Link to="/all-requests" className="text-sm font-black text-brand-600 dark:text-brand-500 hover:text-brand-700 dark:hover:text-brand-400 flex items-center group transition-colors">
            View All <ArrowRight className="w-4 h-4 ml-1.5 group-hover:translate-x-1 transition-transform" />
          </Link>
          {(activeTab === 'documents' ? recentDocs.length > 0 : recentPwds.length > 0) && (
            <button
              onClick={() => handleClearDashboard(activeTab === 'documents' ? 'doc' : 'pwd')}
              className="text-xs font-bold text-slate-400 hover:text-red-500 transition-colors"
            >
              Clear Dashboard
            </button>
          )}
        </div>
      </div>

      {/* Recent Document Requests Table */}
      {activeTab === 'documents' && (
        <div className="bg-white dark:bg-[#070708] backdrop-blur-3xl rounded-3xl shadow-xl border border-slate-200 dark:border-white/10 overflow-hidden transition-colors scroll-x-mobile">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">
                  <th className="px-8 py-5 font-semibold">Request ID</th>
                  <th className="px-8 py-5 font-semibold">Type</th>
                  <th className="px-8 py-5 font-semibold">User Info</th>
                  <th className="px-8 py-5 font-semibold">Expected Date</th>
                  <th className="px-8 py-5 font-semibold">Status</th>
                  {user?.role !== UserRole.STUDENT && <th className="px-8 py-5 font-semibold">Assigned To</th>}
                  <th className="px-8 py-5 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {recentDocs.length === 0 ? (
                  <tr><td colSpan={7} className="px-8 py-12 text-center text-slate-500">No recent document requests found.</td></tr>
                ) : recentDocs.map((req: any) => (
                  <tr key={req.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                    <td className="px-8 py-5 text-sm font-medium text-slate-900 dark:text-white">
                      #{req.id.substring(0, 8).toUpperCase()}
                    </td>
                    <td className="px-8 py-5 text-sm text-slate-600 dark:text-slate-300">{req.type}</td>
                    <td className="px-8 py-5 text-sm">
                      <div className="font-bold text-slate-800 dark:text-slate-200">{req.studentName}</div>
                      <div className="text-xs text-slate-500 font-medium">{req.studentAdmissionNo}</div>
                    </td>
                    <td className="px-8 py-5 text-sm text-slate-500 dark:text-slate-400">
                      {req.expectedCompletionDate ? (
                        <div className="flex items-center text-blue-600 dark:text-blue-400 font-bold">
                          <Calendar className="w-3 h-3 mr-1.5" />
                          {new Date(req.expectedCompletionDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </div>
                      ) : <span className="text-slate-400 text-xs italic">Not set</span>}
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-2">
                        <span className={`px-3 py-1.5 rounded-full text-xs font-bold border ${getStatusStyle(req.status)}`}>
                          {req.type === DocumentType.SPORTS_CAPTAIN && req.status === RequestStatus.ASSIGNED && user?.role === UserRole.STUDENT
                            ? 'Pending Action'
                            : (req.status === RequestStatus.APPLICATION_RECEIVED ? 'Assigned' : req.status)}
                        </span>
                        {/* NEW tag for requests less than 24 hours old */}
                        {new Date().getTime() - new Date(req.createdAt).getTime() < 24 * 60 * 60 * 1000 && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-brand-500 text-white animate-pulse">NEW</span>
                        )}
                      </div>
                    </td>
                    {user?.role !== UserRole.STUDENT && (
                      <td className="px-8 py-5 text-sm text-slate-800 dark:text-white">{req.assignedToName || 'Unassigned'}</td>
                    )}
                    <td className="px-8 py-5 flex items-center space-x-3">
                      {req.type === DocumentType.SPORTS_CAPTAIN && user?.role === UserRole.STUDENT ? (
                        <Link
                          to="/sports-captain/apply"
                          className="text-brand-600 dark:text-brand-400 hover:text-brand-700 font-medium text-sm"
                        >
                          View
                        </Link>
                      ) : (
                        <Link to={`/requests/${req.id}`} className="text-brand-600 dark:text-brand-400 hover:text-brand-700 font-medium text-sm">View</Link>
                      )}
                      {(user?.role === UserRole.SUPER_ADMIN || user?.role === UserRole.ADMIN) && (
                        <button onClick={(e) => handleDeleteRequest(req.id, false, e)} className="text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Password Requests Table */}
      {activeTab === 'password' && (
        <div className="bg-white dark:bg-[#070708] backdrop-blur-3xl rounded-3xl shadow-xl border border-slate-200 dark:border-white/5 overflow-hidden transition-colors scroll-x-mobile">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">
                  <th className="px-8 py-5 font-semibold">User Info</th>
                  <th className="px-8 py-5 font-semibold">Role</th>
                  <th className="px-8 py-5 font-semibold">Status</th>
                  {user?.role !== UserRole.STUDENT && <th className="px-8 py-5 font-semibold">Assigned To</th>}
                  <th className="px-8 py-5 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {recentPwds.length === 0 ? (
                  <tr><td colSpan={5} className="px-8 py-12 text-center text-slate-500">No recent password requests found.</td></tr>
                ) : recentPwds.map((req: any) => (
                  <tr key={req.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group cursor-pointer" onClick={() => openPwdModal(req)}>
                    <td className="px-8 py-5 text-sm">
                      <div className="font-bold text-slate-900 dark:text-white">{req.firstName} {req.lastName}</div>
                      <div className="text-xs text-slate-500 font-medium">{req.email}</div>
                    </td>
                    <td className="px-8 py-5 text-sm text-slate-600 dark:text-slate-300">{req.role}</td>
                    <td className="px-8 py-5">
                      <span className={`px-3 py-1.5 rounded-full text-xs font-bold border ${getStatusStyle(req.status)}`}>{req.status}</span>
                    </td>
                    {user?.role !== UserRole.STUDENT && (
                      <td className="px-8 py-5 text-sm text-slate-500">{req.assignedToName || 'Unassigned'}</td>
                    )}
                    <td className="px-8 py-5 flex items-center space-x-3">
                      <button onClick={() => openPwdModal(req)} className="text-brand-600 dark:text-brand-400 hover:text-brand-700 font-medium text-sm">Manage</button>
                      {(user?.role === UserRole.SUPER_ADMIN || user?.role === UserRole.ADMIN) && (
                        <button onClick={(e) => handleDeleteRequest(req.id, true, e)} className="text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Password Management Modal (Reused) */}
      {isPwdModalOpen && selectedPwdReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="bg-white dark:bg-[#070708] rounded-[2.5rem] shadow-2xl max-w-lg w-full p-8 animate-fade-in border border-slate-200 dark:border-white/10">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">Manage Password Request</h3>
              <button onClick={() => setIsPwdModalOpen(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>

            <div className="space-y-6">
              <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl">
                <p className="text-sm font-bold text-slate-900 dark:text-white">{selectedPwdReq.firstName} {selectedPwdReq.lastName}</p>
                <p className="text-xs text-slate-500">{selectedPwdReq.email}</p>
                <p className="text-xs text-slate-500 mt-1">Requested: {new Date(selectedPwdReq.createdAt).toLocaleDateString()}</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 block">Status</label>
                  <select
                    value={selectedPwdReq.status}
                    onChange={(e) => handlePwdUpdate('status', e.target.value)}
                    className="w-full p-3 bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-600 rounded-xl outline-none font-bold text-slate-900 dark:text-white"
                  >
                    <option value="Pending">Pending</option>
                    <option value="Assigned">Assigned</option>
                    <option value="In-Progress">In-Progress</option>
                    <option value="Completed">Completed</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 block">Assigned To</label>
                  <select
                    value={selectedPwdReq.assignedToId || ''}
                    onChange={(e) => handlePwdUpdate('assignedToId', e.target.value)}
                    className="w-full p-3 bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-600 rounded-xl outline-none text-slate-900 dark:text-white"
                  >
                    <option value="">Unassigned</option>
                    {assignees.map(u => (
                      <option key={u.id} value={u.id}>{u.firstName} {u.lastName} ({u.role})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-slate-700">
                <Button onClick={() => setIsPwdModalOpen(false)}>Close</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
