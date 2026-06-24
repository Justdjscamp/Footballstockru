import { onCall, HttpsError, onRequest } from 'firebase-functions/v2/https';
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from 'firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as crypto from 'crypto';

admin.initializeApp();
const db = getFirestore(admin.app(), 'ai-studio-2de7abc7-05e1-4ba5-9e5a-b99f52e0d3b8');

export const cloudPaymentsWebhook = onRequest({ region: 'europe-west2' }, async (req, res) => {
  const secret = '847850a707d0054358e03fe166a8c6e6';
  const headerHmac = req.get('Content-HMAC') || req.get('X-Content-HMAC');

  if (!headerHmac) {
    console.warn('Missing CloudPayments signature');
    res.status(401).json({ code: 1, message: 'Missing signature' });
    return;
  }

  const hmac = crypto.createHmac('sha256', secret);
  const expectedHmac = hmac.update((req as any).rawBody).digest('base64');

  if (headerHmac !== expectedHmac) {
    console.error('Invalid CloudPayments signature');
    res.status(403).json({ code: 1, message: 'Invalid signature' });
    return;
  }

  const data = req.body;
  const uid = data.AccountId;
  const amount = Number(data.Amount);

  if (!uid) {
    res.json({ code: 1, message: 'Missing AccountId' });
    return;
  }

  try {
    const userRef = db.collection('users').doc(uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      res.json({ code: 1, message: 'User not found' });
      return;
    }

    // CloudPayments sends Check and Pay notifications.
    // For Check, return code 0 if AccountId is valid.
    // For Pay, update balance if Status is 'Completed'.
    if (data.Status === 'Completed') {
      await db.runTransaction(async (transaction) => {
        const privateDataRef = userRef.collection('private').doc('data');
        const privateSnap = await transaction.get(privateDataRef);

        if (!privateSnap.exists) {
          // If private doc doesn't exist, create it (should exist though)
          transaction.set(privateDataRef, { balance: amount, email: '' });
        } else {
          transaction.update(privateDataRef, {
            balance: FieldValue.increment(amount)
          });
        }

        const txRef = db.collection('transactions').doc();
        transaction.set(txRef, {
          id: txRef.id,
          uid: uid,
          amount: amount,
          type: 'topup',
          description: 'Пополнение через CloudPayments',
          transactionId: data.TransactionId,
          createdAt: new Date().toISOString()
        });
      });
      console.log(`Successfully processed payment for user ${uid}: ${amount} RUB`);
    }

    res.json({ code: 0 });
  } catch (error) {
    console.error('CloudPayments webhook error:', error);
    res.json({ code: 1, message: 'Internal error' });
  }
});

