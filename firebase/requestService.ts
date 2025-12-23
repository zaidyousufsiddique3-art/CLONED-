
import {
  collection, doc, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, onSnapshot, getDocs
} from '@firebase/firestore';
import { db } from './firebaseConfig';
import { DocRequest, RequestStatus, DocumentType } from '../types';

const REQUESTS_COLLECTION = 'requests';

// Generate Custom ID: Admission_Seq_Date
export const generateRequestId = async (admissionNo: string): Promise<string> => {
  // Get count of requests for this admission number
  const q = query(collection(db, REQUESTS_COLLECTION), where('studentAdmissionNo', '==', admissionNo));
  const snapshot = await getDocs(q);
  const count = snapshot.size + 1;
  const countStr = count.toString().padStart(3, '0');

  const now = new Date();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');

  return `${admissionNo}_${countStr}_${month}${day}`;
};

export const createRequest = async (request: DocRequest) => {
  // Ensure ID is set
  const id = request.id || await generateRequestId(request.studentAdmissionNo);
  await setDoc(doc(db, REQUESTS_COLLECTION, id), { ...request, id });
  return id;
};

export const updateRequest = async (id: string, data: Partial<DocRequest>) => {
  await updateDoc(doc(db, REQUESTS_COLLECTION, id), { ...data, updatedAt: new Date().toISOString() });
};

export const deleteRequest = async (id: string) => {
  await deleteDoc(doc(db, REQUESTS_COLLECTION, id));
};

// Real-time Listeners

export const subscribeToAllRequests = (callback: (reqs: DocRequest[]) => void) => {
  const q = query(collection(db, REQUESTS_COLLECTION), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const reqs = snapshot.docs.map(doc => doc.data() as DocRequest);
    callback(reqs);
  });
};

export const subscribeToStudentRequests = (studentId: string, callback: (reqs: DocRequest[]) => void) => {
  const q = query(
    collection(db, REQUESTS_COLLECTION),
    where('studentId', '==', studentId)
  );
  // Client-side sort needed because compound query requires index
  return onSnapshot(q, (snapshot) => {
    const reqs = snapshot.docs.map(doc => doc.data() as DocRequest);
    reqs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    callback(reqs);
  });
};

export const subscribeToAssignedRequests = (userId: string, callback: (reqs: DocRequest[]) => void) => {
  const q = query(
    collection(db, REQUESTS_COLLECTION),
    where('assignedToId', '==', userId)
  );
  return onSnapshot(q, (snapshot) => {
    const reqs = snapshot.docs.map(doc => doc.data() as DocRequest);
    reqs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    callback(reqs);
  });
};

export const subscribeToRequest = (id: string, callback: (req: DocRequest | null) => void) => {
  return onSnapshot(doc(db, REQUESTS_COLLECTION, id), (doc) => {
    if (doc.exists()) {
      callback(doc.data() as DocRequest);
    } else {
      callback(null);
    }
  });
};

export const subscribeToSportsRequests = (callback: (reqs: DocRequest[]) => void) => {
  const q = query(
    collection(db, REQUESTS_COLLECTION),
    where('type', 'in', [DocumentType.SPORTS_CAPTAIN, DocumentType.SPORTS_RECOMMENDATION])
  );
  return onSnapshot(q, (snapshot) => {
    const reqs = snapshot.docs.map(doc => doc.data() as DocRequest);
    reqs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    callback(reqs);
  });
};
