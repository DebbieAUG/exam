const admin = require("firebase-admin");
const path = require("path");

// Load service account
const serviceAccount = require("./serviceAccountKey.json");

// Load questions JSON
const data = require("./seed/questions.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function seedQuestions() {
  const questions = data.questions;

  if (!questions || Object.keys(questions).length === 0) {
    console.error("No questions found in JSON");
    process.exit(1);
  }

  for (const [docId, question] of Object.entries(questions)) {
    await db.collection("questions").doc(docId).set(question);
    console.log(`✅ Seeded question: ${docId}`);
  }

  console.log("🎉 All questions seeded successfully");
  process.exit(0);
}

seedQuestions().catch(err => {
  console.error("❌ Seeding failed:", err);
  process.exit(1);
});
