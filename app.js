// ===============================
// Firebase imports (ES Modules)
// ===============================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ===============================
// Firebase config (PASTE YOURS)
// ===============================
const firebaseConfig = {
  apiKey: "AIzaSyCw4Vx2RVrUM8JxwycjyRzOEerDOSb7LnE",
  authDomain: "academy-exams.firebaseapp.com",
  projectId: "academy-exams",
  storageBucket: "academy-exams.firebasestorage.app",
  messagingSenderId: "713843455021",
  appId: "1:713843455021:web:af094b4d5822187dc1b4a4"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ===============================
// Exam constants
// ===============================
const EXAM_ID = "ai-fundamentals";
const DURATION_MINUTES = 60;

let timerInterval = null;

// ===============================
// Start / Resume Exam
// ===============================
window.startExam = async function () {
  const name = document.getElementById("name").value.trim();
  const roll = document.getElementById("roll").value.trim();

  if (!name || !roll) {
    alert("Enter name and roll number");
    return;
  }

  const attemptId = `${EXAM_ID}_${roll}`;
  const attemptRef = doc(db, "attempts", attemptId);

  const snap = await getDoc(attemptRef);

  // ===============================
  // RESUME EXISTING ATTEMPT
  // ===============================
  if (snap.exists()) {
    const data = snap.data();

    if (data.status !== "IN_PROGRESS") {
      alert("Exam already submitted.");
      return;
    }

    alert("Resuming existing attempt");
    attachAntiCheat(attemptId);
    startTimer(data, attemptRef);
    return;
  }

  // ===============================
  // CREATE NEW ATTEMPT
  // ===============================
  await setDoc(attemptRef, {
    examId: EXAM_ID,
    rollNumber: roll,
    name: name,
    status: "IN_PROGRESS",
    startTime: serverTimestamp(),
    submitTime: null,
    durationMinutes: DURATION_MINUTES,
    score: null,
    violations: 0,
    createdAt: serverTimestamp()
  });

  const newSnap = await getDoc(attemptRef);
  attachAntiCheat(attemptId);
  startTimer(newSnap.data(), attemptRef);

  alert("Attempt created. Exam started.");
};

// ===============================
// Timer (server-truth derived)
// ===============================
function startTimer(attemptData, attemptRef) {
  const startTime = attemptData.startTime.toDate();
  const durationMs = attemptData.durationMinutes * 60 * 1000;
  const endTime = startTime.getTime() + durationMs;

  if (timerInterval) clearInterval(timerInterval);

  timerInterval = setInterval(async () => {
    const now = Date.now();
    const remaining = endTime - now;

    if (remaining <= 0) {
      clearInterval(timerInterval);
      document.getElementById("timer").innerText =
        "Time up! Submitting...";
      await autoSubmit(attemptRef);
      return;
    }

    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);

    document.getElementById("timer").innerText =
      `Time left: ${mins}:${secs.toString().padStart(2, "0")}`;
  }, 1000);
}

// ===============================
// Auto-submit on timeout
// ===============================
async function autoSubmit(attemptRef) {
  try {
    await updateDoc(attemptRef, {
      status: "SUBMITTED",
      submitTime: new Date()
    });
    alert("Exam submitted automatically.");
  } catch (e) {
    console.error("Auto-submit failed:", e);
  }
}

// ===============================
// Anti-cheat logging
// ===============================
function logEvent(attemptId, type, meta = {}) {
  const ref = collection(db, "events");
  addDoc(ref, {
    attemptId,
    type,
    timestamp: new Date(),
    meta
  }).catch(() => {});
}

function attachAntiCheat(attemptId) {

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      logEvent(attemptId, "TAB_SWITCH");
    }
  });

  window.addEventListener("blur", () => {
    logEvent(attemptId, "WINDOW_BLUR");
  });

  window.addEventListener("focus", () => {
    logEvent(attemptId, "WINDOW_FOCUS");
  });

  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement) {
      logEvent(attemptId, "FULLSCREEN_EXIT");
    }
  });

  document.addEventListener("copy", () => {
    logEvent(attemptId, "COPY_ATTEMPT");
  });

  document.addEventListener("paste", () => {
    logEvent(attemptId, "PASTE_ATTEMPT");
  });

  window.addEventListener("beforeunload", () => {
    logEvent(attemptId, "REFRESH");
  });
}