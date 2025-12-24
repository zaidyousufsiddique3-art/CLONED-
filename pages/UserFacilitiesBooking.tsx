
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { collection, addDoc, query, where, getDocs, orderBy, onSnapshot, doc, updateDoc } from '@firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import { sendNotification } from '../firebase/notificationService';
import { SPORTS_COORDINATOR_EMAIL } from '../constants';
import { Calendar, Clock, User, CheckCircle, AlertCircle, FileText, PlusCircle, Loader2, Download, Star } from 'lucide-react';

const FACILITIES = ['Badminton Courts', 'Football Ground', 'Basketball Courts'];
const SCHEDULE: Record<string, Record<string, { start: number, startM?: number, end: number, gender?: string }>> = {
    'Badminton Courts': {
        'Sunday': { start: 16, end: 23, gender: 'Female' },
        'Monday': { start: 16, end: 23, gender: 'Male' },
        'Tuesday': { start: 16, end: 23, gender: 'Male' },
        'Wednesday': { start: 16, end: 23, gender: 'Female' },
        'Thursday': { start: 16, end: 23, gender: 'Male' },
        'Friday': { start: 12, end: 23, gender: 'Male' },
        'Saturday': { start: 13, end: 23, gender: 'Female' },
    },
    'Basketball Courts': {
        'Sunday': { start: 16, end: 23 },
        'Monday': { start: 16, end: 23 },
        'Tuesday': { start: 16, end: 23 },
        'Wednesday': { start: 16, end: 23 },
        'Friday': { start: 6, end: 23 },
        'Saturday': { start: 6, end: 14 },
    },
    'Football Ground': {
        'Sunday': { start: 16, end: 23 },
        'Monday': { start: 16, end: 23 },
        'Tuesday': { start: 16, end: 23 },
        'Wednesday': { start: 16, end: 23 },
        'Thursday': { start: 16, end: 23 },
        'Friday': { start: 6, end: 23 },
        'Saturday': { start: 6, end: 23 },
    }
};

const getAvailableSlots = (fac: string, dateStr: string) => {
    if (!dateStr) return [];
    const day = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date(dateStr));
    const sched = SCHEDULE[fac]?.[day];
    if (!sched) return [];

    const slots = [];
    for (let h = sched.start; h < sched.end; h++) {
        slots.push(`${String(h).padStart(2, '0')}:00`);
        slots.push(`${String(h).padStart(2, '0')}:30`);
    }
    // Add the final :00 slot if it matches the end time (exclusive for booking start)
    // But since bookings have duration, we just stop at end-1 basically.
    return slots;
};

const MembershipOption = ({ type, hours, rate, total, validity, rules, onPurchase, loading }: any) => (
    <div className="bg-white dark:bg-[#070708] p-8 rounded-[2.5rem] border border-emerald-500/20 shadow-xl flex flex-col items-center text-center space-y-6">
        <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500">
            <User className="w-8 h-8" />
        </div>
        <div>
            <h3 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight">{type}</h3>
            <p className="text-emerald-500 font-bold uppercase tracking-widest text-xs mt-1">{rate} SAR / Hour</p>
        </div>
        <div className="w-full bg-slate-50 dark:bg-white/5 p-6 rounded-2xl space-y-4">
            <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Total Hours</span>
                <span className="text-slate-900 dark:text-white font-black">{hours} Hours</span>
            </div>
            <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Validity</span>
                <span className="text-slate-900 dark:text-white font-black">{validity}</span>
            </div>
            <div className="h-px bg-slate-200 dark:bg-white/10" />
            <div className="text-left space-y-2">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Membership Rules:</p>
                {rules.map((r: string, idx: number) => (
                    <div key={idx} className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400 font-medium">
                        <div className="min-w-[4px] h-[4px] bg-emerald-500 rounded-full mt-1.5" />
                        <span>{r}</span>
                    </div>
                ))}
            </div>
        </div>
        <div className="w-full">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em] mb-1">Total Price</p>
            <h4 className="text-4xl font-black text-slate-900 dark:text-white">{total} <span className="text-sm">SAR</span></h4>
        </div>
        <button
            onClick={onPurchase}
            disabled={loading}
            className="w-full py-5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-emerald-500/20 transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
        >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "PAY NOW"}
        </button>
    </div>
);

