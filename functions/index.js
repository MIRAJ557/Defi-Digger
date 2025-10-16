const functions = require("firebase-functions");
const admin = require("firebase-admin");
const TelegramBot = require("node-telegram-bot-api");

// Firebase Admin ইনিশিয়ালাইজেশন
admin.initializeApp();
const db = admin.firestore();

// কনফিগারেশন (গোপন তথ্যগুলো এখান থেকে সরিয়ে দেওয়া হয়েছে)
const CONFIG = {
    BOT_USERNAME: "Defidiggermining_bot", 
    WELCOME_BONUS: 10,
    REFERRAL_BONUS: 5,
    WEB_APP_URL: "https://defi-digger.web.app",
    OFFICIAL_WEBSITE: "https://your-official-website.com"
};

// ✅ সমাধান: বট ইনস্ট্যান্সটি এখানে তৈরি করা হবে, কিন্তু টোকেন পরে দেওয়া হবে
let bot; 
const getBotInstance = () => {
    if (!bot) {
        // টোকেনটি শুধু তখনই লোড হবে যখন প্রথমবার দরকার হবে
        const token = functions.config().telegram.token;
        if (token) {
            bot = new TelegramBot(token);
        } else {
            console.error("FATAL: Telegram Token not found in Firebase config. Please run 'firebase functions:config:set telegram.token=...'");
        }
    }
    return bot;
};

// ইউটিলিটি ফাংশন (আপনার লেখা, কোনো পরিবর্তন নেই)
class UserService {
    static generateUserId(telegramId) {
        return `tg_${telegramId}`;
    }

    static extractReferrerId(text) {
        const parts = text.split(" ");
        if (parts.length > 1 && parts[1].startsWith("ref_")) {
            const referrerTgId = parts[1].replace("ref_", "");
            return this.generateUserId(referrerTgId);
        }
        return null;
    }

    static createUserData(userId, referrerId = null) {
        const userData = {
            userId: userId,
            csBalance: CONFIG.WELCOME_BONUS,
            usdBalance: 0,
            hashPower: 10,
            dailyUsdReward: 0,
            purchasedPackages: [],
            referralCount: 0,
            userLevel: 1,
            userXP: 0,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            lastPassiveUpdate: admin.firestore.FieldValue.serverTimestamp(),
            telegramData: {
                firstName: null,
                username: null,
                lastActive: admin.firestore.FieldValue.serverTimestamp()
            }
        };
        if (referrerId && referrerId !== userId) {
            userData.referredBy = referrerId;
        }
        return userData;
    }
}

// ভ্যালিডেশন ফাংশন (আপনার লেখা, কোনো পরিবর্তন নেই)
const validateTelegramMessage = (message) => {
    if (!message || !message.text || !message.chat || !message.from) {
        throw new Error("Invalid Telegram message structure");
    }
    return true;
};

// রেফারেল প্রসেসিং (আপনার লেখা, কোনো পরিবর্তন নেই)
const processReferral = async (userId, referrerId) => {
    if (!referrerId || referrerId === userId) return;

    const referrerRef = db.collection("users").doc(referrerId);
    
    try {
        await db.runTransaction(async (transaction) => {
            const referrerDoc = await transaction.get(referrerRef);
            if (!referrerDoc.exists) {
                console.log(`Referrer ${referrerId} not found`);
                return;
            }
            transaction.update(referrerRef, {
                referralCount: admin.firestore.FieldValue.increment(1),
                csBalance: admin.firestore.FieldValue.increment(CONFIG.REFERRAL_BONUS),
                "telegramData.lastActive": admin.firestore.FieldValue.serverTimestamp()
            });
        });
        console.log(`Successfully processed referral: ${userId} referred by ${referrerId}`);
    } catch (error) {
        console.error(`Error processing referral for ${referrerId}:`, error);
        throw error;
    }
};

