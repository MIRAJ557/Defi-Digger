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
// ★★★ উন্নত এবং প্রফেশনাল ব্রডকাস্ট সিস্টেম ★★★
// ===================================================================

/**
 * উন্নত ব্রডকাস্ট ফাংশন - টেক্সট, ইমেজ, ভিডিও, জিফ এবং ইনলাইন বাটন সাপোর্ট করে
 */
exports.advancedBroadcast = functions.runWith({ 
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

    const { 
        message, 
        messageType = 'text', 
        mediaUrl = null,
        caption = '',
        inlineButtons = [],
        priority = 'normal',
        targetUsers = 'all' // 'all', 'active', 'inactive'
    } = data;
    
    if (!message && !mediaUrl) {
        throw new functions.https.HttpsError('invalid-argument', 'Message text or media URL is required.');
    }

    try {
        // ব্রডকাস্ট রেকর্ড তৈরি করা
        const broadcastId = await createBroadcastRecord({
            adminId: context.auth.uid,
            message,
            messageType,
            mediaUrl,
            caption,
            inlineButtons,
            priority,
            targetUsers
        });

        // টার্গেট ইউজার সিলেক্ট করা
        let usersQuery = db.collection('users').where('telegramId', '!=', null);
        
        if (targetUsers === 'active') {
            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            usersQuery = usersQuery.where('lastLogin', '>=', sevenDaysAgo);
        } else if (targetUsers === 'inactive') {
            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            usersQuery = usersQuery.where('lastLogin', '<', sevenDaysAgo);
        }

        const usersSnapshot = await usersQuery.get();
        const totalUsers = usersSnapshot.size;

        console.log(`Starting advanced broadcast to ${totalUsers} users`);

        // প্রোগ্রেস আপডেট
        await updateBroadcastProgress(broadcastId, {
            total: totalUsers,
            success: 0,
            failed: 0,
            status: 'in_progress'
        });

        let successCount = 0;
        let failCount = 0;
        const failedUsers = [];

        // ব্যাচ প্রসেসিং for better performance
        const batchSize = 25;
        const batches = [];
        
        for (let i = 0; i < usersSnapshot.docs.length; i += batchSize) {
            batches.push(usersSnapshot.docs.slice(i, i + batchSize));
        }

        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
            const batch = batches[batchIndex];
            const batchPromises = batch.map(async (doc) => {
                const userData = doc.data();
                try {
                    await sendAdvancedMessage(userData.telegramId, {
                        message,
                        messageType,
                        mediaUrl,
                        caption,
                        inlineButtons
                    });
                    
                    successCount++;
                    
                    // ডেলিভারি লগ সংরক্ষণ
                    await logMessageDelivery(broadcastId, userData.telegramId, 'success');
                    
                    console.log(`Sent to ${userData.telegramId}: success`);
                    return { success: true, userId: userData.telegramId };
                    
                } catch (error) {
                    failCount++;
                    failedUsers.push({
                        userId: userData.telegramId,
                        error: error.message
                    });
                    
                    // ডেলিভারি লগ সংরক্ষণ
                    await logMessageDelivery(broadcastId, userData.telegramId, 'failed', error.message);
                    
                    console.log(`Failed to send to ${userData.telegramId}: ${error.message}`);
                    return { success: false, userId: userData.telegramId, error: error.message };
                }
            });

            await Promise.all(batchPromises);
            
            // প্রোগ্রেস আপডেট
            await updateBroadcastProgress(broadcastId, {
                success: successCount,
                failed: failCount,
                status: 'in_progress'
            });

            // Rate limiting - avoid hitting Telegram limits
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // ফাইনাল স্ট্যাটাস আপডেট
        await updateBroadcastProgress(broadcastId, {
            success: successCount,
            failed: failCount,
            status: 'completed',
            completedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        const result = {
            success: true,
            message: `✅ Broadcast completed!\n\n📊 Statistics:\n✅ Successful: ${successCount}\n❌ Failed: ${failCount}\n👥 Total: ${totalUsers}\n📈 Success Rate: ${((successCount / totalUsers) * 100).toFixed(1)}%`,
            stats: {
                total: totalUsers,
                success: successCount,
                failed: failCount,
                successRate: ((successCount / totalUsers) * 100).toFixed(1)
            },
            broadcastId: broadcastId,
            failedUsers: failedUsers.slice(0, 10) // প্রথম 10টি failed user
        };

        // Admin কে ডিটেইলড রিপোর্ট পাঠানো
        await sendBroadcastReportToAdmin(context.auth.uid, result);

        return result;

    } catch (error) {
        console.error('Advanced broadcast failed:', error);
        throw new functions.https.HttpsError('internal', 'Broadcast operation failed: ' + error.message);
    }
});

/**
 * উন্নত মেসেজ সেন্ডিং ফাংশন - সব ধরনের মিডিয়া সাপোর্ট করে
 */
async function sendAdvancedMessage(telegramId, messageData) {
    const { message, messageType, mediaUrl, caption, inlineButtons } = messageData;
    
    const finalTelegramId = String(telegramId).replace('tg_', '');
    
    // ইনলাইন বাটন প্রস্তুত করা
    let replyMarkup = null;
    if (inlineButtons && inlineButtons.length > 0) {
        const keyboard = [];
        for (const row of inlineButtons) {
            const buttonRow = [];
            for (const button of row) {
                if (button.url) {
                    buttonRow.push({
                        text: button.text,
                        url: button.url
                    });
                } else if (button.web_app) {
                    buttonRow.push({
                        text: button.text,
                        web_app: { url: button.web_app }
                    });
                } else if (button.callback_data) {
                    buttonRow.push({
                        text: button.text,
                        callback_data: button.callback_data
                    });
                }
            }
            if (buttonRow.length > 0) {
                keyboard.push(buttonRow);
            }
        }
        
        if (keyboard.length > 0) {
            replyMarkup = {
                inline_keyboard: keyboard
            };
        }
    }

    const options = {
        parse_mode: 'HTML',
        disable_web_page_preview: false
    };

    if (replyMarkup) {
        options.reply_markup = replyMarkup;
    }

    try {
        // মেসেজ টাইপ অনুযায়ী কন্টেন্ট সেন্ড করা
        switch (messageType) {
            case 'text':
                let finalMessage = message;
                // HTML ট্যাগগুলিকে টেলিগ্রাম-সাপোর্টেড ফরম্যাটে কনভার্ট করা
                if (finalMessage.includes('<br>')) {
                    finalMessage = finalMessage.replace(/<br\s*\/?>/gi, '\n');
                }
                if (finalMessage.includes('<b>') || finalMessage.includes('<strong>')) {
                    finalMessage = finalMessage.replace(/<b>(.*?)<\/b>/gi, '<b>$1</b>')
                                              .replace(/<strong>(.*?)<\/strong>/gi, '<b>$1</b>');
                }
                if (finalMessage.includes('<i>') || finalMessage.includes('<em>')) {
                    finalMessage = finalMessage.replace(/<i>(.*?)<\/i>/gi, '<i>$1</i>')
                                              .replace(/<em>(.*?)<\/em>/gi, '<i>$1</i>');
                }
                if (finalMessage.includes('<u>')) {
                    finalMessage = finalMessage.replace(/<u>(.*?)<\/u>/gi, '<u>$1</u>');
                }
                if (finalMessage.includes('<code>')) {
                    finalMessage = finalMessage.replace(/<code>(.*?)<\/code>/gi, '<code>$1</code>');
                }
                if (finalMessage.includes('<a ')) {
                    finalMessage = finalMessage.replace(/<a href="(.*?)">(.*?)<\/a>/gi, '<a href="$1">$2</a>');
                }
                
                await bot.sendMessage(finalTelegramId, finalMessage, options);
                break;

            case 'photo':
                if (!mediaUrl) throw new Error('Media URL is required for photo message');
                await bot.sendPhoto(finalTelegramId, mediaUrl, {
                    caption: caption || message,
                    parse_mode: 'HTML',
                    reply_markup: replyMarkup
                });
                break;

            case 'video':
                if (!mediaUrl) throw new Error('Media URL is required for video message');
                await bot.sendVideo(finalTelegramId, mediaUrl, {
                    caption: caption || message,
                    parse_mode: 'HTML',
                    reply_markup: replyMarkup
                });
                break;

            case 'animation': // GIF
                if (!mediaUrl) throw new Error('Media URL is required for animation message');
                await bot.sendAnimation(finalTelegramId, mediaUrl, {
                    caption: caption || message,
                    parse_mode: 'HTML',
                    reply_markup: replyMarkup
                });
                break;

            case 'document':
                if (!mediaUrl) throw new Error('Media URL is required for document message');
                await bot.sendDocument(finalTelegramId, mediaUrl, {
                    caption: caption || message,
                    parse_mode: 'HTML',
                    reply_markup: replyMarkup
                });
                break;

            default:
                throw new Error(`Unsupported message type: ${messageType}`);
        }

        return { success: true };
    } catch (error) {
        console.error(`Error sending ${messageType} to ${finalTelegramId}:`, error.message);
        throw error;
    }
}


/**
 * ব্রডকাস্ট রেকর্ড তৈরি করা (সঠিক সংস্করণ)
 */
async function createBroadcastRecord(broadcastData) {
    // Firestore-এর জন্য বাটন ডেটা ফরম্যাট করা হচ্ছে
    const firestoreSafeButtons = [];
    if (broadcastData.inlineButtons && broadcastData.inlineButtons.length > 0) {
        broadcastData.inlineButtons.forEach(row => {
            row.forEach(button => {
                firestoreSafeButtons.push(button);
            });
        });
    }

    const broadcastRef = await db.collection('broadcastHistory').add({
        ...broadcastData,
        inlineButtons: firestoreSafeButtons, // <-- মূল পরিবর্তন এখানে
        total: 0,
        success: 0,
        failed: 0,
        status: 'initializing',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        completedAt: null
    });
    
    return broadcastRef.id;
}

/**
 * ব্রডকাস্ট প্রোগ্রেস আপডেট করা
 */
async function updateBroadcastProgress(broadcastId, updates) {
    await db.collection('broadcastHistory').doc(broadcastId).update({
        ...updates,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    });
}

/**
 * মেসেজ ডেলিভারি লগ সংরক্ষণ
 */
async function logMessageDelivery(broadcastId, telegramId, status, error = null) {
    const deliveryLog = {
        broadcastId: broadcastId,
        telegramId: telegramId,
        status: status,
        error: error,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
    };
    
    await db.collection('broadcastDeliveryLogs').add(deliveryLog);
}

/**
 * অ্যাডমিনকে ব্রডকাস্ট রিপোর্ট পাঠানো
 */
async function sendBroadcastReportToAdmin(adminUid, result) {
    try {
        const adminDoc = await db.collection('admins').doc(adminUid).get();
        if (adminDoc.exists) {
            const adminData = adminDoc.data();
            if (adminData.telegramId) {
                const reportMessage = `
📢 *Broadcast Completion Report*

✅ *Successful:* ${result.stats.success}
❌ *Failed:* ${result.stats.failed}
👥 *Total Users:* ${result.stats.total}
📈 *Success Rate:* ${result.stats.successRate}%

🆔 *Broadcast ID:* ${result.broadcastId}

${result.stats.failed > 0 ? `\n⚠️ *Failed Users (first 10):*\n${result.failedUsers.map((u, i) => `${i+1}. ${u.userId}: ${u.error}`).join('\n')}` : ''}

Thank you for using our advanced broadcast system! 🚀
                `;
                
                await bot.sendMessage(adminData.telegramId, reportMessage, { parse_mode: 'Markdown' });
            }
        }
    } catch (error) {
        console.error('Error sending report to admin:', error);
    }
}

/**
 * টেস্ট ব্রডকাস্ট ফাংশন - অ্যাডমিন নিজেকে টেস্ট মেসেজ পাঠাতে পারবে
 */
exports.testAdvancedBroadcast = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
    }

    const adminDoc = await db.collection('admins').doc(context.auth.uid).get();
    if (!adminDoc.exists || !adminDoc.data().isAdmin) {
        throw new functions.https.HttpsError('permission-denied', 'Admin access required.');
    }

    const adminData = adminDoc.data();
    if (!adminData.telegramId) {
        throw new functions.https.HttpsError('failed-precondition', 'Admin Telegram ID not found.');
    }

    try {
        await sendAdvancedMessage(adminData.telegramId, data);
        
        return {
            success: true,
            message: 'Test message sent successfully to your Telegram account!'
        };
    } catch (error) {
        console.error('Test broadcast failed:', error);
        throw new functions.https.HttpsError('internal', 'Test broadcast failed: ' + error.message);
    }
});

