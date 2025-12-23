
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { DocRequest, RequestStatus, UserRole, Comment, Attachment, User } from '../types';
import { updateRequest, subscribeToRequest } from '../firebase/requestService';
import { getPotentialAssignees, getSuperAdmins } from '../firebase/userService';
import { sendNotification } from '../firebase/notificationService';
import { uploadFile } from '../firebase/storage';
import { generateId } from '../services/mockDb';
import { DocumentType } from '../types';
import Button from '../components/Button';
import {
    ArrowLeft, Send, Paperclip, Download, File, CheckCircle,
    User as UserIcon, ChevronDown, Eye, EyeOff, Lock, Upload, X, Calendar, MessageSquare, Mail, ShieldAlert
} from 'lucide-react';

const RequestDetail: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [request, setRequest] = useState<DocRequest | null>(null);

    // Comment State
    const [commentText, setCommentText] = useState('');
    const [commentType, setCommentType] = useState<'direct' | 'internal'>('direct'); // Default to Direct for clarity

    const [statusLoading, setStatusLoading] = useState(false);
    const [potentialAssignees, setPotentialAssignees] = useState<User[]>([]);
    const [selectedAssignee, setSelectedAssignee] = useState<string>('');
    const [rejectingDocId, setRejectingDocId] = useState<string | null>(null);
    const [rejectionReason, setRejectionReason] = useState('');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [expectedDate, setExpectedDate] = useState('');
    const [showAssignmentPopup, setShowAssignmentPopup] = useState(false);
    const [assignmentPopupData, setAssignmentPopupData] = useState<{ assigneeName: string, expectedDate: string } | null>(null);

    useEffect(() => {
        if (!id || !user) return;
        const unsubscribe = subscribeToRequest(id, (data) => {
            if (!data) { navigate('/dashboard'); return; }

            // Sports Captain Handling

            setRequest(data);
            setSelectedAssignee(data.assignedToId || '');
            setExpectedDate(data.expectedCompletionDate || '');
        });

        if (user.role === UserRole.SUPER_ADMIN) {
            getPotentialAssignees().then(users => {
                setPotentialAssignees(users);
            });
        }
        return () => unsubscribe();
    }, [id, user, navigate]);

    const handleStatusChange = async (newStatus: RequestStatus) => {
        if (!request) return;
        setStatusLoading(true);
        await updateRequest(request.id, { status: newStatus });

        if (newStatus === RequestStatus.IN_PROGRESS) {
            sendNotification(request.studentId, `Your request #${request.id} is now In-Progress.`, `/requests/${request.id}`);
        }
        setStatusLoading(false);
    };

    const handleAssign = async () => {
        if (!request || !selectedAssignee) return;
        setStatusLoading(true);
        const assignee = potentialAssignees.find(u => u.id === selectedAssignee);
        const assigneeName = assignee ? `${assignee.firstName} ${assignee.lastName}` : 'Unknown';

        await updateRequest(request.id, {
            assignedToId: selectedAssignee,
            assignedToName: assigneeName,
            status: RequestStatus.ASSIGNED
        });

        await sendNotification(selectedAssignee, `You have been assigned request #${request.id}`, `/requests/${request.id}`);
        setStatusLoading(false);

        // Show popup if both assignee and expected date are set
        if (selectedAssignee && expectedDate) {
            setAssignmentPopupData({
                assigneeName: assigneeName,
                expectedDate: expectedDate
            });
            setShowAssignmentPopup(true);
        }
    };

    const handleDateUpdate = async () => {
        if (!request) return;
        await updateRequest(request.id, { expectedCompletionDate: expectedDate });
        await sendNotification(request.studentId, `Expected collection date for #${request.id} updated to ${new Date(expectedDate).toLocaleDateString()}`, `/requests/${request.id}`);
    };

    const handleAddComment = async () => {
        if (!request || !user || !commentText.trim()) return;

        const isStudent = user.role === UserRole.STUDENT;

        // Determine flags based on selection (ignored for students)
        const isInternal = !isStudent && commentType === 'internal';
        const isDirect = !isStudent && commentType === 'direct';

        const newComment: Comment = {
            id: generateId(),
            authorId: user.id,
            authorName: `${user.firstName} ${user.lastName}`,
            content: commentText,
            createdAt: new Date().toISOString(),
            isInternal: isInternal,
            isDirectMessage: isDirect
        };

        await updateRequest(request.id, { comments: [...request.comments, newComment] });
        setCommentText('');

        // Notifications Logic
        if (isInternal) {
            // Internal Note: Notify assigned staff/admin
            if (request.assignedToId && request.assignedToId !== user.id) {
                sendNotification(request.assignedToId, `New internal comment on #${request.id}`, `/requests/${request.id}`);
            }
            // Also notify Super Admins (if not author)
            if (user.role !== UserRole.SUPER_ADMIN) {
                const admins = await getSuperAdmins();
                admins.forEach(a => {
                    if (a.id !== user.id) sendNotification(a.id, `New internal comment on #${request.id}`, `/requests/${request.id}`);
                });
            }
        } else {
            // Direct Message or Student Message
            if (isStudent) {
                // Student replying
                const admins = await getSuperAdmins();
                admins.forEach(a => sendNotification(a.id, `New message from student on #${request.id}`, `/requests/${request.id}`));
                if (request.assignedToId) sendNotification(request.assignedToId, `New message from student on #${request.id}`, `/requests/${request.id}`);
            } else {
                // Staff replying to student (Direct)
                sendNotification(request.studentId, `New message on request #${request.id}`, `/requests/${request.id}`);
            }
        }
    };

    const handleUploadConfirm = async () => {
        if (!selectedFile || !request || !user) return;
        setUploading(true);
        try {
            const url = await uploadFile(selectedFile, `requests/${request.id}/${selectedFile.name}`);

            const isSuperAdmin = user.role === UserRole.SUPER_ADMIN;
            // Sports Coordinator requests (Sports Captain / Sports Recommendation) bypass admin review
            const isSportsRequest = request.type === DocumentType.SPORTS_RECOMMENDATION || request.type === DocumentType.SPORTS_CAPTAIN;

            const status = (isSuperAdmin || isSportsRequest) ? 'Approved' : 'Pending';

            const newAttachment: Attachment = {
                id: generateId(),
                name: selectedFile.name,
                type: selectedFile.type,
                size: selectedFile.size,
                dataUrl: url,
                uploadedBy: `${user.firstName} ${user.lastName}`,
                status: status,
                createdAt: new Date().toISOString()
            };

            const updatePayload: Partial<DocRequest> = {
                attachments: [...request.attachments, newAttachment],
            };

            // If SuperAdmin uploads OR it's a Sports request, AUTO-COMPLETE and NOTIFY
            if (isSuperAdmin || isSportsRequest) {
                updatePayload.status = RequestStatus.COMPLETED;
                const message = "Your document is ready for collection. You can collect it from the school or download the attached copy.";
                await sendNotification(request.studentId, message, `/requests/${request.id}`);
            } else {
                const admins = await getSuperAdmins();
                admins.forEach(a => sendNotification(a.id, `Document uploaded by staff for #${request.id}. Review needed.`, `/requests/${request.id}`));
            }

            await updateRequest(request.id, updatePayload);
            setSelectedFile(null);
            alert("Document uploaded successfully");
        } catch (err) {
            alert("Upload failed.");
        } finally {
            setUploading(false);
        }
    };

    const handleApproveDoc = async (docId: string) => {
        if (!request) return;

        const updatedAttachments = request.attachments.map(att =>
            att.id === docId ? { ...att, status: 'Approved' as const } : att
        );

        await updateRequest(request.id, {
            attachments: updatedAttachments,
            status: RequestStatus.COMPLETED
        });

        const message = "Your document is ready for collection. You can collect it from the school or download the attached copy.";
        await sendNotification(request.studentId, message, `/requests/${request.id}`);
    };

    const handleRejectDoc = async () => {
        if (!request || !rejectingDocId) return;

        const updatedAttachments = request.attachments.map(att =>
            att.id === rejectingDocId ? { ...att, status: 'Rejected' as const } : att
        );

        const rejectionComment: Comment = {
            id: generateId(),
            authorId: user?.id || 'sys',
            authorName: 'System Alert',
            content: `Document Rejected: ${rejectionReason}`,
            createdAt: new Date().toISOString(),
            isInternal: true
        };

        await updateRequest(request.id, {
            attachments: updatedAttachments,
            comments: [...request.comments, rejectionComment],
            status: RequestStatus.ACTION_NEEDED
        });

        if (request.assignedToId) {
            sendNotification(request.assignedToId, `Action Needed: Document rejected for request #${request.id}`, `/requests/${request.id}`);
        }
        setRejectingDocId(null);
        setRejectionReason('');
    };

    if (!request || !user) return <div className="p-8 text-center dark:text-white">Loading...</div>;
    const isSuperAdmin = user.role === UserRole.SUPER_ADMIN;
    const canManage = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.STAFF].includes(user.role);

    const visibleAttachments = request.attachments.filter(att => {
        if (canManage) return true;
        if (att.uploadedBy.includes(user.firstName)) return true;
        if (att.status === 'Approved') return true;
        return false;
    });

    // Filter Comments based on Role and Type
    const visibleComments = request.comments.filter(c => {
        // 1. Student Logic
        if (user.role === UserRole.STUDENT) {
            // Students cannot see internal comments
            return !c.isInternal;
        }

        // 2. Super Admin Logic
        if (user.role === UserRole.SUPER_ADMIN) {
            // Super Admin sees everything
            return true;
        }

        // 3. Staff/Admin Logic
        // Staff/Admin cannot see "Direct Message to Student" unless they are the author
        if (c.isDirectMessage && c.authorId !== user.id) {
            return false;
        }
        return true;
    });

    return (
        <>
            {/* Assignment Popup Notification */}
            {showAssignmentPopup && assignmentPopupData && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in" onClick={() => setShowAssignmentPopup(false)}>
                    <div className="bg-white dark:bg-[#070708] rounded-3xl p-8 shadow-2xl border border-slate-200 dark:border-slate-700 max-w-md w-full mx-4 animate-scale-in" onClick={(e) => e.stopPropagation()}>
                        <div className="text-center">
                            <div className="mb-6">
                                <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
                                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Assignment Successful!</h2>
                                <p className="text-slate-500 dark:text-slate-400 text-sm">The request has been assigned with the following details:</p>
                            </div>

                            <div className="space-y-4 mb-6">
                                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-4">
                                    <p className="text-xs font-bold text-red-400 uppercase tracking-wider mb-1">Assigned Staff Member</p>
                                    <p className="text-xl font-bold text-red-600 dark:text-red-400">{assignmentPopupData.assigneeName}</p>
                                </div>

                                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-4">
                                    <p className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-1">Expected Collection Date</p>
                                    <p className="text-xl font-bold text-blue-600 dark:text-blue-400">{new Date(assignmentPopupData.expectedDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                                </div>
                            </div>

                            <Button onClick={() => setShowAssignmentPopup(false)} className="w-full">
                                Close
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            <div className="max-w-6xl mx-auto pb-12">
                <button onClick={() => navigate(-1)} className="flex items-center mb-8 text-slate-500 hover:text-brand-600 dark:text-slate-400 dark:hover:text-white transition-colors">
                    <ArrowLeft className="mr-2 w-5 h-5" /> Back to Requests
                </button>

                {/* Progress Tracker - Student View Only */}
                {user.role === UserRole.STUDENT && (
                    <div className="mb-10 animate-fade-in">
                        <div className="bg-white dark:bg-[#070708] rounded-[2rem] p-8 border border-slate-200 dark:border-white/10 shadow-sm overflow-hidden">
                            <div className="relative max-w-2xl mx-auto px-4">
                                {/* Base Line */}
                                <div className="absolute top-5 left-5 right-5 h-[2px] bg-slate-100 dark:bg-white/5 z-0"></div>

                                {/* Progress Line */}
                                <div
                                    className="absolute top-5 left-5 h-[2px] bg-emerald-500 transition-all duration-1000 ease-in-out z-0"
                                    style={{
                                        width: request.status === RequestStatus.COMPLETED ? 'calc(100% - 40px)' :
                                            request.status === RequestStatus.IN_PROGRESS ? 'calc(66.66% - 26.66px)' :
                                                request.status === RequestStatus.ASSIGNED ? 'calc(33.33% - 13.33px)' :
                                                    '0px'
                                    }}
                                ></div>

                                <div className="relative flex justify-between items-center">
                                    {[
                                        { id: 'submitted', label: 'Submitted', activeStatuses: [RequestStatus.PENDING, RequestStatus.ASSIGNED, RequestStatus.IN_PROGRESS, RequestStatus.COMPLETED, RequestStatus.ACTION_NEEDED, RequestStatus.IN_REVIEW] },
                                        { id: 'assigned', label: 'Assigned', activeStatuses: [RequestStatus.ASSIGNED, RequestStatus.IN_PROGRESS, RequestStatus.COMPLETED] },
                                        { id: 'in_progress', label: 'In Progress', activeStatuses: [RequestStatus.IN_PROGRESS, RequestStatus.COMPLETED] },
                                        { id: 'completed', label: 'Ready for Collection', activeStatuses: [RequestStatus.COMPLETED] }
                                    ].map((step) => {
                                        const isActive = step.activeStatuses.includes(request.status);
                                        return (
                                            <div key={step.id} className="relative z-10 flex flex-col items-center">
                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-500 border-2 ${isActive
                                                    ? 'bg-emerald-500 border-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                                                    : 'bg-white dark:bg-[#070708] border-slate-200 dark:border-white/10 text-slate-400'
                                                    }`}>
                                                    {isActive ? (
                                                        <CheckCircle className="w-5 h-5" />
                                                    ) : (
                                                        <div className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-700"></div>
                                                    )}
                                                </div>
                                                <div className="mt-4 flex flex-col items-center">
                                                    <span className={`text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] transition-colors duration-500 text-center ${isActive ? 'text-emerald-500' : 'text-slate-400'
                                                        }`}>
                                                        {step.label}
                                                    </span>
                                                    {isActive && (
                                                        <span className="w-1 h-1 rounded-full bg-emerald-500 mt-1 animate-pulse"></span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 space-y-8">
                        <div className="bg-white dark:bg-[#070708] rounded-3xl p-8 border border-slate-200 dark:border-slate-700 shadow-sm">
                            <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-6">
                                <div>
                                    <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white">Request #{request.id}</h1>
                                    <span className="text-slate-500 dark:text-slate-400 text-sm">{new Date(request.createdAt).toLocaleDateString()} at {new Date(request.createdAt).toLocaleTimeString()}</span>
                                </div>
                                <span className={`px-4 py-2 rounded-full text-sm font-bold border whitespace-nowrap ${request.status === RequestStatus.COMPLETED ? 'bg-emerald-100 text-emerald-600 border-emerald-200' :
                                    request.status === RequestStatus.ACTION_NEEDED ? 'bg-red-100 text-red-600 border-red-200' :
                                        'bg-blue-50 text-blue-600 border-blue-200'
                                    }`}>
                                    {request.status}
                                </span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-6 border-t border-b border-slate-100 dark:border-slate-700/50">
                                <div>
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Student Details</p>
                                    <p className="font-bold text-lg text-slate-900 dark:text-white">{request.studentName}</p>
                                    <p className="text-sm text-brand-600 dark:text-brand-400 font-medium">Adm: {request.studentAdmissionNo}</p>
                                </div>
                                <div>
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Document Type</p>
                                    <p className="font-bold text-lg text-slate-900 dark:text-white">{request.type}</p>
                                </div>
                            </div>

                            <div className="mt-6">
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Instructions / Details</p>
                                <p className="text-slate-700 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-[#070708] p-4 rounded-xl border border-slate-100 dark:border-slate-700/50">
                                    {request.details}
                                </p>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-[#070708] rounded-3xl p-8 border border-slate-200 dark:border-slate-700 shadow-sm">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="font-bold text-xl text-slate-900 dark:text-white flex items-center">
                                    <Paperclip className="w-5 h-5 mr-2" /> Attachments
                                </h3>
                            </div>

                            {canManage && (
                                <div className="mb-6 bg-slate-50 dark:bg-[#070708] p-6 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700">
                                    {!selectedFile ? (
                                        <label className="cursor-pointer flex flex-col items-center justify-center p-4 hover:bg-slate-100 dark:hover:bg-slate-800/50 rounded-xl transition-colors">
                                            <Upload className="w-8 h-8 text-slate-400 mb-2" />
                                            <span className="font-bold text-slate-700 dark:text-slate-300">Select Document</span>
                                            <span className="text-xs text-slate-500">PDF, JPG, PNG up to 10MB</span>
                                            <input type="file" className="hidden" onChange={(e) => e.target.files && setSelectedFile(e.target.files[0])} />
                                        </label>
                                    ) : (
                                        <div className="flex items-center justify-between bg-white dark:bg-[#070708] p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                                            <div className="flex items-center">
                                                <File className="w-8 h-8 text-brand-500 mr-3" />
                                                <div>
                                                    <p className="font-bold text-slate-900 dark:text-white text-sm">{selectedFile.name}</p>
                                                    <p className="text-xs text-slate-500">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                                                </div>
                                            </div>
                                            <div className="flex space-x-2">
                                                <Button variant="ghost" onClick={() => setSelectedFile(null)}><X className="w-4 h-4" /></Button>
                                                <Button onClick={handleUploadConfirm} isLoading={uploading}>Upload Document</Button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="space-y-3">
                                {visibleAttachments.length === 0 ? (
                                    <p className="text-slate-500 text-center py-4 italic">No documents available.</p>
                                ) : visibleAttachments.map(att => (
                                    <div key={att.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 border border-slate-100 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors gap-4">
                                        <div className="flex items-center">
                                            <div className={`p-3 rounded-xl mr-4 ${att.status === 'Approved' ? 'bg-emerald-100 text-emerald-600' : att.status === 'Rejected' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>
                                                <File className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <p className="font-bold text-sm text-slate-900 dark:text-white mb-0.5">{att.name}</p>
                                                <div className="flex items-center space-x-2 text-xs">
                                                    <span className={`font-bold px-2 py-0.5 rounded ${att.status === 'Approved' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                                                        att.status === 'Rejected' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                                                            'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                                        }`}>
                                                        {att.status}
                                                    </span>
                                                    <span className="text-slate-400">• {new Date(att.createdAt).toLocaleDateString()}</span>
                                                    <span className="text-slate-400">• by {att.uploadedBy}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {(att.status === 'Approved' || canManage) && (
                                                <a
                                                    href={att.dataUrl}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="p-2 text-slate-500 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20 rounded-lg transition-colors"
                                                    title="Download"
                                                >
                                                    <Download className="w-5 h-5" />
                                                </a>
                                            )}

                                            {isSuperAdmin && att.status === 'Pending' && (
                                                <div className="flex space-x-1">
                                                    <button onClick={() => handleApproveDoc(att.id)} className="p-2 text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg" title="Approve & Complete">
                                                        <CheckCircle className="w-5 h-5" />
                                                    </button>
                                                    <button onClick={() => setRejectingDocId(att.id)} className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg" title="Reject">
                                                        <X className="w-5 h-5" />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {rejectingDocId && (
                                <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-xl animate-fade-in">
                                    <p className="text-sm font-bold text-red-700 dark:text-red-400 mb-2">Reason for rejection (Internal Note)</p>
                                    <div className="flex gap-2">
                                        <input
                                            value={rejectionReason}
                                            onChange={e => setRejectionReason(e.target.value)}
                                            placeholder="E.g. Incorrect format, missing signature..."
                                            className="flex-1 px-4 py-2 border border-red-200 dark:border-red-800 rounded-lg focus:ring-2 focus:ring-red-500 outline-none text-slate-900 dark:text-white bg-white dark:bg-[#070708]"
                                        />
                                        <Button variant="danger" size="sm" onClick={handleRejectDoc}>Confirm Reject</Button>
                                        <Button variant="ghost" size="sm" onClick={() => setRejectingDocId(null)}>Cancel</Button>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="bg-white dark:bg-[#070708] rounded-3xl p-8 border border-slate-200 dark:border-slate-700 shadow-sm">
                            <h3 className="font-bold text-xl text-slate-900 dark:text-white mb-6 flex items-center">
                                <MessageSquare className="w-5 h-5 mr-2" /> Comments & Activity
                            </h3>

                            <div className="space-y-6 mb-8 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                {visibleComments.length === 0 && (
                                    <p className="text-center text-slate-400 text-sm">No comments yet.</p>
                                )}
                                {visibleComments.map(comment => (
                                    <div key={comment.id} className={`flex flex-col ${comment.authorId === user.id ? 'items-end' : 'items-start'}`}>
                                        <div className={`max-w-[80%] rounded-2xl p-4 shadow-sm ${comment.isInternal
                                            ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/30'
                                            : comment.isDirectMessage
                                                ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/30'
                                                : comment.authorId === user.id
                                                    ? 'bg-brand-50 dark:bg-brand-900/20 border border-brand-100 dark:border-brand-900/30'
                                                    : 'bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700'
                                            }`}>
                                            <div className="flex items-center justify-between mb-1 space-x-4">
                                                <span className={`text-xs font-bold ${comment.isInternal ? 'text-amber-700 dark:text-amber-500' :
                                                    comment.isDirectMessage ? 'text-blue-700 dark:text-blue-400' :
                                                        'text-slate-700 dark:text-brand-400'
                                                    }`}>
                                                    {comment.authorName}
                                                    {comment.isInternal && ' (Internal)'}
                                                    {comment.isDirectMessage && ' (Private Message)'}
                                                </span>
                                                <span className="text-[10px] text-slate-400">{new Date(comment.createdAt).toLocaleString()}</span>
                                            </div>
                                            <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">{comment.content}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="flex gap-4 items-start">
                                <div className="flex-1">
                                    <textarea
                                        value={commentText}
                                        onChange={(e) => setCommentText(e.target.value)}
                                        placeholder={
                                            canManage
                                                ? commentType === 'internal'
                                                    ? "Internal note (Hidden from student)..."
                                                    : "Message to student (Private)..."
                                                : "Type message..."
                                        }
                                        className={`w-full p-4 rounded-2xl border focus:ring-2 outline-none transition-all resize-none ${commentType === 'internal'
                                            ? 'bg-amber-50/50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800 focus:ring-amber-500 placeholder-amber-400/70 text-amber-900 dark:text-amber-100'
                                            : commentType === 'direct' && canManage
                                                ? 'bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800 focus:ring-blue-500 placeholder-blue-400/70 text-blue-900 dark:text-blue-100'
                                                : 'bg-slate-50 dark:bg-[#070708] border-slate-200 dark:border-slate-700 focus:ring-brand-500 text-slate-900 dark:text-white'
                                            }`}
                                        rows={3}
                                    />
                                    {canManage && (
                                        <div className="flex items-center space-x-2 mt-3 p-1 bg-slate-50 dark:bg-[#070708] rounded-xl border border-slate-200 dark:border-slate-700 inline-flex">
                                            <button
                                                type="button"
                                                onClick={() => setCommentType('direct')}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center ${commentType === 'direct'
                                                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 shadow-sm'
                                                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
                                                    }`}
                                            >
                                                <Mail className="w-3 h-3 mr-1.5" />
                                                Send Message to Student
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setCommentType('internal')}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center ${commentType === 'internal'
                                                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 shadow-sm'
                                                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
                                                    }`}
                                            >
                                                <ShieldAlert className="w-3 h-3 mr-1.5" />
                                                Internal Note (Staff Only)
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <Button onClick={handleAddComment} disabled={!commentText.trim()} className="mt-1">
                                    <Send className="w-5 h-5" />
                                </Button>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-6">
                        {(isSuperAdmin || (canManage && request.type === DocumentType.SPORTS_RECOMMENDATION)) && (
                            <div className="bg-white dark:bg-[#070708] rounded-3xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
                                <h3 className="font-bold mb-4 text-slate-900 dark:text-white flex items-center">
                                    <Lock className="w-5 h-5 mr-2 text-slate-400" /> {isSuperAdmin ? 'Admin Actions' : 'Coordinator Actions'}
                                </h3>
                                <div className="space-y-4">
                                    {isSuperAdmin && (
                                        <div>
                                            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 block">Assign Request</label>
                                            <select
                                                value={selectedAssignee}
                                                onChange={e => setSelectedAssignee(e.target.value)}
                                                className="w-full p-3 bg-slate-50 dark:bg-[#070708] border border-slate-200 dark:border-slate-600 rounded-xl outline-none text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500"
                                            >
                                                <option value="">Select Staff Member...</option>
                                                {potentialAssignees.map(u => <option key={u.id} value={u.id}>{u.firstName} {u.lastName} - {u.role}</option>)}
                                            </select>
                                            <Button onClick={handleAssign} className="w-full mt-2" disabled={statusLoading}>
                                                {statusLoading ? 'Updating...' : 'Update Assignment'}
                                            </Button>
                                        </div>
                                    )}

                                    <div className={`pt-4 ${isSuperAdmin ? 'border-t border-slate-100 dark:border-slate-700' : ''}`}>
                                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 block">Expected Collection Date</label>
                                        <input
                                            type="date"
                                            value={expectedDate}
                                            onChange={e => setExpectedDate(e.target.value)}
                                            className="w-full p-3 bg-slate-50 dark:bg-[#070708] border border-slate-200 dark:border-slate-600 rounded-xl outline-none text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500"
                                        />
                                        <Button onClick={handleDateUpdate} variant="secondary" className="w-full mt-3">Set Date</Button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {canManage && (
                            <div className="bg-white dark:bg-[#070708] rounded-3xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
                                <h3 className="font-bold mb-4 text-slate-900 dark:text-white">Request Status</h3>
                                <div className="space-y-4">
                                    <select
                                        value={request.status}
                                        onChange={e => handleStatusChange(e.target.value as RequestStatus)}
                                        className="w-full p-3 bg-slate-50 dark:bg-[#070708] border border-slate-200 dark:border-slate-600 rounded-xl outline-none font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500"
                                    >
                                        {Object.values(RequestStatus).filter(s => s !== RequestStatus.COMPLETED).map(s => <option key={s} value={s}>{s}</option>)}
                                        <option value={RequestStatus.COMPLETED} disabled>Completed (System Only)</option>
                                    </select>
                                    <p className="text-xs text-slate-400 leading-relaxed">
                                        <span className="text-brand-500 font-bold">Note:</span> Request moves to <b>Completed</b> automatically when Super Admin approves a document.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
};

export default RequestDetail;
