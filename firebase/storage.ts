
import { ref, uploadBytes, getDownloadURL } from '@firebase/storage';
import { storage } from './firebaseConfig';

// Re-export SDK members to act as a transparent proxy for other files
export * from '@firebase/storage';

export const uploadFile = async (file: File, path: string): Promise<string> => {
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  return await getDownloadURL(storageRef);
};
