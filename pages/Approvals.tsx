import React, { useState, useEffect } from 'react';
import {
    collection,
    query,
    where,
    onSnapshot,
    doc,
    updateDoc,
    getDoc
} from '@firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import { useAuth } from '../context/AuthContext';
import { ApprovalRequest } from '../types';
import {
    CheckCircle,
    XCircle,
    FileText,
    Clock,
    Loader2,
    Eye,
    X,
    AlertCircle,
    Send,
    Pen,
    Stamp,
    MousePointer2
} from 'lucide-react';
import { sendNotification } from '../firebase/notificationService';
import { PRINCIPAL_EMAIL } from '../constants';

const Approvals: React.FC = () => {
    const { user } = useAuth();
    const [requests, setRequests] = useState<ApprovalRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedRequest, setSelectedRequest] = useState<ApprovalRequest | null>(null);
    const [showRejectModal, setShowRejectModal] = useState(false);
    const [showApproveModal, setShowApproveModal] = useState(false);
    const [rejectionReason, setRejectionReason] = useState('');
    const [processing, setProcessing] = useState(false);

    // Approval options
    const [includeSignature, setIncludeSignature] = useState(true);
    const [includeStamp, setIncludeStamp] = useState(false);

    useEffect(() => {
        if (!user || user.email.toLowerCase() !== PRINCIPAL_EMAIL.toLowerCase()) return;

        const q = query(
            collection(db, 'approval_requests'),
            where('recipientEmail', '==', PRINCIPAL_EMAIL),
            where('status', '==', 'Pending Approval')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const reqs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ApprovalRequest));
            setRequests(reqs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user]);

    const handleApproveFinal = async () => {
        if (!selectedRequest || !user) return;

        if (!selectedRequest.payload) {
            alert("Error: This is a legacy request and cannot be approved as it lacks the necessary data payload. Please ask the Superadmin to resend the request.");
            return;
        }

        setProcessing(true);
        console.log("[Approvals] Starting approval for request:", selectedRequest.id);

        try {
            // 1. Regenerate PDF with Principal assets
            const payload = {
                ...selectedRequest.payload,
                PRINCIPAL_SIGNATURE_URL: includeSignature ? user.signatureUrl : undefined,
                PRINCIPAL_STAMP_URL: includeStamp ? user.principalStampUrl : undefined,
            };

            console.log("[Approvals] Sending payload to API...");
            const response = await fetch('/api/generate-expected-grade-pdf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error("[Approvals] API Error:", errorData);
                throw new Error(errorData.error || 'Failed to regenerate PDF');
            }

            const blob = await response.blob();
            const base64 = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
            });

            // 2. Update Firestore
            await updateDoc(doc(db, 'approval_requests', selectedRequest.id), {
                status: 'Approved',
                finalPdfUrl: base64,
                includeSignature,
                includeStamp,
                updatedAt: new Date().toISOString()
            });

            // 3. Notify Superadmin
            await sendNotification(selectedRequest.senderId, `Predicted Grades approved by Principal for ${selectedRequest.studentName}`, "/predicted-grades");

            setShowApproveModal(false);
            setSelectedRequest(null);
            alert("Request approved successfully.");
        } catch (error: any) {
            console.error("Error approving request:", error);
            alert(`Failed to approve request: ${error.message || 'Unknown error'}`);
        } finally {
            setProcessing(false);
        }
    };

    const handleReject = async () => {
        if (!selectedRequest || !rejectionReason.trim()) return;
        setProcessing(true);
        try {
            await updateDoc(doc(db, 'approval_requests', selectedRequest.id), {
                status: 'Rejected',
                rejectionReason: rejectionReason,
                updatedAt: new Date().toISOString()
            });

            // Notify Superadmin
            await sendNotification(selectedRequest.senderId, `Predicted Grades rejected: ${rejectionReason}`, "/predicted-grades");

            setShowRejectModal(false);
            setRejectionReason('');
            setSelectedRequest(null);
            alert("Request rejected.");
        } catch (error) {
            console.error("Error rejecting request:", error);
            alert("Failed to reject request.");
        } finally {
            setProcessing(false);
        }
    };

    if (user?.email.toLowerCase() !== PRINCIPAL_EMAIL.toLowerCase()) {
        return <div className="p-8 text-center text-slate-500">Access Denied.</div>;
    }

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* List of Requests */}
                <div className="lg:col-span-1 space-y-4">
                    <h3 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest px-2">
                        Pending Approvals ({requests.length})
                    </h3>

                    {loading ? (
                        <div className="flex items-center justify-center p-12">
                            <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
                        </div>
                    ) : requests.length === 0 ? (
                        <div className="bg-white dark:bg-[#070708] p-8 rounded-[2rem] border border-dashed border-slate-200 dark:border-white/10 text-center text-white">
                            <CheckCircle className="w-12 h-12 text-slate-200 dark:text-slate-800 mx-auto mb-4" />
                            <p className="text-slate-500 font-medium">No pending requests</p>
                        </div>
                    ) : (
                        requests.map(req => (
                            <button
                                key={req.id}
                                onClick={() => setSelectedRequest(req)}
                                className={`w-full text-left p-6 rounded-[2rem] transition-all border ${selectedRequest?.id === req.id
                                    ? 'bg-brand-600 border-brand-500 text-white shadow-xl shadow-brand-500/20'
                                    : 'bg-white dark:bg-[#070708] border-slate-200 dark:border-white/10 text-slate-900 dark:text-slate-300 hover:border-brand-500/50'
                                    }`}
                            >
                                <div className="flex items-start justify-between mb-3">
                                    <div className={`p-2 rounded-xl ${selectedRequest?.id === req.id ? 'bg-white/20' : 'bg-brand-500/10'}`}>
                                        <FileText className={`w-5 h-5 ${selectedRequest?.id === req.id ? 'text-white' : 'text-brand-500'}`} />
                                    </div>
                                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${selectedRequest?.id === req.id ? 'bg-white/20 text-white' : 'bg-amber-500/10 text-amber-500'
                                        }`}>
                                        Pending
                                    </span>
                                </div>
                                <p className="font-bold text-lg mb-1">{req.studentName}</p>
                                <p className={`text-xs ${selectedRequest?.id === req.id ? 'text-brand-100' : 'text-slate-500'}`}>
                                    {req.documentType}
                                </p>
                                <div className={`flex items-center mt-4 text-[10px] font-medium ${selectedRequest?.id === req.id ? 'text-brand-200' : 'text-slate-400'}`}>
                                    <Clock className="w-3 h-3 mr-1" />
                                    {new Date(req.createdAt).toLocaleDateString()}
                                </div>
                            </button>
                        ))
                    )}
                </div>

                {/* Preview & Actions */}
                <div className="lg:col-span-2">
                    {selectedRequest ? (
                        <div className="bg-white dark:bg-[#070708] rounded-[2.5rem] shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden animate-scale-in h-[calc(100vh-12rem)] flex flex-col">
                            {/* Header */}
                            <div className="px-8 py-6 border-b border-slate-200 dark:border-white/10 flex items-center justify-between bg-slate-50/50 dark:bg-white/[0.02]">
                                <div>
                                    <h2 className="text-xl font-bold dark:text-white">{selectedRequest.studentName}</h2>
                                    <p className="text-sm text-slate-500">Submitted by {selectedRequest.senderName}</p>
                                </div>
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setShowRejectModal(true)}
                                        className="px-6 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl font-bold text-sm transition-all flex items-center gap-2"
                                    >
                                        <XCircle className="w-4 h-4" />
                                        Reject
                                    </button>
                                    <button
                                        onClick={() => {
                                            if (!user.signatureUrl && !user.principalStampUrl) {
                                                alert("Please upload a signature or stamp in your profile first.");
                                                return;
                                            }
                                            setShowApproveModal(true);
                                        }}
                                        className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-2"
                                    >
                                        <CheckCircle className="w-4 h-4" />
                                        Approve
                                    </button>
                                </div>
                            </div>

                            {/* PDF View */}
                            <div className="flex-1 bg-slate-100 dark:bg-slate-900 overflow-hidden relative text-white">
                                <iframe
                                    src={selectedRequest.pdfUrl}
                                    className="w-full h-full border-none"
                                    title="Approval PDF"
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="h-full min-h-[500px] flex flex-col items-center justify-center text-slate-400 bg-white/50 dark:bg-[#070708]/50 rounded-[2.5rem] border-2 border-dashed border-slate-200 dark:border-white/10">
                            <Eye className="w-16 h-16 mb-4 opacity-10" />
                            <p className="text-xl font-bold">Select a request to review</p>
                            <p className="text-sm opacity-60">PDF preview will appear here</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Approval Options Modal */}
            {showApproveModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-[#070708] rounded-[2.5rem] shadow-2xl w-full max-w-lg border border-white/10 animate-in zoom-in-95">
                        <div className="p-8">
                            <div className="flex items-center justify-between mb-8">
                                <div>
                                    <h3 className="text-2xl font-black text-white tracking-tight">Approve Document</h3>
                                    <p className="text-slate-500 text-sm mt-1">Select authorization assets to include</p>
                                </div>
                                <button onClick={() => setShowApproveModal(false)} className="p-2 text-slate-400 hover:text-white transition-colors">
                                    <X size={24} />
                                </button>
                            </div>

                            <div className="space-y-4">
                                {/* Option 1: Signature */}
                                <button
                                    onClick={() => setIncludeSignature(!includeSignature)}
                                    disabled={!user.signatureUrl}
                                    className={`w-full flex items-center justify-between p-6 rounded-[1.5rem] border transition-all ${includeSignature ? 'bg-brand-600/10 border-brand-500/50' : 'bg-white/5 border-white/5 opacity-50'}`}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={`p-3 rounded-xl ${includeSignature ? 'bg-brand-600 text-white' : 'bg-slate-800 text-slate-500'}`}>
                                            <Pen className="w-5 h-5" />
                                        </div>
                                        <div className="text-left">
                                            <p className="font-bold text-white">Principal Signature</p>
                                            <p className="text-xs text-slate-500">Append your digital signature</p>
                                        </div>
                                    </div>
                                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${includeSignature ? 'border-brand-500 bg-brand-500' : 'border-slate-700'}`}>
                                        {includeSignature && <CheckCircle className="w-4 h-4 text-white" />}
                                    </div>
                                </button>

                                {/* Option 2: Stamp */}
                                <button
                                    onClick={() => setIncludeStamp(!includeStamp)}
                                    disabled={!user.principalStampUrl}
                                    className={`w-full flex items-center justify-between p-6 rounded-[1.5rem] border transition-all ${includeStamp ? 'bg-brand-600/10 border-brand-500/50' : 'bg-white/5 border-white/5 opacity-50'}`}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={`p-3 rounded-xl ${includeStamp ? 'bg-brand-600 text-white' : 'bg-slate-800 text-slate-500'}`}>
                                            <Stamp className="w-5 h-5" />
                                        </div>
                                        <div className="text-left">
                                            <p className="font-bold text-white">Institutional Stamp</p>
                                            <p className="text-xs text-slate-500">Apply official principal stamp</p>
                                        </div>
                                    </div>
                                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${includeStamp ? 'border-brand-500 bg-brand-500' : 'border-slate-700'}`}>
                                        {includeStamp && <CheckCircle className="w-4 h-4 text-white" />}
                                    </div>
                                </button>

                                {/* Option 3: Both is implicitly covered by selecting both */}
                            </div>

                            <button
                                onClick={handleApproveFinal}
                                disabled={processing || (!includeSignature && !includeStamp)}
                                className="w-full mt-8 py-5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-2xl font-black text-sm uppercase tracking-widest transition-all shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-3"
                            >
                                {processing ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        GENERATING SIGNED PDF...
                                    </>
                                ) : (
                                    <>
                                        <MousePointer2 className="w-5 h-5" />
                                        FINALIZE & APPROVE
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Rejection Modal */}
            {showRejectModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-[#070708] rounded-[2.5rem] shadow-2xl w-full max-w-md border border-white/10 animate-in zoom-in-95">
                        <div className="p-8">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Rejection Reason</h3>
                                <button onClick={() => setShowRejectModal(false)} className="text-slate-400 hover:text-white transition-colors">
                                    <X size={20} />
                                </button>
                            </div>

                            <p className="text-slate-500 text-sm mb-4">Please provide a mandatory reason for rejecting this predicted grade request.</p>

                            <textarea
                                value={rejectionReason}
                                onChange={(e) => setRejectionReason(e.target.value)}
                                placeholder="Enter reason here..."
                                className="w-full h-32 px-4 py-3 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl focus:ring-2 focus:ring-brand-500 outline-none text-slate-900 dark:text-white transition-all resize-none"
                            />

                            <div className="flex gap-3 mt-6">
                                <button
                                    onClick={() => setShowRejectModal(false)}
                                    className="flex-1 py-3 px-4 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-sm transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleReject}
                                    disabled={!rejectionReason.trim() || processing}
                                    className="flex-1 py-3 px-4 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-red-500/20 flex items-center justify-center gap-2"
                                >
                                    {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                    Submit Rejection
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Approvals;
