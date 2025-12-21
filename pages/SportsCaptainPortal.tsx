
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { User, UserRole, SportsCaptainApplication } from '../types';
import { useSearchParams } from 'react-router-dom';
import { getStudents } from '../firebase/userService';
import { sendNotification } from '../firebase/notificationService';
import { getSportsCaptainApplications } from '../firebase/sportsCaptainService';
import Button from '../components/Button';
import {
    Send,
    Users,
    FileText,
    CheckCircle2,
    Download,
    Eye,
    Trophy,
    ExternalLink,
    ChevronRight,
    ArrowLeft,
    Calendar
} from 'lucide-react';
import { createRequest } from '../firebase/requestService';
import { DocumentType, RequestStatus } from '../types';
import { APP_URL } from '../constants';

const SportsCaptainPortal: React.FC = () => {
    const { user } = useAuth();
    const [searchParams] = useSearchParams();
    const [activeTab, setActiveTab] = useState<'sent' | 'received'>('sent');

    // Sent Tab State
    const [gender, setGender] = useState<string>('Male');
    const [students, setStudents] = useState<User[]>([]);
    const [selectedStudentId, setSelectedStudentId] = useState<string>('');
    const [inviting, setInviting] = useState(false);
    const [deadline, setDeadline] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    // Received Tab State
    const [applications, setApplications] = useState<SportsCaptainApplication[]>([]);
    const [loading, setLoading] = useState(false);
    const [viewingApplication, setViewingApplication] = useState<SportsCaptainApplication | null>(null);

    useEffect(() => {
        loadStudents();
    }, [gender]);

    useEffect(() => {
        if (activeTab === 'received' || searchParams.get('studentId')) {
            loadApplications();
        }
    }, [activeTab, searchParams]);

    useEffect(() => {
        const studentId = searchParams.get('studentId');
        if (studentId && applications.length > 0) {
            const app = applications.find(a => a.studentId === studentId);
            if (app) {
                setViewingApplication(app);
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
        setLoading(true);
        const data = await getSportsCaptainApplications();
        setApplications(data);
        setLoading(false);
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
                assignedToId: user.id,
                assignedToName: `${user.firstName} ${user.lastName}`,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                comments: [],
                attachments: []
            };
            await createRequest(requestData);

            setSuccessMessage(`Invitation dispatched to ${student.firstName}.`);
            setDeadline('');
            setTimeout(() => setSuccessMessage(''), 5000);
        } catch (error) {
            console.error(error);
        } finally {
            setInviting(false);
        }
    };

    return (
        <div className="space-y-8 animate-fade-in">
            {/* Header with Pill Tabs */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div className="bg-slate-200 dark:bg-[#070708] p-1.5 rounded-2xl flex shrink-0 border border-slate-300 dark:border-white/5 shadow-inner">
                    <button
                        onClick={() => setActiveTab('sent')}
                        className={`flex items-center px-6 py-3 rounded-xl text-sm font-black transition-all duration-300 ${activeTab === 'sent'
                            ? 'bg-brand-600 text-white shadow-lg shadow-brand-500/20 translate-y-[-1px]'
                            : 'text-slate-500 dark:text-slate-400 hover:text-brand-600 dark:hover:text-white'
                            }`}
                    >
                        <Send className="w-4 h-4 mr-2" />
                        Applications Sent
                    </button>
                    <button
                        onClick={() => setActiveTab('received')}
                        className={`flex items-center px-6 py-3 rounded-xl text-sm font-black transition-all duration-300 ${activeTab === 'received'
                            ? 'bg-brand-600 text-white shadow-lg shadow-brand-500/20 translate-y-[-1px]'
                            : 'text-slate-500 dark:text-slate-400 hover:text-brand-600 dark:hover:text-white'
                            }`}
                    >
                        <Users className="w-4 h-4 mr-2" />
                        Applications Received
                    </button>
                </div>

                {activeTab === 'received' && (
                    <div className="flex items-center gap-3">
                        <div className="bg-emerald-500/10 text-emerald-500 px-4 py-2 rounded-xl text-xs font-bold border border-emerald-500/20 flex items-center">
                            <CheckCircle2 className="w-3.5 h-3.5 mr-2" />
                            {applications.length} Total Applications
                        </div>
                    </div>
                )}
            </div>

            {activeTab === 'sent' ? (
                /* PAGE 1: APPLICATIONS SENT */
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
                                                    : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/5 text-slate-600 dark:text-slate-400 hover:border-brand-600/50'}`}
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
            ) : (
                /* PAGE 2: APPLICATIONS RECEIVED */
                <div className="space-y-6">
                    <div className="bg-white dark:bg-[#070708] backdrop-blur-3xl rounded-[2.5rem] shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden min-h-[400px]">
                        <div className="scroll-x-mobile">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50 dark:bg-white/5 text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] border-b border-slate-100 dark:border-white/5">
                                        <th className="px-8 py-6">Student Name</th>
                                        <th className="px-8 py-6">Admission No</th>
                                        <th className="px-8 py-6">Gender</th>
                                        <th className="px-8 py-6">Submitted Date</th>
                                        <th className="px-8 py-6 text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr>
                                            <td colSpan={5} className="px-8 py-20 text-center text-slate-500 font-bold text-sm animate-pulse">Retrieving application records...</td>
                                        </tr>
                                    ) : applications.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="px-8 py-20 text-center text-slate-500 font-bold text-sm">No applications received yet.</td>
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
                                            <td className="px-8 py-6">
                                                <span className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest ${app.status === 'Accepted' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-brand-500/10 text-brand-500'}`}>
                                                    Application Received
                                                </span>
                                            </td>
                                            <td className="px-8 py-6 text-slate-500 text-sm font-medium">{new Date(app.createdAt).toLocaleDateString()}</td>
                                            <td className="px-8 py-6 text-right">
                                                <button
                                                    onClick={() => setViewingApplication(app)}
                                                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white rounded-xl text-xs font-black shadow-lg shadow-brand-500/10 hover:bg-brand-700 transition-all opacity-0 group-hover:opacity-100"
                                                >
                                                    <Eye className="w-3.5 h-3.5" />
                                                    View Details
                                                </button>
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
                            <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tighter">Application Dossier</h3>
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
                                    {viewingApplication.studentName.charAt(0)}
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
        </div>
    );
};

export default SportsCaptainPortal;