export const createContactRequest = onCall({ region: 'europe-west2' }, async (request) => {
  const { auth, data } = request;
  if (!auth) {
    throw new HttpsError('unauthenticated', 'Пользователь не авторизован');
  }

  const { toUid, teamId } = data;
  const price = Number(data.price) || 0;
  const fromUid = auth.uid;

  if (!toUid || typeof toUid !== 'string') {
    throw new HttpsError('invalid-argument', 'Отсутствует или некорректный ID получателя');
  }

  if (fromUid === toUid) {
    throw new HttpsError('invalid-argument', 'Нельзя отправить запрос самому себе');
  }

  try {
    // 1. Проверяем наличие уже отклоненной заявки вне транзакции
    const requestsRef = db.collection('contactRequests');
    const q = requestsRef.where('fromUid', '==', fromUid);
    const userSnaps = await q.get();

    const isRejected = userSnaps.docs.some(doc => {
      const d = doc.data();
      return d.toUid === toUid && d.status === 'rejected';
    });

    if (isRejected) {
      throw new HttpsError('permission-denied', 'Заявка к этому пользователю была ранее отклонена');
    }

    const result = await db.runTransaction(async (transaction) => {
      // 2. Проверяем баланс
      const fromUserDocRef = db.collection('users').doc(fromUid).collection('private').doc('data');
      const fromUserSnap = await transaction.get(fromUserDocRef);

      if (!fromUserSnap.exists) {
        throw new HttpsError('not-found', 'Инициатор запроса не найден');
      }

      const fromUserData = fromUserSnap.data() as any;
      const balance = fromUserData?.balance || 0;
      if (balance < price) {
        throw new HttpsError('failed-precondition', 'Недостаточно средств для отправки запроса');
      }

      // Получаем информацию о пользователях (и команде, если есть) для денормализации
      const fromPublicSnap = await transaction.get(db.collection('users').doc(fromUid));
      const toPublicSnap = await transaction.get(db.collection('users').doc(toUid));
      
      let teamName = '';
      let teamLogoURL = '';
      if (teamId) {
        const teamSnap = await transaction.get(db.collection('teams').doc(teamId));
        if (teamSnap.exists) {
          const tData = teamSnap.data() as any;
          teamName = tData.name || '';
          teamLogoURL = tData.logoURL || '';
        }
      }

      // 3. Списываем средства
      transaction.update(fromUserDocRef, {
        balance: FieldValue.increment(-price),
        heldBalance: FieldValue.increment(price)
      });

      // 4. Создаем заявку
      const requestRef = db.collection('contactRequests').doc();
      const requestData: any = {
        id: requestRef.id,
        fromUid,
        toUid,
        status: 'pending',
        price,
        fromName: fromPublicSnap.data()?.displayName || '',
        fromPhotoURL: fromPublicSnap.data()?.photoURL || '',
        toName: toPublicSnap.data()?.displayName || '',
        toPhotoURL: toPublicSnap.data()?.photoURL || '',
        createdAt: new Date().toISOString()
      };

      if (teamId) {
        requestData.teamId = teamId;
        requestData.teamName = teamName;
        requestData.teamLogoURL = teamLogoURL;
      }

      transaction.set(requestRef, requestData);

      return { success: true, requestId: requestRef.id, toUid, fromName: requestData.fromName, fromUid };
    });

    try {
      const toUserDoc = await db.collection('users').doc(result.toUid).get();
      const toUserData = toUserDoc.data() as any;
      if (toUserData && toUserData.fcmTokens && toUserData.fcmTokens.length > 0) {
        await admin.messaging().sendEachForMulticast({
          tokens: toUserData.fcmTokens,
          notification: {
            title: 'Новая заявка',
            body: `${result.fromName} отправил(а) вам заявку`,
          },
          data: {
            requestId: result.requestId,
            fromUid: result.fromUid
          }
        });
      }
    } catch (pushError) {
      console.error('Push error in createContactRequest:', pushError);
    }

    return result;
  } catch (error: any) {
    console.error('createContactRequest error:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('unknown', error.message || 'Ошибка сервера', error.stack);
  }
});

export const resolveContactRequest = onCall({ region: 'europe-west2' }, async (request) => {
  const { auth, data } = request;
  if (!auth) {
    throw new HttpsError('unauthenticated', 'Пользователь не авторизован');
  }

  const { requestId, status } = data;
  if (!requestId || !status) {
    throw new HttpsError('invalid-argument', 'Отсутствуют необходимые параметры');
  }

  if (status !== 'accepted' && status !== 'rejected') {
    throw new HttpsError('invalid-argument', 'Некорректный статус');
  }

  const uid = auth.uid;

  try {
    const result = await db.runTransaction(async (transaction) => {
      const requestRef = db.collection('contactRequests').doc(requestId);
      const requestSnap = await transaction.get(requestRef);

      if (!requestSnap.exists) {
        throw new HttpsError('not-found', 'Запрос не найден');
      }

      const requestData = requestSnap.data() as any;

      if (requestData.toUid !== uid) {
        throw new HttpsError('permission-denied', 'Вы не можете обработать этот запрос');
      }

      if (requestData.status !== 'pending') {
        throw new HttpsError('failed-precondition', 'Запрос уже обработан');
      }

      const price = requestData.price;
      const fromUid = requestData.fromUid;

      const fromUserDocRef = db.collection('users').doc(fromUid).collection('private').doc('data');

      if (status === 'rejected') {
        // Размораживаем средства инициатору
        transaction.update(fromUserDocRef, {
          heldBalance: FieldValue.increment(-price),
          balance: FieldValue.increment(price)
        });
      } else if (status === 'accepted') {
        // Списываем замороженные средства окончательно
        if (price > 0) {
          transaction.update(fromUserDocRef, {
            heldBalance: FieldValue.increment(-price)
          });
          
          const txRef = db.collection('transactions').doc();
          transaction.set(txRef, {
            id: txRef.id,
            uid: fromUid,
            amount: -price,
            type: 'payment',
            description: 'Оплата за контакт ' + requestData.toUid,
            createdAt: new Date().toISOString()
          });
        }
      }

      // Обновляем статус заявки
      transaction.update(requestRef, {
        status: status
      });

      return { success: true, message: `Запрос ${status === 'accepted' ? 'принят' : 'отклонен'}`, fromUid, toUid: uid, requestId, status };
    });

    if (result.status === 'accepted') {
      try {
        const fromUserDoc = await db.collection('users').doc(result.fromUid).get();
        const fromUserData = fromUserDoc.data() as any;
        if (fromUserData && fromUserData.fcmTokens && fromUserData.fcmTokens.length > 0) {
          await admin.messaging().sendEachForMulticast({
            tokens: fromUserData.fcmTokens,
            notification: {
              title: 'Заявка принята!',
              body: 'Ваша заявка подтверждена, чат открыт',
            },
            data: {
              requestId: result.requestId,
            }
          });
        }
      } catch (pushError) {
        console.error('Push error in resolveContactRequest:', pushError);
      }
    }

    return result;
  } catch (error: any) {
    console.error('resolveContactRequest error:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('unknown', error.message || 'Ошибка сервера', error.stack);
  }
});

export const handleTopup = onCall({ region: 'europe-west2' }, async (request) => {
  const { auth, data } = request;
  if (!auth) {
    throw new HttpsError('unauthenticated', 'Пользователь не авторизован');
  }

  const { amount } = data;
  if (!amount || typeof amount !== 'number' || amount <= 0) {
    throw new HttpsError('invalid-argument', 'Некорректная сумма пополнения');
  }

  const uid = auth.uid;

  try {
    return await db.runTransaction(async (transaction) => {
      const userRef = db.collection('users').doc(uid).collection('private').doc('data');
      const userSnap = await transaction.get(userRef);

      if (!userSnap.exists) {
        throw new HttpsError('not-found', 'Пользователь не найден');
      }

      transaction.update(userRef, {
        balance: FieldValue.increment(amount)
      });

      const txRef = db.collection('transactions').doc();
      transaction.set(txRef, {
        id: txRef.id,
        uid: uid,
        amount: amount,
        type: 'topup',
        description: 'Пополнение баланса',
        createdAt: new Date().toISOString()
      });

      return { success: true, newBalance: userSnap.data()?.balance + amount };
    });
  } catch (error: any) {
    console.error('handleTopup error:', error);
    throw new HttpsError('unknown', error.message || 'Ошибка сервера', error.stack);
  }
});

export const callGeminiApi = onCall({ region: 'europe-west2' }, async (request) => {
  const { auth, data } = request;
  if (!auth) {
    throw new HttpsError('unauthenticated', 'Пользователь не авторизован');
  }

  const { prompt } = data;
  if (!prompt || typeof prompt !== 'string') {
    throw new HttpsError('invalid-argument', 'Некорректный запрос');
  }

  try {
    // Здесь должна быть серверная логика обращения к Gemini API:
    // const { GoogleGenAI } = require('@google/genai');
    // const ai = new GoogleGenAI({ apiKey: functions.config().gemini.key });
    // const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
    // return { result: response.text };

    return { result: "Ответ от Gemini API (заглушка на бэкенде)" };
  } catch (error: any) {
    console.error('callGeminiApi error:', error);
    throw new HttpsError('unknown', error.message || 'Ошибка сервера при обращении к Gemini', error.stack);
  }
});

export const deleteUserAccount = onCall({ region: 'europe-west2' }, async (request) => {
  const { auth } = request;
  if (!auth) {
    throw new HttpsError('unauthenticated', 'Пользователь не авторизован');
  }

  const uid = auth.uid;

  try {
    // 1. Delete user from users collection
    await db.collection('users').doc(uid).delete();
    // Delete private data
    await db.collection('users').doc(uid).collection('private').doc('data').delete();

    // 2. Delete teams managed by this user
    const teamsRef = db.collection('teams');
    const teamsSnapshot = await teamsRef.where('managerUid', '==', uid).get();
    const batch = db.batch();
    teamsSnapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    // 3. Delete contact requests
    const contactRequestsRef = db.collection('contactRequests');
    const fromRequests = await contactRequestsRef.where('fromUid', '==', uid).get();
    fromRequests.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    const toRequests = await contactRequestsRef.where('toUid', '==', uid).get();
    toRequests.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    // Delete transactions maybe? Not explicitly requested but good practice. Leave for now as not specified in the strict prompt.

    await batch.commit();

    // 4. Delete avatar from Storage (if exists)
    try {
      const bucket = admin.storage().bucket();
      await bucket.deleteFiles({ prefix: `users/${uid}/` });
      
      // Delete team logos
      await bucket.deleteFiles({ prefix: `teams_logos/${uid}_` });
    } catch (storageError) {
      console.error('Error deleting user storage files:', storageError);
    }

    // 5. Delete Firebase Auth user
    await admin.auth().deleteUser(uid);

    return { success: true };
  } catch (error: any) {
    console.error('deleteUserAccount error:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('unknown', error.message || 'Ошибка удаления аккаунта', error.stack);
  }
});

export const onChatMessageSent = onDocumentCreated({
  document: 'chats/{chatId}/messages/{messageId}',
  database: 'ai-studio-2de7abc7-05e1-4ba5-9e5a-b99f52e0d3b8',
  region: 'europe-west2'
}, async (event) => {
  const snap = event.data;
  if (!snap) return;
  const message = snap.data();
  const chatId = event.params.chatId;

  try {
      // Find the chat details to determine the recipient
      const chatDoc = await db.collection('contactRequests').doc(chatId).get();
      if (!chatDoc.exists) return;
      
      const chatData = chatDoc.data() as any;
      const recipientUid = chatData.fromUid === message.senderUid ? chatData.toUid : chatData.fromUid;

      // Get sender details for the notification title
      const senderDoc = await db.collection('users').doc(message.senderUid).get();
      const senderName = senderDoc.exists ? (senderDoc.data()?.displayName || 'Новое сообщение') : 'Новое сообщение';

      // Get recipient FCM tokens
      const recipientDoc = await db.collection('users').doc(recipientUid).get();
      if (!recipientDoc.exists) return;

      const recipientData = recipientDoc.data() as any;
      
      if (recipientData.fcmTokens && recipientData.fcmTokens.length > 0) {
        await admin.messaging().sendEachForMulticast({
          tokens: recipientData.fcmTokens,
          notification: {
            title: senderName,
            body: message.text.length > 100 ? message.text.substring(0, 97) + '...' : message.text,
          },
          data: {
            chatId: chatId,
            type: 'chat_message'
          }
        });
      }
    } catch (error) {
      console.error('Error sending push on new message:', error);
    }
  });
