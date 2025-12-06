
import { User, UserRole, DocRequest, RequestStatus, DocumentType, Comment, Attachment, PasswordResetRequest, Notification } from '../types';

const USERS_KEY = 'edudocs_users';
const REQUESTS_KEY = 'edudocs_requests';
const PASSWORD_RESETS_KEY = 'edudocs_password_resets';
const NOTIFICATIONS_KEY = 'edudocs_notifications';

// Initialize DB with Super Admin
const initializeDB = () => {
  const existingUsers = localStorage.getItem(USERS_KEY);
  if (!existingUsers) {
    const superAdmin: User = {
      id: 'super-admin-01',
      email: 'administration@slisr.org',
      password: 'Admin@slisr', // In real app, hash this
      firstName: 'Super',
      lastName: 'Admin',
      role: UserRole.SUPER_ADMIN,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    localStorage.setItem(USERS_KEY, JSON.stringify([superAdmin]));
  }
};

initializeDB();

// --- User Operations ---

export const getUsers = (): User[] => {
  const usersStr = localStorage.getItem(USERS_KEY);
  return usersStr ? JSON.parse(usersStr) : [];
};

export const saveUser = (user: User): void => {
  const users = getUsers();
  const index = users.findIndex(u => u.id === user.id);
  if (index >= 0) {
    users[index] = user;
  } else {
    users.push(user);
  }
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
};

export const getUserByEmail = (email: string): User | undefined => {
  return getUsers().find(u => u.email.toLowerCase() === email.toLowerCase());
};

export const getUserById = (id: string): User | undefined => {
  return getUsers().find(u => u.id === id);
};

export const getPotentialAssignees = (): User[] => {
  // Returns Admins, Staff, and Super Admin
  return getUsers().filter(u => 
    u.role === UserRole.ADMIN || 
    u.role === UserRole.STAFF || 
    u.role === UserRole.SUPER_ADMIN
  );
};

export const getSuperAdmins = (): User[] => {
  return getUsers().filter(u => u.role === UserRole.SUPER_ADMIN);
};

// --- Request Operations ---

export const getRequests = (): DocRequest[] => {
  const reqStr = localStorage.getItem(REQUESTS_KEY);
  return reqStr ? JSON.parse(reqStr) : [];
};

export const saveRequest = (req: DocRequest): void => {
  const requests = getRequests();
  const index = requests.findIndex(r => r.id === req.id);
  if (index >= 0) {
    requests[index] = req;
  } else {
    requests.push(req);
  }
  localStorage.setItem(REQUESTS_KEY, JSON.stringify(requests));
};

export const deleteRequest = (id: string): void => {
  const requests = getRequests();
  const updatedRequests = requests.filter(r => r.id !== id);
  localStorage.setItem(REQUESTS_KEY, JSON.stringify(updatedRequests));
};

export const getRequestsByStudent = (studentId: string): DocRequest[] => {
  return getRequests().filter(r => r.studentId === studentId);
};

export const getRequestsByAssignee = (staffId: string): DocRequest[] => {
  return getRequests().filter(r => r.assignedToId === staffId);
};

// ID Generation Logic: AdmissionNumber_RequestNumber_Date
export const generateRequestId = (admissionNo: string): string => {
  const reqs = getRequests();
  // Filter by this student's admission number to count previous requests
  const studentReqs = reqs.filter(r => r.studentAdmissionNo === admissionNo);
  const count = studentReqs.length + 1;
  const countStr = count.toString().padStart(3, '0');
  
  const now = new Date();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  
  return `${admissionNo}_${countStr}_${month}${day}`;
};

// --- Password Reset Operations ---

export const getPasswordResetRequests = (): PasswordResetRequest[] => {
  const str = localStorage.getItem(PASSWORD_RESETS_KEY);
  return str ? JSON.parse(str) : [];
};

export const savePasswordResetRequest = (req: PasswordResetRequest): void => {
  const reqs = getPasswordResetRequests();
  const index = reqs.findIndex(r => r.id === req.id);
  if (index >= 0) {
    reqs[index] = req;
  } else {
    reqs.push(req);
  }
  localStorage.setItem(PASSWORD_RESETS_KEY, JSON.stringify(reqs));
};

// --- Notification Operations ---

export const getNotifications = (userId: string): Notification[] => {
  const str = localStorage.getItem(NOTIFICATIONS_KEY);
  const all: Notification[] = str ? JSON.parse(str) : [];
  return all.filter(n => n.userId === userId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};

export const createNotification = (userId: string, message: string, link?: string): void => {
  const str = localStorage.getItem(NOTIFICATIONS_KEY);
  const all: Notification[] = str ? JSON.parse(str) : [];
  const newNotif: Notification = {
    id: generateId(),
    userId,
    message,
    link,
    isRead: false,
    createdAt: new Date().toISOString()
  };
  all.push(newNotif);
  localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(all));
};

export const markNotificationRead = (id: string): void => {
  const str = localStorage.getItem(NOTIFICATIONS_KEY);
  if (!str) return;
  const all: Notification[] = JSON.parse(str);
  const index = all.findIndex(n => n.id === id);
  if (index >= 0) {
    all[index].isRead = true;
    localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(all));
  }
};

export const markAllNotificationsRead = (userId: string): void => {
  const str = localStorage.getItem(NOTIFICATIONS_KEY);
  if (!str) return;
  const all: Notification[] = JSON.parse(str);
  const updated = all.map(n => n.userId === userId ? { ...n, isRead: true } : n);
  localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(updated));
};

// --- Helper Utilities ---

export const generateId = (): string => {
  return Math.random().toString(36).substr(2, 9);
};

export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });
};

export const getAnalytics = (): any => {
  const reqs = getRequests();
  return {
    total: reqs.length,
    pending: reqs.filter(r => r.status === RequestStatus.PENDING).length,
    inReview: reqs.filter(r => r.status === RequestStatus.IN_PROGRESS).length,
    completed: reqs.filter(r => r.status === RequestStatus.COMPLETED).length,
    rejected: 0, 
  };
};
