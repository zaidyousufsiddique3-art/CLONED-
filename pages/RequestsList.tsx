
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { UserRole, RequestStatus, DocRequest, User } from '../types';
import { subscribeToAllRequests, subscribeToAssignedRequests, subscribeToStudentRequests } from '../firebase/requestService';
import { getPotentialAssignees } from '../firebase/userService';
import { Link } from 'react-router-dom';
import { Filter, Search, Archive, Clock, Trash2, Calendar, Key, X, CheckSquare, FileText } from 'lucide-react';
import { collection, query, onSnapshot, doc, deleteDoc, updateDoc, arrayUnion, writeBatch } from '@firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import Button from '../components/Button';

const RequestsList: React.FC = () => {
    const { user } = useAuth();
    const [requests, setRequests] = useState<DocRequest[]>([]);
    const [passwordRequests, setPasswordRequests] = useState<any[]>([]);
    const [filterStatus, setFilterStatus] = useState<string>('All');
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState<'new' | 'history'>('new');

    // Category State for Side-by-Side tabs
    const [category, setCategory] = useState<'documents' | 'password'>('documents');

    // Password Modal
    const [isPwdModalOpen, setIsPwdModalOpen] = useState(false);
    const [selectedPwdReq, setSelectedPwdReq] = useState<any>(null);
    const [assignees, setAssignees] = useState<User[]>([]);

    useEffect(() => {
        if (!user) return;
        let unsubscribe = () => { };
        let unsubscribePwd = () => { };

        // 1. Doc Requests Subscription
        const handleData = (data: DocRequest[]) => {
            setRequests(data);
        };

        if (user.role === UserRole.STUDENT) {
            unsubscribe = subscribeToStudentRequests(user.id, handleData);
        } else if (user.role === UserRole.SUPER_ADMIN) {
            unsubscribe = subscribeToAllRequests(handleData);
        } else {
            unsubscribe = subscribeToAssignedRequests(user.id, handleData);
        }

        // 2. Password Resets (Visible to All Admins/Staff/SuperAdmin)
        if (user.role !== UserRole.STUDENT) {
            const q = query(collection(db, 'password_resets'));
            unsubscribePwd = onSnapshot(q, (snapshot) => {
                const pwdData = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                    isPasswordReset: true,
                    type: 'Password Reset',
                    studentName: `${doc.data().firstName} ${doc.data().lastName}`,
                    studentAdmissionNo: doc.data().admissionNumber || doc.data().email,
                    assignedToName: doc.data().assignedToName || 'Unassigned'
                }));

                // Filter locally for Staff/Admins to only show assigned
                // SuperAdmin sees all
                let visiblePwdData = pwdData;
                if (user.role === UserRole.STAFF || user.role === UserRole.ADMIN) {
                    visiblePwdData = pwdData.filter((r: any) => r.assignedToId === user.id);
                }

                setPasswordRequests(visiblePwdData);
            });

            getPotentialAssignees().then(setAssignees);
        }

        return () => {
            unsubscribe();
            unsubscribePwd();
        };
    }, [user]);

    // --- ACTIONS ---

    const handleDelete = async (id: string, isPwd: boolean, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (!user) return;

        const confirmMsg = user?.role === UserRole.SUPER_ADMIN
            ? "PERMANENT DELETE: This will remove the record from the database for everyone. Are you sure?"
            : "Are you sure you want to remove this from your history? It will still be visible to admins.";

        if (!window.confirm(confirmMsg)) return;

        const collectionName = isPwd ? 'password_resets' : 'requests';

        try {
            if (user?.role === UserRole.SUPER_ADMIN) {
                await deleteDoc(doc(db, collectionName, id));
                // Optimistic update
                if (isPwd) {
                    setPasswordRequests(prev => prev.filter(r => r.id !== id));
                } else {
                    setRequests(prev => prev.filter(r => r.id !== id));
                }
            } else {
                await updateDoc(doc(db, collectionName, id), {
                    hiddenFromUsers: arrayUnion(user?.id)
                });
                // Optimistic update not strictly needed as onSnapshot should fire, but good for responsiveness
            }
        } catch (err) {
            console.error("Delete failed", err);
            alert("Action failed. Please try again.");
        }
    };

    const handleClearAll = async () => {
        if (!user) return;
        if (filteredRequests.length === 0) return;

        const confirmMsg = user?.role === UserRole.SUPER_ADMIN
            ? `CRITICAL WARNING: You are about to PERMANENTLY DELETE ALL ${filteredRequests.length} displayed requests. This action cannot be undone. Are you sure?`
            : "Are you sure you want to clear your displayed request history? This will hide them from your view.";

        if (!window.confirm(confirmMsg)) return;

        try {
            const batchSize = 450; // Safe margin below 500
            const allDocs = filteredRequests;

            // Process in chunks
            for (let i = 0; i < allDocs.length; i += batchSize) {
                const batch = writeBatch(db);
                const chunk = allDocs.slice(i, i + batchSize);

                chunk.forEach(req => {
                    const colName = req.isPasswordReset ? 'password_resets' : 'requests';
                    const ref = doc(db, colName, req.id);

                    if (user?.role === UserRole.SUPER_ADMIN) {
                        batch.delete(ref);
                    } else {
                        batch.update(ref, { hiddenFromUsers: arrayUnion(user?.id) });
                    }
                });

                await batch.commit();
            }
            alert("Requests cleared successfully.");
            // Optimistic update
            if (user.role === UserRole.SUPER_ADMIN) {
                // For SuperAdmin, we might need to reload or rely on onSnapshot
                // But since we deleted them, onSnapshot should remove them.
            }
        } catch (err) {
            console.error("Clear all failed", err);
            alert("Failed to clear requests. See console for details.");
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
        }

        await updateDoc(doc(db, 'password_resets', selectedPwdReq.id), updatePayload);
        setSelectedPwdReq(prev => ({ ...prev, ...updatePayload }));
    };

    const openPwdModal = (req: any, e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
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
            default: return 'bg-slate-100 text-slate-600 border-slate-200';
        }
    };

    // --- FILTERING ---

    let sourceData = category === 'documents' ? requests : passwordRequests;

    // Sort: Newest First
    sourceData.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const filteredRequests = sourceData.filter((req: any) => {
        // Hide soft deleted
        if (req.hiddenFromUsers?.includes(user?.id)) return false;

        // Tab Filter
        if (activeTab === 'new') {
            if (req.status === RequestStatus.COMPLETED || req.status === 'Completed') return false;
        } else {
            if (req.status !== RequestStatus.COMPLETED && req.status !== 'Completed') return false;
        }

        // Status Filter
        const matchesStatus = filterStatus === 'All' || req.status === filterStatus;

        // Search Filter
        const matchesSearch =
            (req.studentName && req.studentName.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (req.type && req.type.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (req.id && req.id.toLowerCase().includes(searchTerm.toLowerCase()));

        return matchesStatus && matchesSearch;
    });

    return (
        <div className="space-y-6">
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
                <div className="flex flex-col md:flex-row gap-4 w-full xl:w-auto items-center">

                    {/* Category Switcher - Pill Style */}
                    {user?.role !== UserRole.STUDENT && (
                        <div className="bg-slate-200 dark:bg-[#070708] p-1 rounded-xl flex shrink-0 border border-white/5">
                            <button
                                onClick={() => setCategory('documents')}
                                className={`flex items-center px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${category === 'documents'
                                    ? 'bg-brand-600 text-white shadow-md'
                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                                    }`}
                            >
                                <FileText className="w-4 h-4 mr-2" />
                                Document Requests
                            </button>
                            <button
                                onClick={() => setCategory('password')}
                                className={`flex items-center px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${category === 'password'
                                    ? 'bg-brand-600 text-white shadow-md'
                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                                    }`}
                            >
                                <Key className="w-4 h-4 mr-2" />
                                Password Requests
                            </button>
                        </div>
                    )}

                    {/* New/History Tabs */}
                    <div className="flex space-x-2 shrink-0">
                        <button onClick={() => setActiveTab('new')} className={`flex items-center px-4 py-2 rounded-xl font-bold text-sm transition-all border ${activeTab === 'new' ? 'bg-[#070708] text-brand-600 border-white/10 shadow-sm' : 'border-transparent text-slate-500 hover:bg-white/5'}`}><Clock className="w-4 h-4 mr-2" /> New</button>
                        <button onClick={() => setActiveTab('history')} className={`flex items-center px-4 py-2 rounded-xl font-bold text-sm transition-all border ${activeTab === 'history' ? 'bg-[#070708] text-brand-600 border-white/10 shadow-sm' : 'border-transparent text-slate-500 hover:bg-white/5'}`}><Archive className="w-4 h-4 mr-2" /> History</button>
                    </div>
                </div>

                {filteredRequests.length > 0 && (
                    <button onClick={handleClearAll} className="flex items-center text-xs font-bold text-slate-400 hover:text-red-500 transition-colors shrink-0 ml-auto bg-white dark:bg-white/5 backdrop-blur-md px-4 py-2 rounded-xl border border-slate-200 dark:border-white/5">
                        <CheckSquare className="w-4 h-4 mr-2" />
                        {user?.role === UserRole.SUPER_ADMIN ? 'Delete All Displayed' : 'Clear All Displayed'}
                    </button>
                )}
            </div>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-[#070708] backdrop-blur-3xl p-5 rounded-3xl shadow-sm border border-slate-200 dark:border-white/10">
                <div className="relative flex-1 max-w-lg">
                    <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
                    <input type="text" placeholder="Search requests..." className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-brand-500 text-slate-900 dark:text-white placeholder-slate-400" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                </div>
                <div className="flex items-center space-x-3">
                    <div className="flex items-center bg-slate-50 dark:bg-white/5 px-4 py-3 rounded-2xl border border-slate-200 dark:border-white/5">
                        <Filter className="text-slate-400 w-5 h-5 mr-2" />
                        <select className="bg-transparent border-none focus:outline-none text-slate-700 dark:text-slate-300 font-medium text-sm" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                            <option value="All">All Statuses</option>
                            {Object.values(RequestStatus).map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            <div className="bg-white dark:bg-[#070708] backdrop-blur-3xl rounded-3xl shadow-xl border border-slate-200 dark:border-white/10 overflow-hidden">
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
                            {filteredRequests.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-8 py-12 text-center text-slate-500">
                                        No {category} requests found matching your filters.
                                    </td>
                                </tr>
                            ) : filteredRequests.map((req: any) => (
                                <tr key={req.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                                    <td className="px-8 py-5 text-sm font-medium text-slate-900 dark:text-white">
                                        {req.isPasswordReset ? <Key className="w-4 h-4 inline mr-2 text-brand-500" /> : null}
                                        #{req.id.substring(0, 8).toUpperCase()}
                                    </td>
                                    <td className="px-8 py-5 text-sm text-slate-600 dark:text-slate-300">{req.type}</td>
                                    <td className="px-8 py-5 text-sm">
                                        <div className="font-bold text-slate-800 dark:text-slate-200">{req.studentName}</div>
                                        <div className="text-xs text-slate-500">{req.studentAdmissionNo}</div>
                                    </td>
                                    <td className="px-8 py-5 text-sm text-slate-500 dark:text-slate-400">
                                        {req.expectedCompletionDate ? (
                                            <div className="flex items-center text-blue-600 dark:text-blue-400 font-medium">
                                                <Calendar className="w-3 h-3 mr-1.5" />
                                                {new Date(req.expectedCompletionDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                            </div>
                                        ) : <span className="text-slate-400 text-xs italic">Not set</span>}
                                    </td>
                                    <td className="px-8 py-5">
                                        <span className={`px-3 py-1.5 rounded-full text-xs font-bold border ${getStatusStyle(req.status)}`}>{req.status}</span>
                                    </td>
                                    {user?.role !== UserRole.STUDENT && <td className="px-8 py-5 text-sm text-slate-800 dark:text-white">{req.assignedToName || 'Unassigned'}</td>}
                                    <td className="px-8 py-5 flex items-center gap-3">
                                        {req.isPasswordReset ? (
                                            <button onClick={(e) => openPwdModal(req, e)} className="text-brand-600 hover:text-brand-700 font-bold text-sm">Manage</button>
                                        ) : (
                                            <Link to={`/requests/${req.id}`} className="text-brand-600 hover:text-brand-700 font-bold text-sm">View</Link>
                                        )}

                                        <button onClick={(e) => handleDelete(req.id, !!req.isPasswordReset, e)} className="text-slate-400 hover:text-red-500 transition-colors" title="Delete">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Password Management Modal */}
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
                                <Button onClick={() => setIsPwdModalOpen(false)}>Done</Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RequestsList;
