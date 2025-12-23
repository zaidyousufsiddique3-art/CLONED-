
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { collection, addDoc, query, where, getDocs, orderBy, onSnapshot } from '@firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import { sendNotification } from '../firebase/notificationService';
import { SPORTS_COORDINATOR_EMAIL } from '../constants';
import { Calendar, Clock, User, CheckCircle, AlertCircle, FileText, PlusCircle, Loader2, Download } from 'lucide-react';

const FACILITIES = ['Badminton Courts', 'Football Ground'];
const TIME_SLOTS = [
    '16:00', '16:30', '17:00', '17:30', '18:00', '18:30',
    '19:00', '19:30', '20:00', '20:30', '21:00', '21:30',
    '22:00', '22:30', '23:00'
];

const UserFacilitiesBooking: React.FC = () => {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<'new' | 'my-bookings'>('new');

    // Form State
    const [facility, setFacility] = useState(FACILITIES[0]);
    const [date, setDate] = useState('');
    const [startTime, setStartTime] = useState('16:00');
    const [duration, setDuration] = useState('60'); // Minutes
    const [personInCharge, setPersonInCharge] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');

    // My Bookings State
    const [myBookings, setMyBookings] = useState<any[]>([]);
    const [loadingBookings, setLoadingBookings] = useState(true);

    useEffect(() => {
        if (user) {
            setPersonInCharge(`${user.firstName} ${user.lastName}`);

            // Listen to My Bookings
            const q = query(
                collection(db, 'sports_facility_bookings'),
                where('userId', '==', user.id)
            );

            const unsubscribe = onSnapshot(q, (snap) => {
                const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                // Sort client-side to avoid index requirement
                docs.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                setMyBookings(docs);
                setLoadingBookings(false);
            });
            return () => unsubscribe();
        }
    }, [user]);

    // Check query params for download action (from notification)
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const downloadId = params.get('download_id');
        if (downloadId) {
            setActiveTab('my-bookings');
            if (myBookings.length > 0) {
                const booking = myBookings.find(b => b.id === downloadId);
                if (booking && booking.status === 'Approved') {
                    handleDownloadPDF(booking);
                    // Clean URL
                    window.history.replaceState({}, '', '/facilities-booking');
                }
            }
        }
    }, [myBookings]);

    const calculateEndTime = (start: string, durationMinutes: number) => {
        const [h, m] = start.split(':').map(Number);
        const totalMinutes = h * 60 + m + durationMinutes;
        const endH = Math.floor(totalMinutes / 60);
        const endM = totalMinutes % 60;
        return { totalMinutes, label: `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}` };
    };

    const handleDownloadPDF = async (booking: any) => {
        try {
            const response = await fetch('/api/generate-booking-confirmation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    facility: booking.facility,
                    date: booking.date,
                    time: `${booking.timeSlot} – ${calculateEndTime(booking.timeSlot, parseInt(booking.duration)).label}`, // En-dash
                    personInCharge: booking.personInCharge,
                    bookingRef: booking.id,
                    personName: booking.requesterName
                })
            });

            if (!response.ok) throw new Error("Failed to generate PDF");

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Facility_Booking_Confirmation_${booking.date.split('-').reverse().join('-')}.pdf`; // Client side fallback name
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } catch (e) {
            console.error(e);
            alert("Failed to download PDF document.");
        }
    };

    const validateSubmission = async () => {
        // 1. Basic Fields
        if (!date || !startTime || !personInCharge) {
            alert("Please fill in all required fields.");
            return false;
        }

        // 2. Time Logic
        const durationMins = parseInt(duration);
        const [startH, startM] = startTime.split(':').map(Number);
        const startTotal = startH * 60 + startM;
        const endTotal = startTotal + durationMins;

        // Max time 23:00 (1380 mins)
        if (endTotal > 1380) { // 23 * 60
            alert("Booking cannot extend beyond 23:00.");
            return false;
        }

        // 3. Conflict Check
        const q = query(
            collection(db, 'sports_facility_bookings'),
            where('facility', '==', facility),
            where('date', '==', date),
            where('status', 'in', ['Pending', 'Approved'])
        );

        const snap = await getDocs(q);
        const hasConflict = snap.docs.some(doc => {
            const b = doc.data();
            const bStartH = parseInt(b.timeSlot.split(':')[0]);
            const bStartM = parseInt(b.timeSlot.split(':')[1]);
            const bStartTotal = bStartH * 60 + bStartM;
            const bEndTotal = bStartTotal + parseInt(b.duration);

            // Check overlapping ranges
            // (StartA < EndB) and (EndA > StartB)
            return (startTotal < bEndTotal) && (endTotal > bStartTotal);
        });

        if (hasConflict) {
            alert("The selected date and time are not available due to another booking.");
            return false;
        }

        return true;
    };

    const handleSubmit = async () => {
        setSubmitting(true);
        if (await validateSubmission()) {
            try {
                // Create Booking
                const bookingData = {
                    userId: user?.id,
                    userEmail: user?.email,
                    requesterType: user?.role === 'STUDENT' ? 'Student' : 'Staff',
                    requesterName: `${user?.firstName} ${user?.lastName}`,
                    facility,
                    date,
                    timeSlot: startTime,
                    duration: duration,
                    personInCharge,
                    status: 'Pending',
                    createdAt: new Date().toISOString()
                };

                const docRef = await addDoc(collection(db, 'sports_facility_bookings'), bookingData);

                // Notify Sports Coordinator - STRICT EXACT TEXT
                // Notify Sports Coordinator - STRICT EXACT TEXT
                const coordQuery = query(
                    collection(db, 'users'),
                    where('email', 'in', [
                        SPORTS_COORDINATOR_EMAIL,
                        SPORTS_COORDINATOR_EMAIL.toLowerCase(),
                        SPORTS_COORDINATOR_EMAIL.toUpperCase()
                    ])
                );

                const coordSnap = await getDocs(coordQuery);
                if (!coordSnap.empty) {
                    const uniqueIds = Array.from(new Set(coordSnap.docs.map(d => d.id)));
                    for (const id of uniqueIds) {
                        await sendNotification(
                            id,
                            `New booking request by ${bookingData.requesterName} for ${facility} on ${date} at ${startTime}.`,
                            '/facilities-booking'
                        );
                    }
                } else {
                    console.warn("Sports Coordinator not found for notification");
                }

                setSuccessMsg("Booking request submitted successfully!");
                setActiveTab('my-bookings');
                // Reset form
                setDate('');
                setStartTime('16:00');
            } catch (err) {
                console.error(err);
                alert("Failed to submit booking.");
            }
        }
        setSubmitting(false);
    };

    return (
        <div className="max-w-5xl mx-auto animate-fade-in pb-20">
            <div className="mb-8">
                <h1 className="text-3xl font-black text-slate-900 dark:text-white mb-2">Facilities Booking</h1>
                <p className="text-slate-500 text-sm">Book sports facilities pending coordinator approval.</p>
                {successMsg && (
                    <div className="mt-4 p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 rounded-xl font-bold flex items-center">
                        <CheckCircle className="w-5 h-5 mr-2" />
                        {successMsg}
                    </div>
                )}
            </div>

            <div className="flex gap-4 mb-8 border-b border-slate-200 dark:border-white/10">
                <button
                    onClick={() => { setActiveTab('new'); setSuccessMsg(''); }}
                    className={`pb-4 px-4 text-sm font-bold border-b-2 transition-all ${activeTab === 'new' ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                >
                    NEW BOOKING
                </button>
                <button
                    onClick={() => setActiveTab('my-bookings')}
                    className={`pb-4 px-4 text-sm font-bold border-b-2 transition-all ${activeTab === 'my-bookings' ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                >
                    MY BOOKINGS
                </button>
            </div>

            {activeTab === 'new' ? (
                <div className="bg-white dark:bg-[#070708] p-8 rounded-[2.5rem] border border-slate-200 dark:border-white/10 shadow-xl max-w-2xl">
                    <div className="space-y-6">
                        {/* Facility */}
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Facility</label>
                            <select
                                value={facility}
                                onChange={(e) => setFacility(e.target.value)}
                                className="w-full p-4 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 outline-none focus:ring-2 focus:ring-brand-500 font-bold dark:text-white"
                            >
                                {FACILITIES.map(f => <option key={f} value={f}>{f}</option>)}
                            </select>
                        </div>

                        {/* Date */}
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Date</label>
                            <input
                                type="date"
                                value={date}
                                min={new Date().toISOString().split('T')[0]}
                                onChange={(e) => setDate(e.target.value)}
                                className="w-full p-4 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 outline-none focus:ring-2 focus:ring-brand-500 font-bold dark:text-white"
                            />
                        </div>

                        {/* Time & Duration */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Start Time</label>
                                <select
                                    value={startTime}
                                    onChange={(e) => setStartTime(e.target.value)}
                                    className="w-full p-4 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 outline-none focus:ring-2 focus:ring-brand-500 font-bold dark:text-white"
                                >
                                    {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Duration</label>
                                <select
                                    value={duration}
                                    onChange={(e) => setDuration(e.target.value)}
                                    className="w-full p-4 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 outline-none focus:ring-2 focus:ring-brand-500 font-bold dark:text-white"
                                >
                                    <option value="30">30 Minutes</option>
                                    <option value="60">1 Hour</option>
                                    <option value="90">1.5 Hours</option>
                                    <option value="120">2 Hours</option>
                                </select>
                            </div>
                        </div>

                        {/* Person in Charge */}
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Person-in-Charge</label>
                            <input
                                type="text"
                                value={personInCharge}
                                onChange={(e) => setPersonInCharge(e.target.value)}
                                className="w-full p-4 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 outline-none focus:ring-2 focus:ring-brand-500 font-bold dark:text-white"
                            />
                        </div>

                        {/* Payment */}
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Payment</label>
                            <div className="p-4 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-400 font-medium text-sm flex items-center justify-between">
                                <span>No payment required for this booking type.</span>
                                <span>$0.00</span>
                            </div>
                        </div>

                        <button
                            onClick={handleSubmit}
                            disabled={submitting}
                            className="w-full py-4 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-black text-sm uppercase tracking-widest shadow-lg shadow-brand-500/20 transition-all flex items-center justify-center gap-2"
                        >
                            {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <PlusCircle className="w-5 h-5" />}
                            SUBMIT REQUEST
                        </button>
                    </div>
                </div>
            ) : (
                <div className="bg-white dark:bg-[#070708] rounded-[2.5rem] shadow-xl border border-slate-200 dark:border-white/10 overflow-hidden min-h-[500px]">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02]">
                                    <th className="p-6 text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">FACILITY</th>
                                    <th className="p-6 text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">DATE & TIME</th>
                                    <th className="p-6 text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">STATUS</th>
                                    <th className="p-6 text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-right">ACTIONS</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                                {myBookings.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="p-20 text-center">
                                            <p className="text-slate-500 font-medium text-lg">No bookings found.</p>
                                        </td>
                                    </tr>
                                ) : myBookings.map(b => (
                                    <tr key={b.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.01]">
                                        <td className="p-6">
                                            <span className="font-bold text-slate-900 dark:text-white">{b.facility}</span>
                                        </td>
                                        <td className="p-6">
                                            <div className="flex flex-col gap-1">
                                                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{b.date}</span>
                                                <span className="text-xs text-slate-500">{b.timeSlot} ({b.duration} mins)</span>
                                            </div>
                                        </td>
                                        <td className="p-6">
                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${b.status === 'Approved' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' :
                                                b.status === 'Completed' ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400' :
                                                    b.status === 'Rejected' ? 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400' :
                                                        'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'
                                                }`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${b.status === 'Approved' ? 'bg-emerald-500' :
                                                    b.status === 'Completed' ? 'bg-blue-500' :
                                                        b.status === 'Rejected' ? 'bg-red-500' :
                                                            'bg-amber-500'
                                                    }`}></span>
                                                {b.status === 'Pending' ? 'Pending Approval' : b.status}
                                            </span>
                                        </td>
                                        <td className="p-6 text-right">
                                            {(b.status === 'Approved' || b.status === 'Completed') && (
                                                <button
                                                    onClick={() => handleDownloadPDF(b)}
                                                    className="p-2 text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20 rounded-lg transition-colors"
                                                    title="Download Confirmation"
                                                >
                                                    <Download className="w-5 h-5" />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UserFacilitiesBooking;
