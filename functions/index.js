const functions = require('firebase-functions');
const admin = require('firebase-admin');
const TelegramBot = require('node-telegram-bot-api');

admin.initializeApp();
const db = admin.firestore();

const TELEGRAM_BOT_TOKEN = '8467919816:AAGnzm3Bp14A4s45LIU5UEe5D0lTOsXofGw';
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN);

// ===================================================================
// উন্নত Telegram Webhook Function
// ===================================================================
exports.telegramWebhook = functions.https.onRequest(async (req, res) => {
    try {
        console.log('Webhook received:', JSON.stringify(req.body));
        
        const message = req.body.message || req.body.edited_message;
        
        if (!message || !message.text) {
            console.log("No message text found");
            return res.status(200).send('OK');
        }

        const chatId = message.chat.id;
        const userId = `tg_${message.from.id}`;
        const firstName = message.from.first_name || 'User';
        const username = message.from.username || '';
        
        console.log(`Processing message from ${userId}: ${message.text}`);

        // /start কমান্ড হ্যান্ডলিং
        if (message.text.startsWith('/start')) {
            await handleStartCommand(userId, chatId, firstName, username, message.text);
        }
        
        // অন্যান্য কমান্ড হ্যান্ডলিং
        else if (message.text.startsWith('/help')) {
            await handleHelpCommand(chatId, firstName);
        }
        else if (message.text.startsWith('/balance')) {
            await handleBalanceCommand(userId, chatId);
        }
        else {
            await handleUnknownCommand(chatId);
        }

    } catch (error) {
        console.error('Error in telegramWebhook:', error);
    }
    
    return res.status(200).send('OK');
});

// ===================================================================
// কমান্ড হ্যান্ডলার ফাংশনগুলো
// ===================================================================
async function handleStartCommand(userId, chatId, firstName, username, commandText) {
    try {
        console.log(`Handling start command for user: ${userId}`);
        
        const userRef = db.collection('users').doc(userId);
        const userDoc = await userRef.get();
        
        // রেফারেল কোড এক্সট্র্যাক্ট করা
        const referrerId = extractReferralCode(commandText);
        
        const userData = {
            telegramId: chatId,
            telegramUsername: username,
            firstName: firstName,
            lastName: '',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            lastLogin: admin.firestore.FieldValue.serverTimestamp(),
            csBalance: 10,
            usdBalance: 0,
            hashPower: 10,
            userLevel: 1,
            userXP: 0,
            purchasedPackages: [],
            referralCount: 0,
            referredBy: referrerId || null
        };

        if (userDoc.exists) {
            // Existing user - update last login
            await userRef.update({
                lastLogin: admin.firestore.FieldValue.serverTimestamp(),
                telegramUsername: username
            });
            
            console.log(`User ${userId} updated`);
            
            const welcomeBackText = `👋 Welcome back, ${firstName}!\n\nYour mining journey continues! Tap below to start mining and earn more CS tokens.`;
            
            await sendMessageWithButtons(chatId, welcomeBackText);
        } else {
            // New user - create document
            await userRef.set(userData);
            console.log(`New user ${userId} created`);
            
            // রেফারেল বোনাস প্রসেস করা
            if (referrerId) {
                await processReferralBonus(userId, referrerId, firstName);
            }
            
            const welcomeText = `🎉 Hey ${firstName}! Welcome to Defi Digger!\n\n💰 *Start Mining*: Tap the button below to start earning CS tokens\n👥 *Refer Friends*: Share your referral link to earn bonuses\n📈 *Grow Faster*: Upgrade your mining power\n\n*Coin Switch* is a cutting-edge financial platform where users can earn tokens by leveraging various features.`;
            
            await sendMessageWithButtons(chatId, welcomeText);
            
            // রেফারেল লিঙ্ক সহ মেসেজ
            const referralLink = `https://t.me/Defidiggermining_bot?start=ref_${userId.replace('tg_', '')}`;
            const referralText = `📤 *Invite Friends & Earn More!*\n\nShare your referral link:\n\`${referralLink}\`\n\nYou'll get 5 CS tokens for each friend who joins!`;
            
            await bot.sendMessage(chatId, referralText, { parse_mode: 'Markdown' });
        }
        
    } catch (error) {
        console.error('Error in handleStartCommand:', error);
        await bot.sendMessage(chatId, '❌ Sorry, there was an error processing your request. Please try again.');
    }
}

