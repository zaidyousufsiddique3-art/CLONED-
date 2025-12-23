
import { collection, addDoc, updateDoc, doc, query, where, onSnapshot, orderBy, getDocs, writeBatch, deleteDoc } from '@firebase/firestore';
import { db } from './firebaseConfig';
import { Notification } from '../types';

import { PRINCIPAL_EMAIL, SPORTS_COORDINATOR_EMAIL } from '../constants';

const NOTIFS_COLLECTION = 'notifications';

export const sendNotification = async (userId: string, message: string, link?: string) => {
  let targetId = userId;

  if (userId === "COORDINATOR" || userId === "PRINCIPAL" || userId === "SPORTS_COORDINATOR") {
    const email = userId === "PRINCIPAL" ? PRINCIPAL_EMAIL : SPORTS_COORDINATOR_EMAIL;
    const q1 = query(collection(db, 'users'), where('email', '==', email.toLowerCase()));
    const snap1 = await getDocs(q1);

    if (!snap1.empty) {
      targetId = snap1.docs[0].id;
    } else {
      // Fallback for case sensitivity or exact match if lowercase failed
      const q2 = query(collection(db, 'users'), where('email', '==', email));
      const snap2 = await getDocs(q2);
      if (!snap2.empty) targetId = snap2.docs[0].id;
    }
  }

  const notif: Omit<Notification, 'id'> = {
    userId: targetId,
    message,
    link,
    isRead: false,
    createdAt: new Date().toISOString()
  };
  await addDoc(collection(db, NOTIFS_COLLECTION), notif);
};

export const markAsRead = async (id: string) => {
  await updateDoc(doc(db, NOTIFS_COLLECTION, id), { isRead: true });
};

export const markAllAsRead = async (userId: string) => {
  try {
    const q = query(collection(db, NOTIFS_COLLECTION), where('userId', '==', userId), where('isRead', '==', false));
    const snapshot = await getDocs(q);

    if (snapshot.empty) return;

    const chunks = [];
    let currentChunk = writeBatch(db);
    let count = 0;

    snapshot.docs.forEach((d) => {
      const docRef = doc(db, NOTIFS_COLLECTION, d.id);
      currentChunk.update(docRef, { isRead: true });
      count++;
      if (count === 499) {
        chunks.push(currentChunk);
        currentChunk = writeBatch(db);
        count = 0;
      }
    });
    if (count > 0) chunks.push(currentChunk);

    for (const chunk of chunks) {
      await chunk.commit();
    }
  } catch (error) {
    console.error("Error marking all as read:", error);
  }
};

export const deleteNotification = async (id: string) => {
  // Requires security rule allowing user to delete own notification
  await deleteDoc(doc(db, NOTIFS_COLLECTION, id));
};

export const deleteAllNotifications = async (userId: string) => {
  try {
    const q = query(collection(db, NOTIFS_COLLECTION), where('userId', '==', userId));
    const snapshot = await getDocs(q);

    if (snapshot.empty) return;

    const chunks = [];
    let currentChunk = writeBatch(db);
    let count = 0;

    snapshot.docs.forEach((d) => {
      const docRef = doc(db, NOTIFS_COLLECTION, d.id);
      currentChunk.delete(docRef);
      count++;
      if (count === 499) {
        chunks.push(currentChunk);
        currentChunk = writeBatch(db);
        count = 0;
      }
    });
    if (count > 0) chunks.push(currentChunk);

    for (const chunk of chunks) {
      await chunk.commit();
    }
  } catch (error) {
    console.error("Error deleting all notifications:", error);
    throw error;
  }
};

export const subscribeToNotifications = (userId: string, callback: (notifs: Notification[]) => void) => {
  const q = query(
    collection(db, NOTIFS_COLLECTION),
    where('userId', '==', userId)
  );
  return onSnapshot(q, (snapshot) => {
    const notifs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notification));
    // Sort by date desc (newest first)
    notifs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    callback(notifs);
  });
};