const UserFacilitiesBooking: React.FC = () => {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<'new' | 'my-bookings' | 'memberships'>('new');
    const [activeMembership, setActiveMembership] = useState<any>(null);

    // Form State
    const [facility, setFacility] = useState(FACILITIES[0]);
    const [date, setDate] = useState('');
    const [startTime, setStartTime] = useState('');
    const [duration, setDuration] = useState('60'); // Minutes
    const [personInCharge, setPersonInCharge] = useState('');
    const [numberOfStudents, setNumberOfStudents] = useState('');
    const [gender, setGender] = useState('Male');
    const [submitting, setSubmitting] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');
    const [paymentOption, setPaymentOption] = useState<'Pay Now' | 'Use Membership'>('Pay Now');

    // My Bookings State
    const [myBookings, setMyBookings] = useState<any[]>([]);
    const [loadingBookings, setLoadingBookings] = useState(true);

    useEffect(() => {
        if (user) {
            setPersonInCharge(`${user.firstName} ${user.lastName}`);
            if (user.gender) setGender(user.gender);

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

            // Listen to Active Membership
            const memQ = query(
                collection(db, 'badminton_memberships'),
                where('userId', '==', user.id),
                where('status', '==', 'Active')
            );
            const unsubscribeMem = onSnapshot(memQ, (snap) => {
                if (!snap.empty) {
                    const mem = { id: snap.docs[0].id, ...snap.docs[0].data() } as any;
                    // Check expiry date or zero hours
                    if (new Date(mem.expiryDate) < new Date() || mem.remainingHours <= 0) {
                        setActiveMembership(null);
                    } else {
                        setActiveMembership(mem);
                    }
                } else {
                    setActiveMembership(null);
                }
            });

            return () => {
                unsubscribe();
                unsubscribeMem();
            };
        }
    }, [user]);

    // Update startTime when slots change
    useEffect(() => {
        const slots = getAvailableSlots(facility, date);
        if (slots.length > 0 && !slots.includes(startTime)) {
            setStartTime(slots[0]);
        } else if (slots.length === 0) {
            setStartTime('');
        }
    }, [facility, date]);

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
                    personName: booking.requesterName,
                    price: booking.price,
                    paymentMethod: booking.membership ? "Membership" : "Direct",
                    gender: booking.gender
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
        if (!date || !startTime || !personInCharge || (facility === 'Badminton Courts' && user?.role === 'STUDENT' && !numberOfStudents)) {
            alert("Please fill in all required fields.");
            return false;
        }

        // 2. Membership Specific Validation (Badminton)
        if (facility === 'Badminton Courts' && activeMembership && paymentOption === 'Use Membership') {
            if (parseInt(duration) > 60) {
                alert("Membership bookings are limited to a maximum of 1 hour per session.");
                return false;
            }
            if (activeMembership.remainingHours <= 0) {
                alert("You have no remaining hours in your membership.");
                return false;
            }
            if (new Date(activeMembership.expiryDate) < new Date()) {
                alert("Your membership has expired.");
                return false;
            }
        }

        // 3. Schedule & Gender Validation
        const day = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date(date));
        const sched = SCHEDULE[facility]?.[day];

        if (!sched) {
            alert(`Error: ${facility} is unavailable on ${day}.`);
            return false;
        }

        if (facility === 'Badminton Courts' && sched.gender) {
            const userGender = user?.gender || gender;
            const allowedGender = sched.gender; // 'Male' or 'Female'

            if (userGender !== allowedGender) {
                const girlsDays = "Sunday 4PM-11PM, Wednesday 4PM-11PM, Saturday 1PM-11PM";
                const boysDays = "Monday, Tuesday, Thursday, Friday (4PM-11PM, except Fri 12PM-11PM)";

                if (allowedGender === 'Male') {
                    alert(`Error: ${day} Badminton timings are reserved for Boys/Men.\nGirls/Women can book Badminton on: ${girlsDays}`);
                } else {
                    alert(`Error: ${day} Badminton timings are reserved for Girls/Women.\nBoys/Men can book Badminton on: ${boysDays}`);
                }
                return false;
            }
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
                // Calculate Price
                const hours = parseInt(duration) / 60;
                const students = parseInt(numberOfStudents) || 1;
                let price = 0;

                if (facility === 'Badminton Courts' && activeMembership && paymentOption === 'Use Membership') {
                    price = 0; // Membership covers it
                } else if (facility === 'Badminton Courts') {
                    price = user?.role === 'STUDENT' ? (10 * students * hours) : (60 * hours);
                } else if (facility === 'Basketball Courts' || facility === 'Football Ground') {
                    price = user?.role === 'STUDENT' ? (100 * hours) : (120 * hours);
                }

                // Create Booking
                const bookingData = {
                    userId: user?.id,
                    userEmail: user?.email,
                    requesterType: user?.role === 'STUDENT' ? 'Student' : (user?.role === 'PARENT' ? 'Parent' : 'Staff'),
                    requesterName: `${user?.firstName} ${user?.lastName}`,
                    facility,
                    date,
                    timeSlot: startTime,
                    duration: duration,
                    personInCharge,
                    numberOfStudents: (facility === 'Badminton Courts' && user?.role === 'STUDENT') ? numberOfStudents : null,
                    gender,
                    price: price,
                    membership: (facility === 'Badminton Courts' && activeMembership && paymentOption === 'Use Membership') ? true : false,
                    status: 'Pending',
                    createdAt: new Date().toISOString()
                };

                const docRef = await addDoc(collection(db, 'sports_facility_bookings'), bookingData);

                // Notify Sports Coordinator
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
                }

                // Dedect hour if using membership
                if (facility === 'Badminton Courts' && activeMembership && paymentOption === 'Use Membership') {
                    const memDocRef = doc(db, 'badminton_memberships', activeMembership.id);
                    await updateDoc(memDocRef, {
                        remainingHours: activeMembership.remainingHours - 1
                    });
                }

                setSuccessMsg("Booking Request Sent for Approval");
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

    const handlePurchaseMembership = async (type: '12-Hour' | '24-Hour') => {
        if (!user) return;
        if (activeMembership) {
            alert("You already have an active membership.");
            return;
        }
        setSubmitting(true);
        try {
            const hours = type === '12-Hour' ? 12 : 24;
            const months = type === '12-Hour' ? 3 : 6;
            const expiryDate = new Date();
            expiryDate.setMonth(expiryDate.getMonth() + months);

            await addDoc(collection(db, 'badminton_memberships'), {
                userId: user.id,
                userEmail: user.email,
                type,
                totalHours: hours,
                remainingHours: hours,
                purchaseDate: new Date().toISOString(),
                expiryDate: expiryDate.toISOString(),
                status: 'Active'
            });

            alert(`Successfully purchased ${type}!`);
            setActiveTab('new');
        } catch (err) {
            console.error(err);
            alert("Failed to purchase membership.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="max-w-5xl mx-auto animate-fade-in pb-20">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 mb-8">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 dark:text-white mb-2">Facilities Booking</h1>
                    <p className="text-slate-500 text-sm">Book sports facilities pending coordinator approval.</p>
                </div>
                {activeMembership && (
                    <div className="flex items-center gap-3 px-6 py-3 bg-emerald-500/10 border-2 border-emerald-500/30 rounded-2xl animate-in zoom-in-95 duration-500 shadow-lg shadow-emerald-500/10">
                        <Star className="w-4 h-4 text-emerald-500 fill-emerald-500" />
                        <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">
                            {activeMembership.remainingHours} HOURS LEFT
                        </span>
                    </div>
                )}
            </div>
            {successMsg && (
                <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 rounded-xl font-bold flex items-center">
                    <CheckCircle className="w-5 h-5 mr-2" />
                    {successMsg}
                </div>
            )}

            <div className="flex gap-4 mb-8 border-b border-slate-200 dark:border-white/10">
                <button
                    onClick={() => { setActiveTab('new'); setSuccessMsg(''); }}
                    className={`pb-4 px-4 text-sm font-bold border-b-2 transition-all ${activeTab === 'new' ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                >
                    NEW BOOKING
                </button>
                <button
                    onClick={() => { setActiveTab('memberships'); setSuccessMsg(''); }}
                    className={`pb-4 px-4 text-sm font-bold border-b-2 transition-all ${activeTab === 'memberships' ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                >
                    BADMINTON MEMBERSHIPS
                </button>
                <button
                    onClick={() => setActiveTab('my-bookings')}
                    className={`pb-4 px-4 text-sm font-bold border-b-2 transition-all ${activeTab === 'my-bookings' ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                >
                    MY BOOKINGS
                </button>
            </div>

            {activeTab === 'new' ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                    {/* Booking Form */}
                    <div className="lg:col-span-2 bg-white dark:bg-[#070708] p-8 rounded-[2.5rem] border border-slate-200 dark:border-white/10 shadow-xl">
                        <div className="space-y-6">
                            {/* Facility */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Facility</label>
                                    <select
                                        value={facility}
                                        onChange={(e) => {
                                            setFacility(e.target.value);
                                            setPaymentOption('Pay Now');
                                        }}
                                        className="w-full p-4 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 outline-none focus:ring-2 focus:ring-brand-500 font-bold dark:text-white"
                                    >
                                        {FACILITIES.map(f => <option key={f} value={f}>{f}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Gender</label>
                                    <select
                                        value={gender}
                                        onChange={(e) => setGender(e.target.value)}
                                        className="w-full p-4 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 outline-none focus:ring-2 focus:ring-brand-500 font-bold dark:text-white"
                                    >
                                        <option value="Male">Male</option>
                                        <option value="Female">Female</option>
                                    </select>
                                </div>
                            </div>

                            {/* Payment Method Option - Only for Badminton with Active Membership */}
                            {facility === 'Badminton Courts' && activeMembership && (
                                <div className="p-6 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl animate-in slide-in-from-top-2 duration-300">
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Payment Option</label>
                                    <div className="grid grid-cols-2 gap-4">
                                        <button
                                            type="button"
                                            onClick={() => setPaymentOption('Pay Now')}
                                            className={`p-4 rounded-xl border-2 font-bold transition-all flex flex-col items-center gap-2 ${paymentOption === 'Pay Now' ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600' : 'border-slate-200 dark:border-white/10 text-slate-400'}`}
                                        >
                                            <span className="text-sm">Pay Now</span>
                                            <span className="text-[10px] opacity-60">Standard Pricing</span>
                                        </button>
                                        <button
                                            type="button"
                                            disabled={activeMembership.remainingHours <= 0}
                                            onClick={() => setPaymentOption('Use Membership')}
                                            className={`p-4 rounded-xl border-2 font-bold transition-all flex flex-col items-center gap-2 ${paymentOption === 'Use Membership' ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600' : 'border-slate-200 dark:border-white/10 text-slate-400'} disabled:opacity-50 disabled:cursor-not-allowed`}
                                        >
                                            <span className="text-sm">Use Membership</span>
                                            <span className="text-[10px] opacity-60">{activeMembership.remainingHours} Hours Left</span>
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Conditional: Number of Students for Badminton (Student Role Only) */}
                            {facility === 'Badminton Courts' && user?.role === 'STUDENT' && (
                                <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Number of Students</label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={numberOfStudents}
                                        onChange={(e) => setNumberOfStudents(e.target.value)}
                                        placeholder="e.g., 4"
                                        className="w-full p-4 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 outline-none focus:ring-2 focus:ring-brand-500 font-bold dark:text-white"
                                    />
                                </div>
                            )}

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
                                        {getAvailableSlots(facility, date).length > 0 ? (
                                            getAvailableSlots(facility, date).map(t => <option key={t} value={t}>{t}</option>)
                                        ) : (
                                            <option value="">No slots available</option>
                                        )}
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
                        </div>
                    </div>

                    {/* Pricing Card (Green Reference Area) */}
                    <div className="lg:sticky lg:top-24">
                        <div className="p-8 rounded-[2.5rem] bg-emerald-500/5 border-2 border-emerald-500/30 backdrop-blur-xl flex flex-col items-center text-center space-y-6">
                            <div className="w-16 h-16 bg-emerald-500/20 rounded-2xl flex items-center justify-center">
                                <FileText className="w-8 h-8 text-emerald-500" />
                            </div>

                            <div>
                                <p className="text-xs font-black text-emerald-500 uppercase tracking-[0.2em] mb-1">Total Pricing</p>
                                <h2 className="text-5xl font-black text-slate-900 dark:text-white tracking-tighter">
                                    {(() => {
                                        if (facility === 'Badminton Courts' && activeMembership && paymentOption === 'Use Membership') return "0.00";
                                        const hours = parseInt(duration) / 60;
                                        const students = parseInt(numberOfStudents) || 1;
                                        let price = 0;
                                        if (facility === 'Badminton Courts') {
                                            price = user?.role === 'STUDENT' ? (10 * students * hours) : (60 * hours);
                                        } else {
                                            price = user?.role === 'STUDENT' ? (100 * hours) : (120 * hours);
                                        }
                                        return price.toFixed(2);
                                    })()}
                                    <span className="text-lg ml-1 font-bold">SAR</span>
                                </h2>
                                {facility === 'Badminton Courts' && activeMembership && paymentOption === 'Use Membership' && (
                                    <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mt-2 animate-pulse">
                                        Membership Applied (-1 Hour)
                                    </p>
                                )}
                            </div>

                            <div className="w-full pt-4 space-y-3">
                                <div className="flex justify-between text-xs font-bold text-slate-500 uppercase tracking-wider px-2">
                                    <span>Rate Type</span>
                                    <span className="text-slate-900 dark:text-white">Hourly</span>
                                </div>
                                <div className="flex justify-between text-xs font-bold text-slate-500 uppercase tracking-wider px-2">
                                    <span>Category</span>
                                    <span className="text-slate-900 dark:text-white">{user?.role}</span>
                                </div>
                                <div className="h-px bg-emerald-500/20 w-full" />
                            </div>

                            <button
                                onClick={handleSubmit}
                                disabled={submitting}
                                className="w-full py-5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-[1.5rem] font-black text-sm uppercase tracking-widest shadow-xl shadow-emerald-500/20 transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
                            >
                                {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <PlusCircle className="w-5 h-5" />}
                                PAY NOW
                            </button>

                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-relaxed px-4">
                                Clicking pay now will submit your request for archival processing.
                            </p>
                        </div>
                    </div>
                </div>
            ) : activeTab === 'memberships' ? (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* 12-Hour Membership */}
                        <MembershipOption
                            type="12-Hour Membership"
                            hours={12}
                            rate={50}
                            total={600}
                            validity="3 Months"
                            rules={[
                                "Valid only for Badminton",
                                "One court per member",
                                "Maximum 1 hour per booking",
                                "Court must be reserved in advance",
                                "Membership hours are deducted per completed booking",
                                "Unused hours do not carry forward after expiry",
                                "Membership is non-transferable",
                                "Membership validity: 3 months"
                            ]}
                            onPurchase={() => handlePurchaseMembership('12-Hour')}
                            loading={submitting}
                        />

                        {/* 24-Hour Membership */}
                        <MembershipOption
                            type="24-Hour Membership"
                            hours={24}
                            rate={40}
                            total={960}
                            validity="6 Months"
                            rules={[
                                "Valid only for Badminton",
                                "One court per member",
                                "Maximum 1 hour per booking",
                                "Court must be reserved in advance",
                                "Membership hours are deducted per completed booking",
                                "Unused hours do not carry forward after expiry",
                                "Membership is non-transferable",
                                "Membership validity: 6 months"
                            ]}
                            onPurchase={() => handlePurchaseMembership('24-Hour')}
                            loading={submitting}
                        />
                    </div>
                    {activeMembership && (
                        <div className="mt-12 bg-emerald-500/5 border border-emerald-500/20 p-8 rounded-[2.5rem] flex flex-col md:flex-row justify-between items-center gap-6">
                            <div>
                                <h4 className="text-xl font-black text-slate-900 dark:text-white uppercase">Your Active Membership</h4>
                                <p className="text-slate-500 text-sm mt-1">You are currently on the {activeMembership.type}.</p>
                            </div>
                            <div className="flex gap-4">
                                <div className="px-6 py-4 bg-white dark:bg-white/5 rounded-2xl border border-emerald-500/20 text-center">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Hours Remaining</p>
                                    <p className="text-2xl font-black text-emerald-500">{activeMembership.remainingHours} hrs</p>
                                </div>
                                <div className="px-6 py-4 bg-white dark:bg-white/5 rounded-2xl border border-emerald-500/20 text-center">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Expiry Date</p>
                                    <p className="text-lg font-black text-slate-900 dark:text-white">{new Date(activeMembership.expiryDate).toLocaleDateString()}</p>
                                </div>
                            </div>
                        </div>
                    )}
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
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-slate-900 dark:text-white">{b.facility}</span>
                                                {b.membership && (
                                                    <span className="px-1.5 py-0.5 rounded text-[8px] font-black bg-emerald-500 text-white uppercase tracking-tighter">MEMBER</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="p-6">
                                            <div className="flex flex-col gap-1">
                                                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{b.date}</span>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-slate-500">{b.timeSlot} ({b.duration} mins)</span>
                                                    <span className="text-[10px] font-bold bg-slate-100 dark:bg-white/10 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-400">
                                                        {b.gender}
                                                    </span>
                                                    {b.numberOfStudents && (
                                                        <span className="text-[10px] font-bold bg-slate-100 dark:bg-white/10 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-400">
                                                            {b.numberOfStudents} Students
                                                        </span>
                                                    )}
                                                </div>
                                                {b.expectedCollectionDate && (
                                                    <span className="text-[10px] uppercase font-bold text-brand-600 dark:text-brand-500 mt-1">
                                                        Collect by: {b.expectedCollectionDate}
                                                    </span>
                                                )}
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
