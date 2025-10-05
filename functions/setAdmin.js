// এই স্ক্রিপ্টটি শুধুমাত্র একবার চালানোর জন্য
const admin = require('firebase-admin');
const path = require('path'); // <-- নতুন লাইন: path মডিউল যোগ করুন

// আপনার Firebase Admin SDK JSON ফাইলের জন্য একটি সম্পূর্ণ পাথ তৈরি করুন
const serviceAccountPath = path.join(__dirname, 'defi-digger-firebase-adminsdk-fb svc-11274178fe.json');
const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// এখানে আপনার অ্যাডমিন ইমেইলটি দিন
const adminEmail = "jobboster7@gmail.com";

admin.auth().getUserByEmail(adminEmail)
  .then((user) => {
    // ইউজারের জন্য একটি কাস্টম ক্লেইম সেট করুন
    return admin.auth().setCustomUserClaims(user.uid, { admin: true });
  })
  .then(() => {
    console.log(`Successfully set admin claim for ${adminEmail}`);
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error setting custom claim:', error);
    process.exit(1);
  });