/**
 * ব্রডকাস্ট স্ট্যাটাস চেক করার ফাংশন
 */
exports.getBroadcastStatus = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
    }

    const adminDoc = await db.collection('admins').doc(context.auth.uid).get();
    if (!adminDoc.exists || !adminDoc.data().isAdmin) {
        throw new functions.https.HttpsError('permission-denied', 'Admin access required.');
    }

    const { broadcastId } = data;
    if (!broadcastId) {
        throw new functions.https.HttpsError('invalid-argument', 'Broadcast ID is required.');
    }

    try {
        const broadcastDoc = await db.collection('broadcastHistory').doc(broadcastId).get();
        if (!broadcastDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Broadcast not found.');
        }

        const broadcastData = broadcastDoc.data();
        
        // ডেলিভারি স্ট্যাটাস সংগ্রহ
        const deliverySnapshot = await db.collection('broadcastDeliveryLogs')
            .where('broadcastId', '==', broadcastId)
            .get();

        const deliveryStats = {
            total: deliverySnapshot.size,
            success: 0,
            failed: 0
        };

        deliverySnapshot.forEach(doc => {
            const log = doc.data();
            if (log.status === 'success') {
                deliveryStats.success++;
            } else if (log.status === 'failed') {
                deliveryStats.failed++;
            }
        });

        return {
            ...broadcastData,
            deliveryStats: deliveryStats,
            id: broadcastDoc.id
        };
    } catch (error) {
        console.error('Error getting broadcast status:', error);
        throw new functions.https.HttpsError('internal', 'Failed to get broadcast status: ' + error.message);
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
// Single Message Sender Function (আপডেটেড)
// ===================================================================
exports.sendTelegramMessage = functions.https.onCall(async (data, context) => {
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
        let formattedMessage = message;

        if (messageType === 'markdown') {
            options.parse_mode = 'Markdown';
        } else if (messageType === 'html') {
            options.parse_mode = 'HTML';
            formattedMessage = message.replace(/<br\s*\/?>/gi, '\n');
        }

        await bot.sendMessage(finalTelegramId, formattedMessage, options);
        
        console.log(`সফলভাবে মেসেজ পাঠানো হয়েছে: ${finalTelegramId}`);
        return { success: true };

    } catch (error) {
        console.error(`মেসেজ পাঠাতে ব্যর্থ: ${telegramId}:`, error.message);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

// ===================================================================
// Firebase Custom Token Function
// ===================================================================
exports.getFirebaseTokenForUser = functions.https.onCall(async (data, context) => {
    if (!data || !data.telegramId) {
        throw new functions.https.HttpsError('invalid-argument', 'Telegram ID is required.');
    }

    const telegramId = String(data.telegramId).trim();
    const uid = `tg_${telegramId}`;

    try {
        await admin.auth().getUser(uid);
        console.log(`User ${uid} already exists. Generating token.`);

    } catch (error) {
        if (error.code === 'auth/user-not-found') {
            console.log(`User ${uid} not found. Creating new auth user...`);
            try {
                await admin.auth().createUser({
                    uid: uid,
                    displayName: `Telegram User ${telegramId}`,
                });
                console.log(`Successfully created user: ${uid}`);
            } catch (createError) {
                if (createError.code === 'auth/uid-already-exists') {
                    console.log(`User ${uid} was created by a parallel request. Continuing.`);
                } else {
                    console.error('Error creating user:', createError);
                    throw new functions.https.HttpsError('internal', 'Could not create Firebase user.');
                }
            }
        } else {
            console.error('Error fetching user:', error);
            throw new functions.https.HttpsError('internal', 'Could not fetch Firebase user.');
        }
    }

    try {
        const customToken = await admin.auth().createCustomToken(uid);
        console.log(`Successfully generated token for: ${uid}`);
        return { token: customToken };
    } catch (tokenError) {
        console.error('Error creating custom token:', tokenError);
        throw new functions.https.HttpsError('internal', 'Could not create custom token.');
    }
});

// ===================================================================
// অটোমেটিক ডেটা মাইগ্রেশন ফাংশন
// ===================================================================
exports.migrateUserData = functions.https.onCall(async (data, context) => {
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

    const listUsersResult = await auth.listUsers(1000);

    for (const userRecord of listUsersResult.users) {
      const uid = userRecord.uid;

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

          await newUserDocRef.set(oldData, { merge: true });
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

// ===================================================================
// ব্রডকাস্ট হিস্ট্রি ক্লিনআপ ফাংশন (প্রতি মাসে পুরনো ডেটা ডিলিট করবে)
// ===================================================================
exports.cleanupOldBroadcasts = functions.pubsub.schedule('0 0 1 * *').onRun(async (context) => {
    try {
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

        const oldBroadcastsSnapshot = await db.collection('broadcastHistory')
            .where('timestamp', '<', threeMonthsAgo)
            .get();

        let deleteCount = 0;
        const deletePromises = [];

        oldBroadcastsSnapshot.forEach(doc => {
            deletePromises.push(doc.ref.delete());
            deleteCount++;
        });

        await Promise.all(deletePromises);

        console.log(`Cleaned up ${deleteCount} old broadcast records`);
        return null;
    } catch (error) {
        console.error('Error cleaning up old broadcasts:', error);
        return null;
    }
});