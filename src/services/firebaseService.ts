import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  addDoc, 
  serverTimestamp,
  getDocFromServer,
  Timestamp,
  runTransaction,
  getDocs,
  writeBatch,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  signInWithRedirect,
  GoogleAuthProvider, 
  OAuthProvider,
  signOut, 
  onAuthStateChanged,
  User as FirebaseUser,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult,
  PhoneAuthProvider,
  signInWithCredential
} from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { db, auth, functions, storage, rtdb } from '../firebase';
import { UserProfile, UserRole, Team, ContactRequest, Message, Transaction } from '../types';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { ref as rtdbRef, set, onValue, off } from 'firebase/database';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';

// Note: setupRecaptcha attaches it to the window object
export const setupRecaptcha = (containerId: string) => {
  if (Capacitor.isNativePlatform()) return null; // No recaptcha on native
  
  if (!(window as any).recaptchaVerifier) {
    (window as any).recaptchaVerifier = new RecaptchaVerifier(auth, containerId, {
      size: 'invisible',
      callback: (response: any) => {
        // reCAPTCHA solved
      },
      'expired-callback': () => {
        // Response expired. Ask user to solve reCAPTCHA again.
      }
    });
  }
  return (window as any).recaptchaVerifier;
};

export const sendPhoneSMS = async (phoneNumber: string, recaptchaVerifier: any) => {
  try {
    if (Capacitor.isNativePlatform()) {
      return new Promise<any>(async (resolve, reject) => {
        let phoneCodeSentListener: any;
        let phoneVerificationFailedListener: any;
        let phoneVerificationCompletedListener: any;

        const cleanup = () => {
          if (phoneCodeSentListener) phoneCodeSentListener.remove();
          if (phoneVerificationFailedListener) phoneVerificationFailedListener.remove();
          if (phoneVerificationCompletedListener) phoneVerificationCompletedListener.remove();
        };

        phoneCodeSentListener = await FirebaseAuthentication.addListener('phoneCodeSent', event => {
          cleanup();
          resolve({ verificationId: event.verificationId });
        });

        phoneVerificationFailedListener = await FirebaseAuthentication.addListener('phoneVerificationFailed', event => {
          cleanup();
          reject(new Error(event.message || 'Phone verification failed'));
        });

        phoneVerificationCompletedListener = await FirebaseAuthentication.addListener('phoneVerificationCompleted', event => {
          cleanup();
          resolve({ autoVerified: true, user: (event as any).result?.user || (event as any).user });
        });

        try {
          await FirebaseAuthentication.signInWithPhoneNumber({ phoneNumber });
        } catch (error) {
          cleanup();
          reject(error);
        }
      });
    } else {
      const result = await signInWithPhoneNumber(auth, phoneNumber, recaptchaVerifier);
      return { confirmationResult: result };
    }
  } catch (error) {
    console.error('Error sending SMS:', error);
    throw error;
  }
};

export const verifyPhoneCode = async (authData: any, code: string) => {
  try {
    let userResult;
    if (Capacitor.isNativePlatform()) {
      if (authData.autoVerified) {
        // Here we do not have the code. However, native plugin handles auth.
        // Sync to Web SDK.
        const idTokenResult = await FirebaseAuthentication.getIdToken();
        if (idTokenResult && idTokenResult.token) {
          // It's impossible to signInWithCustomToken with an ID Token.
          // Fallback to reload. The user is somehow authed but Web SDK doesn't know.
        }
        userResult = authData.user || auth.currentUser;
      } else {
        // 1. Get credential instead of native confirm
        const credential = PhoneAuthProvider.credential(authData.verificationId, code);
        // 2. Sign in directly to Web SDK (handles sync)
        const result = await signInWithCredential(auth, credential);
        userResult = result.user;
      }
    } else {
      const result = await authData.confirmationResult.confirm(code);
      userResult = result.user;
    }

    // Wait for JS SDK auth state to catch up
    if (!auth.currentUser) {
      await new Promise<void>((resolve) => {
        const unsubscribe = auth.onAuthStateChanged((u) => {
          if (u) {
            unsubscribe();
            resolve();
          }
        });
      });
    }
    
    return userResult || auth.currentUser;
  } catch (error) {
    console.error('Error verifying code:', error);
    throw error;
  }
};

export const saveFcmToken = async (uid: string, token: string) => {
  try {
    const userRef = doc(db, 'users', uid);
    await updateDoc(userRef, {
      fcmTokens: arrayUnion(token)
    });
  } catch (error) {
    console.error('Error saving FCM token:', error);
  }
};

export const removeFcmToken = async (uid: string, token: string) => {
  try {
    const userRef = doc(db, 'users', uid);
    await updateDoc(userRef, {
      fcmTokens: arrayRemove(token)
    });
  } catch (error) {
    console.error('Error removing FCM token:', error);
  }
};

