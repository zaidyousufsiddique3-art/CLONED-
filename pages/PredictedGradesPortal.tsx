import React, { useState, useEffect } from 'react';
import { collection, addDoc, onSnapshot, query, where, orderBy } from '@firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import { getUserByEmail } from '../firebase/userService';
import { sendNotification } from '../firebase/notificationService';
import { ApprovalRequest, DocumentType, UserRole } from '../types';
import { useAuth } from '../context/AuthContext';
import { storage, uploadFile } from '../firebase/storage';
import { ref, listAll } from 'firebase/storage';
import { StudentResult } from '../services/extractionService';
import { PRINCIPAL_EMAIL } from '../constants';

import {
    Folder,
    User,
    FileText,
    Search,
    Loader2,
    ChevronRight,
    AlertCircle,
    TrendingUp,
    Download,
    X,
    Pen,
    Send,
    FileCheck,
    Clock,
    CheckCircle,
    Eye
} from 'lucide-react';

const BASE_PATH = 'superadmin_documents/';

interface StudentFile {
    id: string; // usually path
    fileName: string;
    fileRef: any;
    extractedData?: StudentResult;
}

const PredictedGradesPortal: React.FC = () => {
    const { user } = useAuth();
    const [folders, setFolders] = useState<string[]>([]);
    const [selectedFolder, setSelectedFolder] = useState('');
    const [scanning, setScanning] = useState(false);
    const [scanProgress, setScanProgress] = useState(0); // 0 to 100
    const [students, setStudents] = useState<StudentFile[]>([]);
    const [selectedStudentId, setSelectedStudentId] = useState('');
    const [loadingFolders, setLoadingFolders] = useState(true);
    const [debugMode, setDebugMode] = useState(false);
    const [stats, setStats] = useState({ scanned: 0, extracted: 0, lastFile: '' });
    const [showPredicted, setShowPredicted] = useState(false);
    const [showPdfModal, setShowPdfModal] = useState(false);
    const [iasSession, setIasSession] = useState('');
    const [ialSession, setIalSession] = useState('');
    const [generatingPdf, setGeneratingPdf] = useState(false);
    const [sendingApproval, setSendingApproval] = useState(false);
    const [gender, setGender] = useState<'male' | 'female'>('male');
    const [addSignature, setAddSignature] = useState(false);
    const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
    const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
    const [lastPayload, setLastPayload] = useState<any>(null);
    const [activeTab, setActiveTab] = useState<'generate' | 'approvals' | 'history'>('generate');
    const [myApprovalRequests, setMyApprovalRequests] = useState<ApprovalRequest[]>([]);
    const [allHistoryRequests, setAllHistoryRequests] = useState<ApprovalRequest[]>([]);

    useEffect(() => {
        fetchFolders();
    }, []);

    useEffect(() => {
        if (!user || (activeTab !== 'approvals' && activeTab !== 'history')) return;

        let q;
        if (activeTab === 'approvals') {
            q = query(
                collection(db, 'approval_requests'),
                where('senderId', '==', user.id),
                orderBy('createdAt', 'desc')
            );
        } else {
            // History tab: Superadmin sees all, others see theirs
            if (user.role === UserRole.SUPER_ADMIN) {
                q = query(
                    collection(db, 'approval_requests'),
                    orderBy('createdAt', 'desc')
                );
            } else {
                q = query(
                    collection(db, 'approval_requests'),
                    where('senderId', '==', user.id),
                    orderBy('createdAt', 'desc')
                );
            }
        }

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const reqs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ApprovalRequest));
            if (activeTab === 'approvals') {
                setMyApprovalRequests(reqs);
            } else {
                setAllHistoryRequests(reqs);
            }
        });

        return () => unsubscribe();
    }, [user, activeTab]);

    const fetchFolders = async () => {
        try {
            const rootRef = ref(storage, BASE_PATH);
            const res = await listAll(rootRef);
            setFolders(res.prefixes.map(p => p.name));
        } catch (error) {
            console.error("Error fetching folders:", error);
        } finally {
            setLoadingFolders(false);
        }
    };

    const handleFolderChange = async (folderName: string) => {
        setSelectedFolder(folderName);
        setStudents([]);
        setSelectedStudentId('');
        setShowPredicted(false);
        setPreviewPdfUrl(null);
        setPdfBlob(null);
        if (!folderName) return;
        scanFolder(folderName);
    };

    const handleStudentChange = (id: string) => {
        setSelectedStudentId(id);
        setShowPredicted(false);
        setPreviewPdfUrl(null);
        setPdfBlob(null);
    };

    const scanFolder = async (folderName: string) => {
        setScanning(true);
        setScanProgress(0);
        try {
            const folderRef = ref(storage, `${BASE_PATH}${folderName}/`);
            const listAllFilesRecursively = async (ref: any): Promise<any[]> => {
                const res = await listAll(ref);
                let files = [...res.items];
                for (const prefix of res.prefixes) {
                    files = files.concat(await listAllFilesRecursively(prefix));
                }
                return files;
            };

            const allFileItems = await listAllFilesRecursively(folderRef);
            const totalFiles = allFileItems.length;
            if (totalFiles === 0) {
                setScanning(false);
                return;
            }

            const foundStudents: StudentFile[] = [];
            let processed = 0;
            const fileItems = allFileItems.filter(i => i.name !== '.keep');

            for (const itemRef of fileItems) {
                try {
                    const response = await fetch('/api/extract-student-results', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ filePath: itemRef.fullPath })
                    });
                    if (response.ok) {
                        const apiData = await response.json();
                        const results = apiData.students || [];
                        results.forEach((data: any, idx: number) => {
                            if (debugMode || (data.candidateName && data.candidateName !== 'Unknown Candidate')) {
                                foundStudents.push({
                                    id: `${itemRef.fullPath}_${idx}`,
                                    fileName: itemRef.name,
                                    fileRef: itemRef,
                                    extractedData: data
                                });
                            }
                        });
                    }
                    setStats(prev => ({ ...prev, scanned: processed + 1, extracted: foundStudents.length, lastFile: itemRef.name }));
                } catch (err) {
                    console.error(`Error processing file ${itemRef.name}:`, err);
                }
                processed++;
                setScanProgress(Math.round((processed / fileItems.length) * 100));
            }
            setStudents(foundStudents);
        } catch (error) {
            console.error("Error scanning folder:", error);
            alert("Error scanning folder contents.");
        } finally {
            setScanning(false);
        }
    };

    const selectedStudent = React.useMemo(() => {
        const file = students.find(s => s.id === selectedStudentId);
        return file?.extractedData;
    }, [students, selectedStudentId]);

    const calculatePredictedGrade = (actualGrade: string): string => {
        const clean = actualGrade.split(/[(\s]/)[0].toUpperCase();
        switch (clean) {
            case 'A*': return 'A*';
            case 'A': return 'A*';
            case 'B': return 'A';
            case 'C': return 'B';
            case 'D': return 'C';
            case 'E': return 'D';
            case 'U': return 'E';
            default: return clean;
        }
    };

    const formatStudentName = (name: string): string => {
        if (!name) return '';
        let cleaned = name.replace(/;/g, '');
        if (cleaned.includes(':')) {
            const parts = cleaned.split(':');
            const before = parts[0].trim();
            const after = parts[1]?.trim() || '';
            return `${after} ${before}`.trim();
        }
        return cleaned.trim();
    };

    const formatDateWithOrdinal = (date: Date): string => {
        const day = date.getDate();
        const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const month = months[date.getMonth()];
        const year = date.getFullYear();
        let suffix = 'th';
        if (day === 1 || day === 21 || day === 31) suffix = 'st';
        else if (day === 2 || day === 22) suffix = 'nd';
        else if (day === 3 || day === 23) suffix = 'rd';
        return `${day}${suffix} ${month} ${year}`;
    };

    const generatePDF = async () => {
        if (!selectedStudent || !iasSession || !ialSession || !user) return;
        setGeneratingPdf(true);
        try {
            const results = selectedStudent.results || [];
            const payload: any = {
                STUDENT_FULL_NAME: formatStudentName(selectedStudent.candidateName),
                UCI_NUMBER: selectedStudent.uci,
                DOCUMENT_ISSUE_DATE: formatDateWithOrdinal(new Date()),
                IAS_SESSION_MONTH_YEAR: iasSession,
                IAL_SESSION_MONTH_YEAR: ialSession,
                GENDER: gender,
                SIGNATURE_URL: addSignature ? user.signatureUrl : undefined,
            };
            results.slice(0, 4).forEach((r, idx) => {
                const i = idx + 1;
                payload[`ORIGINAL_SUBJECT_${i}`] = r.subject.toUpperCase();
                payload[`ORIGINAL_GRADE_${i}`] = `${r.grade} (${r.grade.toLowerCase()})`;
                const predicted = calculatePredictedGrade(r.grade);
                payload[`PREDICTED_SUBJECT_${i}`] = r.subject.toUpperCase();
                payload[`PREDICTED_GRADE_${i}`] = `${predicted} (${predicted.toLowerCase()})`;
            });

            const response = await fetch('/api/generate-expected-grade-pdf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!response.ok) throw new Error('Failed to generate PDF');
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            setLastPayload(payload);
            setPdfBlob(blob);
            setPreviewPdfUrl(url);
            setShowPdfModal(false);
        } catch (error) {
            console.error('Error:', error);
            alert('Error generating PDF.');
        } finally {
            setGeneratingPdf(false);
        }
    };

    const handleDownload = () => {
        if (!pdfBlob || !selectedStudent) return;
        const url = window.URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Expected_Grade_Sheet_${formatStudentName(selectedStudent.candidateName).replace(/\s+/g, '_')}.pdf`;
        a.click();
    };

    const handleSendForApproval = async () => {
        if (!pdfBlob || !selectedStudent || !user) return;
        setSendingApproval(true);
        try {
            // Upload PDF to storage instead of using base64 (to avoid 1MB Firestore limit)
            const fileName = `approvals/${Date.now()}_${formatStudentName(selectedStudent.candidateName).replace(/\s+/g, '_')}.pdf`;
            const pdfUrl = await uploadFile(pdfBlob, fileName);

            const approvalReq = {
                senderId: user.id,
                senderName: `${user.firstName} ${user.lastName}`,
                recipientEmail: PRINCIPAL_EMAIL,
                studentName: formatStudentName(selectedStudent.candidateName),
                documentType: DocumentType.PREDICTED_GRADES,
                pdfUrl: pdfUrl,
                status: 'Pending Approval',
                payload: lastPayload,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            await addDoc(collection(db, 'approval_requests'), approvalReq);
            const principal = await getUserByEmail(PRINCIPAL_EMAIL);
            if (principal) await sendNotification(principal.id, "New approval request pending", "/approvals");
            alert("Request sent to Principal.");
            setPreviewPdfUrl(null);
            setPdfBlob(null);
        } catch (error) {
            console.error(error);
            alert("Failed to send request.");
        } finally {
            setSendingApproval(false);
        }
    };

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Tab Navigation */}
            <div className="flex bg-white dark:bg-[#070708] p-1.5 rounded-2xl border border-slate-200 dark:border-white/10 w-fit">
                <button
                    onClick={() => setActiveTab('generate')}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black transition-all ${activeTab === 'generate' ? 'bg-brand-600 text-white shadow-lg shadow-brand-500/20' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}
                >
                    <TrendingUp className="w-4 h-4" />
                    GENERATE PREDICTIONS
                </button>
                <button
                    onClick={() => setActiveTab('approvals')}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black transition-all ${activeTab === 'approvals' ? 'bg-brand-600 text-white shadow-lg shadow-brand-500/20' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}
                >
                    <FileCheck className="w-4 h-4" />
                    APPROVALS
                </button>
                <button
                    onClick={() => setActiveTab('history')}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black transition-all ${activeTab === 'history' ? 'bg-brand-600 text-white shadow-lg shadow-brand-500/20' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}
                >
                    <Clock className="w-4 h-4" />
                    HISTORY
                </button>
            </div>

            {activeTab === 'generate' ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-1 space-y-6">
                        <div className="flex items-center space-x-2 mb-2">
                            <input type="checkbox" id="debugMode" checked={debugMode} onChange={e => setDebugMode(e.target.checked)} className="rounded border-gray-300 text-brand-600" />
                            <label htmlFor="debugMode" className="text-xs text-slate-400">Enable Debug Mode</label>
                        </div>

                        {/* Folder Selection */}
                        <div className="bg-white dark:bg-[#070708] p-6 rounded-[2rem] shadow-xl border border-slate-200 dark:border-white/10 text-white">
                            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">1. Select Exam Session</h3>
                            {loadingFolders ? <Loader2 className="animate-spin" /> : (
                                <div className="relative text-slate-900 dark:text-white">
                                    <select value={selectedFolder} onChange={e => handleFolderChange(e.target.value)} className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-[#111112] border border-slate-200 dark:border-white/10 rounded-xl appearance-none outline-none font-bold">
                                        <option value="">Select Folder...</option>
                                        {folders.map(f => <option key={f} value={f}>{f}</option>)}
                                    </select>
                                    <Folder className="absolute left-3 top-3.5 w-5 h-5 text-slate-400" />
                                </div>
                            )}
                        </div>

                        {/* Student Selection */}
                        <div className={`bg-white dark:bg-[#070708] p-6 rounded-[2rem] shadow-xl border border-slate-200 dark:border-white/10 ${!selectedFolder ? 'opacity-50' : ''}`}>
                            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">2. Select Student</h3>
                            {scanning ? <Loader2 className="animate-spin mx-auto" /> : (
                                <div className="relative text-slate-900 dark:text-white">
                                    <select value={selectedStudentId} onChange={e => handleStudentChange(e.target.value)} className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-[#111112] border border-slate-200 dark:border-white/10 rounded-xl appearance-none outline-none font-bold">
                                        <option value="">Select Student...</option>
                                        {students.map(s => <option key={s.id} value={s.id}>{s.extractedData?.candidateName}</option>)}
                                    </select>
                                    <User className="absolute left-3 top-3.5 w-5 h-5 text-slate-400" />
                                </div>
                            )}
                        </div>

                        {/* Action Card */}
                        {user?.role === UserRole.SUPER_ADMIN && (
                            <div className={`p-8 bg-white dark:bg-[#070708] rounded-[2rem] shadow-2xl border border-slate-200 dark:border-white/10 ${!selectedStudentId ? 'opacity-50' : ''}`}>
                                <div className="flex flex-col items-center text-center space-y-4">
                                    <div className="w-16 h-16 bg-brand-500/10 rounded-2xl flex items-center justify-center"><TrendingUp className="w-8 h-8 text-brand-500" /></div>
                                    <h3 className="text-white font-black text-xl">Intelligence Engine</h3>
                                    <button onClick={() => setShowPredicted(true)} className="w-full py-4 bg-brand-600 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-brand-500/20 transition-all">Activate Prediction</button>
                                    <button onClick={() => setShowPdfModal(true)} disabled={!showPredicted} className="w-full py-4 bg-white/5 disabled:opacity-30 text-white rounded-xl font-black text-xs uppercase tracking-widest border border-white/5 flex items-center justify-center gap-2"><Download className="w-4 h-4" /> Generate Output</button>
                                </div>
                            </div>
                        )}

                        {/* Inline Preview */}
                        {previewPdfUrl && (
                            <div className="p-8 bg-white dark:bg-[#070708] rounded-[2rem] shadow-2xl border border-slate-200 dark:border-white/10 space-y-4">
                                <div className="flex justify-between items-center"><h3 className="text-white font-black">Document Preview</h3><button onClick={() => setPreviewPdfUrl(null)}><X size={16} /></button></div>
                                <iframe src={previewPdfUrl} className="w-full aspect-[1/1.4] rounded-xl bg-slate-900" />
                                <div className="grid grid-cols-2 gap-3">
                                    <button onClick={handleDownload} className="py-3 bg-white/5 text-white rounded-xl text-xs font-bold border border-white/5 flex items-center justify-center gap-2"><Download className="w-4 h-4" /> Download</button>
                                    <button onClick={handleSendForApproval} disabled={sendingApproval} className="py-3 bg-brand-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-brand-500/20 flex items-center justify-center gap-2">
                                        {sendingApproval ? <Loader2 className="animate-spin w-4 h-4" /> : <><Send className="w-4 h-4" /> Send for Approval</>}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Right Column: Data Preview */}
                    <div className="lg:col-span-2 space-y-6 text-white">
                        {selectedStudent ? (
                            <>
                                <div className="bg-white dark:bg-[#070708] rounded-[2.5rem] shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden">
                                    <div className="bg-gradient-to-r from-brand-600 to-brand-700 px-8 py-6">
                                        <h2 className="text-2xl font-bold">{selectedStudent.candidateName}</h2>
                                        <p className="opacity-80">UCI: {selectedStudent.uci}</p>
                                    </div>
                                    <div className="p-8">
                                        <h4 className="flex items-center text-sm font-bold text-slate-500 uppercase tracking-wider mb-6"><FileText className="w-4 h-4 mr-2" /> Exam Results</h4>
                                        <table className="w-full text-left">
                                            <thead><tr className="text-slate-500 text-xs uppercase"><th>Code</th><th>Subject</th><th className="text-right">Grade</th></tr></thead>
                                            <tbody className="divide-y divide-slate-800">
                                                {(selectedStudent.results || []).map(r => (
                                                    <tr key={r.code} className="hover:bg-white/5"><td className="py-4 font-mono text-slate-500">{r.code}</td><td className="py-4 font-medium">{r.subject}</td><td className="py-4 text-right"><span className="px-3 py-1 bg-brand-900/40 text-brand-300 rounded-full font-bold">{r.grade}</span></td></tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {showPredicted && (
                                    <div className="bg-white dark:bg-[#070708] rounded-[2.5rem] shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden animate-in slide-in-from-bottom-4">
                                        <div className="bg-brand-600/10 px-8 py-6"><h3 className="flex items-center font-bold text-brand-500"><TrendingUp className="mr-2" /> Predicted Results</h3></div>
                                        <div className="p-8">
                                            <table className="w-full text-left">
                                                <thead><tr className="text-slate-500 text-xs uppercase"><th>Subject</th><th className="text-right">Predicted</th></tr></thead>
                                                <tbody className="divide-y divide-slate-800">
                                                    {(selectedStudent.results || []).map(r => (
                                                        <tr key={r.code} className="hover:bg-white/5"><td className="py-4">{r.subject}</td><td className="py-4 text-right"><span className="px-4 py-1 bg-emerald-900/40 text-emerald-400 rounded-full font-black tracking-tighter">{calculatePredictedGrade(r.grade)}</span></td></tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-slate-500 bg-white/5 rounded-3xl border-2 border-dashed border-white/5 min-h-[400px]">
                                <Search className="w-12 h-12 mb-4 opacity-20" /><p className="text-lg">Select a student to view analysis</p>
                            </div>
                        )}
                    </div>
                </div>
            ) : activeTab === 'approvals' ? (
                /* Approvals Tab Content */
                <div className="bg-white dark:bg-[#070708] rounded-[2.5rem] shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden text-white">
                    <div className="p-8 border-b border-white/5 bg-white/[0.01]">
                        <h2 className="text-xl font-bold">Approval Tracking</h2>
                        <p className="text-sm text-slate-500">Monitor your sent predicted grade approval requests</p>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-slate-900/50"><tr className="text-slate-500 text-xs uppercase tracking-widest"><th className="px-8 py-4">Student</th><th className="px-8 py-4">Type</th><th className="px-8 py-4 text-center">Date</th><th className="px-8 py-4 text-center">Status</th><th className="px-8 py-4 text-right">Action</th></tr></thead>
                            <tbody className="divide-y divide-white/5">
                                {myApprovalRequests.length === 0 ? <tr><td colSpan={5} className="px-8 py-12 text-center text-slate-500 italic">No requests found</td></tr> : (
                                    myApprovalRequests.map(req => (
                                        <tr key={req.id} className="hover:bg-white/[0.02]">
                                            <td className="px-8 py-5 font-bold">{req.studentName}</td>
                                            <td className="px-8 py-5 text-xs text-slate-500">{req.documentType}</td>
                                            <td className="px-8 py-5 text-center text-xs text-slate-500">{new Date(req.createdAt).toLocaleDateString()}</td>
                                            <td className="px-8 py-5 text-center"><span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${req.status === 'Approved' ? 'bg-emerald-500/10 text-emerald-500' : req.status === 'Rejected' ? 'bg-red-500/10 text-red-500' : 'bg-amber-500/10 text-amber-500'}`}>{req.status}</span></td>
                                            <td className="px-8 py-5 text-right">
                                                {req.status === 'Approved' ? (
                                                    <button onClick={() => { const a = document.createElement('a'); a.href = req.finalPdfUrl || req.pdfUrl; a.download = `Signed_${req.studentName}.pdf`; a.click(); }} className="px-4 py-2 bg-brand-600 rounded-xl text-xs font-bold hover:bg-brand-500 transition-all flex items-center gap-2 ml-auto shadow-lg shadow-brand-500/20"><Eye className="w-3.5 h-3.5" /> View PDF</button>
                                                ) : req.status === 'Rejected' && (
                                                    <div className="group relative inline-block">
                                                        <AlertCircle className="text-red-500 cursor-help" />
                                                        <div className="hidden group-hover:block absolute right-0 bottom-full mb-2 w-48 p-2 bg-slate-900 border border-white/10 rounded shadow-xl text-[10px] z-10">Reason: {req.rejectionReason}</div>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                /* History Tab Content (Superadmin/All) */
                <div className="bg-white dark:bg-[#070708] rounded-[2.5rem] shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden text-white">
                    <div className="p-8 border-b border-white/5 bg-white/[0.01]">
                        <h2 className="text-xl font-bold">Predicted Grades Master History</h2>
                        <p className="text-sm text-slate-500">
                            {user.role === UserRole.SUPER_ADMIN ? 'Complete audit trail of all generated predicted grade documents' : 'Your generated documents history'}
                        </p>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-slate-900/50">
                                <tr className="text-slate-500 text-xs uppercase tracking-widest">
                                    <th className="px-8 py-4">Student</th>
                                    <th className="px-8 py-4">Type</th>
                                    <th className="px-8 py-4 text-center">Date</th>
                                    <th className="px-8 py-4 text-center">Status</th>
                                    <th className="px-8 py-4 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {allHistoryRequests.length === 0 ? <tr><td colSpan={5} className="px-8 py-12 text-center text-slate-500 italic">No history records found</td></tr> : (
                                    allHistoryRequests.map(req => (
                                        <tr key={req.id} className="hover:bg-white/[0.02]">
                                            <td className="px-8 py-5 font-bold">{req.studentName}</td>
                                            <td className="px-8 py-5 text-xs text-slate-500">{req.documentType}</td>
                                            <td className="px-8 py-5 text-center text-xs text-slate-500">{new Date(req.createdAt).toLocaleDateString()}</td>
                                            <td className="px-8 py-5 text-center">
                                                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${req.status === 'Approved' ? 'bg-emerald-500/10 text-emerald-500' : req.status === 'Rejected' ? 'bg-red-500/10 text-red-500' : 'bg-amber-500/10 text-amber-500'}`}>
                                                    {req.status}
                                                </span>
                                            </td>
                                            <td className="px-8 py-5 text-right">
                                                <button
                                                    onClick={() => {
                                                        const a = document.createElement('a');
                                                        a.href = req.finalPdfUrl || req.pdfUrl;
                                                        a.download = `${req.status === 'Approved' ? 'Signed_' : ''}${req.studentName}.pdf`;
                                                        a.click();
                                                    }}
                                                    className="px-4 py-2 bg-brand-600 rounded-xl text-xs font-bold hover:bg-brand-500 transition-all flex items-center gap-2 ml-auto shadow-lg shadow-brand-500/20"
                                                >
                                                    <Download className="w-3.5 h-3.5" /> Download
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* PDF MODAL */}
            {showPdfModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-[#070708] rounded-[2.5rem] shadow-2xl w-full max-w-md border border-white/10">
                        <div className="flex items-center justify-between p-6 border-b border-white/5"><h3 className="text-lg font-bold text-white flex items-center gap-2 pr-4"><Download className="text-brand-600" /> Generate Predicted Grades PDF</h3><button onClick={() => setShowPdfModal(false)}><X /></button></div>
                        <div className="p-6 space-y-4">
                            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-2">IAS Session</label><input type="text" value={iasSession} onChange={e => setIasSession(e.target.value)} placeholder="e.g., Oct/Nov 2020" className="w-full px-4 py-3 bg-white/5 border border-white/5 rounded-xl text-white outline-none focus:ring-2 focus:ring-brand-500" /></div>
                            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-2">IAL Session</label><input type="text" value={ialSession} onChange={e => setIalSession(e.target.value)} placeholder="e.g., May/June 2021" className="w-full px-4 py-3 bg-white/5 border border-white/5 rounded-xl text-white outline-none focus:ring-2 focus:ring-brand-500" /></div>
                            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-2">Gender</label>
                                <div className="flex gap-2">
                                    <button onClick={() => setGender('male')} className={`flex-1 py-3 rounded-xl font-bold transition-all ${gender === 'male' ? 'bg-brand-600 text-white' : 'bg-white/5 text-slate-500'}`}>Male</button>
                                    <button onClick={() => setGender('female')} className={`flex-1 py-3 rounded-xl font-bold transition-all ${gender === 'female' ? 'bg-brand-600 text-white' : 'bg-white/5 text-slate-500'}`}>Female</button>
                                </div>
                            </div>
                            <div className="pt-4 border-t border-white/5">
                                <button onClick={() => { if (!user?.signatureUrl) { alert("Upload signature in Profile"); return; } setAddSignature(!addSignature); }} className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${addSignature ? 'bg-emerald-500/10 border-emerald-500/50' : 'bg-white/5 border-white/5'}`}>
                                    <div className="flex items-center gap-3"><Pen className={addSignature ? 'text-emerald-500' : 'text-slate-500'} /><div className="text-left"><p className="text-xs font-bold text-white">Add Coordinator Signature</p><p className="text-[10px] text-slate-500">Include official authorization</p></div></div>
                                    <div className={`w-10 h-5 rounded-full relative transition-colors ${addSignature ? 'bg-emerald-500' : 'bg-slate-700'}`}><div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${addSignature ? 'right-1' : 'left-1'}`} /></div>
                                </button>
                            </div>
                            <button onClick={generatePDF} disabled={generatingPdf} className="w-full py-4 bg-brand-600 hover:bg-brand-500 text-white rounded-xl font-black uppercase text-xs tracking-widest transition-all mt-4 flex items-center justify-center gap-2 shadow-2xl shadow-brand-500/40">
                                {generatingPdf ? <Loader2 className="animate-spin" /> : <><CheckCircle className="w-4 h-4" /> Finalize Document</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PredictedGradesPortal;
