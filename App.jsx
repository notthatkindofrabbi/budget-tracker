import { useState, useEffect, useMemo } from "react";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const FIXED_EXPENSES = [
  { id: "rent", label: "Rent", amount: 1025, category: "housing" },
  { id: "water", label: "Water (DD)", amount: 50, category: "housing" },
  { id: "internet", label: "Internet", amount: 20, category: "utilities" },
  { id: "council_tax", label: "Council Tax", amount: 177, category: "housing", note: "Fixed until Jan 2027" },
  { id: "car_insurance", label: "Car Insurance", amount: 55, category: "transport", note: "Renewed this month" },
  { id: "loan", label: "Loan Repayment", amount: 211.80, category: "finance" },
  { id: "google", label: "Google Storage", amount: 2, category: "subscriptions" },
  { id: "xbox", label: "Xbox", amount: 10.99, category: "subscriptions" },
  { id: "tax", label: "Tax Payment", amount: 1034, category: "finance", note: "Monthly until further notice" },
];

const VARIABLE_DEFAULTS = {
  electricity: 100,
  mobile: 20,
  groceries: 300,
  takeouts: 100,
  fuel: 120,
  misc: 100,
};

const CC_DEBT = { total: 1100, zeroPct: 1000, monthsLeft: 22 };

// Delivery income: ~250/week → ~1083/month (250 * 52 / 12)
const DELIVERY_WEEKLY = 250;
const WIFE_INCOME = 2400;

function getWeeksInMonth(year, month) {
  // Returns array of {start, end} for Mon-Sun weeks that overlap with this month
  const weeks = [];
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // Find first Monday on or before the 1st
  let cur = new Date(firstDay);
  const dow = cur.getDay(); // 0=Sun,1=Mon,...
  const daysToMon = dow === 0 ? -6 : 1 - dow;
  cur.setDate(cur.getDate() + daysToMon);

  while (cur <= lastDay) {
    const wStart = new Date(cur);
    const wEnd = new Date(cur);
    wEnd.setDate(wEnd.getDate() + 6);
    weeks.push({ start: new Date(wStart), end: new Date(wEnd) });
    cur.setDate(cur.getDate() + 7);
  }
  return weeks;
}

