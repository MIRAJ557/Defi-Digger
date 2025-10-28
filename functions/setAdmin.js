// এই স্ক্রিপ্টটি অ্যাডমিন তৈরি করার জন্য, এটি ডেপ্লয় করা হবে না।
// আপনি আপনার কম্পিউটার থেকে 'node setAdmin.js admin-email@example.com' কমান্ড দিয়ে এটি চালাবেন।

const admin = require('firebase-admin');

// ⚠️ গুরুত্বপূর্ণ: আপনার Firebase প্রকল্পের Service Account Key ফাইলটি ডাউনলোড করুন
// এবং সেটির নাম পরিবর্তন করে 'serviceAccountKey.json' রাখুন।
// এই ফাইলটিকে functions ফোল্ডারের ভিতরে রাখুন।
const serviceAccountKey = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccountKey)
});

const db = admin.firestore();

// কমান্ড লাইন থেকে ইমেইল অ্যাড্রেসটি নেওয়া হচ্ছে
const adminEmail = process.argv[2];

if (!adminEmail) {
  console.error('❌ Error: Please provide an email address as an argument.');
  console.log('Example: node setAdmin.js admin-email@example.com');
  process.exit(1);
}

// ফাংশন: ব্যবহারকারীকে অ্যাডমিন হিসেবে সেট করা
const grantAdminRole = async (email) => {
  try {
    // ইমেইল ব্যবহার করে ব্যবহারকারীকে খোঁজা হচ্ছে
    const user = await admin.auth().getUserByEmail(email);
    const uid = user.uid;

    // ১. ব্যবহারকারীর উপর একটি কাস্টম ক্লেইম (Custom Claim) সেট করা হচ্ছে
    // এটি নিরাপত্তা নিশ্চিত করে
    await admin.auth().setCustomUserClaims(uid, { isAdmin: true });
    
    // ২. Firestore এর 'admins' কালেকশনে একটি ডকুমেন্ট তৈরি করা হচ্ছে
    // আপনার broadcastMessage ফাংশনটি এখান থেকে অ্যাডমিন চেক করে
    await db.collection('admins').doc(uid).set({
        isAdmin: true,
        email: email,
        grantedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`✅ Success! ${email} has been made an admin.`);
    console.log('They can now log in to the admin panel.');
    process.exit(0);

  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      console.error(`❌ Error: User with email "${email}" not found in Firebase Authentication.`);
      console.log('Please ensure the user has signed up or logged into the main app at least once.');
    } else {
      console.error('❌ An unexpected error occurred:', error.message);
    }
    process.exit(1);
  }
};

// ফাংশনটি চালানো হচ্ছে
grantAdminRole(adminEmail);