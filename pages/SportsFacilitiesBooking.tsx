
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { SPORTS_COORDINATOR_EMAIL } from '../constants';
import { collection, query, onSnapshot, updateDoc, doc, orderBy } from '@firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import { sendNotification } from '../firebase/notificationService';
import { Loader2, CheckCircle, XCircle, Calendar, Clock, ClipboardList, CheckSquare } from 'lucide-react';

interface FacilityBooking {
    id: string;
    requesterType: 'Student' | 'Parent' | 'Staff' | 'Admin';
    requesterName: string;
    userId: string;
    facility: 'Badminton Courts' | 'Football Ground' | 'Basketball Courts';
    date: string;
    timeSlot: string;
    duration: string;
    personInCharge: string;
    status: 'Pending' | 'Approved' | 'Rejected' | 'Completed';
    createdAt: string;
    expectedCollectionDate?: string;
    numberOfStudents?: string;
}

const SportsFacilitiesBooking: React.FC = () => {
    const { user } = useAuth();
    const [bookings, setBookings] = useState<FacilityBooking[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'approved' | 'pending'>('pending');

    useEffect(() => {
        if (!user || user.email.toLowerCase() !== SPORTS_COORDINATOR_EMAIL.toLowerCase()) return;

        // Fetch all bookings
        const q = query(
            collection(db, 'sports_facility_bookings'),
            orderBy('createdAt', 'desc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FacilityBooking));
            setBookings(docs);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching bookings:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user]);

    const handleApprove = async (booking: FacilityBooking) => {
        if (!window.confirm("Approve this booking? User will be notified.")) return;
        setActionLoading(booking.id);
        try {
            await updateDoc(doc(db, 'sports_facility_bookings', booking.id), {
                status: 'Approved'
            });
            // Notify User with Download Link
            if (booking.userId) {
                await sendNotification(
                    booking.userId,
                    "Your booking request has been approved. Click here to download the confirmation document.",
                    `/facilities-booking?download_id=${booking.id}`
                );
            }
        } catch (error) {
            console.error("Error approving:", error);
            alert("Failed to approve.");
        } finally {
            setActionLoading(null);
        }
    };

    const handleSetCollectionDate = async (booking: FacilityBooking) => {
        const date = window.prompt("Enter Expected Collection Date (e.g., 2024-12-30):", booking.expectedCollectionDate || "");
        if (date === null) return;

        setActionLoading(booking.id);
        try {
            await updateDoc(doc(db, 'sports_facility_bookings', booking.id), {
                expectedCollectionDate: date
            });
        } catch (error) {
            console.error("Error setting date:", error);
            alert("Failed to set date.");
        } finally {
            setActionLoading(null);
        }
    };

    const handleReject = async (booking: FacilityBooking) => {
        if (!window.confirm("Reject this booking?")) return;
        setActionLoading(booking.id);
        try {
            await updateDoc(doc(db, 'sports_facility_bookings', booking.id), {
                status: 'Rejected'
            });
            if (booking.userId) {
                await sendNotification(
                    booking.userId,
                    `Your booking for ${booking.facility} on ${booking.date} was rejected.`,
                    `/facilities-booking`
                );
            }
        } catch (error) {
            console.error("Error rejecting:", error);
            alert("Failed to reject.");
        } finally {
            setActionLoading(null);
        }
    };

    const handleComplete = async (booking: FacilityBooking) => {
        if (!window.confirm("Mark this booking as Completed?")) return;
        setActionLoading(booking.id);
        try {
            await updateDoc(doc(db, 'sports_facility_bookings', booking.id), {
                status: 'Completed'
            });
            if (booking.userId) {
                await sendNotification(
                    booking.userId,
                    `Your booking has been completed.`,
                    `/facilities-booking`
                );
            }
        } catch (error) {
            console.error("Error completing:", error);
            alert("Failed to complete.");
        } finally {
            setActionLoading(null);
        }
    };

    if (!user || user.email.toLowerCase() !== SPORTS_COORDINATOR_EMAIL.toLowerCase()) {
        return <div className="p-10 text-center text-slate-500">Access Denied: Sports Coordinator Only.</div>;
    }

    // Filter Bookings
    const approvedBookings = bookings.filter(b => b.status === 'Approved');
    const pendingAndHistoryBookings = bookings.filter(b => b.status !== 'Approved');

    const displayedBookings = activeTab === 'approved' ? approvedBookings : pendingAndHistoryBookings;

    return (
        <div className="max-w-6xl mx-auto animate-fade-in pb-20">
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Facilities Management</h1>
                </div>
                <p className="text-slate-500 dark:text-slate-400 font-medium">Manage facility bookings and approvals.</p>
            </div>

            <div className="flex gap-4 mb-8 border-b border-slate-200 dark:border-white/10">
                <button
                    onClick={() => setActiveTab('approved')}
                    className={`pb-4 px-4 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${activeTab === 'approved' ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                >
                    <CheckSquare className="w-4 h-4" />
                    APPROVED / ONGOING
                    <span className="bg-emerald-100 text-emerald-700 text-[10px] px-2 py-0.5 rounded-full">{approvedBookings.length}</span>
                </button>
                <button
                    onClick={() => setActiveTab('pending')}
                    className={`pb-4 px-4 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${activeTab === 'pending' ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                >
                    <ClipboardList className="w-4 h-4" />
                    PENDING & HISTORY
                    <span className="bg-slate-100 text-slate-600 text-[10px] px-2 py-0.5 rounded-full">{pendingAndHistoryBookings.length}</span>
                </button>
            </div>

            <div className="bg-white dark:bg-[#070708] rounded-[2.5rem] shadow-xl border border-slate-200 dark:border-white/10 overflow-hidden min-h-[500px]">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02]">
                                <th className="p-6 text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Requester</th>
                                <th className="p-6 text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Facility</th>
                                <th className="p-6 text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Date & Time</th>
                                <th className="p-6 text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Status</th>
                                <th className="p-6 text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="p-20 text-center">
                                        <Loader2 className="w-8 h-8 animate-spin mx-auto text-brand-500 opacity-50 block" />
                                    </td>
                                </tr>
                            ) : displayedBookings.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="p-20 text-center">
                                        <p className="text-slate-500 font-medium text-lg">No bookings in this category</p>
                                    </td>
                                </tr>
                            ) : (
                                displayedBookings.map(booking => (
                                    <tr key={booking.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                                        <td className="p-6">
                                            <div className="flex flex-col">
                                                <span className="font-bold text-slate-900 dark:text-white">{booking.requesterName}</span>
                                                <span className="text-xs text-slate-500 mt-1">
                                                    {booking.personInCharge}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="p-6">
                                            <span className={`px-3 py-1 rounded-lg text-xs font-bold border ${booking.facility === 'Badminton Courts'
                                                ? 'bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-900/30'
                                                : booking.facility === 'Football Ground'
                                                    ? 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-900/30'
                                                    : 'bg-orange-50 text-orange-600 border-orange-100 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-900/30'
                                                }`}>
                                                {booking.facility}
                                            </span>
                                        </td>
                                        <td className="p-6">
                                            <div className="flex flex-col gap-1">
                                                <span className="flex items-center text-sm font-medium text-slate-700 dark:text-slate-300">
                                                    <Calendar className="w-3.5 h-3.5 mr-2 text-slate-400" />
                                                    {new Date(booking.date).toLocaleDateString()}
                                                </span>
                                                <div className="flex items-center gap-2">
                                                    <span className="flex items-center text-xs text-slate-500">
                                                        <Clock className="w-3.5 h-3.5 mr-2 text-slate-400" />
                                                        {booking.timeSlot} ({booking.duration}m)
                                                    </span>
                                                    {booking.numberOfStudents && (
                                                        <span className="text-[10px] font-bold bg-slate-100 dark:bg-white/10 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-400">
                                                            {booking.numberOfStudents} Students
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-6">
                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${booking.status === 'Approved' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' :
                                                booking.status === 'Rejected' ? 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400' :
                                                    booking.status === 'Completed' ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400' :
                                                        'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'
                                                }`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${booking.status === 'Approved' ? 'bg-emerald-500' :
                                                    booking.status === 'Rejected' ? 'bg-red-500' :
                                                        booking.status === 'Completed' ? 'bg-blue-500' :
                                                            'bg-amber-500'
                                                    }`}></span>
                                                {booking.status}
                                            </span>
                                        </td>
                                        <td className="p-6 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                {booking.status === 'Pending' && (
                                                    <>
                                                        <button
                                                            onClick={() => handleApprove(booking)}
                                                            disabled={actionLoading === booking.id}
                                                            className="p-2 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-xl transition-colors disabled:opacity-50"
                                                            title="Approve"
                                                        >
                                                            {actionLoading === booking.id ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
                                                        </button>
                                                        <button
                                                            onClick={() => handleReject(booking)}
                                                            disabled={actionLoading === booking.id}
                                                            className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors disabled:opacity-50"
                                                            title="Reject"
                                                        >
                                                            {actionLoading === booking.id ? <Loader2 className="w-5 h-5 animate-spin" /> : <XCircle className="w-5 h-5" />}
                                                        </button>
                                                    </>
                                                )}
                                                {booking.status === 'Approved' && (
                                                    <>
                                                        <button
                                                            onClick={() => handleSetCollectionDate(booking)}
                                                            disabled={actionLoading === booking.id}
                                                            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-xl transition-all flex items-center gap-2"
                                                        >
                                                            <Calendar className="w-3 h-3" />
                                                            {booking.expectedCollectionDate ? 'EDIT DATE' : 'SET DATE'}
                                                        </button>
                                                        <button
                                                            onClick={() => handleComplete(booking)}
                                                            disabled={actionLoading === booking.id}
                                                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-blue-500/20 flex items-center gap-2"
                                                        >
                                                            {actionLoading === booking.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckSquare className="w-3 h-3" />}
                                                            MARK COMPLETED
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default SportsFacilitiesBooking;