async function handleHelpCommand(chatId, firstName) {
    const helpText = `🛠 *Help Center - Defi Digger*\n\n*/start* - Start bot & open mining app\n*/balance* - Check your balance\n*/help* - Show this help message\n\n💡 *Tips:*\n• Mine daily to maximize earnings\n• Invite friends for referral bonuses\n• Upgrade your mining power for better returns`;
    
    await bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown' });
}

async function handleBalanceCommand(userId, chatId) {
    try {
        const userDoc = await db.collection('users').doc(userId).get();
        
        if (!userDoc.exists) {
            await bot.sendMessage(chatId, '❌ User not found. Please send /start first.');
            return;
        }
        
        const userData = userDoc.data();
        const balanceText = `💰 *Your Balance*\n\nCS Tokens: ${userData.csBalance || 0}\nUSD Balance: $${userData.usdBalance || 0}\nHash Power: ${userData.hashPower || 0}\nLevel: ${userData.userLevel || 1}\nReferrals: ${userData.referralCount || 0}`;
        
        await bot.sendMessage(chatId, balanceText, { parse_mode: 'Markdown' });
    } catch (error) {
        console.error('Error in handleBalanceCommand:', error);
        await bot.sendMessage(chatId, '❌ Error fetching balance. Please try again.');
    }
}

async function handleUnknownCommand(chatId) {
    const unknownText = `🤔 I didn't understand that command.\n\nTry one of these:\n/start - Start mining\n/balance - Check balance\n/help - Get help`;
    
    await bot.sendMessage(chatId, unknownText);
}

// ===================================================================
// ইউটিলিটি ফাংশনগুলো
// ===================================================================
function extractReferralCode(commandText) {
    const parts = commandText.split(' ');
    if (parts.length > 1 && parts[1].startsWith('ref_')) {
        const refCode = parts[1].replace('ref_', '');
        return `tg_${refCode}`;
    }
    return null;
}

async function sendMessageWithButtons(chatId, text) {
    const options = {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [
                    { 
                        text: '🚀 Start Mining', 
                        web_app: { 
                            url: 'https://defi-digger.web.app' 
                        } 
                    }
                ],
                [
                    { 
                        text: '📊 My Dashboard', 
                        web_app: { 
                            url: 'https://defi-digger.web.app/dashboard' 
                        } 
                    },
                    { 
                        text: '👥 Refer Friends', 
                        web_app: { 
                            url: 'https://defi-digger.web.app/referral' 
                        } 
                    }
                ],
                [
                    { 
                        text: '🌐 Official Website', 
                        url: 'https://your-official-website.com' 
                    }
                ]
            ]
        }
    };
    
    await bot.sendMessage(chatId, text, options);
}

// ===================================================================
// উন্নত রেফারেল সিস্টেম
// ===================================================================
exports.detectAndProcessReferral = functions.firestore
    .document('users/{userId}')
    .onCreate(async (snapshot, context) => {
        try {
            const newUserData = snapshot.data();
            const newUserId = context.params.userId;
            const referrerId = newUserData.referredBy || null;

            console.log(`Processing referral for new user: ${newUserId}, referred by: ${referrerId}`);

            if (!referrerId || referrerId === newUserId) {
                console.log('No valid referrer found');
                return null;
            }

            const referrerRef = db.collection('users').doc(referrerId);
            const newUserRef = snapshot.ref;

            await db.runTransaction(async (transaction) => {
                const referrerDoc = await transaction.get(referrerRef);
                
                if (!referrerDoc.exists) {
                    console.log(`Referrer ${referrerId} not found`);
                    return;
                }

                const referralBonusCS = 5;
                const welcomeBonusCS = 2;

                // রেফারারকে বোনাস দেওয়া
                transaction.update(referrerRef, {
                    referralCount: admin.firestore.FieldValue.increment(1),
                    csBalance: admin.firestore.FieldValue.increment(referralBonusCS),
                    hashPower: admin.firestore.FieldValue.increment(1) // অতিরিক্ত বোনাস
                });

                // নতুন ইউজারকে ওয়েলকাম বোনাস
                transaction.update(newUserRef, {
                    csBalance: admin.firestore.FieldValue.increment(welcomeBonusCS)
                });

                // ট্রানজ্যাকশন হিস্ট্রি
                const referrerTransactionRef = db.collection('transactions').doc();
                transaction.set(referrerTransactionRef, {
                    userId: referrerId,
                    type: 'referral_bonus',
                    amount: referralBonusCS,
                    description: `Referral bonus for inviting ${newUserData.firstName || 'new user'}`,
                    status: 'completed',
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                });

                const newUserTransactionRef = db.collection('transactions').doc();
                transaction.set(newUserTransactionRef, {
                    userId: newUserId,
                    type: 'welcome_bonus',
                    amount: welcomeBonusCS,
                    description: `Welcome bonus for joining via referral`,
                    status: 'completed',
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                });
            });

            console.log(`Referral processed successfully for ${newUserId}`);

            // রেফারারকে নোটিফিকেশন
            const referrerData = (await referrerRef.get()).data();
            if (referrerData && referrerData.telegramId) {
                try {
                    await bot.sendMessage(
                        referrerData.telegramId,
                        `🎉 Congratulations! You received ${referralBonusCS} CS tokens and +1 hash power for referring ${newUserData.firstName || 'a new user'}!`
                    );
                } catch (error) {
                    console.log('Could not send notification to referrer:', error.message);
                }
            }

        } catch (error) {
            console.error('Error in referral processing:', error);
        }
        
        return null;
    });

