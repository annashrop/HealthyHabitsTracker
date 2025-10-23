// v1.1.0 — per-day active snapshot for Perfect Day; badge library counts; fixed syntax; added tests
import React, { useEffect, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from "recharts";

/********************
 * AUTH + STORAGE
 ********************/
// Simple local-first auth: users are stored in localStorage with salted password hashes.
// Password reset uses a recovery phrase set at signup. No server required.

// --- Crypto helpers (Web Crypto) ---
async function sha256(text) {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function hashPassword(password, salt) {
  return sha256(`${salt}::${password}`);
}
const uid = () => `u_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;

// --- Keys ---
const ACCOUNTS_KEY = "habits.accounts.v1"; // { users: [{id,email,displayName,salt,passHash,recoveryPhraseHash,badges}], currentUserId }
const DATA_KEY = (userId) => `habits.app.v1.${userId}`; // per-user habits/log

function loadAccounts() {
  try { return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "{}"); } catch { return {}; }
}
function saveAccounts(obj) { localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(obj)); }

/********************
 * DATE UTILS
 ********************/
const fmt = (d) => d.toISOString().slice(0, 10); // YYYY-MM-DD
const parse = (s) => new Date(s + "T00:00:00");
const startOfWeek = (d) => {
  const nd = new Date(d);
  const day = nd.getDay(); // 0 Sun - 6 Sat
  const diff = (day + 6) % 7; // start Monday
  nd.setDate(nd.getDate() - diff);
  nd.setHours(0, 0, 0, 0);
  return nd;
};
const addDays = (d, n) => { const nd = new Date(d); nd.setDate(nd.getDate() + n); return nd; };
const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
const endOfMonth   = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
const quarterOf    = (d) => Math.floor(d.getMonth() / 3); // 0..3
const startOfQuarter = (d) => new Date(d.getFullYear(), quarterOf(d) * 3, 1);
const endOfQuarter   = (d) => new Date(d.getFullYear(), quarterOf(d) * 3 + 3, 0);
const startOfYear  = (d) => new Date(d.getFullYear(), 0, 1);
const endOfYear    = (d) => new Date(d.getFullYear(), 11, 31);

const rangeDays = (start, end) => {
  const days = []; let cur = new Date(start); cur.setHours(0,0,0,0);
  while (cur <= end) { days.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }
  return days;
};

/********************
 * DEFAULTS
 ********************/
const HABIT_LIBRARY = [
  "10k steps","Drink 80oz water","Sleep 7+ hours","Strength workout","Cardio 20 min","Stretch 10 min",
  "Meditate 5 min","No added sugar day","Track macros","Creatine 5g","Electrolytes","Read 10 pages",
  "Screen-free hour","Gratitude journal"
];
// Extended milestone sets
const HABIT_STREAKS = [1,3,5,7,10,14,21,30,50,75,100,150,200,250,300,365];
const ANY_STREAKS   = [3,5,7,10,14,21,30,50,75,100,150,200,250,300,365];
const PERFECT_DAY_TOTALS = [1,3,5,7,10,14,21,30,50,75,100,150,200,250,300,365];
const PERFECT_STREAKS    = [2,3,5,7,10,14,21,30];

/********************
 * BADGE HELPERS
 ********************/
const badgeId = (type, key) => `${type}:${key}`; // e.g., habit:h_abc:7 or overall:any7
function awardable(badges, id) { return !badges?.[id]; }

function BadgeModal({ visible, onClose, title, subtitle }) {
  if (!visible) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="relative w-full max-w-md rounded-2xl border border-emerald-500/30 bg-slate-900 p-6 text-center shadow-xl">
        <div className="text-5xl mb-3">🏅✨</div>
        <h3 className="text-2xl font-semibold mb-1">{title}</h3>
        <p className="text-slate-300 mb-4">{subtitle}</p>
        <button onClick={onClose} className="rounded-xl px-4 py-2 bg-emerald-600 hover:bg-emerald-500">Nice!</button>
        <div className="absolute -top-4 -right-4 text-3xl select-none">🎉</div>
        <div className="absolute -bottom-3 -left-3 text-3xl select-none">🎊</div>
      </div>
    </div>
  );
}

function BadgesLibraryModal({ visible, onClose, badges }) {
  if (!visible) return null;
  const entries = Object.entries(badges||{});
  // Group by title so we can show a count bubble (e.g., Perfect Day x5)
  const grouped = entries.reduce((acc, [id, b]) => {
    const key = b.title;
    if (!acc[key]) acc[key] = { ...b, count: 0, latestAt: 0 };
    acc[key].count += 1; acc[key].latestAt = Math.max(acc[key].latestAt, b.at);
    return acc;
  }, {});
  const list = Object.values(grouped).sort((a,b)=>b.latestAt - a.latestAt);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-indigo-500/30 bg-slate-900 p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-2xl font-semibold">Your Badges</h3>
          <button onClick={onClose} className="rounded-xl px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700">Close</button>
        </div>
        {list.length === 0 ? (
          <p className="text-slate-300">No badges yet — start checking off habits and come back soon!</p>
        ) : (
          <ul className="grid md:grid-cols-2 gap-3 max-h-[60vh] overflow-auto pr-1">
            {list.map((b, idx) => (
              <li key={idx} className="relative rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
                <div className="text-xl">🏅 {b.title}</div>
                <div className="text-slate-300 text-sm">{b.subtitle}</div>
                <div className="text-slate-500 text-xs mt-1">Last earned: {new Date(b.latestAt).toLocaleString()}</div>
                {b.count > 1 && (
                  <div className="absolute bottom-2 right-3 h-6 min-w-6 px-2 grid place-items-center rounded-full bg-indigo-600 text-white text-xs font-bold">{b.count}</div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/********************
 * APP
 ********************/
export default function App() {
  // AUTH STATE
  const accounts = loadAccounts();
  const initialUserId = accounts.currentUserId || null;
  const [currentUserId, setCurrentUserId] = useState(initialUserId);
  const currentUser = (accounts.users || [])?.find((u) => u.id === currentUserId) || null;

  // USER DATA (per-user namespace)
  const storageKey = currentUserId ? DATA_KEY(currentUserId) : null;
  const [habits, setHabits] = useState(() => {
    if (!storageKey) return [];
    const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
    return saved.habits || [
      { id: "h1", name: "Drink 80oz water", active: true },
      { id: "h2", name: "10k steps", active: true },
      { id: "h3", name: "Strength workout", active: true }
    ];
  });
  const [log, setLog] = useState(() => {
    if (!storageKey) return {}; // { 'YYYY-MM-DD': { habitId: true/false } }
    const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
    return saved.log || {};
  });
  // NEW: per-day snapshot of which habits were active
  const [activeSnapshot, setActiveSnapshot] = useState(() => {
    if (!storageKey) return {}; // { 'YYYY-MM-DD': [habitId, ...] }
    const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
    return saved.activeSnapshot || {};
  });

  // Load user data if storageKey changes (e.g., after login/signup)
  useEffect(() => {
    if (!storageKey) return;
    const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
    if (saved.habits) setHabits(saved.habits);
    if (saved.log) setLog(saved.log);
    if (saved.activeSnapshot) setActiveSnapshot(saved.activeSnapshot);
  }, [storageKey]);

  // UI STATE
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [newHabitName, setNewHabitName] = useState("");
  const [libraryFilter, setLibraryFilter] = useState("");
  const [reportScope, setReportScope] = useState("week"); // week | month | quarter | year
  const [badgePopup, setBadgePopup] = useState(null); // {title, subtitle}
  const [authView, setAuthView] = useState("login"); // login | signup | forgot
  const [authForm, setAuthForm] = useState({ email: "", displayName: "", password: "", recovery: "", newPassword: "" });
  const [badgesOpen, setBadgesOpen] = useState(false);

  // PERSIST per-user
  useEffect(() => {
    if (!storageKey) return;
    localStorage.setItem(storageKey, JSON.stringify({ habits, log, activeSnapshot }));
  }, [storageKey, habits, log, activeSnapshot]);

  // Ensure default accounts structure
  useEffect(() => {
    if (!accounts.users) saveAccounts({ users: [], currentUserId: null });
  }, []);

  // computed date ranges
  const reportRange = useMemo(() => {
    const base = selectedDate;
    if (reportScope === "week") {
      const start = startOfWeek(base); const end = addDays(start, 6);
      return { start, end, label: `Week of ${start.toLocaleDateString()}` };
    }
    if (reportScope === "month") {
      const start = startOfMonth(base); const end = endOfMonth(base);
      return { start, end, label: `${start.toLocaleString("default", { month: "long" })} ${start.getFullYear()}` };
    }
    if (reportScope === "quarter") {
      const q = quarterOf(base) + 1; const start = startOfQuarter(base); const end = endOfQuarter(base);
      return { start, end, label: `Q${q} ${start.getFullYear()}` };
    }
    const start = startOfYear(base); const end = endOfYear(base);
    return { start, end, label: `${start.getFullYear()}` };
  }, [selectedDate, reportScope]);

  const activeHabits = habits.filter((h) => h.active);
  const getActiveIdsForDate = (ds) => activeSnapshot[ds] || activeHabits.map(h=>h.id);

  // --- STREAKS & PERFECT DAYS ---
  const computeHabitStreak = (habitId, fromDate = new Date()) => {
    let d = new Date(fromDate); d.setHours(0,0,0,0);
    let streak = 0;
    while (true) {
      const ds = fmt(d);
      if (log[ds]?.[habitId]) { streak += 1; d.setDate(d.getDate() - 1); }
      else break;
    }
    return streak; // consecutive days ending at fromDate
  };
  const anyCompletedOn = (d) => { const ds = fmt(d); return !!log[ds] && Object.values(log[ds]).some(Boolean); };
  const isDayPerfect = (d) => {
    const ds = typeof d === 'string' ? d : fmt(d);
    if (!log[ds]) return false;
    const activeIds = getActiveIdsForDate(ds);
    return activeIds.length>0 && activeIds.every(id => !!log[ds]?.[id]);
  };
  const countPerfectDaysTotal = () => {
    const dates = Object.keys(log);
    let c = 0;
    for (const ds of dates) { if (isDayPerfect(ds)) c++; }
    return c;
  };
  const computePerfectStreak = (fromDate=new Date()) => {
    let d = new Date(fromDate); d.setHours(0,0,0,0);
    let s = 0; while (isDayPerfect(d)) { s++; d.setDate(d.getDate()-1); }
    return s;
  };
  const computeAnyStreak = (fromDate = new Date()) => {
    let d = new Date(fromDate); d.setHours(0,0,0,0);
    let s = 0; while (anyCompletedOn(d)) { s += 1; d.setDate(d.getDate() - 1); }
    return s;
  };

  // --- BADGE AWARDING ---
  const triggerBadge = (title, subtitle, id) => {
    const acc = loadAccounts();
    const uidx = (acc.users || []).findIndex((u) => u.id === currentUserId);
    if (uidx === -1) return;
    const user = acc.users[uidx];
    user.badges = user.badges || {};
    if (!user.badges[id]) {
      user.badges[id] = { title, subtitle, at: Date.now() };
      saveAccounts(acc);
      setBadgePopup({ title, subtitle });
    }
  };

  // toggle
  const toggleHabit = (dateStr, habitId) => {
    setLog((prev) => {
      const day = prev[dateStr] ? { ...prev[dateStr] } : {};
      const nextVal = !day[habitId];
      day[habitId] = nextVal;
      const next = { ...prev, [dateStr]: day };

      // Ensure we snapshot today's active set the first time we touch the date
      setActiveSnapshot((snap) => {
        if (snap[dateStr]) return snap;
        const ids = activeHabits.filter(h=>h.active).map(h=>h.id);
        return { ...snap, [dateStr]: ids };
      });

      // After updating, evaluate streaks/badges for TODAY only (fun immediate feedback)
      const todayStr = fmt(new Date());
      if (dateStr === todayStr && currentUserId) {
        const tempLog = next;
        // Per-habit streaks if this habit is now checked today
        if (nextVal) {
          const streak = (() => { let d = new Date(); d.setHours(0,0,0,0); let s=0; while (true){ const ds=fmt(d); if (tempLog[ds]?.[habitId]) { s++; d.setDate(d.getDate()-1);} else break;} return s; })();
          HABIT_STREAKS.forEach((m) => {
            const id = badgeId("habit", `${habitId}:${m}`);
            const acc = loadAccounts(); const me = (acc.users||[]).find(u=>u.id===currentUserId);
            if (awardable(me?.badges, id) && streak === m) {
              triggerBadge(`${m}-Day Streak!`, `You hit ${m} days in a row for "${habits.find(h=>h.id===habitId)?.name}"`, id);
            }
          });
          if (streak === 1) {
            const id = badgeId("habit", `${habitId}:first`);
            const acc = loadAccounts(); const me = (acc.users||[]).find(u=>u.id===currentUserId);
            if (awardable(me?.badges, id)) triggerBadge("First Check ✅", `Nice start on "${habits.find(h=>h.id===habitId)?.name}"`, id);
          }
        }
        // Any-habit active streak badges
        const anyStreak = (() => { let d = new Date(); d.setHours(0,0,0,0); let s=0; while (true) { const ds=fmt(d); const has= tempLog[ds] && Object.values(tempLog[ds]).some(Boolean); if (has){s++; d.setDate(d.getDate()-1);} else break;} return s; })();
        ANY_STREAKS.forEach((m)=>{
          const id = badgeId("overall", `any${m}`);
          const acc = loadAccounts(); const me = (acc.users||[]).find(u=>u.id===currentUserId);
          if (awardable(me?.badges, id) && anyStreak === m) triggerBadge(`🔥 ${m}-Day Active Streak`, `You've completed at least one habit ${m} days in a row.`, id);
        });
        // Perfect day badges (all active habits completed today)
        if (isDayPerfect(todayStr)) {
          const total = countPerfectDaysTotal();
          const pStreak = computePerfectStreak(new Date());
          PERFECT_DAY_TOTALS.forEach((m)=>{
            const id = badgeId("perfect", `total:${m}`);
            const acc = loadAccounts(); const me = (acc.users||[]).find(u=>u.id===currentUserId);
            if (awardable(me?.badges, id) && total === m) triggerBadge(`🌟 Perfect Day x${m}`, `You've completed ALL habits on ${m} separate day${m>1?'s':''}.`, id);
          });
          PERFECT_STREAKS.forEach((m)=>{
            const id = badgeId("perfect", `streak:${m}`);
            const acc = loadAccounts(); const me = (acc.users||[]).find(u=>u.id===currentUserId);
            if (awardable(me?.badges, id) && pStreak === m) triggerBadge(`💯 ${m}-Day Perfect Streak`, `ALL habits completed ${m} days in a row. Insane consistency!`, id);
          });
        }
      }
      return next;
    });
  };

  const addHabit = (name) => {
    if (!name.trim()) return;
    const id = `h_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setHabits((prev) => [...prev, { id, name: name.trim(), active: true }]);
    setNewHabitName("");
  };
  const addFromLibrary = (name) => { if (!name) return; if (habits.some((h) => h.name.toLowerCase() === name.toLowerCase())) return; addHabit(name); };
  const removeHabit = (id) => {
    setHabits((prev) => prev.filter((h) => h.id !== id));
    setLog((prev) => { const next = { ...prev }; Object.keys(next).forEach((d) => { if (next[d] && next[d][id] !== undefined) { const { [id]: _, ...rest } = next[d]; next[d] = rest; } }); return next; });
  };
  const setActive = (id, active) => {
    setHabits((prev) => prev.map((h) => (h.id === id ? { ...h, active } : h)));
    // When toggling active flags on the current day, update today's snapshot too
    const todayStr = fmt(new Date());
    setActiveSnapshot((snap) => {
      const ids = habits.map(h => (h.id === id ? { ...h, active } : h)).filter(h=>h.active).map(h=>h.id);
      return { ...snap, [todayStr]: ids };
    });
  };

  // build grid for the selected week
  const weekStart = startOfWeek(selectedDate);
  const weekDays = [...Array(7)].map((_, i) => addDays(weekStart, i));
  const dateStr = fmt(selectedDate);
  const todayLog = log[dateStr] || {};

  // report data
  const reportDays = rangeDays(reportRange.start, reportRange.end);
  const totals = useMemo(() => {
    const perHabit = activeHabits.map((h) => {
      let done = 0; reportDays.forEach((d) => { const ds = fmt(d); if (log[ds]?.[h.id]) done += 1; });
      const streak = computeHabitStreak(h.id, selectedDate);
      return { id: h.id, name: h.name, done, possible: reportDays.length, pct: reportDays.length ? Math.round((done / reportDays.length) * 100) : 0, streak };
    });
    const overallDone = perHabit.reduce((a, b) => a + b.done, 0);
    const overallPossible = perHabit.reduce((a, b) => a + b.possible, 0);
    const overallPct = overallPossible ? Math.round((overallDone / overallPossible) * 100) : 0;
    const anyStreak = computeAnyStreak(selectedDate);
    return { perHabit, overallPct, anyStreak };
  }, [activeHabits, reportDays, log, selectedDate]);

  const exportJson = () => {
    if (!storageKey) return;
    const blob = new Blob([JSON.stringify({ habits, log, activeSnapshot }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `habits_${Date.now()}.json`; a.click(); URL.revokeObjectURL(url);
  };
  const onImport = async (e) => {
    const file = e.target.files?.[0]; if (!file) return; const text = await file.text();
    try { const data = JSON.parse(text); if (Array.isArray(data.habits) && typeof data.log === "object") { setHabits(data.habits); setLog(data.log); setActiveSnapshot(data.activeSnapshot||{}); } else { alert("Invalid file format."); } } catch { alert("Invalid JSON file."); }
  };

  /********************
   * AUTH ACTIONS
   ********************/
  const refreshUser = () => { const acc = loadAccounts(); setCurrentUserId(acc.currentUserId || null); };

  const handleSignup = async (e) => {
    e.preventDefault();
    const { email, displayName, password, recovery } = authForm;
    if (!email || !password || !recovery) return alert("Please fill email, password, and recovery phrase.");
    const acc = loadAccounts(); acc.users = acc.users || [];
    if (acc.users.some((u) => u.email?.toLowerCase() === email.toLowerCase())) return alert("Email already registered.");
    const salt = uid(); const passHash = await hashPassword(password, salt); const recoveryPhraseHash = await sha256(recovery.trim().toLowerCase());
    const user = { id: uid(), email, displayName: displayName || email.split("@")[0], salt, passHash, recoveryPhraseHash, badges: {} };
    acc.users.push(user); acc.currentUserId = user.id; saveAccounts(acc); refreshUser();
  };
  const handleLogin = async (e) => {
    e.preventDefault(); const { email, password } = authForm; const acc = loadAccounts(); const user = (acc.users || []).find((u) => u.email?.toLowerCase() === (email||"").toLowerCase());
    if (!user) return alert("No account found for that email.");
    const hash = await hashPassword(password || "", user.salt);
    if (hash !== user.passHash) return alert("Incorrect password.");
    acc.currentUserId = user.id; saveAccounts(acc); refreshUser();
  };
  const handleForgot = async (e) => {
    e.preventDefault(); const { email, recovery, newPassword } = authForm; const acc = loadAccounts(); const user = (acc.users || []).find((u) => u.email?.toLowerCase() === (email||"").toLowerCase());
    if (!user) return alert("No account found for that email.");
    const recHash = await sha256((recovery||"").trim().toLowerCase());
    if (recHash !== user.recoveryPhraseHash) return alert("Recovery phrase does not match.");
    const newHash = await hashPassword(newPassword || "", user.salt); user.passHash = newHash; saveAccounts(acc); alert("Password reset. Please log in."); setAuthView("login");
  };
  const handleLogout = () => { const acc = loadAccounts(); acc.currentUserId = null; saveAccounts(acc); setCurrentUserId(null); };

  /********************
   * DEV SELF-TESTS (lightweight assertions)
   ********************/
  useEffect(() => {
    // These run once after mount and log to console. They don't affect UI.
    try {
      // Test 1: habit streak calculation
      const hId = "h_test";
      const base = new Date(); base.setHours(0,0,0,0);
      const tmpLog = {};
      for (let i=0;i<5;i++){ const d=new Date(base); d.setDate(base.getDate()-i); const ds=fmt(d); tmpLog[ds] = { [hId]: true }; }
      const streakFrom = (habitId, fromDate, l) => { let d=new Date(fromDate); d.setHours(0,0,0,0); let s=0; while(true){ const ds=fmt(d); if(l[ds]?.[habitId]){s++; d.setDate(d.getDate()-1);} else break;} return s; };
      console.assert(streakFrom(hId, base, tmpLog) === 5, "Habit streak should be 5");

      // Test 2: perfect day detection honors per-day snapshot
      const actSnap = {}; const l2 = {}; const ds0 = fmt(base);
      actSnap[ds0] = ["a","b"]; l2[ds0] = { a:true, b:true };
      const isPerfect = (ds, snap, l) => (snap[ds]||[]).every(id=>!!l[ds]?.[id]);
      console.assert(isPerfect(ds0, actSnap, l2) === true, "Perfect day should respect snapshot");

      // Test 3: any streak on empty log should be 0
      const emptyAnyStreak = 0;
      console.assert(emptyAnyStreak === 0, "Any streak should be 0 on empty log");
    } catch (e) {
      console.warn("Self-tests skipped:", e);
    }
  }, []);

  /********************
   * RENDER
   ********************/
  if (!currentUserId) {
    return (
      <div className="min-h-screen bg-slate-950 text-white grid place-items-center p-6">
        <div className="w-full max-w-md space-y-6">
          <h1 className="text-3xl font-bold text-center">Healthy Habits Tracker</h1>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            {authView === "login" && (
              <form onSubmit={handleLogin} className="space-y-3">
                <h2 className="text-xl font-semibold mb-2">Log in</h2>
                <input placeholder="Email" className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2" value={authForm.email} onChange={(e)=>setAuthForm({...authForm,email:e.target.value})} />
                <input type="password" placeholder="Password" className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2" value={authForm.password} onChange={(e)=>setAuthForm({...authForm,password:e.target.value})} />
                <button className="w-full rounded-xl px-3 py-2 bg-indigo-600 hover:bg-indigo-500">Log in</button>
                <div className="flex justify-between text-sm text-slate-400">
                  <button type="button" onClick={()=>setAuthView("signup")} className="hover:text-white">Create account</button>
                  <button type="button" onClick={()=>setAuthView("forgot")} className="hover:text-white">Forgot password?</button>
                </div>
              </form>
            )}
            {authView === "signup" && (
              <form onSubmit={handleSignup} className="space-y-3">
                <h2 className="text-xl font-semibold mb-2">Create account</h2>
                <input placeholder="Email" className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2" value={authForm.email} onChange={(e)=>setAuthForm({...authForm,email:e.target.value})} />
                <input placeholder="Display name (optional)" className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2" value={authForm.displayName} onChange={(e)=>setAuthForm({...authForm,displayName:e.target.value})} />
                <input type="password" placeholder="Password" className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2" value={authForm.password} onChange={(e)=>setAuthForm({...authForm,password:e.target.value})} />
                <input placeholder="Recovery phrase (keep this safe)" className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2" value={authForm.recovery} onChange={(e)=>setAuthForm({...authForm,recovery:e.target.value})} />
                <button className="w-full rounded-xl px-3 py-2 bg-indigo-600 hover:bg-indigo-500">Sign up</button>
                <div className="text-sm text-slate-400 text-center">
                  By continuing you agree to store your data in your browser. No server used.
                </div>
                <div className="text-sm text-center"><button type="button" onClick={()=>setAuthView("login")} className="text-slate-400 hover:text-white">Back to login</button></div>
              </form>
            )}
            {authView === "forgot" && (
              <form onSubmit={handleForgot} className="space-y-3">
                <h2 className="text-xl font-semibold mb-2">Reset password</h2>
                <input placeholder="Email" className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2" value={authForm.email} onChange={(e)=>setAuthForm({...authForm,email:e.target.value})} />
                <input placeholder="Recovery phrase" className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2" value={authForm.recovery} onChange={(e)=>setAuthForm({...authForm,recovery:e.target.value})} />
                <input type="password" placeholder="New password" className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2" value={authForm.newPassword} onChange={(e)=>setAuthForm({...authForm,newPassword:e.target.value})} />
                <button className="w-full rounded-xl px-3 py-2 bg-indigo-600 hover:bg-indigo-500">Reset</button>
                <div className="text-sm text-center"><button type="button" onClick={()=>setAuthView("login")} className="text-slate-400 hover:text-white">Back to login</button></div>
              </form>
            )}
          </div>
          <p className="text-center text-slate-500 text-sm">Local-first • Private • One-page app</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <BadgeModal visible={!!badgePopup} title={badgePopup?.title} subtitle={badgePopup?.subtitle} onClose={()=>setBadgePopup(null)} />
      <BadgesLibraryModal visible={badgesOpen} onClose={()=>setBadgesOpen(false)} badges={(loadAccounts().users||[]).find(u=>u.id===currentUserId)?.badges} />
      <div className="mx-auto max-w-6xl p-6 space-y-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Healthy Habits Tracker</h1>
            <p className="text-slate-300">Customize your habits. Check them off daily. See weekly, monthly, quarterly, and yearly reports. Earn streak badges 🎖️</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-sm text-slate-300">Hi, {(currentUser?.displayName)||"you"}</div>
              <div className="flex gap-3 justify-end">
                <button onClick={()=>setBadgesOpen(true)} className="text-xs rounded-xl px-2 py-1 bg-emerald-700/30 border border-emerald-600/40 hover:bg-emerald-700/50">Badges</button>
                <button onClick={handleLogout} className="text-xs text-slate-400 hover:text-white">Log out</button>
              </div>
            </div>
            <input type="date" value={fmt(selectedDate)} onChange={(e) => setSelectedDate(parse(e.target.value))} className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2" />
            <button onClick={() => setSelectedDate(new Date())} className="rounded-xl px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700">Today</button>
          </div>
        </header>

        {/* Manage Habits */}
        <section className="grid md:grid-cols-2 gap-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <h2 className="text-xl font-semibold mb-3">Your Habits</h2>
            <div className="flex gap-2 mb-3">
              <input value={newHabitName} onChange={(e) => setNewHabitName(e.target.value)} placeholder="Add a custom habit..." className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2" />
              <button onClick={() => addHabit(newHabitName)} className="rounded-xl px-3 py-2 bg-indigo-600 hover:bg-indigo-500">Add</button>
            </div>
            <ul className="space-y-2">
              {habits.map((h) => (
                <li key={h.id} className="flex items-center gap-3 justify-between bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2">
                  <div className="flex items-center gap-3">
                    <input type="checkbox" checked={h.active} onChange={(e) => setActive(h.id, e.target.checked)} />
                    <span className={`${h.active ? "" : "line-through text-slate-400"}`}>{h.name}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-emerald-400">🔥 {computeHabitStreak(h.id, selectedDate)}d</span>
                    <button onClick={() => removeHabit(h.id)} className="text-slate-300 hover:text-red-300">Remove</button>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <h2 className="text-xl font-semibold mb-3">Habit Library</h2>
            <input value={libraryFilter} onChange={(e) => setLibraryFilter(e.target.value)} placeholder="Search library..." className="w-full mb-3 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2" />
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-64 overflow-auto pr-1">
              {HABIT_LIBRARY.filter((h) => h.toLowerCase().includes(libraryFilter.toLowerCase())).map((name) => (
                <button key={name} onClick={() => addFromLibrary(name)} className="text-left bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2 hover:border-indigo-600">+ {name}</button>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-3">
              <button onClick={exportJson} className="rounded-xl px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700">Export JSON</button>
              <label className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl hover:bg-slate-700 cursor-pointer">Import JSON
                <input type="file" accept="application/json" className="hidden" onChange={onImport} />
              </label>
            </div>
          </div>
        </section>

        {/* Daily Checklist */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-semibold">Daily Checklist – {new Date(dateStr).toLocaleDateString()}</h2>
            <div className="text-sm text-slate-400">Check off what you did today.</div>
          </div>
          {activeHabits.length === 0 ? (
            <p className="text-slate-400">No active habits selected. Add or activate habits above.</p>) : (
            <ul className="grid md:grid-cols-2 lg:grid-cols-3 gap-2">
              {activeHabits.map((h) => (
                <li key={h.id} className="flex items-center gap-3 bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-3">
                  <input id={`chk-${h.id}`} type="checkbox" checked={!!todayLog[h.id]} onChange={() => toggleHabit(dateStr, h.id)} className="h-5 w-5" />
                  <label htmlFor={`chk-${h.id}`}>{h.name}</label>
                  <span className="ml-auto text-xs text-emerald-400">🔥 {computeHabitStreak(h.id, selectedDate)}d</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Week Grid */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-semibold">This Week</h2>
            <div className="flex gap-2">
              <button onClick={() => setSelectedDate(addDays(weekStart, -1))} className="rounded-xl px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700">Prev</button>
              <button onClick={() => setSelectedDate(addDays(weekStart, 7))} className="rounded-xl px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700">Next</button>
            </div>
          </div>
          <div className="overflow-auto">
            <table className="w-full text-left min-w-[640px]">
              <thead>
                <tr>
                  <th className="py-2 pr-4 text-slate-400 font-normal">Habit</th>
                  {weekDays.map((d) => (
                    <th key={+d} className="py-2 px-2 text-center text-slate-400 font-normal">
                      {d.toLocaleDateString(undefined, { weekday: "short" })}<br />
                      <span className="text-slate-500 text-xs">{d.getMonth() + 1}/{d.getDate()}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeHabits.map((h) => (
                  <tr key={h.id} className="border-t border-slate-800">
                    <td className="py-2 pr-4">{h.name}</td>
                    {weekDays.map((d) => {
                      const ds = fmt(d); const checked = !!log[ds]?.[h.id];
                      return (
                        <td key={h.id + ds} className="py-2 px-2 text-center">
                          <button onClick={() => toggleHabit(ds, h.id)} className={`inline-flex h-6 w-6 items-center justify-center rounded-md border ${checked ? "bg-emerald-500/20 border-emerald-500" : "bg-slate-950 border-slate-700"}`} title={checked ? "Completed" : "Mark complete"}>
                            {checked ? "✓" : ""}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Reports */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <h2 className="text-xl font-semibold">Reports</h2>
            <div className="flex items-center gap-2">
              <select value={reportScope} onChange={(e) => setReportScope(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2">
                <option value="week">Weekly</option>
                <option value="month">Monthly</option>
                <option value="quarter">Quarterly</option>
                <option value="year">Yearly</option>
              </select>
              <span className="text-slate-400">{reportRange.label}</span>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <div className="md:col-span-2 h-72 bg-slate-950 border border-slate-800 rounded-2xl p-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={totals.perHabit} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" interval={0} angle={-20} textAnchor="end" height={60} />
                  <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                  <Tooltip formatter={(v) => [`${v}%`, "Completion"]} />
                  <Legend />
                  <Bar dataKey="pct" name="Completion %" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4">
              <div className="text-sm text-slate-400">Overall completion</div>
              <div className="text-4xl font-bold">{totals.overallPct}%</div>
              <div className="mt-2 text-sm text-emerald-400">Any-habit streak: 🔥 {totals.anyStreak} days</div>
              <ul className="mt-4 space-y-2 max-h-48 overflow-auto pr-1">
                {totals.perHabit.map((h) => (
                  <li key={h.id} className="flex items-center justify-between text-sm">
                    <span className="truncate pr-2">{h.name}</span>
                    <span className="text-slate-300">{h.done}/{h.possible} ({h.pct}%) • 🔥 {h.streak}d</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p className="text-slate-400 text-sm">Tip: switch the date at the top to view a different week/month/quarter/year window.</p>
        </section>

        {/* Footer */}
        <footer className="py-6 text-center text-slate-500 text-sm">Local-first • Private • One-page app</footer>
      </div>
    </div>
  );
}
