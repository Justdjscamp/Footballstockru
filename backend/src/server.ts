import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import * as admin from "firebase-admin";
import crypto from "crypto";

dotenv.config();

// Initialize Firebase Admin
if (!admin.apps.length) {
  try {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (serviceAccountJson) {
      console.log("Attempting to parse service account JSON...");

      // Extremely robust parsing
      let cleaned = serviceAccountJson.trim();
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        cleaned = cleaned.substring(firstBrace, lastBrace + 1);
      }

      const serviceAccount = JSON.parse(cleaned);

      if (serviceAccount.private_key) {
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
      }
      
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log("Firebase Admin initialized successfully.");
    } else {
      admin.initializeApp();
      console.warn("Firebase Admin initialized with default credentials.");
    }
  } catch (err: any) {
    console.error("Firebase Admin initialization error:", err.message);
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      console.log("First 20 chars of ENV:", process.env.FIREBASE_SERVICE_ACCOUNT.substring(0, 20));
    }
  }
}

const db = admin.firestore();

const app = express();
const PORT = parseInt(process.env.PORT || "3001", 10);

app.use(cors({ origin: '*' }));

// We need raw body for CloudPayments HMAC verification
app.use(express.json({
  verify: (req: any, res, buf) => {
    req.rawBody = buf.toString();
  }
}));

// API Routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// --- CLOUDPAYMENTS WEBHOOK ---
app.post("/api/payments/cloudpayments/callback", async (req: any, res) => {
  const secret = process.env.CLOUDPAYMENTS_SECRET || '847850a707d0054358e03fe166a8c6e6';
  const headerHmac = req.get('Content-HMAC') || req.get('X-Content-HMAC');

  if (!headerHmac) {
    console.warn('Missing CloudPayments signature');
    return res.status(401).json({ code: 1, message: 'Missing signature' });
  }

  const hmac = crypto.createHmac('sha256', secret);
  const expectedHmac = hmac.update(req.rawBody).digest('base64');

  if (headerHmac !== expectedHmac) {
    console.error('Invalid CloudPayments signature');
    return res.status(403).json({ code: 1, message: 'Invalid signature' });
  }

  const data = req.body;
  const uid = data.AccountId;
  const amount = Number(data.Amount);

  if (!uid) {
    return res.json({ code: 1, message: 'Missing AccountId' });
  }

  try {
    const userRef = db.collection('users').doc(uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return res.json({ code: 1, message: 'User not found' });
    }

    if (data.Status === 'Completed') {
      await db.runTransaction(async (transaction) => {
        const privateDataRef = userRef.collection('private').doc('data');
        const privateSnap = await transaction.get(privateDataRef);

        if (!privateSnap.exists) {
          transaction.set(privateDataRef, { balance: amount, email: '' });
        } else {
          transaction.update(privateDataRef, {
            balance: admin.firestore.FieldValue.increment(amount)
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

// --- CONTACT REQUESTS LOGIC ---
// Helper for push notifications
async function sendPushNotification(uid: string, title: string, body: string, data: any = {}) {
  try {
    const userDoc = await db.collection('users').doc(uid).get();
    const userData = userDoc.data() as any;
    if (userData?.fcmTokens && userData.fcmTokens.length > 0) {
      await admin.messaging().sendEachForMulticast({
        tokens: userData.fcmTokens,
        notification: { title, body },
        data: data
      });
    }
  } catch (err) {
    console.error("Push notification error:", err);
  }
}

app.post("/api/requests/create", async (req, res) => {
  const { fromUid, toUid, price, teamId } = req.body;

  if (!fromUid || !toUid) return res.status(400).json({ error: "Missing uids" });
  if (fromUid === toUid) return res.status(400).json({ error: "Cannot request self" });

  try {
    const result = await db.runTransaction(async (transaction) => {
      const fromUserPrivateRef = db.collection('users').doc(fromUid).collection('private').doc('data');
      const fromUserSnap = await transaction.get(fromUserPrivateRef);

      if (!fromUserSnap.exists) throw new Error("Sender not found");
      const balance = fromUserSnap.data()?.balance || 0;
      if (balance < price) throw new Error("Insufficient funds");

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

      transaction.update(fromUserPrivateRef, {
        balance: admin.firestore.FieldValue.increment(-price),
        heldBalance: admin.firestore.FieldValue.increment(price)
      });

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
      return { requestId: requestRef.id, toUid, fromName: requestData.fromName };
    });

    await sendPushNotification(result.toUid, 'Новая заявка', `${result.fromName} отправил(а) вам заявку`, { requestId: result.requestId });
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/requests/resolve", async (req, res) => {
  const { uid, requestId, status } = req.body; // uid is the resolver (toUid)

  try {
    const result = await db.runTransaction(async (transaction) => {
      const requestRef = db.collection('contactRequests').doc(requestId);
      const requestSnap = await transaction.get(requestRef);

      if (!requestSnap.exists) throw new Error("Request not found");
      const requestData = requestSnap.data() as any;

      if (requestData.toUid !== uid) throw new Error("Not authorized");
      if (requestData.status !== 'pending') throw new Error("Already resolved");

      const fromUserPrivateRef = db.collection('users').doc(requestData.fromUid).collection('private').doc('data');

      if (status === 'rejected') {
        transaction.update(fromUserPrivateRef, {
          heldBalance: admin.firestore.FieldValue.increment(-requestData.price),
          balance: admin.firestore.FieldValue.increment(requestData.price)
        });
      } else if (status === 'accepted') {
        transaction.update(fromUserPrivateRef, {
          heldBalance: admin.firestore.FieldValue.increment(-requestData.price)
        });

        if (requestData.price > 0) {
          const txRef = db.collection('transactions').doc();
          transaction.set(txRef, {
            id: txRef.id,
            uid: requestData.fromUid,
            amount: -requestData.price,
            type: 'payment',
            description: 'Оплата за контакт ' + requestData.toUid,
            createdAt: new Date().toISOString()
          });
        }
      }

      transaction.update(requestRef, { status });
      return { fromUid: requestData.fromUid, status };
    });

    if (result.status === 'accepted') {
      await sendPushNotification(result.fromUid, 'Заявка принята!', 'Ваша заявка подтверждена, чат открыт', { requestId });
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- ADMIN / TEST TOPUP ---
app.post("/api/wallet/topup", async (req, res) => {
  const { uid, amount } = req.body;
  try {
    const userPrivateRef = db.collection('users').doc(uid).collection('private').doc('data');
    await userPrivateRef.update({
      balance: admin.firestore.FieldValue.increment(amount)
    });

    const txRef = db.collection('transactions').doc();
    await txRef.set({
      id: txRef.id,
      uid,
      amount,
      type: 'topup',
      description: 'Тестовое пополнение',
      createdAt: new Date().toISOString()
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Backend server running on http://0.0.0.0:${PORT}`);
});