// ===================================================================
// উন্নত ব্রডকাস্ট সিস্টেম
// ===================================================================
exports.broadcastMessage = functions.runWith({ 
    timeoutSeconds: 540, 
    memory: '1GB' 
}).https.onCall(async (data, context) => {
    // Authentication check
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
    }

    // Admin verification
    const adminDoc = await db.collection('admins').doc(context.auth.uid).get();
    if (!adminDoc.exists || !adminDoc.data().isAdmin) {
        throw new functions.https.HttpsError('permission-denied', 'Admin access required.');
    }

    const { message, messageType = 'text' } = data;
    
    if (!message) {
        throw new functions.https.HttpsError('invalid-argument', 'Message text is required.');
    }

    try {
        const usersSnapshot = await db.collection('users')
            .where('telegramId', '!=', null)
            .get();

        const totalUsers = usersSnapshot.size;
        let successCount = 0;
        let failCount = 0;
        const failedUsers = [];

        console.log(`Starting broadcast to ${totalUsers} users`);

        // ব্যাচ প্রসেসিং for better performance
        const batchSize = 30;
        const batches = [];
        
        for (let i = 0; i < usersSnapshot.docs.length; i += batchSize) {
            batches.push(usersSnapshot.docs.slice(i, i + batchSize));
        }

        for (const batch of batches) {
            const batchPromises = batch.map(async (doc) => {
                const userData = doc.data();
                try {
                    let sentMessage;
                    
                    if (messageType === 'html') {
                        sentMessage = await bot.sendMessage(userData.telegramId, message, { 
                            parse_mode: 'HTML' 
                        });
                    } else if (messageType === 'markdown') {
                        sentMessage = await bot.sendMessage(userData.telegramId, message, { 
                            parse_mode: 'Markdown' 
                        });
                    } else {
                        sentMessage = await bot.sendMessage(userData.telegramId, message);
                    }
                    
                    successCount++;
                    console.log(`Sent to ${userData.telegramId}: success`);
                    return { success: true, userId: userData.telegramId };
                    
                } catch (error) {
                    failCount++;
                    failedUsers.push({
                        userId: userData.telegramId,
                        error: error.message
                    });
                    console.log(`Failed to send to ${userData.telegramId}: ${error.message}`);
                    return { success: false, userId: userData.telegramId, error: error.message };
                }
            });

            await Promise.all(batchPromises);
            // Rate limiting - avoid hitting Telegram limits
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        const result = {
            success: true,
            message: `Broadcast completed! Success: ${successCount}, Failed: ${failCount}, Total: ${totalUsers}`,
            stats: {
                total: totalUsers,
                success: successCount,
                failed: failCount
            },
            failedUsers: failedUsers.slice(0, 10) // প্রথম 10টি failed user
        };

        // Admin কে রিপোর্ট পাঠানো
        await bot.sendMessage(
            context.auth.uid, // Admin এর Telegram ID
            `📢 Broadcast Report:\n\n✅ Success: ${successCount}\n❌ Failed: ${failCount}\n📊 Total: ${totalUsers}`,
            { parse_mode: 'Markdown' }
        );

        return result;

    } catch (error) {
        console.error('Broadcast failed:', error);
        throw new functions.https.HttpsError('internal', 'Broadcast operation failed: ' + error.message);
    }
});

