import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import * as admin from "firebase-admin";
import crypto from "crypto";

dotenv.config();

// Initialize Firebase Admin
let isFirebaseInitialized = false;

try {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (serviceAccountJson) {
    console.log("Attempting to parse service account JSON...");

    let cleaned = serviceAccountJson.trim();

    // Remove potential outer quotes if Render added them
    if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
      cleaned = cleaned.substring(1, cleaned.length - 1);
    }

    // Force add braces if they are missing but content looks like JSON
    if (!cleaned.startsWith('{') && cleaned.includes('"type":')) {
      console.log("Braces seem to be missing, adding them manually...");
      cleaned = '{' + cleaned + '}';
    }

    // Extract everything between first { and last }
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }

    const serviceAccount = JSON.parse(cleaned);

    if (serviceAccount.private_key) {
      // Fix double-escaped newlines common in some ENV environments
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    isFirebaseInitialized = true;
    console.log("Firebase Admin initialized successfully.");
  } else {
    admin.initializeApp();
    isFirebaseInitialized = true;
    console.warn("Firebase Admin initialized with default credentials.");
  }
} catch (err: any) {
  console.error("Firebase Admin initialization error:", err.message);
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.log("First 20 chars of ENV:", process.env.FIREBASE_SERVICE_ACCOUNT.substring(0, 20));
  }
}

const db = isFirebaseInitialized ? admin.firestore() : null;

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
  res.json({
    status: "ok",
    firebase: isFirebaseInitialized ? "connected" : "error"
  });
});

// OAuth Public Config Endpoint
app.get("/api/auth/config", (req, res) => {
  res.json({
    vkClientId: process.env.VK_CLIENT_ID || "",
    yandexClientId: process.env.YANDEX_CLIENT_ID || ""
  });
});

// OAuth Callback Endpoint
app.post("/api/auth/callback", async (req, res) => {
  const { provider, code, redirectUri } = req.body;

  if (!provider || !code) {
    return res.status(400).json({ error: "Missing provider or code" });
  }

  try {
    let uid = "";
    let displayName = "";
    let photoURL = "";
    let email = "";

    if (provider === "yandex") {
      const clientId = process.env.YANDEX_CLIENT_ID;
      const clientSecret = process.env.YANDEX_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        throw new Error("Yandex credentials are not configured on server.");
      }

      // Exchange code for token
      const tokenResponse = await fetch("https://oauth.yandex.ru/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          client_id: clientId,
          client_secret: clientSecret,
        }).toString(),
      });

      if (!tokenResponse.ok) {
        const errText = await tokenResponse.text();
        console.error("Yandex token exchange error response:", errText);
        throw new Error(`Failed to exchange Yandex code: ${tokenResponse.statusText}`);
      }

      const tokenData = await tokenResponse.json() as { access_token: string };
      const accessToken = tokenData.access_token;

      // Fetch user info
      const infoResponse = await fetch("https://login.yandex.ru/info?format=json", {
        headers: { Authorization: `OAuth ${accessToken}` },
      });

      if (!infoResponse.ok) {
        throw new Error(`Failed to fetch Yandex user info: ${infoResponse.statusText}`);
      }

      const infoData = await infoResponse.json() as {
        id: string;
        real_name?: string;
        display_name?: string;
        default_email?: string;
        default_avatar_id?: string;
        is_avatar_empty?: boolean;
      };

      uid = `yandex:${infoData.id}`;
      displayName = infoData.real_name || infoData.display_name || "Yandex User";
      email = infoData.default_email || "";
      if (infoData.default_avatar_id && !infoData.is_avatar_empty) {
        photoURL = `https://avatars.yandex.net/get-yapic/${infoData.default_avatar_id}/islands-200`;
      }
    } else if (provider === "vk") {
      const clientId = process.env.VK_CLIENT_ID;
      const clientSecret = process.env.VK_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        throw new Error("VK credentials are not configured on server.");
      }

      // Exchange code for token
      const tokenResponse = await fetch("https://oauth.vk.com/access_token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          code,
        }).toString(),
      });

      if (!tokenResponse.ok) {
        const errText = await tokenResponse.text();
        console.error("VK token exchange error response:", errText);
        throw new Error(`Failed to exchange VK code: ${tokenResponse.statusText}`);
      }

      const tokenData = await tokenResponse.json() as {
        access_token: string;
        user_id: number;
        email?: string;
      };
      const accessToken = tokenData.access_token;
      const vkUserId = tokenData.user_id;
      email = tokenData.email || "";

      // Fetch user info
      const infoResponse = await fetch(
        `https://api.vk.com/method/users.get?user_ids=${vkUserId}&fields=photo_200,first_name,last_name&access_token=${accessToken}&v=5.131`
      );

      if (!infoResponse.ok) {
        throw new Error(`Failed to fetch VK user info: ${infoResponse.statusText}`);
      }

      const infoData = await infoResponse.json() as {
        response?: {
          id: number;
          first_name: string;
          last_name: string;
          photo_200?: string;
        }[];
      };

      const vkUser = infoData.response?.[0];
      if (!vkUser) {
        throw new Error("VK user info response was empty");
      }

      uid = `vk:${vkUser.id}`;
      displayName = `${vkUser.first_name} ${vkUser.last_name}`.trim();
      photoURL = vkUser.photo_200 || "";
    } else {
      return res.status(400).json({ error: "Unsupported provider" });
    }

    // Check if Firebase Auth user exists, otherwise create them
    let firebaseUser;
    try {
      firebaseUser = await admin.auth().getUser(uid);

      // Update properties if changed
      const updateData: any = {};
      if (displayName && firebaseUser.displayName !== displayName) updateData.displayName = displayName;
      if (photoURL && firebaseUser.photoURL !== photoURL) updateData.photoURL = photoURL;
      if (email && firebaseUser.email !== email) updateData.email = email;

      if (Object.keys(updateData).length > 0) {
        firebaseUser = await admin.auth().updateUser(uid, updateData);
      }
    } catch (e: any) {
      if (e.code === "auth/user-not-found") {
        firebaseUser = await admin.auth().createUser({
          uid,
          displayName,
          photoURL: photoURL || undefined,
          email: email || undefined,
        });
      } else {
        throw e;
      }
    }

    // Generate Custom Token
    const customToken = await admin.auth().createCustomToken(uid);
    res.json({ customToken, user: firebaseUser });
  } catch (err: any) {
    console.error(`OAuth callback failed for provider ${provider}:`, err);
    res.status(500).json({ error: err.message || "OAuth exchange failed" });
  }
});

// --- CLOUDPAYMENTS WEBHOOK ---
app.post("/api/payments/cloudpayments/callback", async (req: any, res) => {
  if (!db) return res.status(500).json({ error: "Database not initialized" });

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
  if (!db) return;
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
  if (!db) return res.status(500).json({ error: "Database not initialized" });

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
        requestData.teamId = requestRef.id; // Corrected: teamId should be the request id or provided teamId
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
  if (!db) return res.status(500).json({ error: "Database not initialized" });

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
  if (!db) return res.status(500).json({ error: "Database not initialized" });

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
