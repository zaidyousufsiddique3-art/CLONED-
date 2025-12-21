
import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { subscribeToNotifications, markAsRead, markAllAsRead, deleteAllNotifications, deleteNotification } from '../firebase/notificationService';
import { Notification } from '../types';
import { Bell, Check, ExternalLink, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';

const Notifications: React.FC = () => {
    const { user } = useAuth();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [filter, setFilter] = useState<'all' | 'unread'>('all');

    useEffect(() => {
        if (!user) return;

        const unsubscribe = subscribeToNotifications(user.id, (data) => {
            setNotifications(data);
        });

        return () => unsubscribe();
    }, [user]);

    const handleMarkAllRead = async () => {
        if (user) {
            await markAllAsRead(user.id);
        }
    };

    const handleClearAll = async () => {
        if (!user) return;
        if (!window.confirm("Are you sure you want to delete ALL your notifications? This cannot be undone.")) return;

        try {
            await deleteAllNotifications(user.id);
            setNotifications([]); // Optimistic update
        } catch (err) {
            console.error("Failed to clear notifications", err);
            alert("Failed to clear notifications.");
        }
    };

    const handleDeleteOne = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!window.confirm("Delete this notification?")) return;

        try {
            await deleteNotification(id);
            setNotifications(prev => prev.filter(n => n.id !== id)); // Optimistic update
        } catch (err) {
            console.error("Failed to delete notification", err);
            alert("Failed to delete notification.");
        }
    };

    const handleRead = async (id: string) => {
        await markAsRead(id);
    };

    const filteredNotifications = notifications.filter(n => {
        if (filter === 'unread') return !n.isRead;
        return true;
    });

    return (
        <div className="max-w-3xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center">
                    <Bell className="w-6 h-6 mr-3 text-brand-500" />
                    Notifications
                </h2>
                <div className="flex space-x-4">
                    {notifications.some(n => !n.isRead) && (
                        <button
                            onClick={handleMarkAllRead}
                            className="flex items-center text-sm font-bold text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 transition-colors"
                        >
                            <Check className="w-4 h-4 mr-1" />
                            Mark all as read
                        </button>
                    )}
                    {notifications.length > 0 && (
                        <button
                            onClick={handleClearAll}
                            className="flex items-center text-sm font-bold text-slate-400 hover:text-red-500 transition-colors"
                        >
                            <Trash2 className="w-4 h-4 mr-1" />
                            Clear All
                        </button>
                    )}
                </div>
            </div>

            {/* Tabs */}
            <div className="flex space-x-4 mb-6">
                <button
                    onClick={() => setFilter('all')}
                    className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${filter === 'all' ? 'bg-brand-600 text-white shadow' : 'bg-white dark:bg-[#070708] text-slate-500 dark:text-slate-400 border border-white/5'}`}
                >
                    All
                </button>
                <button
                    onClick={() => setFilter('unread')}
                    className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${filter === 'unread' ? 'bg-brand-600 text-white shadow' : 'bg-white dark:bg-[#070708] text-slate-500 dark:text-slate-400 border border-white/5'}`}
                >
                    Unread
                </button>
            </div>

            <div className="bg-white dark:bg-[#070708] rounded-3xl shadow-sm border border-slate-200 dark:border-white/10 overflow-hidden transition-colors">
                {filteredNotifications.length === 0 ? (
                    <div className="p-12 text-center text-slate-500 dark:text-slate-400">
                        {filter === 'unread' ? "You're all caught up!" : "You have no notifications."}
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
                        {filteredNotifications.map(notif => (
                            <div
                                key={notif.id}
                                className={`p-6 flex items-start space-x-4 transition-colors ${!notif.isRead ? 'bg-brand-50/50 dark:bg-brand-500/5' : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'}`}
                                onClick={() => !notif.isRead && handleRead(notif.id)}
                            >
                                <div className={`w-2 h-2 rounded-full mt-2.5 shrink-0 ${!notif.isRead ? 'bg-brand-500' : 'bg-transparent'}`}></div>
                                <div className="flex-1">
                                    <p className={`text-sm ${!notif.isRead ? 'font-bold text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-300'}`}>
                                        {notif.message}
                                    </p>
                                    <span className="text-xs text-slate-400 mt-1 block">
                                        {new Date(notif.createdAt).toLocaleString()}
                                    </span>
                                </div>
                                <div className="flex items-center space-x-2">
                                    {notif.link && (
                                        <Link
                                            to={notif.link}
                                            onClick={(e) => { e.stopPropagation(); handleRead(notif.id); }}
                                            className="p-2 text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                                        >
                                            <ExternalLink className="w-4 h-4" />
                                        </Link>
                                    )}
                                    <button
                                        onClick={(e) => handleDeleteOne(notif.id, e)}
                                        className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Notifications;
