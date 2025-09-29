const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

admin.initializeApp();
const db = admin.firestore();

// আপনার টেলিগ্রাম বটের টোকেন এখানে বসান
// এটি @BotFather থেকে পাবেন
 const TELEGRAM_BOT_TOKEN = "8467919816:AAGnzm3Bp14A4s45LIU5UEe5D0lTOsXofGw";

// এই ফাংশনটি তখনই চলবে যখন টেলিগ্রাম থেকে কোনো মেসেজ আসবে
exports.telegramWebhook = functions.https.onRequest(async (req, res) => {
    const message = req.body.message;

    // নিশ্চিত করুন যে এটি একটি টেক্সট মেসেজ
    if (!message || !message.text) {
        return res.sendStatus(200); // মেসেজটি ইগনোর করুন
    }

    const chatId = message.chat.id;
    const userId = `tg_${message.from.id}`;
    const text = message.text;

    // "/start" কমান্ড চেক করুন
    if (text.startsWith("/start")) {
        let referrerId = null;

        // রেফারেল কোড আছে কিনা দেখুন
        const parts = text.split(" ");
        if (parts.length > 1 && parts[1].startsWith("ref_")) {
            const referrerTgId = parts[1].replace("ref_", "");
            referrerId = `tg_${referrerTgId}`;
        }

        const userRef = db.collection("users").doc(userId);
        const userDoc = await userRef.get();

        if (!userDoc.exists) {
            // এটি একজন নতুন ব্যবহারকারী
            console.log(`New user found: ${userId}`);

            const newUser = {
                userId: userId,
                csBalance: 0,
                usdBalance: 0,
                hashPower: 10,
                dailyUsdReward: 0,
                lastTapTime: 0,
                purchasedPackages: [],
                referralCount: 0,
                lastPassiveUpdate: admin.firestore.FieldValue.serverTimestamp(),
                userLevel: 1,
                userXP: 0,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            };

            if (referrerId && referrerId !== userId) {
                newUser.referredBy = referrerId;
                console.log(`User ${userId} was referred by ${referrerId}`);

                // রেফারারের referralCount বাড়িয়ে দিন
                const referrerRef = db.collection("users").doc(referrerId);
                await referrerRef.update({
                    referralCount: admin.firestore.FieldValue.increment(1),
                });
                console.log(`Incremented referral count for ${referrerId}`);
            }

            // নতুন ব্যবহারকারীর ডেটা ডাটাবেসে সেভ করুন
            await userRef.set(newUser);
            
        } else {
            console.log(`Existing user returned: ${userId}`);
        }
        
        // ব্যবহারকারীকে একটি স্বাগত বার্তা পাঠান (ঐচ্ছিক)
        await axios.post(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
            {
                chat_id: chatId,
                text: "Welcome to Coin Switch! Click the button below to start mining.",
                // এখানে আপনার ওয়েব অ্যাপ খোলার জন্য একটি বাটন যোগ করতে পারেন
            }
        );
    }

    // টেলিগ্রামকে জানান যে আমরা মেসেজটি পেয়েছি
    return res.sendStatus(200);
});