function fmt(n) {
  return "£" + Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function fmtDate(d) {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

const STORAGE_KEY = "budget_tracker_v1";

function loadState() {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}

export default function App() {
  const now = new Date();
  const [activeTab, setActiveTab] = useState("overview");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  // Per-month variable expenses stored as { "2026-5": { electricity: 80, ... } }
  const [varExpenses, setVarExpenses] = useState(() => {
    const saved = loadState();
    return saved?.varExpenses || {};
  });

  // New job income toggle + hours
  const [newJobActive, setNewJobActive] = useState(() => loadState()?.newJobActive ?? false);
  const [newJobHours, setNewJobHours] = useState(() => loadState()?.newJobHours ?? 16);
  const [newJobRate, setNewJobRate] = useState(() => loadState()?.newJobRate ?? 12.83);

  // CC minimum payment (variable)
  const [ccMinPayment, setCcMinPayment] = useState(() => loadState()?.ccMinPayment ?? 25);

  // Week-specific delivery income overrides { "2026-5-0": 240, ... }
  const [weekDelivery, setWeekDelivery] = useState(() => loadState()?.weekDelivery || {});

  // Notes per month
  const [notes, setNotes] = useState(() => loadState()?.notes || {});

  const monthKey = `${year}-${month}`;

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ varExpenses, newJobActive, newJobHours, newJobRate, ccMinPayment, weekDelivery, notes }));
    } catch {}
  }, [varExpenses, newJobActive, newJobHours, newJobRate, ccMinPayment, weekDelivery, notes]);

  const vars = useMemo(() => ({ ...VARIABLE_DEFAULTS, ...(varExpenses[monthKey] || {}) }), [varExpenses, monthKey]);

  const setVar = (key, val) => {
    setVarExpenses(prev => ({
      ...prev,
      [monthKey]: { ...(prev[monthKey] || {}), [key]: val }
    }));
  };

  const weeks = useMemo(() => getWeeksInMonth(year, month), [year, month]);

  const totalFixed = FIXED_EXPENSES.reduce((s, e) => s + e.amount, 0);
  const totalVar = vars.electricity + vars.mobile + vars.groceries + vars.takeouts + vars.fuel + vars.misc + ccMinPayment;
  const totalExpenses = totalFixed + totalVar;

  const deliveryMonthly = weeks.reduce((s, _, i) => {
    const k = `${monthKey}-${i}`;
    return s + (weekDelivery[k] !== undefined ? weekDelivery[k] : DELIVERY_WEEKLY);
  }, 0);

  const newJobMonthly = newJobActive
    ? newJobHours * newJobRate * 4.33
    : 0;

  const totalIncome = WIFE_INCOME + deliveryMonthly + newJobMonthly;
  const net = totalIncome - totalExpenses;
  const savingsRate = totalIncome > 0 ? ((net / totalIncome) * 100).toFixed(1) : 0;

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  };

  // WhatsApp weekly summary
  const buildWhatsAppMsg = (weekIdx) => {
    const w = weeks[weekIdx];
    if (!w) return "";
    const wk = `${monthKey}-${weekIdx}`;
    const del = weekDelivery[wk] !== undefined ? weekDelivery[wk] : DELIVERY_WEEKLY;
    const perWeekFixed = (totalFixed / weeks.length).toFixed(2);
    const perWeekVar = (totalVar / weeks.length).toFixed(2);
    const weekIncome = WIFE_INCOME / 4.33 + del + (newJobActive ? newJobHours * newJobRate : 0);

    const lines = [
      `📊 *Budget Update — Week ${weekIdx + 1}*`,
      `📅 ${fmtDate(w.start)} – ${fmtDate(w.end)}`,
      ``,
      `💰 *Income This Week*`,
      `  Wife's income (pro-rata): £${(WIFE_INCOME / 4.33).toFixed(0)}`,
      `  Delivery: £${del}`,
      newJobActive ? `  New job (~${newJobHours}h): £${(newJobHours * newJobRate).toFixed(0)}` : null,
      `  *Total: £${weekIncome.toFixed(0)}*`,
      ``,
      `🏠 *Fixed Costs (weekly share)*: £${perWeekFixed}`,
      `🛒 *Variable Costs (weekly share)*: £${perWeekVar}`,
      ``,
      `📈 *Monthly Snapshot*`,
      `  Total income: ${fmt(totalIncome)}`,
      `  Total expenses: ${fmt(totalExpenses)}`,
      `  Net: ${net >= 0 ? "✅" : "⚠️"} ${fmt(net)} ${net >= 0 ? "surplus" : "deficit"}`,
      `  Savings rate: ${savingsRate}%`,
      ``,
      `💳 CC debt remaining: £${CC_DEBT.zeroPct} (0% — ${CC_DEBT.monthsLeft}mo left)`,
      notes[monthKey] ? `\n📝 Note: ${notes[monthKey]}` : null,
    ].filter(Boolean).join("\n");

    return lines;
  };

  const sendWhatsApp = (weekIdx) => {
    const msg = buildWhatsAppMsg(weekIdx);
    const encoded = encodeURIComponent(msg);
    window.open(`https://wa.me/?text=${encoded}`, "_blank");
  };

  const currentWeekIdx = useMemo(() => {
    const today = new Date();
    return weeks.findIndex(w => today >= w.start && today <= w.end);
  }, [weeks]);

  const TABS = [
    { id: "overview", label: "Overview" },
    { id: "expenses", label: "Expenses" },
    { id: "income", label: "Income" },
    { id: "weeks", label: "Weekly" },
  ];

  return (
    <div style={{ fontFamily: "'DM Mono', monospace", minHeight: "100vh", background: "#f5f3ef", color: "#1a1a1a" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Playfair+Display:wght@500;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: #ccc; border-radius: 2px; }
        input[type=number] { -moz-appearance: textfield; }
        input::-webkit-outer-spin-button, input::-webkit-inner-spin-button { -webkit-appearance: none; }

        .card { background: #fff; border: 1px solid #e8e4dc; border-radius: 3px; padding: 20px; }
        .label { font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: #888; margin-bottom: 4px; }
        .value { font-size: 22px; font-weight: 500; }
        .value-lg { font-size: 28px; font-weight: 500; font-family: 'Playfair Display', serif; }
        .row { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #f0ece4; }
        .row:last-child { border-bottom: none; }
        .tag { font-size: 9px; letter-spacing: 0.08em; text-transform: uppercase; background: #f0ece4; color: #888; padding: 2px 6px; border-radius: 2px; }
        .tag-fixed { background: #e8f0e8; color: #5a8a5a; }
        .tag-var { background: #f0e8e4; color: #8a5a4a; }
        .input-field { border: 1px solid #e0dbd0; border-radius: 2px; padding: 6px 10px; font-family: inherit; font-size: 14px; width: 90px; text-align: right; background: #faf9f6; color: #1a1a1a; }
        .input-field:focus { outline: none; border-color: #aaa; }
        .btn { border: 1px solid #1a1a1a; background: transparent; font-family: inherit; font-size: 11px; letter-spacing: 0.08em; padding: 8px 16px; cursor: pointer; transition: all 0.15s; border-radius: 2px; }
        .btn:hover { background: #1a1a1a; color: #f5f3ef; }
        .btn-green { border-color: #25d366; color: #25d366; }
        .btn-green:hover { background: #25d366; color: #fff; }
        .btn-active { background: #1a1a1a; color: #f5f3ef; }
        .tab { padding: 10px 18px; font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; cursor: pointer; border: none; background: transparent; font-family: inherit; color: #888; border-bottom: 2px solid transparent; transition: all 0.15s; }
        .tab:hover { color: #1a1a1a; }
        .tab-active { color: #1a1a1a; border-bottom-color: #1a1a1a; }
        .surplus { color: #2d6e3a; }
        .deficit { color: #8a2c2c; }
        .week-card { border: 1px solid #e8e4dc; border-radius: 3px; padding: 16px; margin-bottom: 12px; background: #fff; }
        .week-card.current { border-color: #1a1a1a; }
        .progress-bar { height: 4px; background: #f0ece4; border-radius: 2px; margin-top: 8px; }
        .progress-fill { height: 100%; border-radius: 2px; transition: width 0.3s; }
        textarea { width: 100%; border: 1px solid #e0dbd0; border-radius: 2px; padding: 10px; font-family: inherit; font-size: 13px; background: #faf9f6; color: #1a1a1a; resize: vertical; min-height: 80px; }
        textarea:focus { outline: none; border-color: #aaa; }
        .section-title { font-family: 'Playfair Display', serif; font-size: 17px; font-weight: 500; margin-bottom: 16px; }
        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        @media(max-width: 600px) { .grid-2 { grid-template-columns: 1fr; } }
        .pill { display: inline-block; font-size: 9px; letter-spacing: 0.08em; padding: 2px 7px; border-radius: 10px; text-transform: uppercase; }
      `}</style>

      {/* Header */}
      <div style={{ background: "#1a1a1a", color: "#f5f3ef", padding: "20px 24px" }}>
        <div style={{ maxWidth: 780, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, letterSpacing: "-0.01em" }}>Budget</div>
              <div style={{ fontSize: 10, letterSpacing: "0.15em", color: "#888", textTransform: "uppercase", marginTop: 2 }}>Personal Finance Tracker</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button className="btn" style={{ borderColor: "#555", color: "#aaa", padding: "6px 10px" }} onClick={prevMonth}>←</button>
              <div style={{ fontSize: 13, letterSpacing: "0.06em", minWidth: 120, textAlign: "center" }}>
                {MONTHS[month]} {year}
              </div>
              <button className="btn" style={{ borderColor: "#555", color: "#aaa", padding: "6px 10px" }} onClick={nextMonth}>→</button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e8e4dc" }}>
        <div style={{ maxWidth: 780, margin: "0 auto", display: "flex" }}>
          {TABS.map(t => (
            <button key={t.id} className={`tab ${activeTab === t.id ? "tab-active" : ""}`} onClick={() => setActiveTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 780, margin: "0 auto", padding: "20px 16px" }}>

        {/* ── OVERVIEW ── */}
        {activeTab === "overview" && (
          <div>
            <div className="grid-2" style={{ marginBottom: 16 }}>
              <div className="card">
                <div className="label">Total Income</div>
                <div className={`value-lg surplus`}>{fmt(totalIncome)}</div>
              </div>
              <div className="card">
                <div className="label">Total Expenses</div>
                <div className="value-lg">{fmt(totalExpenses)}</div>
              </div>
            </div>

            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div className="label">Monthly Net</div>
                  <div className={`value-lg ${net >= 0 ? "surplus" : "deficit"}`}>
                    {net >= 0 ? "+" : "–"}{fmt(net)}
                  </div>
                  <div style={{ fontSize: 11, color: "#888", marginTop: 6 }}>
                    Savings rate: {savingsRate}%
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="label">Fixed</div>
                  <div style={{ fontSize: 15, fontWeight: 500 }}>{fmt(totalFixed)}</div>
                  <div className="label" style={{ marginTop: 8 }}>Variable</div>
                  <div style={{ fontSize: 15, fontWeight: 500 }}>{fmt(totalVar)}</div>
                </div>
              </div>
              <div className="progress-bar" style={{ marginTop: 14 }}>
                <div className="progress-fill" style={{
                  width: `${Math.min(100, (totalExpenses / totalIncome) * 100)}%`,
                  background: net >= 0 ? "#2d6e3a" : "#8a2c2c"
                }} />
              </div>
              <div style={{ fontSize: 10, color: "#aaa", marginTop: 6, letterSpacing: "0.06em" }}>
                {((totalExpenses / totalIncome) * 100).toFixed(1)}% of income spent
              </div>
            </div>

            {/* CC Debt Summary */}
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="section-title">Credit Card Debt</div>
              <div className="row">
                <span style={{ fontSize: 13 }}>Total debt</span>
                <span style={{ fontWeight: 500 }}>{fmt(CC_DEBT.total)}</span>
              </div>
              <div className="row">
                <span style={{ fontSize: 13 }}>0% balance <span className="tag" style={{ background: "#e8f0e8", color: "#5a8a5a" }}>{CC_DEBT.monthsLeft}mo left</span></span>
                <span style={{ fontWeight: 500 }}>{fmt(CC_DEBT.zeroPct)}</span>
              </div>
              <div className="row">
                <span style={{ fontSize: 13 }}>Monthly minimum payment</span>
                <input
                  className="input-field"
                  type="number"
                  value={ccMinPayment}
                  min={0}
                  step={5}
                  onChange={e => setCcMinPayment(+e.target.value)}
                />
              </div>
              <div style={{ fontSize: 11, color: "#aaa", marginTop: 10 }}>
                At £{ccMinPayment}/mo: 0% card cleared in ~{Math.ceil(CC_DEBT.zeroPct / ccMinPayment)} months
              </div>
            </div>

            {/* Notes */}
            <div className="card">
              <div className="section-title">Monthly Notes</div>
              <textarea
                placeholder="Add any notes for this month..."
                value={notes[monthKey] || ""}
                onChange={e => setNotes(prev => ({ ...prev, [monthKey]: e.target.value }))}
              />
            </div>
          </div>
        )}

        {/* ── EXPENSES ── */}
        {activeTab === "expenses" && (
          <div>
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="section-title">Fixed Expenses</div>
              {FIXED_EXPENSES.map(e => (
                <div className="row" key={e.id}>
                  <div>
                    <span style={{ fontSize: 13 }}>{e.label}</span>
                    {e.note && <div style={{ fontSize: 10, color: "#aaa" }}>{e.note}</div>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="tag tag-fixed">fixed</span>
                    <span style={{ fontWeight: 500, minWidth: 72, textAlign: "right" }}>{fmt(e.amount)}</span>
                  </div>
                </div>
              ))}
              <div className="row" style={{ borderTop: "1px solid #e8e4dc", marginTop: 8, paddingTop: 12 }}>
                <span style={{ fontSize: 12, color: "#888" }}>Fixed subtotal</span>
                <span style={{ fontWeight: 500 }}>{fmt(totalFixed)}</span>
              </div>
            </div>

            <div className="card">
              <div className="section-title">Variable Expenses</div>
              <div className="label" style={{ marginBottom: 12 }}>Edit amounts for {MONTHS[month]}</div>

              {[
                { key: "electricity", label: "Electricity", note: "Usually lower in summer" },
                { key: "mobile", label: "Mobile Bills", note: "Both you & wife" },
                { key: "groceries", label: "Groceries", note: null },
                { key: "takeouts", label: "Takeaways", note: null },
                { key: "fuel", label: "Fuel", note: "Hybrid CT200h — delivery driving" },
                { key: "misc", label: "Miscellaneous", note: null },
              ].map(({ key, label, note }) => (
                <div className="row" key={key}>
                  <div>
                    <span style={{ fontSize: 13 }}>{label}</span>
                    {note && <div style={{ fontSize: 10, color: "#aaa" }}>{note}</div>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="tag tag-var">variable</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ fontSize: 12, color: "#888" }}>£</span>
                      <input
                        className="input-field"
                        type="number"
                        value={vars[key]}
                        min={0}
                        step={1}
                        onChange={e => setVar(key, +e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              ))}

              <div className="row">
                <div>
                  <span style={{ fontSize: 13 }}>CC Minimum Payment</span>
                  <div style={{ fontSize: 10, color: "#aaa" }}>0% card minimum</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 12, color: "#888" }}>£</span>
                  <input
                    className="input-field"
                    type="number"
                    value={ccMinPayment}
                    min={0}
                    step={5}
                    onChange={e => setCcMinPayment(+e.target.value)}
                  />
                </div>
              </div>

              <div className="row" style={{ borderTop: "1px solid #e8e4dc", marginTop: 8, paddingTop: 12 }}>
                <span style={{ fontSize: 12, color: "#888" }}>Variable subtotal</span>
                <span style={{ fontWeight: 500 }}>{fmt(totalVar)}</span>
              </div>
            </div>
          </div>
        )}

        {/* ── INCOME ── */}
        {activeTab === "income" && (
          <div>
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="section-title">Income Sources</div>

              <div className="row">
                <div>
                  <span style={{ fontSize: 13 }}>Wife's Salary</span>
                  <div style={{ fontSize: 10, color: "#aaa" }}>Monthly, post-tax</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="tag tag-fixed">fixed</span>
                  <span style={{ fontWeight: 500 }}>{fmt(WIFE_INCOME)}</span>
                </div>
              </div>

              <div className="row">
                <div>
                  <span style={{ fontSize: 13 }}>Food Delivery</span>
                  <div style={{ fontSize: 10, color: "#aaa" }}>Paid weekly — set per week in Weekly tab</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="tag tag-var">weekly</span>
                  <span style={{ fontWeight: 500 }}>{fmt(deliveryMonthly)}</span>
                </div>
              </div>

              <div className="row" style={{ alignItems: "flex-start", paddingTop: 14 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 13 }}>New Job</span>
                    <button
                      className={`btn ${newJobActive ? "btn-active" : ""}`}
                      style={{ fontSize: 9, padding: "3px 8px" }}
                      onClick={() => setNewJobActive(a => !a)}
                    >
                      {newJobActive ? "Active" : "Inactive"}
                    </button>
                  </div>
                  <div style={{ fontSize: 10, color: "#aaa" }}>12h contract, up to 20h/week · £12.83–13/hr</div>
                  {newJobActive && (
                    <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                      <div>
                        <div className="label">Hours/week</div>
                        <input className="input-field" type="number" value={newJobHours} min={12} max={20} step={1} onChange={e => setNewJobHours(+e.target.value)} style={{ width: 70 }} />
                      </div>
                      <div>
                        <div className="label">Rate (£/hr)</div>
                        <input className="input-field" type="number" value={newJobRate} min={12.83} max={13} step={0.01} onChange={e => setNewJobRate(+e.target.value)} style={{ width: 80 }} />
                      </div>
                    </div>
                  )}
                </div>
                <span style={{ fontWeight: 500, color: newJobActive ? "#2d6e3a" : "#bbb" }}>
                  {newJobActive ? fmt(newJobMonthly) : "—"}
                </span>
              </div>

              <div className="row" style={{ borderTop: "1px solid #e8e4dc", marginTop: 8, paddingTop: 12 }}>
                <span style={{ fontSize: 12, color: "#888" }}>Total income</span>
                <span style={{ fontWeight: 600, fontSize: 16, fontFamily: "'Playfair Display', serif" }}>{fmt(totalIncome)}</span>
              </div>
            </div>

            {newJobActive && (
              <div className="card" style={{ background: "#f9f9f6" }}>
                <div className="label" style={{ marginBottom: 8 }}>New Job Estimate Breakdown</div>
                <div className="row">
                  <span style={{ fontSize: 12 }}>Per week ({newJobHours}h × £{newJobRate})</span>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{fmt(newJobHours * newJobRate)}</span>
                </div>
                <div className="row">
                  <span style={{ fontSize: 12 }}>Per month (× 4.33 weeks)</span>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{fmt(newJobMonthly)}</span>
                </div>
                <div style={{ fontSize: 10, color: "#aaa", marginTop: 8 }}>
                  Tax & NI not yet deducted. Remember to account for these once your payslip confirms the deductions.
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── WEEKLY ── */}
        {activeTab === "weeks" && (
          <div>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 16, letterSpacing: "0.06em" }}>
              Weeks run Monday → Sunday. Set your actual delivery earnings per week, then send a WhatsApp summary.
            </div>

            {weeks.map((w, i) => {
              const wk = `${monthKey}-${i}`;
              const del = weekDelivery[wk] !== undefined ? weekDelivery[wk] : DELIVERY_WEEKLY;
              const isCurrent = i === currentWeekIdx;
              const weekShare = totalExpenses / weeks.length;
              const weekIncome = WIFE_INCOME / 4.33 + del + (newJobActive ? newJobHours * newJobRate : 0);
              const weekNet = weekIncome - weekShare;

              return (
                <div key={i} className={`week-card ${isCurrent ? "current" : ""}`}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontWeight: 500, fontSize: 13 }}>Week {i + 1}</span>
                        {isCurrent && <span className="pill" style={{ background: "#1a1a1a", color: "#fff" }}>Current</span>}
                      </div>
                      <div style={{ fontSize: 11, color: "#888", marginTop: 3 }}>
                        {fmtDate(w.start)} — {fmtDate(w.end)}
                      </div>
                    </div>
                    <button className="btn btn-green" onClick={() => sendWhatsApp(i)}>
                      📲 Send to WhatsApp
                    </button>
                  </div>

                  <div style={{ display: "flex", gap: 20, marginTop: 14, flexWrap: "wrap" }}>
                    <div>
                      <div className="label">Delivery Income</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{ fontSize: 12, color: "#888" }}>£</span>
                        <input
                          className="input-field"
                          type="number"
                          value={del}
                          min={0}
                          step={10}
                          onChange={e => setWeekDelivery(prev => ({ ...prev, [wk]: +e.target.value }))}
                          style={{ width: 80 }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="label">Weekly Income Est.</div>
                      <div style={{ fontSize: 15, fontWeight: 500, marginTop: 4 }}>{fmt(weekIncome)}</div>
                    </div>
                    <div>
                      <div className="label">Expense Share</div>
                      <div style={{ fontSize: 15, fontWeight: 500, marginTop: 4 }}>{fmt(weekShare)}</div>
                    </div>
                    <div>
                      <div className="label">Weekly Net</div>
                      <div className={`${weekNet >= 0 ? "surplus" : "deficit"}`} style={{ fontSize: 15, fontWeight: 500, marginTop: 4 }}>
                        {weekNet >= 0 ? "+" : "–"}{fmt(weekNet)}
                      </div>
                    </div>
                  </div>

                  <div className="progress-bar">
                    <div className="progress-fill" style={{
                      width: `${Math.min(100, (weekShare / weekIncome) * 100)}%`,
                      background: weekNet >= 0 ? "#2d6e3a" : "#8a2c2c"
                    }} />
                  </div>
                </div>
              );
            })}

            <div style={{ fontSize: 10, color: "#bbb", marginTop: 12, textAlign: "center", letterSpacing: "0.08em" }}>
              WhatsApp opens a pre-filled message — tap Send in WhatsApp to deliver it.
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
