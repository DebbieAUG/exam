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
  query,
  where,
  getDocs,
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
const EXAM_ID = "az-900";
const DURATION_MINUTES = 60;

let timerInterval = null;
let currentAttemptRef = null;
let currentAttemptData = null;
let ALL_QUESTIONS = [];

// ===============================
// Utilities
// ===============================
function shuffleArray(arr) {
  // Fisher-Yates shuffle for uniform randomness
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ===============================
// Fullscreen helpers
// ===============================
function requestFullscreen() {
  const elem = document.documentElement;
  if (elem.requestFullscreen) elem.requestFullscreen();
}

// ===============================
// Anti-cheat logging
// ===============================
function logEvent(attemptId, type, meta = {}) {
  addDoc(collection(db, "events"), {
    attemptId,
    type,
    timestamp: serverTimestamp(),
    meta
  }).catch(() => {});
}

function attachAntiCheat(attemptId) {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) logEvent(attemptId, "TAB_SWITCH");
  });

  window.addEventListener("blur", () => {
    logEvent(attemptId, "WINDOW_BLUR");
  });

  window.addEventListener("focus", () => {
    logEvent(attemptId, "WINDOW_FOCUS");
  });

  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement) {
      document.getElementById("fullscreen-warning").style.display = "block";
      logEvent(attemptId, "FULLSCREEN_EXIT");
    } else {
      document.getElementById("fullscreen-warning").style.display = "none";
    }
  });

  document.addEventListener("copy", () => logEvent(attemptId, "COPY_ATTEMPT"));
  document.addEventListener("paste", () => logEvent(attemptId, "PASTE_ATTEMPT"));

  window.addEventListener("beforeunload", () => {
    logEvent(attemptId, "REFRESH");
  });
}

// ===============================
// Load questions from Firestore
// ===============================
async function loadQuestions() {
  const q = query(
    collection(db, "questions"),
    where("examId", "==", EXAM_ID)
  );

  const snapshot = await getDocs(q);
  const questions = [];

  snapshot.forEach(doc => questions.push(doc.data()));
  return questions;
}

// ===============================
// Start / Resume Exam
// ===============================
window.startExam = async function () {
  const name = document.getElementById("name").value.trim();
  const roll = document.getElementById("roll").value.trim();

  // Validate inputs
  if (!name || !roll) {
    alert("Enter name and roll number");
    return;
  }

  if (name.length < 2 || name.length > 100) {
    alert("Name must be between 2 and 100 characters");
    return;
  }

  if (!/^[a-zA-Z0-9\-]+$/.test(roll)) {
    alert("Roll number can only contain letters, numbers, and hyphens");
    return;
  }

  if (roll.length < 2 || roll.length > 50) {
    alert("Roll number must be between 2 and 50 characters");
    return;
  }

  document.getElementById("start-section").classList.add("hidden");
  document.getElementById("question-section").classList.remove("hidden");  

  const attemptId = `${EXAM_ID}_${roll}`;
  const attemptRef = doc(db, "attempts", attemptId);
  const snap = await getDoc(attemptRef);


  ALL_QUESTIONS = await loadQuestions();

  if (!ALL_QUESTIONS || ALL_QUESTIONS.length === 0) {
    alert('No questions available for this exam. Please contact the administrator.');
    return;
  }

  // ===============================
  // RESUME
  // ===============================
  if (snap.exists()) {
    const data = snap.data();

    if (data.status === "SUBMITTED") {
      if (data.score !== null) {
        document.getElementById("question-box").innerHTML =
          `<h2>Your Score: ${data.score}%</h2>`;
      } else {
        document.getElementById("question-box").innerHTML =
          `<h2>Exam submitted. Awaiting scoring.</h2>`;
      }
      return;
    }

    if (data.status !== "IN_PROGRESS") {
      alert("Exam already submitted or not available.");
      return;
    }

    currentAttemptRef = attemptRef;
    currentAttemptData = data;

    attachAntiCheat(attemptId);
    requestFullscreen();
    await startTimer(data, attemptRef);
    renderQuestion();
    return;
  }

  // ===============================
  // CREATE NEW ATTEMPT
  // ===============================
  const questionIds = shuffleArray(
    ALL_QUESTIONS.map(q => q.questionId)
  );

  await setDoc(attemptRef, {
    examId: EXAM_ID,
    rollNumber: roll,
    name: name,
    status: "IN_PROGRESS",
    startTime: serverTimestamp(),
    submitTime: null,
    durationMinutes: DURATION_MINUTES,
    answers: {},
    questionOrder: questionIds,
    currentQuestionIndex: 0,
    score: null,
    createdAt: serverTimestamp()
  });

  const newSnap = await getDoc(attemptRef);

  currentAttemptRef = attemptRef;
  currentAttemptData = newSnap.data();

  attachAntiCheat(attemptId);
  requestFullscreen();
  await startTimer(currentAttemptData, attemptRef);
  renderQuestion();
};

