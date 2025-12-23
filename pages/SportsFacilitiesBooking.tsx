
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { SPORTS_COORDINATOR_EMAIL } from '../constants';
import { collection, query, onSnapshot, updateDoc, doc, where, orderBy } from '@firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import { Loader2, CheckCircle, XCircle, Calendar, Clock, User, ClipboardList } from 'lucide-react';

interface FacilityBooking {
    id: string;
    requesterType: 'Student' | 'Parent';
    requesterName: string;
    facility: 'Badminton Courts' | 'Football Ground';
    date: string;
    timeSlot: string;
    status: 'Pending' | 'Approved' | 'Rejected';
    createdAt: string;
}

const SportsFacilitiesBooking: React.FC = () => {
    const { user } = useAuth();
    const [bookings, setBookings] = useState<FacilityBooking[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    useEffect(() => {
        if (!user || user.email.toLowerCase() !== SPORTS_COORDINATOR_EMAIL.toLowerCase()) return;

        // Fetch bookings (isolated collection)
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
            setLoading(false); // Make sure to stop loading on error
        });

        return () => unsubscribe();
    }, [user]);

    const handleAction = async (id: string, action: 'Approved' | 'Rejected') => {
        if (!id || !action) return;

        // Confirmation before action
        const confirmMsg = action === 'Approved'
            ? "Are you sure you want to APPROVE this booking?"
            : "Are you sure you want to REJECT this booking?";

        if (!window.confirm(confirmMsg)) return;

        setActionLoading(id);
        try {
            await updateDoc(doc(db, 'sports_facility_bookings', id), {
                status: action
            });
            // No notifications per requirements
        } catch (error) {
            console.error(`Error ${action.toLowerCase()} booking:`, error);
            alert(`Failed to ${action.toLowerCase()} booking.`);
        } finally {
            setActionLoading(null);
        }
    };

    if (!user || user.email.toLowerCase() !== SPORTS_COORDINATOR_EMAIL.toLowerCase()) {
        return <div className="p-10 text-center text-slate-500">Access Denied: Sports Coordinator Only.</div>;
    }

    return (
        <div className="max-w-6xl mx-auto animate-fade-in pb-20">
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Sports Facilities Booking</h1>
                    <span className="bg-brand-600 text-white text-xs font-bold px-2 py-1 rounded-md uppercase tracking-wider">Beta</span>
                </div>
                <p className="text-slate-500 dark:text-slate-400 font-medium">Manage incoming facility booking requests.</p>
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
                                        <span className="text-slate-400 text-sm mt-4 block">Loading bookings...</span>
                                    </td>
                                </tr>
                            ) : bookings.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="p-20 text-center">
                                        <ClipboardList className="w-12 h-12 text-slate-200 dark:text-slate-800 mx-auto mb-4" />
                                        <p className="text-slate-500 font-medium text-lg">No booking requests found</p>
                                    </td>
                                </tr>
                            ) : (
                                bookings.map(booking => (
                                    <tr key={booking.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                                        <td className="p-6">
                                            <div className="flex flex-col">
                                                <span className="font-bold text-slate-900 dark:text-white">{booking.requesterName}</span>
                                                <span className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                                                    <User className="w-3 h-3" /> {booking.requesterType}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="p-6">
                                            <span className={`px-3 py-1 rounded-lg text-xs font-bold border ${booking.facility === 'Badminton Courts'
                                                    ? 'bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-900/30'
                                                    : 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-900/30'
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
                                                <span className="flex items-center text-xs text-slate-500">
                                                    <Clock className="w-3.5 h-3.5 mr-2 text-slate-400" />
                                                    {booking.timeSlot}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="p-6">
                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${booking.status === 'Approved' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' :
                                                    booking.status === 'Rejected' ? 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400' :
                                                        'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'
                                                }`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${booking.status === 'Approved' ? 'bg-emerald-500' :
                                                        booking.status === 'Rejected' ? 'bg-red-500' :
                                                            'bg-amber-500'
                                                    }`}></span>
                                                {booking.status}
                                            </span>
                                        </td>
                                        <td className="p-6 text-right">
                                            {booking.status === 'Pending' && (
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        onClick={() => handleAction(booking.id, 'Approved')}
                                                        disabled={actionLoading === booking.id}
                                                        className="p-2 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-xl transition-colors disabled:opacity-50"
                                                        title="Approve"
                                                    >
                                                        {actionLoading === booking.id ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
                                                    </button>
                                                    <button
                                                        onClick={() => handleAction(booking.id, 'Rejected')}
                                                        disabled={actionLoading === booking.id}
                                                        className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors disabled:opacity-50"
                                                        title="Reject"
                                                    >
                                                        {actionLoading === booking.id ? <Loader2 className="w-5 h-5 animate-spin" /> : <XCircle className="w-5 h-5" />}
                                                    </button>
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
        </div>
    );
};

export default SportsFacilitiesBooking;
