import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { UserRole, RequestStatus, DocRequest, User } from '../types';
import { subscribeToAllRequests, subscribeToAssignedRequests, subscribeToStudentRequests, subscribeToSportsRecommendationRequests } from '../firebase/requestService';
import { Link } from 'react-router-dom';
import { FileText, Clock, CheckCircle, User as UserIcon, ArrowLeft, Calendar, Key } from 'lucide-react';
import { collection, query, onSnapshot } from '@firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import { SPORTS_COORDINATOR_EMAIL } from '../constants';

const AllRequests: React.FC = () => {
    const { user } = useAuth();
    const [requests, setRequests] = useState<DocRequest[]>([]);
    const [passwordRequests, setPasswordRequests] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState<'all' | 'recent' | 'passwords'>('all');
    const [loading, setLoading] = useState(true);

    const isSportsCoordinator = user?.email?.toLowerCase() === SPORTS_COORDINATOR_EMAIL.toLowerCase();

    useEffect(() => {
        if (!user) return;

        let unsubscribe = () => { };

        // Subscribe to Document Requests based on role
        const handleData = (data: DocRequest[]) => {
            setRequests(data);
            setLoading(false);
        };

        if (user.role === UserRole.STUDENT) {
            unsubscribe = subscribeToStudentRequests(user.id, handleData);
        } else if (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN) {
            unsubscribe = subscribeToAllRequests(handleData);
        } else if (isSportsCoordinator) {
            // Sports Coordinator sees ONLY Sports Recommendation requests
            unsubscribe = subscribeToSportsRecommendationRequests(handleData);
        } else {
            // Staff ONLY see assigned
            unsubscribe = subscribeToAssignedRequests(user.id, handleData);
        }

        return () => unsubscribe();
    }, [user, isSportsCoordinator]);

    useEffect(() => {
        if (!user) return;

        // Subscribe to Password Resets
        const q = query(collection(db, 'password_resets'));
        const unsubscribePwd = onSnapshot(q, (snapshot) => {
            let pwdData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                isPasswordReset: true,
                type: 'Password Reset',
                studentName: `${doc.data().firstName} ${doc.data().lastName}`,
                studentAdmissionNo: doc.data().admissionNumber || doc.data().email,
                assignedToName: doc.data().assignedToName || 'Unassigned'
            }));

            // Role-based filtering for Password Requests
            if (user.role === UserRole.STAFF) {
                pwdData = pwdData.filter((r: any) => r.assignedToId === user.id);
            } else if (user.role === UserRole.STUDENT) {
                pwdData = pwdData.filter((r: any) => r.email === user.email);
            }
            // SuperAdmin and Admin see all password requests

            // Sort newest first
            pwdData.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            setPasswordRequests(pwdData);
        });

        return () => unsubscribePwd();
    }, [user]);

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

    // Filter requests for "Recent Requests" tab (last 24 hours)
    const recentRequests = requests.filter(r => {
        const timeDiff = new Date().getTime() - new Date(r.createdAt).getTime();
        const hoursDiff = timeDiff / (1000 * 60 * 60);
        return hoursDiff <= 24;
    });

    const recentPasswords = passwordRequests.filter(r => {
        const timeDiff = new Date().getTime() - new Date(r.createdAt).getTime();
        const hoursDiff = timeDiff / (1000 * 60 * 60);
        return hoursDiff <= 24;
    });

    // Determine which requests to display based on active tab
    const displayRequests = activeTab === 'all' ? requests : recentRequests;
    const displayPasswords = recentPasswords;
    const visibleRequests = displayRequests.filter(r => !r.hiddenFromUsers?.includes(user?.id || ''));

    return (
        <div className="space-y-8">
            <Link to="/dashboard" className="flex items-center text-slate-500 hover:text-brand-600 dark:text-slate-400 dark:hover:text-white transition-colors mb-6">
                <ArrowLeft className="mr-2 w-5 h-5" /> Back to Dashboard
            </Link>

            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl md:text-4xl font-black text-slate-900 dark:text-white tracking-tight">All Requests</h1>
                    <p className="text-slate-500 dark:text-slate-400 text-sm mt-2">Complete request history and management</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="bg-slate-200 dark:bg-[#070708] p-1 rounded-xl flex shrink-0 border border-white/5 w-fit">
                <button
                    onClick={() => setActiveTab('all')}
                    className={`flex items-center px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'all'
                        ? 'bg-brand-600 text-white shadow-md'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                >
                    <FileText className="w-4 h-4 mr-2" />
                    All Requests ({requests.length})
                </button>
                <button
                    onClick={() => setActiveTab('recent')}
                    className={`flex items-center px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'recent'
                        ? 'bg-brand-600 text-white shadow-md'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                >
                    <Clock className="w-4 h-4 mr-2" />
                    Recent Requests ({recentRequests.length})
                </button>
                <button
                    onClick={() => setActiveTab('passwords')}
                    className={`flex items-center px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'passwords'
                        ? 'bg-brand-600 text-white shadow-md'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                >
                    <Key className="w-4 h-4 mr-2" />
                    Recent Passwords ({displayPasswords.length})
                </button>
            </div>

            {/* Content based on active tab */}
            {loading ? (
                <div className="text-center py-12 text-slate-500">Loading...</div>
            ) : (
                <>
                    {activeTab !== 'passwords' ? (
                        <div className="bg-white dark:bg-[#070708] backdrop-blur-3xl rounded-3xl shadow-xl border border-slate-200 dark:border-white/10 overflow-hidden transition-colors">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">
                                            <th className="px-8 py-5 font-semibold">Request ID</th>
                                            <th className="px-8 py-5 font-semibold">Type</th>
                                            <th className="px-8 py-5 font-semibold">User Info</th>
                                            <th className="px-8 py-5 font-semibold">Created Date</th>
                                            <th className="px-8 py-5 font-semibold">Expected Date</th>
                                            <th className="px-8 py-5 font-semibold">Status</th>
                                            {user?.role !== UserRole.STUDENT && <th className="px-8 py-5 font-semibold">Assigned To</th>}
                                            <th className="px-8 py-5 font-semibold">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                                        {visibleRequests.length === 0 ? (
                                            <tr><td colSpan={8} className="px-8 py-12 text-center text-slate-500">No requests found.</td></tr>
                                        ) : visibleRequests.map((req: any) => (
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
                                                    {new Date(req.createdAt).toLocaleDateString()}
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
                                                            {req.status === RequestStatus.APPLICATION_RECEIVED ? 'Assigned' : req.status}
                                                        </span>
                                                        {/* NEW tag for recent requests in the recent tab */}
                                                        {activeTab === 'recent' && new Date().getTime() - new Date(req.createdAt).getTime() < 24 * 60 * 60 * 1000 && (
                                                            <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-brand-500 text-white animate-pulse">NEW</span>
                                                        )}
                                                    </div>
                                                </td>
                                                {user?.role !== UserRole.STUDENT && (
                                                    <td className="px-8 py-5 text-sm text-slate-800 dark:text-white">{req.assignedToName || 'Unassigned'}</td>
                                                )}
                                                <td className="px-8 py-5">
                                                    <Link to={`/requests/${req.id}`} className="text-brand-600 dark:text-brand-400 hover:text-brand-700 font-medium text-sm">View</Link>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-white dark:bg-[#070708] backdrop-blur-3xl rounded-3xl shadow-xl border border-slate-200 dark:border-white/10 overflow-hidden transition-colors">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">
                                            <th className="px-8 py-5 font-semibold">User Info</th>
                                            <th className="px-8 py-5 font-semibold">Role</th>
                                            <th className="px-8 py-5 font-semibold">Request Date</th>
                                            <th className="px-8 py-5 font-semibold">Status</th>
                                            {user?.role !== UserRole.STUDENT && <th className="px-8 py-5 font-semibold">Assigned To</th>}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                                        {displayPasswords.length === 0 ? (
                                            <tr><td colSpan={5} className="px-8 py-12 text-center text-slate-500">No recent password requests found (24h).</td></tr>
                                        ) : displayPasswords.map((req: any) => (
                                            <tr key={req.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                                                <td className="px-8 py-5 text-sm">
                                                    <div className="font-bold text-slate-900 dark:text-white">{req.firstName} {req.lastName}</div>
                                                    <div className="text-xs text-slate-500 font-medium">{req.email}</div>
                                                </td>
                                                <td className="px-8 py-5 text-sm text-slate-600 dark:text-slate-300">{req.role}</td>
                                                <td className="px-8 py-5 text-sm text-slate-500 dark:text-slate-400">
                                                    {new Date(req.createdAt).toLocaleDateString()}
                                                </td>
                                                <td className="px-8 py-5">
                                                    <span className={`px-3 py-1.5 rounded-full text-xs font-bold border ${getStatusStyle(req.status)}`}>{req.status}</span>
                                                </td>
                                                {user?.role !== UserRole.STUDENT && (
                                                    <td className="px-8 py-5 text-sm text-slate-500">{req.assignedToName || 'Unassigned'}</td>
                                                )}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default AllRequests;