// টেলিগ্রাম মেসেজ সেন্ডিং সার্ভিস
class TelegramService {
    static async sendWelcomeMessage(chatId, firstName, userId) {
        const localBot = getBotInstance();
        if (!localBot) {
            console.error("Welcome message not sent because bot is not initialized.");
            return;
        }

        const welcomeText = this.getWelcomeMessage(firstName);
        const webAppUrl = `${CONFIG.WEB_APP_URL}?userId=${userId}`;
        const referralLink = `https://t.me/share/url?url=https://t.me/${CONFIG.BOT_USERNAME}?start=ref_${userId.replace('tg_','')}`;

        try {
            await localBot.sendMessage(chatId, welcomeText, {
                parse_mode: "HTML",
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "🚀 Start Mining!", web_app: { url: webAppUrl } }],
                        [{ text: "📊 My Dashboard", callback_data: "dashboard" }],
                        [{ text: "👥 Refer Friends", url: referralLink }],
                        [{ text: "🌐 Official Website", url: CONFIG.OFFICIAL_WEBSITE }]
                    ]
                }
            });
        } catch (error) {
            console.error(`Failed to send welcome message to ${chatId}:`, error);
            throw error;
        }
    }

    static getWelcomeMessage(firstName) {
        return `👋 Hey, <b>${firstName}</b>! Welcome to <b>Defi Digger</b>!\n\n💰 Tap on the coin and watch your balance grow!\n\n<b>Coin Switch</b> is a cutting-edge financial platform where users can earn tokens through various mining app features. The majority of Coin Switch Token (CS) distribution will occur among our players.\n\n🤝 <b>Referral Program:</b>\nBring your friends, relatives, and co-workers to the app! More buddies = more coins!\n\n🎁 <b>You've received:</b>\n• ${CONFIG.WELCOME_BONUS} CS Welcome Bonus\n• 10 Hash Power to start mining\n\nStart your mining journey now!`;
    }
}

// ------------------------------------------------------------------
// ফাংশন ১: টেলিগ্রাম ওয়েবহুক (আপনার লেখা, সামান্য পরিবর্তন)
// ------------------------------------------------------------------
exports.telegramWebhook = functions.https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(204).send('');
    }

    try {
        const message = req.body.message;
        validateTelegramMessage(message);

        const chatId = message.chat.id;
        const userId = UserService.generateUserId(message.from.id);
        const firstName = message.from.first_name || 'there';
        const text = message.text;

        if (text.startsWith("/start")) {
            const referrerId = UserService.extractReferrerId(text);
            const userRef = db.collection("users").doc(userId);
            const userDoc = await userRef.get();

            if (!userDoc.exists) {
                console.log(`Creating new user: ${userId}`);
                const newUser = UserService.createUserData(userId, referrerId);
                newUser.telegramData = {
                    firstName: message.from.first_name,
                    username: message.from.username,
                    lastActive: admin.firestore.FieldValue.serverTimestamp()
                };
                await userRef.set(newUser);
                if (referrerId) {
                    await processReferral(userId, referrerId);
                }
                console.log(`New user created successfully: ${userId}`);
            } else {
                await userRef.update({ "telegramData.lastActive": admin.firestore.FieldValue.serverTimestamp() });
                console.log(`Existing user updated: ${userId}`);
            }
            await TelegramService.sendWelcomeMessage(chatId, firstName, userId);
        }
        return res.status(200).json({ status: "success" });
    } catch (error) {
        console.error("Error in telegramWebhook:", error);
        return res.status(500).json({ status: "error", message: "Internal server error" });
    }
});

