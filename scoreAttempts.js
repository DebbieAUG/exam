const admin = require("firebase-admin");
const answers = require("./seed/answers.json");

admin.initializeApp({
  credential: admin.credential.cert(require("./serviceAccountKey.json"))
});

const db = admin.firestore();

const EXAM_ID = "az-900";

async function scoreAttempts() {
  const snapshot = await db
    .collection("attempts")
    .where("examId", "==", EXAM_ID)
    .where("status", "==", "SUBMITTED")
    .get();

  console.log(`Found ${snapshot.size} submitted attempts`);

  for (const doc of snapshot.docs) {
    const attempt = doc.data();
    const correct = answers[EXAM_ID];
    const studentAnswers = attempt.answers || {};

    let score = 0;
    let total = Object.keys(correct).length;

    for (const qId of Object.keys(correct)) {
      if (studentAnswers[qId] === correct[qId]) {
        score++;
      }
    }

    const percentage = Math.round((score / total) * 100);

    await doc.ref.update({
      score: percentage,
      scoredAt: new Date()
    });

    console.log(
      `✅ Scored ${attempt.rollNumber}: ${percentage}%`
    );
  }

  console.log("🎉 Scoring complete");
  process.exit(0);
}

scoreAttempts().catch(err => {
  console.error("❌ Scoring failed:", err);
  process.exit(1);
});