export const signInWithOidc = async (providerId: string) => {
  const provider = new OAuthProvider(providerId);
  try {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (error) {
    console.error(`Error signing in with ${providerId}:`, error);
    throw error;
  }
};

export const logout = () => signOut(auth);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
  const publicPath = `users/${uid}`;
  const privatePath = `users/${uid}/private/data`;
  try {
    const publicSnap = await getDoc(doc(db, 'users', uid));
    if (!publicSnap.exists()) return null;

    const privateSnap = await getDoc(doc(db, 'users', uid, 'private', 'data'));
    const publicData = publicSnap.data();
    const privateData = privateSnap.exists() ? privateSnap.data() : { email: '', balance: 100 };

    return {
      ...publicData,
      ...privateData,
    } as UserProfile;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, publicPath);
    return null;
  }
};

export const createUserProfile = async (user: FirebaseUser, role: UserRole): Promise<UserProfile> => {
  const uid = user.uid;
  const publicPath = `users/${uid}`;
  const privatePath = `users/${uid}/private/data`;
  
  const publicProfile: any = {
    uid,
    role,
    displayName: user.displayName || 'Anonymous',
    photoURL: user.photoURL || null,
    createdAt: new Date().toISOString(),
  };

  if (user.phoneNumber) {
    publicProfile.phoneNumber = user.phoneNumber;
  }

  const privateProfile = {
    email: user.email || '',
    balance: 100,
  };

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'users', uid), publicProfile);
    batch.set(doc(db, 'users', uid, 'private', 'data'), privateProfile);
    
    // Add welcome bonus transaction
    const transactionRef = doc(collection(db, 'transactions'));
    batch.set(transactionRef, {
      uid,
      amount: 100,
      type: 'topup',
      description: 'Приветственный бонус',
      createdAt: new Date().toISOString()
    });

    await batch.commit();

    return { ...publicProfile, ...privateProfile } as UserProfile;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, publicPath);
    throw error;
  }
};

export const updatePlayerProfile = async (uid: string, playerProfile: any) => {
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), { playerProfile });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
};

export const updateUserProfile = async (uid: string, data: Partial<UserProfile>) => {
  const publicPath = `users/${uid}`;
  const privatePath = `users/${uid}/private/data`;
  
  const publicFields = ['displayName', 'photoURL', 'playerProfile', 'phoneNumber'];
  const privateFields = ['email', 'balance'];

  const publicUpdate: any = {};
  const privateUpdate: any = {};

  Object.keys(data).forEach(key => {
    if (publicFields.includes(key)) publicUpdate[key] = (data as any)[key];
    if (privateFields.includes(key)) privateUpdate[key] = (data as any)[key];
  });

  try {
    const batch = writeBatch(db);
    if (Object.keys(publicUpdate).length > 0) {
      batch.update(doc(db, 'users', uid), publicUpdate);
    }
    if (Object.keys(privateUpdate).length > 0) {
      batch.update(doc(db, 'users', uid, 'private', 'data'), privateUpdate);
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, publicPath);
  }
};

