import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { User, SportsCaptainApplication, DocumentType, RequestStatus } from '../types';
import { useSearchParams } from 'react-router-dom';
import { getStudents } from '../firebase/userService';
import { sendNotification } from '../firebase/notificationService';
import { getSportsCaptainApplications, deleteSportsCaptainApplication } from '../firebase/sportsCaptainService';
import Button from '../components/Button';
import {
    Send,
    Users,
    FileText,
    CheckCircle2,
    Download,
    Eye,
    Trophy,
    ArrowLeft,
    Calendar,
    Trash2
} from 'lucide-react';
import { createRequest, subscribeToSportsCaptainRequests } from '../firebase/requestService';
import { collection, query, where, getDocs, updateDoc, doc, orderBy, onSnapshot, getDoc } from '@firebase/firestore';
import { db } from '../firebase/firebaseConfig';

const SportsCaptainPortal: React.FC = () => {
    const { user } = useAuth();
    const [searchParams] = useSearchParams();
    const [activeTab, setActiveTab] = useState<'send-request' | 'sent-list' | 'received'>('send-request');

    // Sent Tab State
    const [gender, setGender] = useState<string>('Male');
    const [students, setStudents] = useState<User[]>([]);
    const [selectedStudentId, setSelectedStudentId] = useState<string>('');
    const [inviting, setInviting] = useState(false);
    const [deadline, setDeadline] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    // Received Tab State
    const [applications, setApplications] = useState<SportsCaptainApplication[]>([]);
    const [invitationsCount, setInvitationsCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [viewingApplication, setViewingApplication] = useState<SportsCaptainApplication | null>(null);

    // Requests View State
    const [viewingRequest, setViewingRequest] = useState<any | null>(null);

    // Sent List State
    const [sentInvitations, setSentInvitations] = useState<any[]>([]);

    // Status Update State
    const [newStatus, setNewStatus] = useState<SportsCaptainApplication['status']>('Pending');
    const [rejectionReason, setRejectionReason] = useState('');
    const [updatingStatus, setUpdatingStatus] = useState(false);

    // Request Resolution State
    const [resolvingRequestId, setResolvingRequestId] = useState<string | null>(null);
    const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
    const [requestRejectionReason, setRequestRejectionReason] = useState('');

    useEffect(() => {
        if (!user) return;

        // 1. Listen for Applications (Received)
        const qApps = query(collection(db, 'sports_captain_applications'));
        const unsubApps = onSnapshot(qApps,
            (snapshot) => {
                const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SportsCaptainApplication));
                // Sort in memory
                setApplications(data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
                setLoading(false);
            },
            (error) => {
                console.error("Apps fetch error:", error);
                setLoading(false);
            }
        );

        // 2. Listen for Requests (Sports Captain ONLY - NOT Recommendations)
        const unsubReqs = subscribeToSportsCaptainRequests((docs) => {
            setSentInvitations(docs);
            setInvitationsCount(docs.length);
        });

        return () => {
            unsubApps();
            unsubReqs();
        };
    }, [user]);

    useEffect(() => {
        loadStudents();
    }, [gender]);

    useEffect(() => {
        const studentId = searchParams.get('studentId');
        if (studentId && applications.length > 0) {
            const app = applications.find(a => a.studentId === studentId);
            if (app) {
                setViewingApplication(app);
                setNewStatus(app.status || 'Pending');
                setRejectionReason(app.rejectionReason || '');
                setActiveTab('received');
            }
        }
    }, [applications, searchParams]);

    const loadStudents = async () => {
        const data = await getStudents(gender);
        setStudents(data);
        if (data.length > 0) setSelectedStudentId(data[0].id);
        else setSelectedStudentId('');
    };

    const loadApplications = async () => {
        // No longer needed as we use onSnapshot, but keeping empty to avoid build breaks if called elsewhere
    };

    const handleSendInvitation = async () => {
        if (!selectedStudentId || !deadline) return;
        setInviting(true);
        try {
            const student = students.find(s => s.id === selectedStudentId);
            if (!student) return;

            // 1. Send Notification
            await sendNotification(
                selectedStudentId,
                "You are invited to apply for the position of Sports Captain.",
                "/sports-captain/apply"
            );

            // 2. Create Document Request for Tracking
            const requestData: any = {
                studentId: selectedStudentId,
                studentName: `${student.firstName} ${student.lastName}`,
                studentAdmissionNo: student.admissionNumber || '',
                type: DocumentType.SPORTS_CAPTAIN,
                details: "Invitation for Sports Captain Application",
                status: RequestStatus.ASSIGNED,
                expectedCompletionDate: new Date(deadline).toISOString(),
                assignedToId: user?.id,
                assignedToName: user ? `${user.firstName} ${user.lastName}` : 'Coordinator',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                comments: [],
                attachments: []
            };
            await createRequest(requestData);

            // Close the original request if this is a resolution
            if (resolvingRequestId) {
                await updateDoc(doc(db, 'requests', resolvingRequestId), {
                    status: RequestStatus.COMPLETED,
                    updatedAt: new Date().toISOString()
                });
                setResolvingRequestId(null);
            }

            setSuccessMessage(`Invitation dispatched to ${student.firstName}.`);
            setDeadline('');
            setTimeout(() => setSuccessMessage(''), 5000);
        } catch (error) {
            console.error("Error sending invitation", error);
            alert("Failed to send invitation.");
        } finally {
            setInviting(false);
        }
    };

    const handleRejectRequest = async () => {
        if (!viewingRequest || !requestRejectionReason) return;

        try {
            await updateDoc(doc(db, 'requests', viewingRequest.id), {
                status: RequestStatus.REJECTED,
                updatedAt: new Date().toISOString()
            });

            await sendNotification(
                viewingRequest.studentId,
                `Your request for ${viewingRequest.type} was rejected: ${requestRejectionReason}`,
                `/requests/${viewingRequest.id}`
            );

            setIsRejectModalOpen(false);
            setViewingRequest(null);
            setRequestRejectionReason('');
            alert("Request rejected.");
        } catch (error) {
            console.error("Rejection failed", error);
            alert("Failed to reject request.");
        }
    };

    const handleAcceptAndInvite = async (req: any) => {
        setResolvingRequestId(req.id);

        try {
            const userRef = doc(db, 'users', req.studentId);
            const userSnap = await getDoc(userRef);

            if (userSnap.exists()) {
                const userData = userSnap.data() as User;
                const userGender = userData.gender || 'Male';
                setGender(userGender);

                setTimeout(() => {
                    setSelectedStudentId(req.studentId);
                }, 500);

                setActiveTab('send-request');
                setViewingRequest(null);
            }
        } catch (e) {
            console.error("Error setting up invite", e);
        }
    };

    const handleUpdateStatus = async () => {
        if (!viewingApplication) return;
        setUpdatingStatus(true);
        try {
            // 1. Update Application Record
            const appRef = doc(db, 'sports_captain_applications', viewingApplication.id);
            await updateDoc(appRef, {
                status: newStatus,
                rejectionReason: newStatus === 'Rejected' ? rejectionReason : '',
                updatedAt: new Date().toISOString()
            });

            // 2. Update Document Request Status
            const q = query(
                collection(db, 'requests'),
                where('studentId', '==', viewingApplication.studentId),
                where('type', '==', DocumentType.SPORTS_CAPTAIN)
            );
            const snapshot = await getDocs(q);
            if (!snapshot.empty) {
                for (const requestDoc of snapshot.docs) {
                    let requestStatus = RequestStatus.APPLICATION_RECEIVED;
                    if (newStatus === 'Accepted') requestStatus = RequestStatus.COMPLETED;
                    if (newStatus === 'Rejected') requestStatus = RequestStatus.REJECTED;
                    if (newStatus === 'In-review') requestStatus = RequestStatus.IN_REVIEW;

                    await updateDoc(doc(db, 'requests', requestDoc.id), {
                        status: requestStatus,
                        updatedAt: new Date().toISOString()
                    });
                }
            }

            // 3. Send Notification to Student
            await sendNotification(
                viewingApplication.studentId,
                "You received a status update from the Sports Coordinator",
                "/sports-captain/apply"
            );

            alert("Status updated and notification sent.");
            loadApplications();
            setViewingApplication({ ...viewingApplication, status: newStatus, rejectionReason: newStatus === 'Rejected' ? rejectionReason : '' });
        } catch (error: any) {
            console.error(error);
            alert("Update failed: " + error.message);
        } finally {
            setUpdatingStatus(false);
        }
    };

    const handleDeleteApplication = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (window.confirm("Are you sure you want to delete this application? This action cannot be undone.")) {
            try {
                await deleteSportsCaptainApplication(id);
                loadApplications();
            } catch (error: any) {
                alert("Deletion failed: " + error.message);
            }
        }
    };

    return (
        <div className="space-y-8 animate-fade-in">
            {/* Header with Pill Tabs */}
            <div className="flex flex-col xl:flex-row justify-between items-center gap-6">
                <div className="bg-slate-200 dark:bg-[#070708] p-1.5 rounded-2xl flex flex-wrap justify-center md:flex-nowrap shrink-0 border border-slate-300 dark:border-white/5 shadow-inner w-full md:w-auto">
                    <button
                        onClick={() => setActiveTab('send-request')}
                        className={`flex items-center px-6 py-3 rounded-xl text-sm font-black transition-all duration-300 w-full md:w-auto justify-center ${activeTab === 'send-request'
                            ? 'bg-brand-600 text-white shadow-lg shadow-brand-500/20 translate-y-[-1px]'
                            : 'text-slate-500 dark:text-slate-400 hover:text-brand-600 dark:hover:text-white'
                            }`}
                    >
                        <Send className="w-4 h-4 mr-2" />
                        Send Application Request
                    </button>
                    <button
                        onClick={() => setActiveTab('sent-list')}
                        className={`flex items-center px-6 py-3 rounded-xl text-sm font-black transition-all duration-300 w-full md:w-auto justify-center ${activeTab === 'sent-list'
                            ? 'bg-brand-600 text-white shadow-lg shadow-brand-500/20 translate-y-[-1px]'
                            : 'text-slate-500 dark:text-slate-400 hover:text-brand-600 dark:hover:text-white'
                            }`}
                    >
                        <FileText className="w-4 h-4 mr-2" />
                        Requests
                    </button>
                    <button
                        onClick={() => setActiveTab('received')}
                        className={`flex items-center px-6 py-3 rounded-xl text-sm font-black transition-all duration-300 w-full md:w-auto justify-center ${activeTab === 'received'
                            ? 'bg-brand-600 text-white shadow-lg shadow-brand-500/20 translate-y-[-1px]'
                            : 'text-slate-500 dark:text-slate-400 hover:text-brand-600 dark:hover:text-white'
                            }`}
                    >
                        <Users className="w-4 h-4 mr-2" />
                        Applications Received
                    </button>
                </div>
            </div>

            {/* Global Analytics Section */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="bg-white dark:bg-white/5 p-6 rounded-3xl border border-slate-200 dark:border-white/5 shadow-sm transition-all hover:border-brand-500/30 group">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 group-hover:text-brand-500 transition-colors">Total Requests</p>
                    <p className="text-3xl font-black text-slate-900 dark:text-white leading-none">{invitationsCount}</p>
                </div>
                <div className="bg-white dark:bg-white/5 p-6 rounded-3xl border border-slate-200 dark:border-white/5 shadow-sm transition-all hover:border-brand-500/30 group">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 group-hover:text-brand-500 transition-colors">Applications Received</p>
                    <p className="text-3xl font-black text-brand-600 leading-none">{applications.length}</p>
                </div>
                <div className="bg-amber-500/5 p-6 rounded-3xl border border-amber-500/10 shadow-sm transition-all hover:border-amber-500/30 group">
                    <p className="text-[10px] font-black text-amber-600/60 uppercase tracking-[0.2em] mb-2 group-hover:text-amber-600 transition-colors">In-Review</p>
                    <p className="text-3xl font-black text-amber-600 leading-none">{applications.filter(a => a.status === 'In-review' || a.status === 'Pending').length}</p>
                </div>
                <div className="bg-red-500/5 p-6 rounded-3xl border border-red-500/10 shadow-sm transition-all hover:border-red-500/30 group">
                    <p className="text-[10px] font-black text-red-600/60 uppercase tracking-[0.2em] mb-2 group-hover:text-red-600 transition-colors">Rejected</p>
                    <p className="text-3xl font-black text-red-600 leading-none">{applications.filter(a => a.status === 'Rejected').length}</p>
                </div>
                <div className="bg-emerald-500/5 p-6 rounded-3xl border border-emerald-500/10 shadow-sm transition-all hover:border-emerald-500/30 group">
                    <p className="text-[10px] font-black text-emerald-600/60 uppercase tracking-[0.2em] mb-2 group-hover:text-emerald-600 transition-colors">Successful</p>
                    <p className="text-3xl font-black text-emerald-600 leading-none">{applications.filter(a => a.status === 'Accepted').length}</p>
                </div>
            </div>

            {activeTab === 'send-request' ? (
                /* PAGE 1: SEND APPLICATION REQUEST */
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="bg-white dark:bg-[#070708] rounded-[2.5rem] p-10 shadow-2xl border border-slate-200 dark:border-white/10 relative overflow-hidden group">
                        <div className="absolute -top-24 -right-24 w-48 h-48 bg-brand-600/5 rounded-full blur-3xl group-hover:bg-brand-600/10 transition-colors"></div>

                        <div className="relative z-10 space-y-8">
                            <div>
                                <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tighter">Draft Invitation</h3>
                                <p className="text-slate-500 text-sm mt-1 font-medium">Select a student to invite for the Sports Captaincy.</p>
                            </div>

                            <div className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Student Gender</label>
                                    <div className="grid grid-cols-2 gap-4">
                                        {['Male', 'Female'].map(g => (
                                            <button
                                                key={g}
                                                onClick={() => setGender(g)}
                                                className={`py-4 rounded-2xl font-bold text-sm border transition-all ${gender === g
                                                    ? 'bg-brand-600 border-brand-600 text-white shadow-lg shadow-brand-500/20'
                                                    : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/5 text-slate-600 dark:text-slate-400 hover:border-brand-600/50'
                                                    }`}
                                            >
                                                {g}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Candidate Selection</label>
                                    <select
                                        value={selectedStudentId}
                                        onChange={(e) => setSelectedStudentId(e.target.value)}
                                        className="w-full px-6 py-4 bg-slate-50 dark:bg-[#070708] border border-slate-200 dark:border-white/10 rounded-2xl focus:ring-2 focus:ring-brand-500 outline-none text-slate-900 dark:text-white font-bold transition-all appearance-none cursor-pointer"
                                    >
                                        <option value="" disabled>Select Student...</option>
                                        {students.map(s => (
                                            <option key={s.id} value={s.id}>{s.firstName} {s.lastName} ({s.admissionNumber})</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Submission Deadline</label>
                                    <div className="relative">
                                        <input
                                            type="date"
                                            value={deadline}
                                            onChange={(e) => setDeadline(e.target.value)}
                                            min={new Date().toISOString().split('T')[0]}
                                            className="w-full px-6 py-4 bg-slate-50 dark:bg-[#070708] border border-slate-200 dark:border-white/10 rounded-2xl focus:ring-2 focus:ring-brand-500 outline-none text-slate-900 dark:text-white font-bold transition-all"
                                        />
                                        <Calendar className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5 pointer-events-none" />
                                    </div>
                                </div>

                                {successMessage && (
                                    <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 p-4 rounded-2xl text-xs font-bold flex items-center animate-scale-in">
                                        <CheckCircle2 className="w-4 h-4 mr-3" />
                                        {successMessage}
                                    </div>
                                )}

                                <Button
                                    onClick={handleSendInvitation}
                                    isLoading={inviting}
                                    disabled={!selectedStudentId || !deadline}
                                    className="w-full py-5 rounded-[1.25rem] text-sm tracking-wider"
                                >
                                    <Send className="w-4 h-4 mr-2" />
                                    Dispatch Invitation & Create Record
                                </Button>
                            </div>
                        </div>
                    </div>

                    <div className="hidden lg:flex flex-col justify-center p-10 space-y-8">
                        <div className="space-y-4">
                            <div className="w-16 h-16 bg-brand-600/10 rounded-2xl flex items-center justify-center text-brand-600">
                                <Trophy size={32} />
                            </div>
                            <h2 className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter leading-tight">
                                Empower Excellence <br />In Athletic Leadership
                            </h2>
                            <p className="text-slate-500 dark:text-slate-400 leading-relaxed font-medium text-lg">
                                Invite the most promising candidates to represent SLISR as Sports Captains.
                                Selected students will receive an official portal notification to submit their achievements and vision.
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            <div className="p-6 bg-white dark:bg-[#0A0A0C] rounded-3xl border border-slate-200 dark:border-white/5">
                                <p className="text-brand-600 font-bold text-2xl">Verified</p>
                                <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Record Sync</p>
                            </div>
                            <div className="p-6 bg-white dark:bg-[#0A0A0C] rounded-3xl border border-slate-200 dark:border-white/5">
                                <p className="text-brand-600 font-bold text-2xl">Secure</p>
                                <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">E2E Flow</p>
                            </div>
                        </div>
                    </div>
                </div>
            ) : activeTab === 'sent-list' ? (
                /* PAGE 2: SENT APPLICATIONS LIST */
                <div className="bg-white dark:bg-[#070708] backdrop-blur-3xl rounded-[2.5rem] shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden min-h-[400px]">
                    <div className="scroll-x-mobile">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50 dark:bg-white/5 text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] border-b border-slate-100 dark:border-white/5">
                                    <th className="px-8 py-6">Student Name</th>
                                    <th className="px-8 py-6">Type</th>
                                    <th className="px-8 py-6">Admn No</th>
                                    <th className="px-8 py-6">Deadline / Info</th>
                                    <th className="px-8 py-6">Status</th>
                                    <th className="px-8 py-6">Dispatched Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan={5} className="px-8 py-20 text-center text-slate-500 font-bold text-sm animate-pulse">Retrieving dispatched invitations...</td>
                                    </tr>
                                ) : sentInvitations.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-8 py-20 text-center text-slate-500 font-bold text-sm">No requests found.</td>
                                    </tr>
                                ) : sentInvitations.map(invit => (
                                    <tr key={invit.id} className="group hover:bg-slate-50 dark:hover:bg-white/5 transition-all border-b border-slate-50 dark:border-white/5 cursor-pointer" onClick={() => setViewingRequest(invit)}>
                                        <td className="px-8 py-6 font-bold text-slate-900 dark:text-white">
                                            {invit.studentName}
                                        </td>
                                        <td className="px-8 py-6 text-xs font-bold text-slate-500">{invit.type}</td>
                                        <td className="px-8 py-6 font-mono text-sm text-slate-500 dark:text-slate-400">{invit.studentAdmissionNo}</td>
                                        <td className="px-8 py-6 text-slate-500 text-sm font-medium">
                                            {invit.expectedCompletionDate ? new Date(invit.expectedCompletionDate).toLocaleDateString() : 'View Details'}
                                        </td>
                                        <td className="px-8 py-6">
                                            <div className="flex items-center gap-2">
                                                <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest whitespace-nowrap ${invit.status === RequestStatus.COMPLETED ? 'bg-emerald-500/10 text-emerald-500' :
                                                    invit.status === RequestStatus.REJECTED ? 'bg-red-500/10 text-red-500' :
                                                        'bg-brand-500/10 text-brand-500'
                                                    }`}>
                                                    {invit.status === RequestStatus.APPLICATION_RECEIVED ? 'Assigned' : invit.status}
                                                </span>
                                                {/* NEW tag for requests less than 24 hours old */}
                                                {new Date().getTime() - new Date(invit.createdAt).getTime() < 24 * 60 * 60 * 1000 && (
                                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-brand-500 text-white animate-pulse">NEW</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-8 py-6 text-slate-400 text-sm font-medium">{new Date(invit.createdAt).toLocaleDateString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                /* PAGE 3: APPLICATIONS RECEIVED */
                <div className="space-y-6">
                    <div className="bg-white dark:bg-[#070708] backdrop-blur-3xl rounded-[2.5rem] shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden min-h-[400px]">
                        <div className="scroll-x-mobile">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50 dark:bg-white/5 text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] border-b border-slate-100 dark:border-white/5">
                                        <th className="px-8 py-6">Student Name</th>
                                        <th className="px-8 py-6">Admission No</th>
                                        <th className="px-8 py-6">Gender</th>
                                        <th className="px-8 py-6">Status</th>
                                        <th className="px-8 py-6">Submitted Date</th>
                                        <th className="px-8 py-6 text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr>
                                            <td colSpan={6} className="px-8 py-20 text-center text-slate-500 font-bold text-sm animate-pulse">Retrieving application records...</td>
                                        </tr>
                                    ) : applications.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="px-8 py-20 text-center text-slate-500 font-bold text-sm">No applications received yet.</td>
                                        </tr>
                                    ) : applications.map(app => (
                                        <tr key={app.id} className="group hover:bg-slate-50 dark:hover:bg-white/5 transition-all border-b border-slate-50 dark:border-white/5">
                                            <td className="px-8 py-6">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-xl bg-brand-600/10 text-brand-600 flex items-center justify-center font-bold text-xs uppercase tracking-tighter">
                                                        {app.studentName.charAt(0)}
                                                    </div>
                                                    <span className="font-bold text-slate-900 dark:text-white">{app.studentName}</span>
                                                </div>
                                            </td>
                                            <td className="px-8 py-6 font-mono text-sm text-slate-500 dark:text-slate-400">{app.studentAdmissionNo}</td>
                                            <td className="px-8 py-6 font-bold text-slate-500 dark:text-slate-400 capitalize">{app.studentGender}</td>
                                            <td className="px-8 py-6">
                                                <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest whitespace-nowrap ${app.status === 'Accepted' ? 'bg-emerald-500/10 text-emerald-500' :
                                                    app.status === 'Rejected' ? 'bg-red-500/10 text-red-500' :
                                                        app.status === 'In-review' ? 'bg-amber-500/10 text-amber-500' :
                                                            'bg-brand-500/10 text-brand-500'
                                                    } `}>
                                                    {(app.status === 'Pending' || !app.status) ? 'Assigned' : app.status}
                                                </span>
                                            </td>
                                            <td className="px-8 py-6 text-slate-500 text-sm font-medium">{new Date(app.createdAt).toLocaleDateString()}</td>
                                            <td className="px-8 py-6 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        onClick={() => {
                                                            setViewingApplication(app);
                                                            setNewStatus(app.status || 'In-review');
                                                            setRejectionReason(app.rejectionReason || '');
                                                        }}
                                                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white rounded-xl text-xs font-black shadow-lg shadow-brand-500/10 hover:bg-brand-700 transition-all opacity-0 group-hover:opacity-100"
                                                    >
                                                        <Eye className="w-3.5 h-3.5" />
                                                        View Details
                                                    </button>
                                                    <button
                                                        onClick={(e) => handleDeleteApplication(app.id, e)}
                                                        className="p-2.5 text-slate-400 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100"
                                                        title="Delete Application"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* Application Detail Immersive View */}
            {viewingApplication && (
                <div className="absolute inset-0 z-50 bg-slate-50 dark:bg-[#060607] overflow-y-auto animate-in fade-in slide-in-from-right-4 duration-300">
                    {/* Top Sticky bar */}
                    <div className="sticky top-0 z-30 bg-white/80 dark:bg-[#070708]/80 backdrop-blur-3xl px-6 md:px-10 py-5 border-b border-slate-200 dark:border-white/5 flex justify-between items-center">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => setViewingApplication(null)}
                                className="p-2.5 bg-slate-100 dark:bg-white/5 rounded-xl hover:bg-brand-600 hover:text-white transition-all text-slate-500"
                            >
                                <ArrowLeft size={18} />
                            </button>
                            <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tighter">Application</h3>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="px-4 py-2 bg-brand-600/10 text-brand-600 rounded-lg text-[10px] font-black uppercase tracking-widest border border-brand-600/20">
                                Official Record
                            </div>
                        </div>
                    </div>

                    <div className="max-w-5xl mx-auto px-6 py-8 space-y-10">
                        {/* Student Portfolio Header */}
                        <div className="bg-white dark:bg-[#0A0A0C] p-8 rounded-[2.5rem] border border-slate-200 dark:border-white/5 shadow-xl relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-brand-600/5 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2"></div>

                            <div className="relative z-10 flex flex-col md:flex-row gap-8 items-center">
                                <div className="w-24 h-24 rounded-[2rem] bg-brand-600 text-white flex items-center justify-center text-4xl font-black shadow-2xl shadow-brand-500/30 shrink-0">
                                    {viewingApplication.studentName ? viewingApplication.studentName.charAt(0) : 'S'}
                                </div>
                                <div className="space-y-6 flex-1 w-full text-center md:text-left">
                                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                                        <div className="space-y-1">
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Candidate Name</p>
                                            <p className="text-lg font-black text-slate-900 dark:text-white tracking-tight">{viewingApplication.studentName}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Admission ID</p>
                                            <p className="text-lg font-mono font-bold text-slate-500 dark:text-slate-400">{viewingApplication.studentAdmissionNo}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Identity Header</p>
                                            <p className="text-lg font-bold text-slate-900 dark:text-white">{viewingApplication.studentGender}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Reception Date</p>
                                            <p className="text-lg font-bold text-slate-900 dark:text-white">{new Date(viewingApplication.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Status Management Bar */}
                        <div className="bg-white dark:bg-white/5 p-8 rounded-[2.5rem] border border-slate-200 dark:border-white/5 flex flex-col lg:flex-row items-center gap-8 shadow-xl">
                            <div className="flex-1 space-y-2 w-full">
                                <label className="text-[10px] font-black text-slate-400 dark:text-slate-400 uppercase tracking-widest ml-1">Update Application Status</label>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {['Accepted', 'In-review', 'Rejected'].map((s) => (
                                        <button
                                            key={s}
                                            onClick={() => setNewStatus(s as any)}
                                            className={`py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all border ${newStatus === s
                                                ? s === 'Accepted' ? 'bg-emerald-500 border-emerald-500 text-white shadow-lg shadow-emerald-500/20' :
                                                    s === 'Rejected' ? 'bg-red-500 border-red-500 text-white shadow-lg shadow-red-500/20' :
                                                        'bg-amber-500 border-amber-500 text-white shadow-lg shadow-amber-500/20'
                                                : 'bg-slate-50 dark:bg-white/5 border-slate-100 dark:border-white/10 text-slate-400 hover:border-brand-500/20'
                                                }`}
                                        >
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {newStatus === 'Rejected' && (
                                <div className="flex-[1.5] space-y-2 w-full animate-in slide-in-from-top-2">
                                    <label className="text-[10px] font-black text-red-400 uppercase tracking-widest ml-1">Reason for Rejection</label>
                                    <input
                                        type="text"
                                        value={rejectionReason}
                                        onChange={(e) => setRejectionReason(e.target.value)}
                                        placeholder="e.g. Insufficient sporting portfolio for Grade 12 level..."
                                        className="w-full px-6 py-4 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl focus:ring-2 focus:ring-red-500 outline-none text-slate-900 dark:text-white font-bold transition-all text-sm"
                                    />
                                </div>
                            )}

                            <div className="shrink-0 w-full lg:w-auto pt-6 lg:pt-0">
                                <Button
                                    onClick={handleUpdateStatus}
                                    isLoading={updatingStatus}
                                    disabled={newStatus === 'Rejected' && !rejectionReason.trim()}
                                    className={`w-full lg:w-auto px-12 py-5 rounded-2xl font-black uppercase tracking-widest text-xs ${newStatus === 'Accepted' ? 'bg-emerald-600 hover:bg-emerald-700' :
                                        newStatus === 'Rejected' ? 'bg-red-600 hover:bg-red-700' :
                                            'bg-brand-600'
                                        }`}
                                >
                                    <Send className="w-4 h-4 mr-2" />
                                    Send Update
                                </Button>
                            </div>
                        </div>

                        {/* Primary Portfolio Documents */}
                        <div className="space-y-6">
                            <div className="flex items-center gap-4">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] whitespace-nowrap">Core Documents</h4>
                                <div className="h-[1px] w-full bg-slate-200 dark:bg-white/10"></div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {[
                                    { label: 'Academic CV', url: viewingApplication.cvUrl, name: viewingApplication.cvName },
                                    { label: 'Intent Statement', url: viewingApplication.intentUrl, name: viewingApplication.intentName },
                                    { label: 'Strategic Plan', url: viewingApplication.actionPlanUrl, name: viewingApplication.actionPlanName }
                                ].map((doc, idx) => (
                                    <div key={idx} className="group p-6 bg-white dark:bg-[#0A0A0C] rounded-[2rem] border border-slate-200 dark:border-white/5 flex flex-col justify-between items-start gap-5 hover:border-brand-600/30 transition-all shadow-lg hover:shadow-brand-500/5">
                                        <div className="w-12 h-12 bg-slate-50 dark:bg-white/5 rounded-xl flex items-center justify-center text-brand-600 transition-colors group-hover:bg-brand-600 group-hover:text-white">
                                            <FileText size={24} />
                                        </div>
                                        <div className="w-full">
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{doc.label}</p>
                                            <p className="font-bold text-slate-900 dark:text-white text-xs truncate w-full" title={doc.name || 'document.pdf'}>
                                                {doc.name || 'document_file.pdf'}
                                            </p>
                                        </div>
                                        <a
                                            href={doc.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="w-full py-3.5 bg-slate-900 dark:bg-white/10 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all text-center flex items-center justify-center gap-2 shadow-xl shadow-black/10"
                                        >
                                            <Download size={12} />
                                            Download Asset
                                        </a>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Achievement Certificates */}
                        <div className="space-y-6">
                            <div className="flex items-center gap-4">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] whitespace-nowrap">Evidence & Certificates</h4>
                                <div className="h-[1px] w-full bg-slate-200 dark:bg-white/10"></div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {viewingApplication.supportingCertificates.map((cert, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-5 bg-white dark:bg-[#0A0A0C] border border-slate-200 dark:border-white/5 rounded-[1.25rem] hover:border-brand-600/50 transition-all shadow-soft group">
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            <div className="text-brand-600 bg-brand-600/10 p-2.5 rounded-lg group-hover:bg-brand-600 group-hover:text-white transition-colors">
                                                <Trophy size={16} />
                                            </div>
                                            <div className="overflow-hidden">
                                                <p className="font-bold text-[11px] text-slate-900 dark:text-white truncate max-w-[120px]" title={cert.name}>{cert.name}</p>
                                                <p className="text-[8px] text-slate-500 font-black uppercase tracking-tighter">{(cert.size / 1024).toFixed(1)} KB Record</p>
                                            </div>
                                        </div>
                                        <a href={cert.dataUrl} target="_blank" rel="noopener noreferrer" className="p-2.5 text-slate-400 hover:text-brand-600 transition-colors bg-slate-50 dark:bg-white/5 rounded-lg">
                                            <Download size={16} />
                                        </a>
                                    </div>
                                ))}
                                {viewingApplication.supportingCertificates.length === 0 && (
                                    <div className="col-span-full py-12 text-center text-slate-400 font-bold bg-white dark:bg-[#0A0A0C] rounded-[2rem] border border-dashed border-slate-200 dark:border-white/10 uppercase tracking-widest text-[10px]">
                                        No supplementary records found.
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="pt-8 pb-16 flex justify-center">
                            <Button onClick={() => setViewingApplication(null)} className="px-10 py-4 rounded-xl text-xs">
                                Return to Applications List
                            </Button>
                        </div>
                    </div>
                </div>
            )}
            {viewingRequest && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-[#0A0A0C] w-full max-w-2xl rounded-3xl p-8 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center">
                            <div>
                                <h3 className="text-2xl font-black text-slate-900 dark:text-white">Request Details</h3>
                                <p className="text-slate-500 font-bold text-sm mt-1">{viewingRequest.type}</p>
                            </div>
                            <button onClick={() => setViewingRequest(null)} className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full transition-colors">
                                <Trash2 className="w-5 h-5 opacity-0" /> {/* Hidden trigger for alignment, using X below */}
                                <div className="absolute top-8 right-8 cursor-pointer" onClick={() => setViewingRequest(null)}>✕</div>
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-2xl">
                                    <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest">Student</p>
                                    <p className="font-bold text-slate-900 dark:text-white mt-1">{viewingRequest.studentName}</p>
                                </div>
                                <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-2xl">
                                    <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest">Date</p>
                                    <p className="font-bold text-slate-900 dark:text-white mt-1">{new Date(viewingRequest.createdAt).toLocaleDateString()}</p>
                                </div>
                            </div>

                            <div className="p-6 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/5">
                                <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest mb-3">Request Details / Achievements</p>
                                <div className="prose dark:prose-invert text-sm whitespace-pre-wrap">
                                    {viewingRequest.details}
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end pt-2 gap-3">
                            {viewingRequest.status === 'Pending' && (
                                <>
                                    <Button onClick={() => setIsRejectModalOpen(true)} className="bg-red-500 hover:bg-red-600 text-white">
                                        Reject
                                    </Button>
                                    <Button onClick={() => handleAcceptAndInvite(viewingRequest)} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                                        Accept & Invite
                                    </Button>
                                </>
                            )}
                            <Button onClick={() => setViewingRequest(null)} className="bg-slate-900 text-white hover:bg-slate-800">
                                Close
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Rejection Modal */}
            {isRejectModalOpen && (
                <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white dark:bg-[#0A0A0C] w-full max-w-md rounded-3xl p-8 shadow-2xl border border-red-500/20">
                        <h3 className="text-xl font-black text-slate-900 dark:text-white mb-4">Reject Request</h3>
                        <p className="text-sm text-slate-500 mb-4">Please provide a reason for this rejection. The student will be notified.</p>

                        <textarea
                            value={requestRejectionReason}
                            onChange={(e) => setRequestRejectionReason(e.target.value)}
                            className="w-full p-4 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl outline-none focus:ring-2 focus:ring-red-500 mb-6 text-sm font-medium"
                            placeholder="Reason for rejection..."
                            rows={3}
                            autoFocus
                        />

                        <div className="flex justify-end gap-3">
                            <Button onClick={() => setIsRejectModalOpen(false)} variant="ghost">Cancel</Button>
                            <Button onClick={handleRejectRequest} className="bg-red-500 hover:bg-red-600 text-white" disabled={!requestRejectionReason.trim()}>
                                Confirm Rejection
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SportsCaptainPortal;
