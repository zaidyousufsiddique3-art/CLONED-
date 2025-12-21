
import { collection, addDoc, getDocs, query, where, orderBy, doc, updateDoc, getDoc } from '@firebase/firestore';
import { db } from './firebaseConfig';
import { SportsCaptainApplication } from '../types';

export const createSportsCaptainApplication = async (data: Omit<SportsCaptainApplication, 'id'>): Promise<string> => {
    const docRef = await addDoc(collection(db, 'sports_captain_applications'), data);
    return docRef.id;
};

export const getSportsCaptainApplications = async (): Promise<SportsCaptainApplication[]> => {
    const q = query(collection(db, 'sports_captain_applications'), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SportsCaptainApplication));
};

export const updateSportsCaptainApplicationStatus = async (id: string, status: SportsCaptainApplication['status']) => {
    const docRef = doc(db, 'sports_captain_applications', id);
    await updateDoc(docRef, { status, updatedAt: new Date().toISOString() });
};

export const getSportsCaptainApplicationByStudent = async (studentId: string): Promise<SportsCaptainApplication | null> => {
    const q = query(collection(db, 'sports_captain_applications'), where('studentId', '==', studentId));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as SportsCaptainApplication;
};

export const deleteSportsCaptainApplication = async (id: string) => {
    const { deleteDoc } = await import('@firebase/firestore');
    await deleteDoc(doc(db, 'sports_captain_applications', id));
};