export const updateTeam = async (teamId: string, data: Partial<Team>) => {
  const path = `teams/${teamId}`;
  try {
    await updateDoc(doc(db, 'teams', teamId), data);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
};

export const addTestBalance = async (uid: string, amount: number) => {
  try {
    const handleTopup = httpsCallable(functions, 'handleTopup');
    await handleTopup({ amount });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${uid}/private/data`);
    throw error;
  }
};

export const createTeam = async (managerUid: string, teamData: Partial<Team>) => {
  const teamRef = doc(collection(db, 'teams'));
  const path = `teams/${teamRef.id}`;
  const team: Team = {
    id: teamRef.id,
    managerUid,
    name: teamData.name || '',
    gameFormat: teamData.gameFormat || '',
    tournaments: teamData.tournaments || [],
    reinforcementPositions: teamData.reinforcementPositions || [],
    description: teamData.description || '',
    createdAt: new Date().toISOString(),
  };
  try {
    await setDoc(teamRef, team);
    return team;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
    throw error;
  }
};

export const sendContactRequest = async (fromUid: string, toUid: string, price: number, teamId?: string) => {
  try {
    if (!toUid) {
      throw new Error("Отсутствует ID получателя");
    }
    if (fromUid === toUid) {
      throw new Error("Нельзя отправить запрос самому себе");
    }
    const fn = httpsCallable(functions, 'createContactRequest');
    const result = await fn({ toUid, price, teamId });
    return result.data;
  } catch (error) {
    console.error("sendContactRequest error:", error);
    // Don't use handleFirestoreError here since it's a cloud function error, not DB permissions
    throw error;
  }
};

export const acceptContactRequest = async (requestId: string, fromUid: string, toUid: string, price: number) => {
  try {
    const fn = httpsCallable(functions, 'resolveContactRequest');
    const result = await fn({ requestId, status: 'accepted' });
    return result.data;
  } catch (error) {
    console.error("acceptContactRequest error:", error);
    throw error;
  }
};

export const rejectContactRequest = async (requestId: string) => {
  try {
    const fn = httpsCallable(functions, 'resolveContactRequest');
    const result = await fn({ requestId, status: 'rejected' });
    return result.data;
  } catch (error) {
    console.error("rejectContactRequest error:", error);
    throw error;
  }
};

export const uploadChatAttachment = async (chatId: string, file: File | Blob, type: 'image' | 'audio'): Promise<string> => {
  const extension = type === 'image' ? 'jpg' : 'webm';
  const fileRef = storageRef(storage, `chats/${chatId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${extension}`);
  await uploadBytes(fileRef, file);
  return getDownloadURL(fileRef);
};

export const sendMessage = async (
  chatId: string, 
  senderUid: string, 
  text: string, 
  recipientUid: string,
  imageUrl?: string,
  audioUrl?: string
) => {
  const messageRef = doc(collection(db, 'chats', chatId, 'messages'));
  const path = `chats/${chatId}/messages/${messageRef.id}`;
  const message: Message = {
    id: messageRef.id,
    chatId,
    senderUid,
    text,
    createdAt: new Date().toISOString(),
    ...(imageUrl && { imageUrl }),
    ...(audioUrl && { audioUrl }),
  };
  
  try {
    // Save message
    await setDoc(messageRef, message);
    
    // Update chat metadata in contactRequests
    const chatRef = doc(db, 'contactRequests', chatId);
    const chatSnap = await getDoc(chatRef);
    
    if (chatSnap.exists()) {
      const data = chatSnap.data() as ContactRequest;
      const currentUnread = data.unreadCount || {};
      const newUnread = {
        ...currentUnread,
        [recipientUid]: (currentUnread[recipientUid] || 0) + 1
      };
      
      const lastMsgText = audioUrl ? '🎤 Голосовое сообщение' : imageUrl ? '📷 Фотография' : text;

      await updateDoc(chatRef, {
        lastMessage: lastMsgText,
        lastMessageAt: message.createdAt,
        unreadCount: newUnread
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
};

export const editMessage = async (chatId: string, messageId: string, newText: string) => {
  const path = `chats/${chatId}/messages/${messageId}`;
  try {
    await updateDoc(doc(db, 'chats', chatId, 'messages', messageId), {
      text: newText,
      isEdited: true
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
};

export const deleteMessage = async (chatId: string, messageId: string) => {
  const path = `chats/${chatId}/messages/${messageId}`;
  try {
    await updateDoc(doc(db, 'chats', chatId, 'messages', messageId), {
      text: 'Сообщение удалено',
      isDeleted: true,
      imageUrl: null,
      audioUrl: null
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
};

export const markChatAsRead = async (chatId: string, uid: string) => {
  const path = `contactRequests/${chatId}`;
  try {
    const chatRef = doc(db, 'contactRequests', chatId);
    const chatSnap = await getDoc(chatRef);
    
    if (chatSnap.exists()) {
      const data = chatSnap.data() as ContactRequest;
      const currentUnread = data.unreadCount || {};
      
      if (currentUnread[uid] && currentUnread[uid] > 0) {
        await updateDoc(chatRef, {
          [`unreadCount.${uid}`]: 0
        });
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
};

export const deleteChat = async (chatId: string) => {
  try {
    // 1. Delete all messages in the chat
    const messagesRef = collection(db, 'chats', chatId, 'messages');
    const messagesSnap = await getDocs(messagesRef);
    const batch = writeBatch(db);
    messagesSnap.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    
    // 2. Delete the contact request (which acts as chat metadata)
    const requestRef = doc(db, 'contactRequests', chatId);
    batch.delete(requestRef);
    
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `chats/${chatId}`);
  }
};

export const deleteAllChatsAndRequests = async () => {
  try {
    const batch = writeBatch(db);
    
    // Delete all contact requests
    const requestsSnap = await getDocs(collection(db, 'contactRequests'));
    requestsSnap.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    
    // Note: Deleting subcollections (messages) across all chats is harder in a single batch
    // if there are many. For a demo/dev tool, we'll try to delete messages for each chat found.
    for (const chatDoc of requestsSnap.docs) {
      const messagesSnap = await getDocs(collection(db, 'chats', chatDoc.id, 'messages'));
      messagesSnap.docs.forEach((msgDoc) => {
        batch.delete(msgDoc.ref);
      });
    }
    
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, 'contactRequests');
  }
};

export const setTypingStatus = async (chatId: string, uid: string, isTyping: boolean) => {
  try {
    const typingRef = rtdbRef(rtdb, `chats/${chatId}/typing/${uid}`);
    await set(typingRef, isTyping);
  } catch (error) {
    console.error('Error setting typing status in RTDB:', error);
  }
};

export const subscribeToTypingStatus = (chatId: string, callback: (typingUsers: Record<string, boolean>) => void) => {
  const typingRef = rtdbRef(rtdb, `chats/${chatId}/typing`);
  onValue(typingRef, (snapshot) => {
    callback(snapshot.val() || {});
  });
  return () => off(typingRef);
};

// Test connection
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
testConnection();