// ===============================
// Timer
// ===============================
async function startTimer(attemptData, attemptRef) {
  // Ensure server timestamp is resolved
  if (!attemptData.startTime || typeof attemptData.startTime.toDate !== 'function') {
    try {
      const fresh = await getDoc(attemptRef);
      attemptData = fresh.data();
      currentAttemptData = attemptData;
    } catch (e) {
      console.warn('Could not refresh attempt startTime', e);
    }
  }

  if (!attemptData.startTime || typeof attemptData.startTime.toDate !== 'function') {
    document.getElementById('timer').innerText = 'Timer not available';
    return;
  }

  const startTime = attemptData.startTime.toDate();
  const endTime = startTime.getTime() + attemptData.durationMinutes * 60 * 1000;

  if (timerInterval) clearInterval(timerInterval);

  timerInterval = setInterval(async () => {
    const remaining = endTime - Date.now();

    if (remaining <= 0) {
      clearInterval(timerInterval);
      document.getElementById('timer').innerText = 'Time up! Submitting...';
      await autoSubmit(attemptRef);
      return;
    }

    const m = Math.floor(remaining / 60000);
    const s = Math.floor((remaining % 60000) / 1000);

    document.getElementById('timer').innerText = `Time left: ${m}:${s.toString().padStart(2, '0')}`;
  }, 1000);
}

// ===============================
// Auto-submit
// ===============================
async function autoSubmit(attemptRef) {
  try {
    await updateDoc(attemptRef, {
      status: "SUBMITTED",
      submitTime: serverTimestamp()
    });
    alert("Exam submitted.");
  } catch (e) {
    console.error("Auto-submit failed", e);
    alert("Failed to submit exam. Please try again.");
  }
}

// ===============================
// Question rendering
// ===============================
function renderQuestion() {
  const order = currentAttemptData.questionOrder;
  const idx = currentAttemptData.currentQuestionIndex;
  const qId = order[idx];

  const q = ALL_QUESTIONS.find(x => x.questionId === qId);

  if (!q) {
    document.getElementById('question-box').innerHTML = '<p>Question not found.</p>';
    return;
  }

  let html = `<h3>Q${idx + 1}. ${q.text}</h3>`;

  const opts = q.options || {};
  for (const [key, value] of Object.entries(opts)) {
    const checked = currentAttemptData.answers && currentAttemptData.answers[qId] === key ? 'checked' : '';

    html += `
      <label>
        <input type="radio"
               name="option"
               ${checked}
               onchange="selectAnswer('${qId}','${key}')">
        ${key}. ${value}
      </label><br/>
    `;
  }

  document.getElementById("question-box").innerHTML = html;
}

// ===============================
// Answer save
// ===============================
window.selectAnswer = async function (qId, option) {
  currentAttemptData.answers = currentAttemptData.answers || {};
  currentAttemptData.answers[qId] = option;

  const updateObj = {};
  updateObj[`answers.${qId}`] = option;

  try {
    await updateDoc(currentAttemptRef, updateObj);
  } catch (e) {
    console.error('Failed to save answer', e);
  }
};

// ===============================
// Navigation
// ===============================
window.nextQuestion = async function () {
  if (
    currentAttemptData.currentQuestionIndex <
    currentAttemptData.questionOrder.length - 1
  ) {
    currentAttemptData.currentQuestionIndex++;
    await updateDoc(currentAttemptRef, {
      currentQuestionIndex:
        currentAttemptData.currentQuestionIndex
    });
    renderQuestion();
  }
};

window.prevQuestion = async function () {
  if (currentAttemptData.currentQuestionIndex > 0) {
    currentAttemptData.currentQuestionIndex--;
    await updateDoc(currentAttemptRef, {
      currentQuestionIndex:
        currentAttemptData.currentQuestionIndex
    });
    renderQuestion();
  }
};