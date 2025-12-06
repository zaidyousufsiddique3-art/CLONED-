
import { collection, getDocs, doc, updateDoc, query, where, setDoc, deleteDoc } from '@firebase/firestore';
import { db } from './firebaseConfig';
import { User, UserRole } from '../types';

export const getAllUsers = async (): Promise<User[]> => {
  const snapshot = await getDocs(collection(db, 'users'));
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
};

export const updateUserProfile = async (userId: string, data: Partial<User>) => {
  const userRef = doc(db, 'users', userId);
  await updateDoc(userRef, data);
};

export const deleteUser = async (userId: string) => {
  const userRef = doc(db, 'users', userId);
  await deleteDoc(userRef);
};

export const getPotentialAssignees = async (): Promise<User[]> => {
  const q = query(collection(db, 'users'), where('role', 'in', [UserRole.ADMIN, UserRole.STAFF, UserRole.SUPER_ADMIN]));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
};

export const getSuperAdmins = async (): Promise<User[]> => {
  const q = query(collection(db, 'users'), where('role', '==', UserRole.SUPER_ADMIN));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
};

// Seed Super Admin if not exists
export const seedSuperAdmin = async () => {
  const email = 'administration@slisr.org';
  // We can't check auth users client side easily without login, 
  // but we can check firestore.
  const q = query(collection(db, 'users'), where('email', '==', email));
  const snapshot = await getDocs(q);
  
  if (snapshot.empty) {
    console.log("Super Admin not found in DB. Ensure 'administration@slisr.org' is registered.");
  }
};
