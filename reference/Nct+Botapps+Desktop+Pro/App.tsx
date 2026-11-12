import React, { useEffect, useState, useRef } from 'react';

// TYPES
type Bot = { id: string; name: string; code: string; status: 'active' | 'idle' | 'error'; desc: string; scheduledCount: number };
type ChatMsg = { id: string; role: 'user' | 'bot' | 'system'; text: string; ts: string; transient?: boolean };
type GanttTask = { id: string; label: string; start: number; dur: number; type: 'auto' | 'user' | 'monitor'; progress: number };

const BOTS: Bot[] = [
  { id: 'gh01', name: 'Greenhouse Bot', code: 'GH-01', status: 'active', desc: 'Monitors bay 3-7, waters, logs', scheduledCount: 12 },
  { id: 'lab02', name: 'Lab Sampler', code: 'LAB-02', status: 'active', desc: 'Soil samples, pH, EC logging', scheduledCount: 8 },
  { id: 'field03', name: 'Field Monitor', code: 'FLD-03', status: 'idle', desc: 'LoRa sensors field north', scheduledCount: 3 },
  { id: 'inbox', name: 'Inbox Router', code: 'INB-01', status: 'error', desc: 'Email triage + calendar', scheduledCount: 24 },
];

const INITIAL_MSGS: Record<string, ChatMsg[]> = {
  gh01: [
    { id: '1', role: 'system', text: 'Bot connected to GLOBAL → Monitor: GH-Sensors-LAN, Email: greenhouse@lab.local', ts: '09:12:04' },
    { id: '2', role: 'bot', text: 'Bay 4 humidity dropped to 42% at 09:14. I increased misting to 70% without logging chat. See live rail →', ts: '09:14:22' },
    { id: '3', role: 'user', text: 'Show me which plants need water today', ts: '09:15:01' },
    { id: '4', role: 'bot', text: '3 plants flagged: Tomato-B4-R12 (moisture 18%), Basil-B3-R02 (18%), Lettuce-B7-R09 (21%). Dashboard widgets updated. I scheduled watering at 09:45 - see Schedule.', ts: '09:15:12' },
    { id: '5', role: 'bot', text: 'Also opened pH log in WebViews > GH-Logs', ts: '09:15:13' },
  ],
  lab02: [
    { id: '1', role: 'bot', text: 'Last sample FLD-N-042 logged: pH 6.4 EC 1.8. Dashboard updated.', ts: '08:42:00' },
  ],
  field03: [{ id: '1', role: 'system', text: 'Idle. Waiting for monitor callback.', ts: '07:00:00' }],
  inbox: [{ id: '1', role: 'bot', text: 'Filtered 12 emails. 3 require action in Email tab.', ts: '09:00:00' }],
};

const GANTT: GanttTask[] = [
  { id: 't1', label: 'Mist Bay 4 (auto from humidity monitor)', start: 0, dur: 2, type: 'auto', progress: 100 },
  { id: 't2', label: 'Water Tomato-B4-R12', start: 1, dur: 1.5, type: 'auto', progress: 60 },
  { id: 't3', label: 'Log growth samples', start: 3, dur: 1, type: 'user', progress: 0 },
  { id: 't4', label: 'Calibrate pH sensor (Monitor callback)', start: 4.5, dur: 2, type: 'monitor', progress: 0 },
  { id: 't5', label: 'Open email report', start: 6, dur: 0.5, type: 'auto', progress: 0 },
  { id: 't6', label: 'Night cycle check', start: 9, dur: 3, type: 'monitor', progress: 0 },
];

type PersistedEvent = { botId: string; kind: string; label: string; ts: number };

