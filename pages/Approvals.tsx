import React, { useState, useEffect } from 'react';
import {
    collection,
    query,
    where,
    onSnapshot,
    doc,
    updateDoc,
    getDoc,
    getDocs
} from '@firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import { useAuth } from '../context/AuthContext';
import { ApprovalRequest, DocumentType } from '../types';
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
    MousePointer2,
    Download
} from 'lucide-react';
import { sendNotification } from '../firebase/notificationService';
import { PRINCIPAL_EMAIL } from '../constants';
import { uploadFile } from '../firebase/storage';
const RequestItem = React.memo(({ req, isSelected, onClick, activeTab }: { req: ApprovalRequest; isSelected: boolean; onClick: () => void; activeTab: string }) => (
    <button
        onClick={onClick}
        className={`w-full text-left p-6 rounded-[2rem] transition-all border ${isSelected
            ? 'bg-brand-600 border-brand-500 text-white shadow-xl shadow-brand-500/20'
            : 'bg-white dark:bg-[#070708] border-slate-200 dark:border-white/10 text-slate-900 dark:text-slate-300 hover:border-brand-500/50'
            }`}
    >
        <div className="flex items-start justify-between mb-3">
            <div className={`p-2 rounded-xl ${isSelected ? 'bg-white/20' : 'bg-brand-500/10'}`}>
                <FileText className={`w-5 h-5 ${isSelected ? 'text-white' : 'text-brand-500'}`} />
            </div>
            <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${isSelected
                ? 'bg-white/20 text-white'
                : activeTab === 'pending' ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-500'
                }`}>
                {req.status === 'Approved' ? 'Approved' : 'Pending'}
            </span>
        </div>
        <p className="font-bold text-lg mb-1">{req.studentName}</p>
        <p className={`text-xs ${isSelected ? 'text-brand-100' : 'text-slate-500'}`}>
            {req.documentType}
        </p>
        <div className={`flex items-center mt-4 text-[10px] font-medium ${isSelected ? 'text-brand-200' : 'text-slate-400'}`}>
            <Clock className="w-3 h-3 mr-1" />
            {new Date(req.updatedAt || req.createdAt).toLocaleDateString()}
        </div>
    </button>
));

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

    const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');

    useEffect(() => {
        if (!user || user.email.toLowerCase() !== PRINCIPAL_EMAIL.toLowerCase()) return;

        // Fetch all relevant statuses at once to unify background loading
        const q = query(
            collection(db, 'approval_requests'),
            where('recipientEmail', '==', PRINCIPAL_EMAIL),
            where('status', 'in', ['Pending Approval', 'Sent for Approval', 'Approved'])
        );

        const unsubscribe = onSnapshot(q,
            (snapshot) => {
                const reqs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ApprovalRequest));
                setRequests(reqs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
                setLoading(false);
            },
            (error) => {
                console.error("Approvals query failed:", error);
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, [user]);

    // Auto-select allowed options when modal opens
    useEffect(() => {
        if (showApproveModal && selectedRequest) {
            const isPredictedGrades = selectedRequest.documentType === DocumentType.PREDICTED_GRADES;
            const isSportsRec = selectedRequest.documentType === DocumentType.SPORTS_RECOMMENDATION;

            if (isPredictedGrades) {
                setIncludeSignature(true);
                setIncludeStamp(true);
            } else if (isSportsRec) {
                setIncludeSignature(false);
                setIncludeStamp(true);
            } else {
                // Default to Stamp Only for others (Reference Letter, etc.)
                setIncludeSignature(false);
                setIncludeStamp(true);
            }
        }
    }, [showApproveModal, selectedRequest]);

    const handleApproveFinal = async () => {
        if (!selectedRequest || !user) return;

        if (!selectedRequest.payload) {
            alert("Error: This is a legacy request and cannot be approved as it lacks the necessary data payload. Please ask the Superadmin to resend the request.");
            return;
        }

        // VALIDATION: Strict Approval Rules
        const isPredictedGrades = selectedRequest.documentType === DocumentType.PREDICTED_GRADES;
        const isSportsRec = selectedRequest.documentType === DocumentType.SPORTS_RECOMMENDATION;

        // 1. Predicted Grades: MUST have Both
        if (isPredictedGrades && (!includeSignature || !includeStamp)) {
            alert("Invalid approval mode. Predicted Grades require both Signature and Stamp.");
            return;
        }

        // 2. Sports Recommendation: MUST have Stamp ONLY (No Signature)
        if (isSportsRec && (includeSignature || !includeStamp)) {
            alert("Invalid approval mode. Sports Recommendations must have Stamp ONLY (No Signature).");
            return;
        }

        // 3. Other Recommendations: Must have Stamp (Signature is optional but Stamp is mandatory per 'Stamp Only' or 'Both' rules)
        // If 'Both' -> Sig + Stamp. If 'Stamp Only' -> Stamp.
        // So Stamp MUST be true in all valid cases for Other. 
        if (!isPredictedGrades && !isSportsRec && !includeStamp) {
            alert("Invalid approval mode. Approval must include at least the official stamp.");
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
            const apiEndpoint = isSportsRec ? '/api/generate-sports-recommendation' : '/api/generate-expected-grade-pdf';

            const response = await fetch(apiEndpoint, {
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

            // Upload the approved PDF to storage
            const fileName = `approved_documents/${Date.now()}_${selectedRequest.studentName.replace(/\s+/g, '_')}.pdf`;
            const finalPdfUrl = await uploadFile(blob, fileName);

            // 2. Update Firestore
            await updateDoc(doc(db, 'approval_requests', selectedRequest.id), {
                status: 'Approved',
                finalPdfUrl: finalPdfUrl,
                includeSignature: includeSignature,
                includeStamp: includeStamp,
                updatedAt: new Date().toISOString()
            });

            // 3. Update History record if it exists
            const qHistory = query(collection(db, 'generated_documents'),
                where('studentName', '==', selectedRequest.studentName),
                where('documentType', '==', selectedRequest.documentType),
                where('generatedById', '==', selectedRequest.senderId));
            const historySnap = await getDocs(qHistory);
            if (!historySnap.empty) {
                await updateDoc(doc(db, 'generated_documents', historySnap.docs[0].id), {
                    status: 'Approved',
                    pdfUrl: finalPdfUrl,
                    updatedAt: new Date().toISOString()
                });
            }

            // 4. Notifications
            const msg = isSportsRec
                ? `Sports Recommendation Letter for ${selectedRequest.studentName} has been approved.`
                : `Predicted Grades for ${selectedRequest.studentName} has been approved.`;

            await sendNotification(selectedRequest.senderId, msg, isSportsRec ? "/sports-recommendation?tab=approvals" : "/predicted-grades?tab=approvals");

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

            // Notify Sender
            const isSportsRec = selectedRequest.documentType === DocumentType.SPORTS_RECOMMENDATION;
            const msg = isSportsRec
                ? `Sports Recommendation Letter for ${selectedRequest.studentName} has been rejected: ${rejectionReason}`
                : `Predicted Grades for ${selectedRequest.studentName} has been rejected: ${rejectionReason}`;

            await sendNotification(selectedRequest.senderId, msg, isSportsRec ? "/sports-recommendation" : "/predicted-grades");

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

    const filteredRequests = activeTab === 'pending'
        ? requests.filter(r => r.status === 'Pending Approval' || r.status === 'Sent for Approval')
        : requests.filter(r => r.status === 'Approved');

    // Helper to check valid options for UI
    const isPredictedGrades = selectedRequest?.documentType === DocumentType.PREDICTED_GRADES;
    const isSportsRec = selectedRequest?.documentType === DocumentType.SPORTS_RECOMMENDATION;
    const isOther = !isPredictedGrades && !isSportsRec;

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Tab Navigation */}
            <div className="flex bg-white dark:bg-[#070708] p-1.5 rounded-2xl border border-slate-200 dark:border-white/10 w-fit">
                <button
                    onClick={() => { setActiveTab('pending'); setSelectedRequest(null); }}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black transition-all ${activeTab === 'pending' ? 'bg-brand-600 text-white shadow-lg shadow-brand-500/20' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}
                >
                    <Clock className="w-4 h-4" />
                    PENDING APPROVALS
                </button>
                <button
                    onClick={() => { setActiveTab('history'); setSelectedRequest(null); }}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black transition-all ${activeTab === 'history' ? 'bg-brand-600 text-white shadow-lg shadow-brand-500/20' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}
                >
                    <CheckCircle className="w-4 h-4" />
                    HISTORY
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* List of Requests */}
                <div className="lg:col-span-1 space-y-4">
                    <h3 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest px-2">
                        {activeTab === 'pending' ? 'Pending' : 'Approved'} Documents ({filteredRequests.length})
                    </h3>

                    {loading ? (
                        <div className="flex items-center justify-center p-12">
                            <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
                        </div>
                    ) : filteredRequests.length === 0 ? (
                        <div className="bg-white dark:bg-[#070708] p-8 rounded-[2rem] border border-dashed border-slate-200 dark:border-white/10 text-center text-white">
                            <CheckCircle className="w-12 h-12 text-slate-200 dark:text-slate-800 mx-auto mb-4" />
                            <p className="text-slate-500 font-medium">No {activeTab} requests</p>
                        </div>
                    ) : (
                        filteredRequests.map(req => (
                            <RequestItem
                                key={req.id}
                                req={req}
                                isSelected={selectedRequest?.id === req.id}
                                onClick={() => setSelectedRequest(req)}
                                activeTab={activeTab}
                            />
                        ))
                    )}
                </div>

                {/* Preview & Actions */}
                <div className="lg:col-span-2">
                    {selectedRequest ? (
                        <div className="bg-white dark:bg-[#070708] rounded-[2.5rem] shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden animate-scale-in h-[calc(100vh-16rem)] flex flex-col">
                            {/* Header */}
                            <div className="px-8 py-6 border-b border-slate-200 dark:border-white/10 flex items-center justify-between bg-slate-50/50 dark:bg-white/[0.02]">
                                <div>
                                    <h2 className="text-xl font-bold dark:text-white">{selectedRequest.studentName}</h2>
                                    <p className="text-sm text-slate-500">
                                        {activeTab === 'pending' ? `Submitted by ${selectedRequest.senderName}` : `Approved on ${new Date(selectedRequest.updatedAt).toLocaleDateString()}`}
                                    </p>
                                </div>
                                <div className="flex gap-3">
                                    {activeTab === 'pending' ? (
                                        <>
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
                                        </>
                                    ) : (
                                        <button
                                            onClick={() => {
                                                const a = document.createElement('a');
                                                a.href = selectedRequest.finalPdfUrl || selectedRequest.pdfUrl;
                                                a.download = `Approved_${selectedRequest.studentName}.pdf`;
                                                a.click();
                                            }}
                                            className="px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-brand-500/20 flex items-center gap-2"
                                        >
                                            <Download className="w-4 h-4" />
                                            Open Final PDF
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* PDF View */}
                            <div className="flex-1 bg-slate-100 dark:bg-slate-900 overflow-hidden relative text-white">
                                <iframe
                                    src={activeTab === 'pending' ? selectedRequest.pdfUrl : (selectedRequest.finalPdfUrl || selectedRequest.pdfUrl)}
                                    className="w-full h-full border-none"
                                    title="Approval PDF"
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="h-full min-h-[500px] flex flex-col items-center justify-center text-slate-400 bg-white/50 dark:bg-[#070708]/50 rounded-[2.5rem] border-2 border-dashed border-slate-200 dark:border-white/10 text-center">
                            <Eye className="w-16 h-16 mb-4 opacity-10" />
                            <p className="text-xl font-bold">Select a request to review</p>
                            <p className="text-sm opacity-60">PDF preview will appear here</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Approval Options Modal */}
            {showApproveModal && selectedRequest && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-[#070708] rounded-[2.5rem] shadow-2xl w-full max-w-lg border border-white/10 animate-in zoom-in-95">
                        <div className="p-8">
                            <div className="flex items-center justify-between mb-8">
                                <div>
                                    <h3 className="text-2xl font-black text-white tracking-tight">Approve Document</h3>
                                    <p className="text-slate-500 text-sm mt-1">
                                        Type: <span className="text-brand-400 font-bold">{selectedRequest.documentType}</span>
                                    </p>
                                </div>
                                <button onClick={() => setShowApproveModal(false)} className="p-2 text-slate-400 hover:text-white transition-colors">
                                    <X size={24} />
                                </button>
                            </div>

                            <div className="grid grid-cols-1 gap-4">
                                {/* Option: Stamp Only (Allowed for Sports Rec + Other) */}
                                {(isSportsRec || isOther) && (
                                    <button
                                        onClick={() => { setIncludeSignature(false); setIncludeStamp(true); }}
                                        disabled={isSportsRec} // Disabled if it's the only option
                                        className={`w-full flex items-center justify-between p-6 rounded-[2rem] border transition-all ${!includeSignature && includeStamp ? 'bg-brand-600 border-brand-500 shadow-xl shadow-brand-500/20' : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 opacity-70 hover:opacity-100 hover:border-brand-500/30'}`}
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className={`p-3 rounded-xl ${!includeSignature && includeStamp ? 'bg-white/20' : 'bg-brand-600/10 text-brand-500'}`}>
                                                <Stamp className="w-5 h-5 text-white" />
                                            </div>
                                            <div className="text-left">
                                                <p className={`font-bold ${!includeSignature && includeStamp ? 'text-white' : 'text-slate-900 dark:text-white'}`}>Stamp Only</p>
                                                <p className={`text-xs ${!includeSignature && includeStamp ? 'text-brand-100' : 'text-slate-500'}`}>Official seal{isSportsRec ? ' (Mandatory)' : ''}</p>
                                            </div>
                                        </div>
                                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${!includeSignature && includeStamp ? 'border-white bg-white/20' : 'border-slate-300 dark:border-slate-700'}`}>
                                            {!includeSignature && includeStamp && <CheckCircle className="w-4 h-4 text-white" />}
                                        </div>
                                    </button>
                                )}

                                {/* Option: Both (Allowed for Predicted Grades + Other) */}
                                {(isPredictedGrades || isOther) && (
                                    <button
                                        onClick={() => { setIncludeSignature(true); setIncludeStamp(true); }}
                                        disabled={isPredictedGrades} // Disabled if it's the only option
                                        className={`w-full flex items-center justify-between p-6 rounded-[2rem] border transition-all ${includeSignature && includeStamp ? 'bg-emerald-600 border-emerald-500 shadow-xl shadow-emerald-500/20' : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 opacity-70 hover:opacity-100 hover:border-brand-500/30'}`}
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className={`p-3 rounded-xl ${includeSignature && includeStamp ? 'bg-white/20' : 'bg-brand-600/10 text-brand-500'}`}>
                                                <CheckCircle className="w-5 h-5 text-white" />
                                            </div>
                                            <div className="text-left">
                                                <p className={`font-bold ${includeSignature && includeStamp ? 'text-white' : 'text-slate-900 dark:text-white'}`}>Signature + Stamp</p>
                                                <p className={`text-xs ${includeSignature && includeStamp ? 'text-brand-100' : 'text-slate-500'}`}>{isPredictedGrades ? 'Full authorization (Mandatory)' : 'Full authorization'}</p>
                                            </div>
                                        </div>
                                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${includeSignature && includeStamp ? 'border-white bg-white/20' : 'border-slate-300 dark:border-slate-700'}`}>
                                            {includeSignature && includeStamp && <CheckCircle className="w-4 h-4 text-white" />}
                                        </div>
                                    </button>
                                )}
                            </div>

                            <button
                                onClick={handleApproveFinal}
                                disabled={processing || (!includeSignature && !includeStamp)}
                                className="w-full mt-10 py-5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-[1.5rem] font-black text-sm uppercase tracking-widest transition-all shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-3"
                            >
                                {processing ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        FINALIZING PDF...
                                    </>
                                ) : (
                                    <>
                                        <MousePointer2 className="w-5 h-5" />
                                        CONFIRM APPROVAL
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