// ------------------------------------------------------------------
// ফাংশন ২: ব্রডকাস্ট মেসেজ (উন্নত সংস্করণ)
// ------------------------------------------------------------------
exports.broadcastMessageToUsers = functions.https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        return res.status(204).send('');
    }

    try {
        // ✅ সমাধান: ফাংশন শুরু হওয়ার পর গোপন কী লোড করা হচ্ছে
        const BROADCAST_SECRET_KEY = functions.config().broadcast.secret;
        if (!BROADCAST_SECRET_KEY) {
            console.error("FATAL: Broadcast secret key not found in config.");
            return res.status(500).json({ error: "Configuration error" });
        }
        
        const providedKey = req.query.key || req.body.key;
        if (providedKey !== BROADCAST_SECRET_KEY) {
            console.warn("Unauthorized broadcast attempt");
            return res.status(403).json({ error: "Unauthorized", message: "Invalid secret key" });
        }

        const message = req.query.message || req.body.message;
        if (!message || message.trim().length === 0) {
            return res.status(400).json({ error: "Bad Request", message: "Message parameter is required and cannot be empty" });
        }
        
        const localBot = getBotInstance();
        if (!localBot) {
            return res.status(500).json({ error: "Bot not initialized" });
        }

        console.log("Starting broadcast...");
        const usersSnapshot = await db.collection("users").get();
        if (usersSnapshot.empty) {
            return res.status(200).json({ message: "No users found for broadcasting", totalUsers: 0 });
        }

        const broadcastResults = {
            totalUsers: usersSnapshot.size,
            successful: 0,
            failed: 0,
            errors: []
        };
        const BATCH_SIZE = 30;
        const userBatches = [];
        for (let i = 0; i < usersSnapshot.docs.length; i += BATCH_SIZE) {
            userBatches.push(usersSnapshot.docs.slice(i, i + BATCH_SIZE));
        }

        for (const [batchIndex, batch] of userBatches.entries()) {
            console.log(`Processing batch ${batchIndex + 1}/${userBatches.length}`);
            const batchPromises = batch.map(async (doc) => {
                const userData = doc.data();
                const chatId = userData.userId?.replace('tg_', '');
                if (!chatId) {
                    broadcastResults.failed++;
                    return;
                }
                try {
                    await localBot.sendMessage(chatId, message.trim(), { parse_mode: "Markdown", disable_web_page_preview: true });
                    broadcastResults.successful++;
                    await doc.ref.update({ "telegramData.lastActive": admin.firestore.FieldValue.serverTimestamp() });
                } catch (error) {
                    broadcastResults.failed++;
                    broadcastResults.errors.push({ userId: userData.userId, error: error.message });
                    if (error.response?.statusCode === 403) {
                        console.log(`User ${userData.userId} has blocked the bot`);
                    }
                }
            });
            await Promise.allSettled(batchPromises);
            if (batchIndex < userBatches.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        const summary = {
            message: "Broadcast completed",
            totalUsers: broadcastResults.totalUsers,
            successful: broadcastResults.successful,
            failed: broadcastResults.failed,
            successRate: `${((broadcastResults.successful / broadcastResults.totalUsers) * 100).toFixed(2)}%`
        };
        console.log("Broadcast summary:", summary);
        return res.status(200).json(summary);
    } catch (error) {
        console.error("Error in broadcastMessageToUsers:", error);
        return res.status(500).json({ error: "Internal Server Error", message: "An error occurred during broadcast" });
    }
});

// ------------------------------------------------------------------
// ফাংশন ৩: রেফারেল স্ট্যাটাস চেক (আপনার লেখা, সামান্য পরিবর্তন)
// ------------------------------------------------------------------
exports.getReferralStatus = functions.https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    try {
        const userId = req.query.userId;
        if (!userId) {
            return res.status(400).json({ error: "User ID is required" });
        }
        const userRef = db.collection("users").doc(userId);
        const userDoc = await userRef.get();
        if (!userDoc.exists) {
            return res.status(404).json({ error: "User not found" });
        }
        const userData = userDoc.data();
        const referralStats = {
            referralCount: userData.referralCount || 0,
            totalEarned: (userData.referralCount || 0) * CONFIG.REFERRAL_BONUS,
            referralLink: `https://t.me/${CONFIG.BOT_USERNAME}?start=ref_${userId.replace('tg_', '')}`
        };
        return res.status(200).json(referralStats);
    } catch (error) {
        console.error("Error in getReferralStatus:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});