// ===================================================================
// স্বয়ংক্রিয় ব্যাকআপ ফাংশন
// ===================================================================
exports.scheduledUserStats = functions.pubsub.schedule('every 24 hours').onRun(async (context) => {
    try {
        const usersSnapshot = await db.collection('users').get();
        const totalUsers = usersSnapshot.size;
        
        const activeUsersSnapshot = await db.collection('users')
            .where('lastLogin', '>=', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
            .get();
        const activeUsers = activeUsersSnapshot.size;

        const stats = {
            totalUsers,
            activeUsers,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        };

        await db.collection('stats').doc('userStats').set(stats, { merge: true });
        console.log(`User stats updated: Total: ${totalUsers}, Active: ${activeUsers}`);
        
    } catch (error) {
        console.error('Error updating user stats:', error);
    }
});

// ===================================================================
// নতুন এবং সংশোধিত: Single Message Sender Function
// ===================================================================
exports.sendTelegramMessage = functions.https.onCall(async (data, context) => {
    // ব্যবহারকারী লগইন করা অ্যাডমিন কিনা তা চেক করা হচ্ছে
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
    }

    const adminDoc = await db.collection('admins').doc(context.auth.uid).get();
    if (!adminDoc.exists || !adminDoc.data().isAdmin) {
        throw new functions.https.HttpsError('permission-denied', 'Admin access required.');
    }

    const { telegramId, message, messageType } = data;

    if (!telegramId || !message) {
        throw new functions.https.HttpsError('invalid-argument', 'Telegram ID এবং মেসেজ আবশ্যক।');
    }

    try {
        const finalTelegramId = String(telegramId).replace('tg_', '');

        const options = {};
        let formattedMessage = message; // মেসেজটিকে একটি নতুন ভেরিয়েবলে রাখা হলো

        if (messageType === 'markdown') {
            options.parse_mode = 'Markdown';
        } else if (messageType === 'html') {
            options.parse_mode = 'HTML';
            // ★★★ মূল সমাধান এই লাইনটিতে ★★★
            // এই লাইনটি আপনার পাঠানো মেসেজ থেকে সকল <br> ট্যাগকে খুঁজে বের করে সেগুলোকে একটি নতুন লাইনে (\n) পরিণত করে দেবে।
            formattedMessage = message.replace(/<br\s*\/?>/gi, '\n');
        }

        // টেলিগ্রাম বটকে এখন ফরম্যাট করা মেসেজটি পাঠানো হচ্ছে
        await bot.sendMessage(finalTelegramId, formattedMessage, options);
        
        console.log(`সফলভাবে মেসেজ পাঠানো হয়েছে: ${finalTelegramId}`);
        return { success: true };

    } catch (error) {
        console.error(`মেসেজ পাঠাতে ব্যর্থ: ${telegramId}:`, error.message);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

// ===================================================================
// ★★★ ফাইনাল এবং প্রফেশনাল: Firebase কাস্টম টোকেন ফাংশন ★★★
// (পুরনোটা মুছে এটা পেস্ট করুন)
// ===================================================================
exports.getFirebaseTokenForUser = functions.https.onCall(async (data, context) => {
    if (!data || !data.telegramId) {
        throw new functions.https.HttpsError('invalid-argument', 'Telegram ID is required.');
    }

    const telegramId = String(data.telegramId).trim();
    const uid = `tg_${telegramId}`;

    try {
        // ধাপ ১: ইউজারের অস্তিত্ব চেক করা
        // getUser ফাংশনটি ব্যবহারকারী না থাকলে error throw করে
        await admin.auth().getUser(uid);
        console.log(`User ${uid} already exists. Generating token.`);

    } catch (error) {
        // যদি ব্যবহারকারী খুঁজে পাওয়া না যায় (auth/user-not-found)
        if (error.code === 'auth/user-not-found') {
            console.log(`User ${uid} not found. Creating new auth user...`);
            try {
                // ধাপ ২: শুধুমাত্র যদি না থাকে, তাহলেই নতুন ইউজার তৈরি করা
                await admin.auth().createUser({
                    uid: uid,
                    displayName: `Telegram User ${telegramId}`,
                });
                console.log(`Successfully created user: ${uid}`);
            } catch (createError) {
                // যদি একই সময়ে দুটি অনুরোধ এসে একটি ইউজার তৈরি করে ফেলে
                if (createError.code === 'auth/uid-already-exists') {
                    console.log(`User ${uid} was created by a parallel request. Continuing.`);
                } else {
                    // অন্য কোনো সমস্যা হলে error throw করা
                    console.error('Error creating user:', createError);
                    throw new functions.https.HttpsError('internal', 'Could not create Firebase user.');
                }
            }
        } else {
            // অন্য যেকোনো ধরনের error হলে (যেমন নেটওয়ার্ক সমস্যা)
            console.error('Error fetching user:', error);
            throw new functions.https.HttpsError('internal', 'Could not fetch Firebase user.');
        }
    }

    // ধাপ ৩: সবকিছু ঠিক থাকলে, কাস্টম টোকেন তৈরি এবং রিটার্ন করা
    try {
        const customToken = await admin.auth().createCustomToken(uid);
        console.log(`Successfully generated token for: ${uid}`);
        return { token: customToken };
    } catch (tokenError) {
        console.error('Error creating custom token:', tokenError);
        throw new functions.https.HttpsError('internal', 'Could not create custom token.');
    }
});

// =========================================================
// ★★★ অটোমেটিক ডেটা মাইগ্রেশন ফাংশন (রোবট) ★★★
// (এই সম্পূর্ণ কোডটি আপনার functions/index.js ফাইলের শেষে যোগ করুন)
// =========================================================

exports.migrateUserData = functions.https.onCall(async (data, context) => {
  // শুধুমাত্র অথেন্টিকেটেড অ্যাডমিন এই ফাংশনটি চালাতে পারবে
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
  }
  const adminDoc = await admin.firestore().collection('admins').doc(context.auth.uid).get();
  if (!adminDoc.exists || !adminDoc.data().isAdmin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required.');
  }

  console.log("=== ডেটা মাইগ্রেশন প্রক্রিয়া শুরু হলো ===");

  try {
    const firestore = admin.firestore();
    const auth = admin.auth();
    let migratedCount = 0;
    let errorCount = 0;
    const usersToMigrate = [];

    // Authentication থেকে সব ব্যবহারকারীর তালিকা আনা হচ্ছে
    const listUsersResult = await auth.listUsers(1000);

    // প্রথমে সব ব্যবহারকারীকে চেক করে মাইগ্রেশনের জন্য একটি তালিকা বানানো হচ্ছে
    for (const userRecord of listUsersResult.users) {
      const uid = userRecord.uid;

      // শুধুমাত্র নতুন এবং সঠিক ফরম্যাটের UID গুলো চেক করা হবে
      if (!uid.startsWith("tg_")) {
        const newUserDocRef = firestore.collection("users").doc(uid);
        const newUserDoc = await newUserDocRef.get();
        
        if (newUserDoc.exists && newUserDoc.data().telegramId) {
          usersToMigrate.push({
            uid: uid,
            telegramId: newUserDoc.data().telegramId,
          });
        }
      }
    }

    console.log(`মাইগ্রেশনের জন্য মোট ${usersToMigrate.length} জন ব্যবহারকারী পাওয়া গেছে।`);

    // এবার তালিকা অনুযায়ী এক এক করে মাইগ্রেশন করা হচ্ছে
    for (const user of usersToMigrate) {
      const { uid, telegramId } = user;
      const oldDocId = `tg_${telegramId}`;
      
      try {
        const oldUserDocRef = firestore.collection("users").doc(oldDocId);
        const oldUserDoc = await oldUserDocRef.get();

        if (oldUserDoc.exists) {
          console.log(`মাইগ্রেশন করা হচ্ছে: ${oldDocId} -> ${uid}`);
          
          const oldData = oldUserDoc.data();
          const newUserDocRef = firestore.collection("users").doc(uid);

          // পুরনো ডেটা নতুন ডকুমেন্টে আপডেট করা হচ্ছে
          await newUserDocRef.set(oldData, { merge: true });

          // পুরনো ডকুমেন্টটি ডিলেট করে দেওয়া
          await oldUserDocRef.delete();
          
          migratedCount++;
          console.log(`✅ ${oldDocId} সফলভাবে মাইগ্রেট করা হয়েছে।`);
        }
      } catch (e) {
        console.error(`ব্যবহারকারী ${uid} কে মাইগ্রেট করতে সমস্যা হয়েছে:`, e.message);
        errorCount++;
      }
    }

    const resultMessage = `মাইগ্রেশন সম্পন্ন। মোট সফল: ${migratedCount}, মোট ত্রুটি: ${errorCount}`;
    console.log(resultMessage);
    return { success: true, message: resultMessage };

  } catch (error) {
    console.error("মাইগ্রেশন প্রক্রিয়ায় একটি বড় ত্রুটি হয়েছে:", error);
    throw new functions.https.HttpsError('internal', "A critical error occurred during migration.");
  }
});