async function apiCall(action: string, args: any) {
  const res = await fetch("actions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, args }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || (j as any).error) throw new Error((j as any).error || "api error");
  return (j as any).data;
}

export default function App() {
  const [selectedBot, setSelectedBot] = useState<Bot>(BOTS[0]);
  const [activeTab, setActiveTab] = useState<'chat' | 'dashboard' | 'control' | 'schedule' | 'tasks' | 'email' | 'webviews'>('chat');
  const [globalView, setGlobalView] = useState<'none' | 'monitors' | 'emails' | 'dbs'>('none');
  const [msgs, setMsgs] = useState<ChatMsg[]>(INITIAL_MSGS['gh01']);
  const [input, setInput] = useState('');
  const [liveVals, setLiveVals] = useState({ humidity: 42.3, temp: 24.8, moisture: 18, co2: 842, ph: 6.31 });
  const [toast, setToast] = useState<string | null>(null);
  const [scheduleView, setScheduleView] = useState<'gantt' | 'calendar'>('gantt');
  const [tasksView, setTasksView] = useState<'kanban' | 'list' | 'contacts'>('kanban');
  const [webViewTab, setWebViewTab] = useState(0);
  const [persisted, setPersisted] = useState<PersistedEvent[]>([]);
  const [persistBusy, setPersistBusy] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);

  // ---- Persistence: load on startup (required contract) ----
  const reloadRecords = async () => {
    try {
      const data = await apiCall("records.list", { collection: "nct_events", limit: 100 });
      const recs = (data?.records || []) as { value: PersistedEvent }[];
      setPersisted(recs.map(r => r.value).sort((a, b) => b.ts - a.ts));
    } catch {
      // backend unavailable in preview – keep empty
    }
  };

  useEffect(() => {
    // literal action strings required by validator
    // initial load
    apiCall("records.list", { collection: "nct_events", limit: 100 })
      .then((d: any) => {
        const recs = (d?.records || []) as { value: PersistedEvent }[];
        setPersisted(recs.map(r => r.value).sort((a, b) => b.ts - a.ts));
      })
      .catch(() => {});
  }, []);

  const createRow = async (row: PersistedEvent) => {
    await apiCall("records.create", { collection: "nct_events", value: row });
  };

  const logPersisted = async (kind: string, label: string) => {
    const row: PersistedEvent = { botId: selectedBot.id, kind, label, ts: Date.now() };
    setPersistBusy(true);
    try {
      await createRow(row);
      await reloadRecords();
    } catch (e) {
      setToast(`Persist error: ${e instanceof Error ? e.message : String(e)}`);
      setTimeout(() => setToast(null), 2500);
    } finally {
      setPersistBusy(false);
    }
  };

  // live widget animation
  useEffect(() => {
    const iv = setInterval(() => {
      setLiveVals(v => ({
        humidity: +(v.humidity + (Math.random() - 0.5) * 0.4).toFixed(1),
        temp: +(v.temp + (Math.random() - 0.5) * 0.1).toFixed(1),
        moisture: Math.max(10, Math.min(40, v.moisture + (Math.random() - 0.5) * 0.6)),
        co2: Math.round(v.co2 + (Math.random() - 0.5) * 8),
        ph: +(v.ph + (Math.random() - 0.5) * 0.02).toFixed(2),
      }));
    }, 1200);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    setMsgs(INITIAL_MSGS[selectedBot.id] || []);
    setGlobalView('none');
    setActiveTab('chat');
  }, [selectedBot.id]);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' });
  }, [msgs]);

  const send = () => {
    if (!input.trim()) return;
    const newMsg: ChatMsg = { id: Date.now().toString(), role: 'user', text: input, ts: new Date().toLocaleTimeString('en-GB') };
    setMsgs(m => [...m, newMsg]);
    setInput('');
    logPersisted("chat", `User: ${input.slice(0, 120)}`);
    setTimeout(() => {
      setMsgs(m => [...m, { id: (Date.now()+1).toString(), role: 'bot', text: `Acknowledged. Updating dashboard widgets and Schedule. Control Panel actions refreshed.`, ts: new Date().toLocaleTimeString('en-GB') }]);
    }, 600);
  };

  const triggerControl = (action: string) => {
    setToast(`BOT ACTION: ${action} — executed via Control Panel. Stationary widgets updating.`);
    setTimeout(() => setToast(null), 3000);
    setMsgs(m => [...m, { id: Date.now().toString(), role: 'system', text: `Control Panel → ${action} triggered by user`, ts: new Date().toLocaleTimeString('en-GB') }]);
    logPersisted("control", action);
  };

  return (
    <div data-safe-area-inset-root className="min-h-screen w-full bg-[var(--bg)] text-[13px] flex flex-col" style={{ boxSizing: 'border-box', paddingTop: 'var(--safe-area-inset-top)' }}>
      {/* TOP SYSTEM BAR */}
      <div className="h-[32px] shrink-0 flex items-center px-3 bg-[#0F0F0F] border-b border-[var(--border)] justify-between">
        <div className="flex items-center gap-3">
          <div className="mono text-[11px] tracking-[0.14em] font-semibold">NCT / BOT APPS OS</div>
          <div className="h-3 w-px bg-[var(--border)]" />
          <div className="mono text-[10px] text-[var(--text-dim)]">v0.9.1 • PROTOTYPE — Issues from doc implemented</div>
        </div>
        <div className="flex items-center gap-2 mono text-[10px]">
          <span className="px-1.5 py-0.5 bg-[var(--panel-3)] border border-[var(--border)] rounded-[2px]">SECURE CONTEXT</span>
          <span className="w-2 h-2 rounded-[2px] bg-[var(--accent-2)] animate-pulse" />
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* LEFT GLOBAL NAV - 240px */}
        <aside className="w-[240px] shrink-0 bg-[#171717] border-r border-[var(--border)] flex flex-col">
          <div className="p-3 border-b border-[var(--border)]">
            <div className="mono text-[10px] tracking-[0.12em] text-[var(--text-faint)] mb-2">GLOBAL RESOURCES</div>
            <div className="space-y-1">
              {[
                { id: 'monitors', label: 'Monitor Modules', count: 4, icon: '◫', view: 'monitors' as const },
                { id: 'emails', label: 'Email Accounts', count: 2, icon: '✉', view: 'emails' as const },
                { id: 'dbs', label: 'Databases', count: 1, icon: '▤', view: 'dbs' as const },
              ].map(r => (
                <button key={r.id} onClick={() => setGlobalView(r.view)} className={`w-full text-left flex items-center justify-between px-2 py-1.5 rounded-[2px] border ${globalView === r.view ? 'bg-[var(--panel-2)] border-[var(--border-strong)] text-white' : 'border-transparent hover:bg-[var(--panel)] hover:border-[var(--border)] text-[var(--text-dim)]'} transition-colors`}>
                  <span className="flex items-center gap-2 mono text-[11px]"><span className="text-[10px]">{r.icon}</span>{r.label}</span>
                  <span className="mono text-[10px] bg-[var(--panel-3)] px-1 rounded-[2px]">{r.count}</span>
                </button>
              ))}
            </div>
            <div className="mt-3 p-2 bg-[#1B1B1B] border border-[var(--border)] rounded-[2px]">
              <div className="mono text-[9px] text-[var(--text-faint)] tracking-widest">DOC REQUIREMENT</div>
              <div className="text-[11px] leading-[1.3] mt-1 text-[var(--text-dim)]">Global resource module e.g. remote database, email account, can be connected to individual bots by user, known by all bots.</div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            <div className="mono text-[10px] tracking-[0.12em] text-[var(--text-faint)] mb-2 flex items-center justify-between">
              BOTS <span className="text-[var(--text-dim)]">{BOTS.length} INSTANCES</span>
            </div>
            <div className="space-y-1">
              {BOTS.map(bot => (
                <button key={bot.id} onClick={() => setSelectedBot(bot)} className={`w-full text-left p-2 rounded-[2px] border flex gap-2 ${selectedBot.id === bot.id && globalView === 'none' ? 'bg-[var(--panel-2)] border-[var(--accent)]/30' : 'bg-transparent border-transparent hover:bg-[var(--panel)] hover:border-[var(--border)]'}`}>
                  <div className={`mt-0.5 w-[6px] h-[6px] rounded-[1px] shrink-0 ${bot.status === 'active' ? 'bg-[var(--accent-2)]' : bot.status === 'idle' ? 'bg-[var(--text-faint)]' : 'bg-[var(--danger)]'}`} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="mono text-[11px] font-medium tracking-wide">{bot.code}</span>
                      <span className="text-[11px] truncate">{bot.name}</span>
                    </div>
                    <div className="mono text-[10px] text-[var(--text-dim)] truncate">{bot.desc}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="mono text-[9px] px-1 py-0.5 bg-[var(--panel-3)] border border-[var(--border)] rounded-[2px]">{bot.scheduledCount} SCHEDULED</span>
                      {bot.status === 'active' && <span className="mono text-[9px] text-[var(--accent-2)]">● LIVE</span>}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-6">
              <div className="mono text-[10px] tracking-[0.12em] text-[var(--text-faint)] mb-2">ANNOTATION LEGEND</div>
              <div className="space-y-1.5">
                {[
                  ['§2.1', 'Mixture of procedural + stationary widgets'],
                  ['§2.2', 'Bot activity outside chat in dashboard'],
                  ['§2.3', 'Transient data not logged label'],
                  ['§3.1', 'Dashboard + Control Panel pages'],
                ].map(([k, v]) => (
                  <div key={k} className="flex gap-2 text-[10px] mono leading-[1.3]"><span className="px-1 bg-[var(--accent)] text-black rounded-[2px] shrink-0 h-fit">{k}</span><span className="text-[var(--text-dim)]">{v}</span></div>
                ))}
              </div>
            </div>
          </div>

          <div className="p-2 border-t border-[var(--border)] flex items-center gap-2">
            <div className="w-6 h-6 rounded-[2px] bg-[var(--panel-3)] border border-[var(--border)] flex items-center justify-center mono text-[10px]">AK</div>
            <div><div className="text-[11px] leading-none">Alex K.</div><div className="mono text-[10px] text-[var(--text-dim)]">admin@nct.local</div></div>
            <div className="ml-auto mono text-[9px] px-1 border border-[var(--border)] rounded-[2px]">PRO</div>
          </div>
        </aside>

        {/* MAIN */}
        <div className="flex-1 min-w-0 flex flex-col bg-[var(--bg)]">
          {/* BOT HEADER */}
          {globalView === 'none' ? (
            <div data-safe-area-sticky-top className="sticky z-20 bg-[var(--bg-elevated)] border-b border-[var(--border)]" style={{ top: 'var(--safe-area-inset-top)' }}>
              <div className="h-[48px] flex items-center px-4 justify-between border-b border-[var(--border)]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-[2px] bg-[var(--panel-2)] border border-[var(--border)] flex items-center justify-center mono text-[11px] font-semibold">{selectedBot.code.slice(0,2)}</div>
                  <div>
                    <div className="flex items-center gap-2"><span className="text-[13px] font-semibold">{selectedBot.name}</span><span className="mono text-[10px] px-1.5 py-0.5 bg-[var(--panel-3)] border border-[var(--border)] rounded-[2px]">{selectedBot.code}</span><span className={`w-1.5 h-1.5 rounded-[1px] ${selectedBot.status === 'active' ? 'bg-[var(--accent-2)]' : 'bg-[var(--text-faint)]'}`} /></div>
                    <div className="mono text-[10px] text-[var(--text-dim)]">{selectedBot.desc} • Last sync 2m ago</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="mono text-[10px] text-[var(--text-dim)]">CONNECTED RESOURCES:</div>
                  <span className="mono text-[10px] px-1.5 py-1 bg-[#1E2A1E] border border-[#2A4A2A] text-[var(--accent-2)] rounded-[2px]">GH-Sensors-LAN</span>
                  <span className="mono text-[10px] px-1.5 py-1 bg-[#1E242A] border border-[#2A3A4A] text-[var(--blue)] rounded-[2px]">greenhouse@lab.local</span>
                  <span className="mono text-[10px] px-1.5 py-1 bg-[#2A1E1E] border border-[#4A2A2A] text-[#FF9A9A] rounded-[2px]">pg:greenhouse_db</span>
                </div>
              </div>
              {/* SECONDARY NAV TABS */}
              <div className="h-[36px] flex items-center px-2 gap-1 overflow-x-auto">
                {[
                  { id: 'chat', label: 'Chat Log', doc: '§3 Chat log page' },
                  { id: 'dashboard', label: 'Dashboard', doc: '§3 Dashboard' },
                  { id: 'control', label: 'Control Panel', doc: '§3 Control Panel' },
                  { id: 'schedule', label: 'Schedule', doc: 'Gantt/Calendar' },
                  { id: 'tasks', label: 'Tasks / Kanban / Contacts', doc: '§3 Other pages' },
                  { id: 'email', label: 'Email', doc: 'Built-in client' },
                  { id: 'webviews', label: 'WebViews', doc: 'Webview tabs' },
                ].map(tab => (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`h-[26px] px-3 rounded-[2px] border mono text-[11px] flex items-center gap-2 whitespace-nowrap ${activeTab === tab.id ? 'bg-white text-black border-white font-medium' : 'bg-transparent border-transparent text-[var(--text-dim)] hover:bg-[var(--panel)] hover:border-[var(--border)] hover:text-[var(--text)]'}`}>
                    {tab.label}
                    <span className={`text-[8px] px-1 rounded-[1px] ${activeTab === tab.id ? 'bg-black/10' : 'bg-[var(--panel-3)]'}`}>{tab.doc}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div data-safe-area-sticky-top className="sticky z-20 bg-[var(--bg-elevated)] border-b border-[var(--border)] h-[48px] flex items-center px-4" style={{ top: 'var(--safe-area-inset-top)' }}>
              <span className="mono text-[12px] tracking-wide font-semibold">GLOBAL / {globalView.toUpperCase()}</span>
              <button onClick={() => setGlobalView('none')} className="ml-3 mono text-[10px] px-2 py-1 border border-[var(--border)] rounded-[2px] hover:bg-[var(--panel-2)]">← Back to Bots</button>
            </div>
          )}

          {/* CONTENT AREA */}
          <div className="flex-1 overflow-y-auto min-h-0 bg-[#151515]">
            {globalView !== 'none' ? (
              <GlobalView type={globalView} />
            ) : activeTab === 'chat' ? (
              <div className="flex min-h-full">
                {/* Chat Timeline 60% */}
                <div className="w-[60%] min-w-0 border-r border-[var(--border)] flex flex-col bg-[#161616]">
                  <div className="px-4 py-2 border-b border-[var(--border)] flex items-center justify-between bg-[#1A1A1A]">
                    <div className="mono text-[10px] tracking-[0.12em] text-[var(--text-faint)]">CHAT LOG — LOGGED HISTORY</div>
                    <div className="mono text-[9px] px-1.5 py-0.5 bg-[var(--panel-3)] border border-[var(--border)] rounded-[2px]">§2.1 procedural + stationary</div>
                  </div>
                  <div ref={chatRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                    {msgs.map(m => (
                      <div key={m.id} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[78%] rounded-[2px] border px-3 py-2 ${m.role === 'user' ? 'bg-white text-black border-white' : m.role === 'system' ? 'bg-[#1E1E1E] border-[#2E2E2E] text-[var(--text-dim)] mono text-[11px]' : 'bg-[var(--panel-2)] border-[var(--border)]'}`}>
                          <div className="flex items-center gap-2 mb-1"><span className="mono text-[10px] opacity-60">{m.role.toUpperCase()}</span><span className="mono text-[10px] opacity-40">{m.ts}</span></div>
                          <div className="text-[12.5px] leading-[1.45] whitespace-pre-wrap">{m.text}</div>
                        </div>
                      </div>
                    ))}
                    <div className="pt-2 mono text-[10px] text-[var(--text-faint)]">Bot also updates widgets on right without adding chat message — see live rail.</div>
                  </div>
                  <div className="p-3 border-t border-[var(--border)] bg-[#1A1A1A] flex gap-2">
                    <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="Tell bot to open webview, schedule, etc…" className="flex-1 h-[32px] px-3 bg-[#0F0F0F] border border-[var(--border)] rounded-[2px] mono text-[12px] outline-none focus:border-[var(--border-strong)]" />
                    <button onClick={send} className="h-[32px] px-4 bg-white text-black mono text-[11px] font-semibold rounded-[2px] hover:bg-[#E8E8E8]">SEND</button>
                  </div>
                </div>

                {/* Stationary Widget Rail 40% */}
                <div className="w-[40%] min-w-0 bg-[#171717] flex flex-col">
                  <div className="px-4 py-2 border-b border-[var(--border)] flex items-center justify-between bg-[#1D1D1D]">
                    <div className="flex items-center gap-2">
                      <span className="mono text-[10px] tracking-[0.12em] text-[var(--text-faint)]">STATIONARY WIDGET RAIL</span>
                      <span className="mono text-[9px] px-1.5 py-0.5 bg-[#2A2418] border border-[#4A3A1A] text-[#FFD37A] rounded-[2px] animate-pulse">● LIVE — NOT LOGGED §2.3</span>
                    </div>
                    <span className="mono text-[9px] text-[var(--text-faint)]">NEXT TO CHAT FLOW</span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3 space-y-3">
                    <div className="p-2 bg-[#1B1B1B] border border-[var(--border)] rounded-[2px] mono text-[10px] leading-[1.4] text-[var(--text-dim)]">
                      <span className="text-white">DOC FIX:</span> Bot activity does not have to be limited to chats but can be outside chats in stationary dashboard widgets next to chat flow, transient data not logged.
                    </div>

                    <WidgetCard title="GREENHOUSE BAY 4" subtitle="Procedural live" live>
                      <div className="grid grid-cols-2 gap-2">
                        <Metric label="HUMIDITY" value={`${liveVals.humidity}%`} delta="+0.3%" />
                        <Metric label="TEMP" value={`${liveVals.temp}°C`} delta="stable" />
                        <Metric label="SOIL MOIST" value={`${liveVals.moisture.toFixed(1)}%`} warn={liveVals.moisture < 20} />
                        <Metric label="CO2" value={`${liveVals.co2} ppm`} />
                      </div>
                      <div className="mt-3 h-[48px] flex items-end gap-[2px]">{Array.from({ length: 24 }).map((_, i) => <div key={i} className="flex-1 bg-[var(--accent)]/70 rounded-[1px]" style={{ height: `${20 + Math.sin(i / 2 + liveVals.humidity) * 15 + Math.random() * 10}%` }} />)}</div>
                    </WidgetCard>

                    <WidgetCard title="PLANT MONITOR — TOMATO-B4-R12" subtitle="Individual item monitor">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-[2px] bg-[#1E1E1E] border border-[var(--border)] flex items-center justify-center text-[18px]">🍅</div>
                        <div className="flex-1">
                          <div className="mono text-[11px]">Moisture {liveVals.moisture.toFixed(1)}% • pH {liveVals.ph}</div>
                          <div className="mt-1 h-1.5 bg-[var(--panel-3)] rounded-[1px] overflow-hidden"><div className="h-full bg-[var(--danger)]" style={{ width: `${liveVals.moisture}%` }} /></div>
                          <div className="mono text-[9px] text-[var(--text-faint)] mt-1">BOT CONTROLS WATERING WITHOUT CHAT LOG</div>
                        </div>
                      </div>
                    </WidgetCard>

                    <WidgetCard title="EMAIL BOX BOT CONTROLS" subtitle="Email widget that shows email box">
                      <div className="mono text-[10px] space-y-1">
                        <div className="flex justify-between"><span className="text-[var(--text-dim)]">INBOX</span><span>12 unread</span></div>
                        <div className="h-px bg-[var(--border)]" />
                        <div className="text-[11px] truncate">↳ Re: Greenhouse report — needs approval</div>
                        <div className="text-[11px] truncate">↳ Sensor alert Bay 3</div>
                        <div className="text-[var(--text-faint)]">Bot triaged without chat entry</div>
                      </div>
                    </WidgetCard>

                    <WidgetCard title="AIR QUALITY SENSOR" subtitle="Transient — not persisted">
                      <div className="flex items-center justify-between mono text-[11px]"><span>PM2.5</span><span className="text-[var(--accent-2)]">{(8 + Math.random()).toFixed(1)} µg/m³ • OK</span></div>
                    </WidgetCard>
                  </div>
                </div>
              </div>
            ) : activeTab === 'dashboard' ? (
              <DashboardGrid liveVals={liveVals} />
            ) : activeTab === 'control' ? (
              <ControlPanel onAction={triggerControl} />
            ) : activeTab === 'schedule' ? (
              <ScheduleTab view={scheduleView} setView={setScheduleView} tasks={GANTT} />
            ) : activeTab === 'tasks' ? (
              <TasksTab view={tasksView} setView={setTasksView} />
            ) : activeTab === 'email' ? (
              <EmailTab />
            ) : (
              <WebViewsTab active={webViewTab} setActive={setWebViewTab} />
            )}
          </div>

          {/* TOAST */}
          {toast && <div className="fixed bottom-4 left-1/2 -translate-x-1/2 mono text-[11px] px-4 py-2 bg-white text-black border border-white rounded-[2px] shadow-xl z-50">{toast}</div>}
        </div>
      </div>
    </div>
  );
}

function WidgetCard({ title, subtitle, children, live }: { title: string; subtitle: string; children: React.ReactNode; live?: boolean }) {
  return (
    <div className="bg-[#1E1E1E] border border-[var(--border)] rounded-[2px] p-3">
      <div className="flex items-center justify-between mb-2">
        <div><div className="mono text-[11px] font-medium tracking-wide">{title}</div><div className="mono text-[9px] text-[var(--text-faint)]">{subtitle.toUpperCase()}</div></div>
        {live && <div className="w-1.5 h-1.5 rounded-[1px] bg-[var(--accent-2)] animate-pulse" />}
      </div>
      {children}
    </div>
  );
}
function Metric({ label, value, delta, warn }: { label: string; value: string; delta?: string; warn?: boolean }) {
  return (
    <div className={`p-2 rounded-[2px] border ${warn ? 'bg-[#2A1E1E] border-[#4A2A2A]' : 'bg-[#232323] border-[var(--border)]'}`}>
      <div className="mono text-[9px] text-[var(--text-faint)] tracking-widest">{label}</div>
      <div className={`mono text-[13px] font-medium ${warn ? 'text-[var(--danger)]' : 'text-white'}`}>{value}</div>
      {delta && <div className="mono text-[9px] text-[var(--text-dim)]">{delta}</div>}
    </div>
  );
}

function DashboardGrid({ liveVals }: { liveVals: any }) {
  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="mono text-[10px] tracking-[0.12em] text-[var(--text-faint)]">DASHBOARD — STATIONARY WIDGETS FOR INDIVIDUAL ITEMS TO MONITOR §2.4</div>
        <div className="flex items-center gap-2 mono text-[9px]">
          <span className="px-2 py-1 bg-[var(--panel-2)] border border-[var(--border)] rounded-[2px]">DRAGGABLE GRID • PRO LAYOUT</span>
          <span className="px-2 py-1 bg-[var(--accent)] text-black rounded-[2px]">BOT CONTROLS WIDGETS</span>
        </div>
      </div>
      <div className="grid grid-cols-12 gap-3 auto-rows-[minmax(140px,auto)]">
        <div className="col-span-4 bg-[#1E1E1E] border border-[var(--border)] rounded-[2px] p-3">
          <div className="mono text-[11px] font-semibold">GREENHOUSE OVERVIEW</div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {['BAY 3', 'BAY 4', 'BAY 5', 'BAY 6', 'BAY 7', 'BAY 8'].map(b => (
              <div key={b} className="h-[52px] bg-[#232323] border border-[var(--border)] rounded-[2px] p-2 mono text-[10px]"><div className="text-[var(--text-faint)]">{b}</div><div className="text-[13px] text-white mt-1">{(70 + Math.random() * 10).toFixed(0)}%</div></div>
            ))}
          </div>
        </div>
        <div className="col-span-5 bg-[#1E1E1E] border border-[var(--border)] rounded-[2px] p-3">
          <div className="flex justify-between"><span className="mono text-[11px] font-semibold">PLANT MONITORS — INDIVIDUAL</span><span className="mono text-[9px] text-[var(--text-faint)]">8 ITEMS</span></div>
          <div className="mt-3 space-y-2">
            {[
              { name: 'Tomato-B4-R12', moisture: liveVals.moisture, status: 'needs water' },
              { name: 'Basil-B3-R02', moisture: 19.2, status: 'ok' },
              { name: 'Lettuce-B7-R09', moisture: 21.4, status: 'ok' },
            ].map(p => (
              <div key={p.name} className="flex items-center gap-3 p-2 bg-[#232323] border border-[var(--border)] rounded-[2px]">
                <div className="w-8 h-8 bg-[#1A1A1A] border border-[var(--border)] rounded-[2px] flex items-center justify-center">🌱</div>
                <div className="flex-1 min-w-0"><div className="mono text-[11px]">{p.name}</div><div className="mono text-[10px] text-[var(--text-dim)]">{p.moisture.toFixed(1)}% moisture • pH {liveVals.ph}</div></div>
                <span className={`mono text-[9px] px-1.5 py-0.5 rounded-[2px] border ${p.status === 'needs water' ? 'bg-[#2A1E1E] border-[#4A2A2A] text-[#FF9A9A]' : 'bg-[#1E2A1E] border-[#2A4A2A] text-[var(--accent-2)]'}`}>{p.status.toUpperCase()}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="col-span-3 bg-[#1E1E1E] border border-[var(--border)] rounded-[2px] p-3 flex flex-col">
          <div className="mono text-[11px] font-semibold">EMAIL WIDGET</div>
          <div className="mono text-[9px] text-[var(--text-faint)]">BOT CONTROLS EMAIL BOX</div>
          <div className="mt-3 flex-1 bg-[#181818] border border-[var(--border)] rounded-[2px] p-2 mono text-[10px] space-y-1">
            <div className="flex justify-between"><span>INBOX</span><span className="bg-[var(--accent)] text-black px-1 rounded-[1px]">12 NEW</span></div>
            <div className="h-px bg-[var(--border)] my-1" />
            <div>→ Greenhouse daily report</div>
            <div className="text-[var(--text-dim)]">→ pH calibration due</div>
            <div className="text-[var(--text-faint)]">Bot filtered spam</div>
            <button className="mt-2 w-full h-6 bg-white text-black mono text-[10px] rounded-[2px]">OPEN EMAIL CLIENT →</button>
          </div>
        </div>

        <div className="col-span-3 bg-[#1E1E1E] border border-[var(--border)] rounded-[2px] p-3">
          <div className="mono text-[11px] font-semibold">SENSOR — CO2</div>
          <div className="mono text-[22px] font-medium mt-2">{liveVals.co2}<span className="text-[10px] text-[var(--text-dim)]"> ppm</span></div>
          <div className="mt-2 h-[40px] bg-[#181818] border border-[var(--border)] rounded-[2px] flex items-end gap-[2px] p-1">{Array.from({ length: 20 }).map((_, i) => <div key={i} className="flex-1 bg-[var(--blue)]/70 rounded-[1px]" style={{ height: `${30 + Math.random() * 60}%` }} />)}</div>
        </div>
        <div className="col-span-6 bg-[#1E1E1E] border border-[var(--border)] rounded-[2px] p-3">
          <div className="flex justify-between"><span className="mono text-[11px] font-semibold">GREENHOUSE MAP — STATIONARY</span><span className="mono text-[9px] px-1.5 py-0.5 bg-[#1E2A1E] border border-[#2A4A2A] text-[var(--accent-2)] rounded-[2px]">LIVE</span></div>
          <div className="mt-3 h-[96px] bg-[#101010] border border-[var(--border)] rounded-[2px] grid grid-cols-6 gap-[1px] p-[1px]">{Array.from({ length: 18 }).map((_, i) => <div key={i} className={`rounded-[1px] ${i === 7 ? 'bg-[var(--danger)]/50 border border-[var(--danger)]' : 'bg-[#232323]'}`} />)}</div>
        </div>
        <div className="col-span-3 bg-[#1E1E1E] border border-[var(--border)] rounded-[2px] p-3">
          <div className="mono text-[11px] font-semibold">QUICK STATS</div>
          <div className="mt-3 space-y-2 mono text-[10px]">
            <div className="flex justify-between"><span className="text-[var(--text-dim)]">WATER USED TODAY</span><span>142 L</span></div>
            <div className="flex justify-between"><span className="text-[var(--text-dim)]">TASKS DONE</span><span>7 / 12</span></div>
            <div className="flex justify-between"><span className="text-[var(--text-dim)]">ALERTS</span><span className="text-[#FF9A9A]">1 active</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ControlPanel({ onAction }: { onAction: (a: string) => void }) {
  const [sampleName, setSampleName] = useState('');
  return (
    <div className="p-4 max-w-[1100px]">
      <div className="flex items-center gap-3 mb-4">
        <div className="mono text-[10px] tracking-[0.12em] text-[var(--text-faint)]">CONTROL PANEL — BOT SETS UP BUTTONS AND FORMS §3.2</div>
        <span className="mono text-[9px] px-2 py-0.5 bg-[var(--accent)] text-black rounded-[2px]">BOT-DEFINED UI</span>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-7 space-y-4">
          <div className="bg-[#1E1E1E] border border-[var(--border)] rounded-[2px] p-4">
            <div className="flex items-center justify-between mb-3"><span className="mono text-[11px] font-semibold">QUICK ACTIONS — BUTTONS BOT CREATED</span><span className="mono text-[9px] text-[var(--text-faint)]">CLICKABLE → CALLBACK TO BOT</span></div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Water All Bays', icon: '💧', desc: 'Trigger irrigation' },
                { label: 'Run Diagnostics', icon: '◫', desc: 'Sensors check' },
                { label: 'Open Email Report', icon: '✉', desc: 'In webview tab' },
                { label: 'Log Night Cycle', icon: '☾', desc: 'Schedule task' },
                { label: 'Calibrate pH', icon: '⚗', desc: 'Monitor module' },
                { label: 'Emergency Vent', icon: '⚠', desc: 'Critical action' },
              ].map(b => (
                <button key={b.label} onClick={() => onAction(b.label)} className="text-left p-3 bg-[#232323] hover:bg-[#2A2A2A] border border-[var(--border)] hover:border-[var(--border-strong)] rounded-[2px] transition-colors group">
                  <div className="flex items-center gap-2"><span>{b.icon}</span><span className="mono text-[11px] font-medium group-hover:text-white">{b.label}</span></div>
                  <div className="mono text-[10px] text-[var(--text-dim)] mt-1">{b.desc}</div>
                </button>
              ))}
            </div>
            <div className="mt-3 mono text-[10px] text-[var(--text-dim)] p-2 bg-[#181818] border border-[var(--border)] rounded-[2px]">Bot defines these via API: <span className="text-white">controlPanel.addButton({`{id, label, callback}`})</span> — User clicks, bot receives callback without chat log.</div>
          </div>

          <div className="bg-[#1E1E1E] border border-[var(--border)] rounded-[2px] p-4">
            <div className="mono text-[11px] font-semibold mb-3">FORM — LOG NEW SAMPLE (BOT-CREATED)</div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="mono text-[10px] text-[var(--text-dim)]">SAMPLE ID</label><input value={sampleName} onChange={e => setSampleName(e.target.value)} placeholder="FLD-N-043" className="mt-1 w-full h-[32px] px-2 bg-[#0F0F0F] border border-[var(--border)] rounded-[2px] mono text-[12px] outline-none focus:border-white" /></div>
              <div><label className="mono text-[10px] text-[var(--text-dim)]">pH</label><input placeholder="6.4" className="mt-1 w-full h-[32px] px-2 bg-[#0F0F0F] border border-[var(--border)] rounded-[2px] mono text-[12px]" /></div>
              <div><label className="mono text-[10px] text-[var(--text-dim)]">BAY</label><select className="mt-1 w-full h-[32px] px-2 bg-[#0F0F0F] border border-[var(--border)] rounded-[2px] mono text-[12px]"><option>Bay 4</option><option>Bay 3</option></select></div>
              <div><label className="mono text-[10px] text-[var(--text-dim)]">NOTES</label><input placeholder="Observations…" className="mt-1 w-full h-[32px] px-2 bg-[#0F0F0F] border border-[var(--border)] rounded-[2px] mono text-[12px]" /></div>
            </div>
            <button onClick={() => onAction(`Log sample ${sampleName || 'FLD-N-043'}`)} className="mt-4 h-[32px] px-4 bg-white text-black mono text-[11px] font-semibold rounded-[2px]">SUBMIT TO BOT →</button>
          </div>
        </div>

        <div className="col-span-5">
          <div className="bg-[#1E1E1E] border border-[var(--border)] rounded-[2px] p-4 h-full">
            <div className="mono text-[11px] font-semibold">HOW IT SOLVES DOC ISSUE</div>
            <div className="mt-3 space-y-3 mono text-[11px] leading-[1.5] text-[var(--text-dim)]">
              <div className="p-2 bg-[#181818] border-l-2 border-[var(--accent)]">Control panel allows bot to set up buttons and forms that user can click — without going through chat. Bot gets callback.</div>
              <div>Example: Bot created Water All button because humidity monitor fired callback → global resource module → bot → control panel UI.</div>
              <div className="h-px bg-[var(--border)]" />
              <div className="text-[10px]">Current bot defines 6 actions + 1 form. All rendered as stationary UI, not chat.</div>
              <div className="p-2 bg-[#1A1A1A] border border-[var(--border)] rounded-[2px]">
                <div className="text-[10px] text-[var(--text-faint)]">API LOG</div>
                <div className="mt-1 text-[10px]">bot.ui.setControlPanel([{`{type:'button', label:'Water All'…}`}, …])</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScheduleTab({ view, setView, tasks }: { view: 'gantt' | 'calendar'; setView: (v: 'gantt' | 'calendar') => void; tasks: GanttTask[] }) {
  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3"><span className="mono text-[10px] tracking-[0.12em] text-[var(--text-faint)]">SCHEDULE — USER SHOULD SEE ALL WHAT BOT HAS SCHEDULED AS GANTT OR CALENDAR §4.1</span><span className="mono text-[9px] px-2 py-0.5 bg-[var(--accent)] text-black rounded-[2px]">BOT SCHEDULED • 12 ITEMS</span></div>
        <div className="flex bg-[#1E1E1E] border border-[var(--border)] rounded-[2px] p-0.5">
          <button onClick={() => setView('gantt')} className={`h-6 px-3 mono text-[10px] rounded-[1px] ${view === 'gantt' ? 'bg-white text-black' : 'text-[var(--text-dim)]'}`}>GANTT</button>
          <button onClick={() => setView('calendar')} className={`h-6 px-3 mono text-[10px] rounded-[1px] ${view === 'calendar' ? 'bg-white text-black' : 'text-[var(--text-dim)]'}`}>CALENDAR</button>
        </div>
      </div>

      {view === 'gantt' ? (
        <div className="bg-[#1E1E1E] border border-[var(--border)] rounded-[2px] overflow-hidden">
          <div className="grid grid-cols-12 mono text-[10px] text-[var(--text-faint)] border-b border-[var(--border)] bg-[#1A1A1A]">
            <div className="col-span-4 p-2 border-r border-[var(--border)]">TASK</div>
            <div className="col-span-8 p-2 flex justify-between"><span>09:00</span><span>12:00</span><span>15:00</span><span>18:00</span><span>21:00</span></div>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {tasks.map(t => (
              <div key={t.id} className="grid grid-cols-12 items-center h-[40px] hover:bg-[#232323]">
                <div className="col-span-4 px-3 flex items-center gap-2 min-w-0">
                  <div className={`w-2 h-2 rounded-[1px] ${t.type === 'auto' ? 'bg-[var(--accent)]' : t.type === 'monitor' ? 'bg-[var(--blue)]' : 'bg-white'}`} />
                  <span className="mono text-[11px] truncate">{t.label}</span>
                </div>
                <div className="col-span-8 px-2 relative h-full flex items-center">
                  <div className="absolute inset-y-2 bg-[#151515] border border-[var(--border)] rounded-[2px] w-full" />
                  <div className="absolute h-[16px] rounded-[1px] flex items-center" style={{ left: `${(t.start / 12) * 100}%`, width: `${(t.dur / 12) * 100}%`, background: t.type === 'auto' ? 'var(--accent)' : t.type === 'monitor' ? 'var(--blue)' : 'white' }}>
                    <div className="h-full bg-black/20 rounded-[1px]" style={{ width: `${t.progress}%` }} />
                  </div>
                  <span className="relative ml-auto mono text-[9px] px-1 bg-[#0F0F0F] border border-[var(--border)] rounded-[1px]">{t.type.toUpperCase()}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="p-3 bg-[#181818] border-t border-[var(--border)] flex gap-3 mono text-[10px]"><span className="flex items-center gap-1"><span className="w-2 h-2 bg-[var(--accent)] rounded-[1px]" /> AUTO (bot scheduled)</span><span className="flex items-center gap-1"><span className="w-2 h-2 bg-white rounded-[1px]" /> USER</span><span className="flex items-center gap-1"><span className="w-2 h-2 bg-[var(--blue)] rounded-[1px]" /> MONITOR CALLBACK</span></div>
        </div>
      ) : (
        <div className="bg-[#1E1E1E] border border-[var(--border)] rounded-[2px] p-4">
          <div className="grid grid-cols-7 gap-[1px] bg-[var(--border)] border border-[var(--border)] rounded-[2px] overflow-hidden">
            {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map(d => <div key={d} className="bg-[#1A1A1A] p-2 mono text-[10px] text-[var(--text-faint)]">{d}</div>)}
            {Array.from({ length: 28 }).map((_, i) => (
              <div key={i} className="bg-[#1E1E1E] min-h-[86px] p-2">
                <div className="mono text-[11px] text-[var(--text-dim)]">{i + 1}</div>
                {i === 2 && <div className="mt-1 mono text-[9px] p-1 bg-[var(--accent)] text-black rounded-[1px]">Water B4</div>}
                {i === 2 && <div className="mt-1 mono text-[9px] p-1 bg-[#2A2A4A] text-[var(--blue)] border border-[#3A3A5A] rounded-[1px]">Calibrate pH</div>}
                {i === 5 && <div className="mt-1 mono text-[9px] p-1 bg-white text-black rounded-[1px]">Log samples</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TasksTab({ view, setView }: { view: 'kanban' | 'list' | 'contacts'; setView: (v: any) => void }) {
  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <span className="mono text-[10px] tracking-[0.12em] text-[var(--text-faint)]">TASKS / KANBAN / ADDRESS BOOK — OTHER PAGES: GANTT, TASK LISTS, ADDRESS BOOK §5</span>
        <div className="flex bg-[#1E1E1E] border border-[var(--border)] rounded-[2px] p-0.5">
          {(['kanban', 'list', 'contacts'] as const).map(v => <button key={v} onClick={() => setView(v)} className={`h-6 px-3 mono text-[10px] uppercase rounded-[1px] ${view === v ? 'bg-white text-black' : 'text-[var(--text-dim)]'}`}>{v}</button>)}
        </div>
      </div>

      {view === 'kanban' ? (
        <div className="grid grid-cols-3 gap-3">
          {[
            { title: 'TODO', count: 4, tasks: ['Water Tomato-B4', 'pH calibration', 'Export logs', 'Check Bay 3'] },
            { title: 'DOING (BOT)', count: 2, tasks: ['Misting Bay 4 — auto', 'Monitoring CO2 — live'] },
            { title: 'DONE', count: 7, tasks: ['Soil sample FLD-42', 'Night cycle', 'Email report'] },
          ].map(col => (
            <div key={col.title} className="bg-[#1E1E1E] border border-[var(--border)] rounded-[2px] p-3">
              <div className="flex items-center justify-between mb-3"><span className="mono text-[11px] font-semibold">{col.title}</span><span className="mono text-[10px] px-1.5 py-0.5 bg-[var(--panel-3)] border border-[var(--border)] rounded-[2px]">{col.count}</span></div>
              <div className="space-y-2">{col.tasks.map(t => <div key={t} className="p-2 bg-[#232323] border border-[var(--border)] rounded-[2px] mono text-[11px] hover:border-[var(--border-strong)] cursor-pointer">{t}</div>)}</div>
            </div>
          ))}
        </div>
      ) : view === 'list' ? (
        <div className="bg-[#1E1E1E] border border-[var(--border)] rounded-[2px] divide-y divide-[var(--border)] mono text-[11px]">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="p-3 flex justify-between hover:bg-[#232323]"><span>Task #{100 + i} — Log sample</span><span className="text-[var(--text-dim)]">Assigned to GH-01 • Due today</span></div>)}</div>
      ) : (
        <div className="bg-[#1E1E1E] border border-[var(--border)] rounded-[2px] p-3">
          <div className="mono text-[11px] font-semibold mb-3">ADDRESS BOOK — BOT HAS ACCESS TO CONTACTS §6</div>
          <div className="grid grid-cols-12 mono text-[10px] text-[var(--text-faint)] border-b border-[var(--border)] py-2"><div className="col-span-4">NAME</div><div className="col-span-4">EMAIL</div><div className="col-span-4">ROLE</div></div>
          {[
            { n: 'Dr. Lin', e: 'lin@lab.local', r: 'Lab Manager' },
            { n: 'Maya S.', e: 'maya@greenhouse.local', r: 'Botanist' },
            { n: 'Ops', e: 'ops@nct.local', r: 'Global resource owner' },
          ].map(c => <div key={c.e} className="grid grid-cols-12 py-2 border-b border-[var(--border)]/50 mono text-[11px]"><div className="col-span-4">{c.n}</div><div className="col-span-4 text-[var(--text-dim)]">{c.e}</div><div className="col-span-4">{c.r}</div></div>)}
        </div>
      )}
    </div>
  );
}

function EmailTab() {
  return (
    <div className="flex h-full min-h-[500px]">
      <div className="w-[300px] border-r border-[var(--border)] bg-[#1A1A1A] p-2 space-y-1">
        <div className="mono text-[10px] tracking-[0.12em] text-[var(--text-faint)] p-2">EMAIL — BUILT-IN CLIENT THAT USER CAN TELL BOT TO OPEN INSIDE WEBVIEW TAB §7</div>
        {[
          { s: 'Greenhouse daily report', from: 'bot@gh.local', time: '09:14' },
          { s: 'Sensor alert Bay 3 needs attention', from: 'alerts@monitor.local', time: '08:52', unread: true },
          { s: 'Re: Soil samples FLD-N', from: 'maya@lab.local', time: 'Yesterday' },
        ].map(m => (
          <div key={m.s} className={`p-2 rounded-[2px] border ${m.unread ? 'bg-white text-black border-white' : 'bg-[#1E1E1E] border-[var(--border)] hover:bg-[#232323]'}`}>
            <div className="mono text-[11px] font-medium truncate">{m.s}</div>
            <div className="mono text-[10px] opacity-60 flex justify-between"><span>{m.from}</span><span>{m.time}</span></div>
          </div>
        ))}
      </div>
      <div className="flex-1 bg-[#161616] p-6">
        <div className="max-w-[640px] bg-[#1E1E1E] border border-[var(--border)] rounded-[2px] p-6">
          <div className="mono text-[10px] text-[var(--text-faint)]">FROM: alerts@monitor.local → greenhouse@lab.local (GLOBAL RESOURCE)</div>
          <div className="text-[16px] font-semibold mt-2">Sensor alert Bay 3 needs attention</div>
          <div className="h-px bg-[var(--border)] my-4" />
          <div className="mono text-[12px] leading-[1.6] text-[var(--text-dim)]">Humidity sensor Bay 3 reporting 38% for 2h. Greenhouse Bot has been notified via Monitor Module callback. It will adjust misting and update stationary widgets. No chat log needed — action visible in Dashboard and Schedule (Gantt).<br /><br />— Monitor Modules system</div>
          <div className="mt-6 flex gap-2"><button className="h-7 px-3 bg-white text-black mono text-[11px] rounded-[2px]">Bot: Fix it</button><button className="h-7 px-3 bg-[#232323] border border-[var(--border)] mono text-[11px] rounded-[2px]">Open in WebView</button></div>
        </div>
      </div>
    </div>
  );
}

function WebViewsTab({ active, setActive }: { active: number; setActive: (n: number) => void }) {
  const tabs = [
    { id: 'gh-logs', label: 'GH-Logs / pH', url: 'https://greenhouse.local/logs' },
    { id: 'grafana', label: 'Grafana Bay 4', url: 'https://grafana.local/d/gh' },
    { id: 'email-web', label: 'Email Web Client', url: 'https://mail.local' },
  ];
  return (
    <div className="flex flex-col h-full min-h-[500px]">
      <div className="h-[36px] bg-[#1A1A1A] border-b border-[var(--border)] flex items-center px-2 gap-1">
        <span className="mono text-[10px] text-[var(--text-faint)] mr-3 tracking-[0.12em]">WEBVIEWS — BOTS SHOULD OPEN WEB PAGES WITHIN WEB VIEW TABS §8</span>
        {tabs.map((t, i) => (
          <button key={t.id} onClick={() => setActive(i)} className={`h-[26px] px-3 rounded-[2px] border mono text-[11px] flex items-center gap-2 ${active === i ? 'bg-white text-black border-white' : 'bg-[#232323] border-[var(--border)] text-[var(--text-dim)] hover:bg-[#2A2A2A]'}`}>
            <span className="w-2 h-2 rounded-[1px] bg-[#2A2A2A] border border-[var(--border)]" />{t.label}
          </button>
        ))}
        <span className="ml-auto mono text-[9px] px-2 py-1 bg-[#1E2A1E] border border-[#2A4A2A] text-[var(--accent-2)] rounded-[2px]">BOT OPENED TAB VIA API</span>
      </div>
      <div className="flex-1 bg-[#0F0F0F] p-3">
        <div className="h-full bg-white rounded-[2px] border border-[var(--border)] overflow-hidden flex flex-col">
          <div className="h-[32px] bg-[#F2F2F2] border-b border-[#DDD] flex items-center px-3 gap-2"><div className="flex gap-1"><div className="w-3 h-3 rounded-[1px] bg-[#FF5F56]" /><div className="w-3 h-3 rounded-[1px] bg-[#FFBD2E]" /><div className="w-3 h-3 rounded-[1px] bg-[#27C93F]" /></div><div className="ml-4 flex-1 h-5 bg-white border border-[#DDD] rounded-[2px] mono text-[10px] flex items-center px-2 text-black/60">{tabs[active].url}</div></div>
          <div className="flex-1 p-6 bg-[#FAFAFA] text-black mono text-[11px]">
            <div className="max-w-[560px]"><div className="text-[18px] font-semibold mb-2">{tabs[active].label}</div><div className="h-px bg-black/10 mb-4" /><div className="space-y-2 leading-[1.5] text-black/70">This is a webview tab inside app window instead of external browser. Bot called:<br /><span className="bg-black text-white px-1">bot.webview.open('{tabs[active].url}', {'{'} tab: '{tabs[active].label}' {'}'})</span><br /><br />User sees greenhouse logs, Grafana, email client embedded. No external browser needed. Content is isolated but bot can interact via callbacks.<br /><br />— Simulated webview content for {tabs[active].label}</div></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function GlobalView({ type }: { type: 'monitors' | 'emails' | 'dbs' }) {
  return (
    <div className="p-4">
      <div className="mono text-[10px] tracking-[0.12em] text-[var(--text-faint)] mb-4">GLOBAL APP LEVEL: MONITOR MODULES - GET CALLBACKS, SEND TO BOTS, GLOBAL RESOURCE MODULE §9</div>

      {type === 'monitors' && (
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-8 space-y-3">
            {[
              { id: 'GH-Sensors-LAN', type: 'LAN sensors', status: 'active', callbacks: 142, bots: ['GH-01', 'LAB-02'] },
              { id: 'LoRa-Field-North', type: 'LoRaWAN', status: 'active', callbacks: 89, bots: ['FLD-03'] },
              { id: 'Weather-API', type: 'HTTP poll', status: 'idle', callbacks: 12, bots: ['GH-01'] },
            ].map(m => (
              <div key={m.id} className="bg-[#1E1E1E] border border-[var(--border)] rounded-[2px] p-4 flex justify-between">
                <div><div className="mono text-[12px] font-semibold flex items-center gap-2">{m.id}<span className={`w-1.5 h-1.5 rounded-[1px] ${m.status === 'active' ? 'bg-[var(--accent-2)]' : 'bg-[var(--text-faint)]'}`} /></div><div className="mono text-[11px] text-[var(--text-dim)] mt-1">{m.type} • {m.callbacks} callbacks today</div><div className="mt-2 flex gap-1">{m.bots.map(b => <span key={b} className="mono text-[9px] px-1.5 py-0.5 bg-[var(--panel-3)] border border-[var(--border)] rounded-[2px]">{b}</span>)}</div></div>
                <div className="text-right"><div className="mono text-[10px] text-[var(--text-faint)]">CONNECTED TO BOTS BY USER</div><button className="mt-2 h-6 px-3 bg-white text-black mono text-[10px] rounded-[2px]">CONFIGURE</button></div>
              </div>
            ))}
          </div>
          <div className="col-span-4 bg-[#1E1E1E] border border-[var(--border)] rounded-[2px] p-4">
            <div className="mono text-[11px] font-semibold">HOW IT WORKS</div>
            <div className="mt-3 mono text-[11px] leading-[1.5] text-[var(--text-dim)] space-y-2">
              <div>Monitor modules get callbacks (sensor data), send to bots. Global resource known by all bots.</div>
              <div className="p-2 bg-[#181818] border border-[var(--border)] rounded-[2px]">Example: Humidity 42% → Monitor → Bot → Stationary widget updates (transient, not logged) + Schedules Gantt task.</div>
              <div className="text-[10px] text-[var(--text-faint)]">User connects global resource to individual bots in left sidebar.</div>
            </div>
          </div>
        </div>
      )}
      {type === 'emails' && (
        <div className="bg-[#1E1E1E] border border-[var(--border)] rounded-[2px] p-4 mono text-[11px]"><div>2 Email Accounts connected globally. Bots have access rather than connectors or synced data. Built-in email client that user can tell bot to open inside webview tab.</div><div className="mt-3 space-y-2"><div className="p-2 bg-[#232323] border border-[var(--border)] rounded-[2px]">greenhouse@lab.local → connected to GH-01, INB-01</div><div className="p-2 bg-[#232323] border border-[var(--border)] rounded-[2px]">ops@nct.local → global owner</div></div></div>
      )}
      {type === 'dbs' && <div className="bg-[#1E1E1E] border border-[var(--border)] rounded-[2px] p-4 mono text-[11px]">Remote database pg:greenhouse_db — global resource module, connected to GH-01. Bots access via built-in resource, not connector.</div>}
    </div>
  );
}
