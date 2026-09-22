import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts'
import {
  AlertCircle, Boxes, Building2, CheckCircle2, ChevronRight, CircleDollarSign,
  Cloud, CloudOff, Download, FileSpreadsheet, LayoutDashboard, LoaderCircle,
  PackageCheck, ReceiptText, RefreshCcw, Save, Search, UploadCloud, Users, X,
} from 'lucide-react'
import defaultData from './data/defaultData.json'
import { readEmbalaseWorkbook } from './utils/excelParser'
import { fetchSharedState, replaceSharedDashboard, saveSharedNote } from './utils/cloudSync'

const STORAGE_KEY = 'embalase-dashboard-v1'
const DEFAULT_DASHBOARD = {
  source: defaultData.metadata.sourceFile,
  lastUpdated: defaultData.metadata.extractedAt,
  periodLabel: defaultData.metadata.periodLabel,
  agents: defaultData.agents,
  invoices: defaultData.invoices,
}
const PAGE_SIZE = 200
const PIE_COLORS = ['#2DD4BF', '#60A5FA', '#F59E0B', '#F472B6', '#A78BFA', '#94A3B8']

const currency = (value) => new Intl.NumberFormat('id-ID', {
  style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
}).format(Number(value) || 0)
const number = (value, max = 0) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: max }).format(Number(value) || 0)
const shortCurrency = (value) => new Intl.NumberFormat('id-ID', {
  style: 'currency', currency: 'IDR', notation: 'compact', maximumFractionDigits: 1,
}).format(Number(value) || 0)
const formatDate = (value) => value ? new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${value}T00:00:00`)) : '—'
const formatDateTime = (value) => value ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Belum disimpan'

const loadInitial = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    if (saved?.dashboard?.agents?.length) return saved
  } catch { /* cache rusak diabaikan */ }
  return { dashboard: DEFAULT_DASHBOARD, notes: {}, revision: 0 }
}

const SyncBadge = ({ status }) => {
  const labels = {
    online: 'Tersinkron', syncing: 'Menyimpan…', connecting: 'Menghubungkan…', offline: 'Mode lokal',
  }
  const Icon = status.state === 'online' ? Cloud : status.state === 'offline' ? CloudOff : LoaderCircle
  return <div className={`sync-badge ${status.state}`} title={status.error || ''}>
    <Icon size={16} className={status.state === 'syncing' || status.state === 'connecting' ? 'spin' : ''} />
    <div><small>Data lintas browser</small><strong>{labels[status.state]}</strong></div>
  </div>
}

const KpiCard = ({ icon: Icon, label, value, note, tone }) => <article className={`kpi ${tone}`}>
  <div className="kpi-icon"><Icon size={20} /></div>
  <div><small>{label}</small><strong>{value}</strong><span>{note}</span></div>
</article>

export default function App() {
  const initial = useMemo(loadInitial, [])
  const [dashboard, setDashboard] = useState(initial.dashboard)
  const [notes, setNotes] = useState(initial.notes || {})
  const [activePage, setActivePage] = useState('overview')
  const [branch, setBranch] = useState('Semua cabang')
  const [category, setCategory] = useState('Semua kategori')
  const [query, setQuery] = useState('')
  const [selectedKey, setSelectedKey] = useState(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')
  const [syncStatus, setSyncStatus] = useState({ state: 'connecting', error: '', lastSynced: null })
  const revisionRef = useRef(Number(initial.revision) || 0)
  const dashboardRef = useRef(dashboard)
  const notesRef = useRef(notes)
  const pendingDashboardRef = useRef(null)
  const pendingNotesRef = useRef(new Map())

  useEffect(() => { dashboardRef.current = dashboard }, [dashboard])
  useEffect(() => { notesRef.current = notes }, [notes])

  const persist = useCallback((nextDashboard, nextNotes, revision = revisionRef.current) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ dashboard: nextDashboard, notes: nextNotes, revision }))
  }, [])

  const applySharedState = useCallback((shared, force = false) => {
    if (!shared) return false
    const revision = Number(shared.revision) || 0
    if (!force && revision <= revisionRef.current) return false
    const nextDashboard = shared.data?.agents?.length ? shared.data : dashboardRef.current
    const nextNotes = shared.accountNotes || {}
    revisionRef.current = revision
    dashboardRef.current = nextDashboard
    notesRef.current = nextNotes
    setDashboard(nextDashboard)
    setNotes(nextNotes)
    persist(nextDashboard, nextNotes, revision)
    return true
  }, [persist])

  const syncFromCloud = useCallback(async ({ notify = false } = {}) => {
    if (notify) setSyncStatus((current) => ({ ...current, state: 'syncing', error: '' }))
    try {
      if (pendingDashboardRef.current) {
        const shared = await replaceSharedDashboard(pendingDashboardRef.current)
        pendingDashboardRef.current = null
        applySharedState(shared, true)
      }
      for (const [key, note] of [...pendingNotesRef.current.entries()]) {
        const shared = await saveSharedNote(key, note)
        pendingNotesRef.current.delete(key)
        applySharedState(shared, true)
      }
      const shared = await fetchSharedState()
      applySharedState(shared)
      setSyncStatus({ state: 'online', error: '', lastSynced: new Date().toISOString() })
      return shared
    } catch (error) {
      setSyncStatus({ state: 'offline', error: error.message, lastSynced: null })
      if (notify) setMessage(`Belum tersinkron: ${error.message}. Data tetap tersedia di browser ini dan akan dicoba lagi otomatis.`)
      return null
    }
  }, [applySharedState])

  useEffect(() => {
    syncFromCloud({ notify: true })
    const interval = window.setInterval(() => syncFromCloud(), 8000)
    const onFocus = () => syncFromCloud()
    const onVisibility = () => { if (document.visibilityState === 'visible') syncFromCloud() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [syncFromCloud])

  const branches = useMemo(() => [...new Set(dashboard.agents.map((item) => item.cabang).filter(Boolean))].sort(), [dashboard.agents])
  const categories = useMemo(() => [...new Set(dashboard.agents.map((item) => item.kategori).filter(Boolean))].sort(), [dashboard.agents])
  const filteredAgents = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return dashboard.agents.filter((agent) =>
      (branch === 'Semua cabang' || agent.cabang === branch) &&
      (category === 'Semua kategori' || agent.kategori === category) &&
      (!needle || `${agent.namaAgen} ${agent.idAgen} ${agent.pic}`.toLowerCase().includes(needle)),
    )
  }, [dashboard.agents, branch, category, query])
  const filteredKeys = useMemo(() => new Set(filteredAgents.map((agent) => agent.key)), [filteredAgents])
  const filteredInvoices = useMemo(() => dashboard.invoices.filter((invoice) => filteredKeys.has(invoice.agentKey)), [dashboard.invoices, filteredKeys])
  const totals = useMemo(() => filteredAgents.reduce((sum, agent) => ({
    surplus: sum.surplus + (Number(agent.surplus) || 0),
    dibayar: sum.dibayar + (Number(agent.dibayar) || 0),
    sisa: sum.sisa + (Number(agent.sisaPiutang) || 0),
    sisaBotol: sum.sisaBotol + (Number(agent.sisaBotol) || 0),
    sisaKrat: sum.sisaKrat + (Number(agent.sisaKrat) || 0),
    outstanding: sum.outstanding + (Number(agent.sisaPiutang) > 0 ? 1 : 0),
  }), { surplus: 0, dibayar: 0, sisa: 0, sisaBotol: 0, sisaKrat: 0, outstanding: 0 }), [filteredAgents])
  const topOutstanding = useMemo(() => filteredAgents
    .filter((agent) => agent.sisaPiutang > 0)
    .sort((a, b) => b.sisaPiutang - a.sisaPiutang)
    .slice(0, 10)
    .map((agent) => ({ name: agent.namaAgen, value: agent.sisaPiutang, key: agent.key })), [filteredAgents])
  const branchChart = useMemo(() => {
    const grouped = new Map()
    filteredAgents.forEach((agent) => grouped.set(agent.cabang, (grouped.get(agent.cabang) || 0) + (Number(agent.sisaPiutang) || 0)))
    return [...grouped].map(([name, value]) => ({ name, value })).filter((item) => item.value > 0).sort((a, b) => b.value - a.value).slice(0, 6)
  }, [filteredAgents])
  const selectedAgent = dashboard.agents.find((agent) => agent.key === selectedKey)
  const selectedInvoices = useMemo(() => dashboard.invoices
    .filter((invoice) => invoice.agentKey === selectedKey)
    .sort((a, b) => b.tanggalFaktur.localeCompare(a.tanggalFaktur)), [dashboard.invoices, selectedKey])

  useEffect(() => {
    if (!selectedAgent) return
    setNoteDraft(notes[selectedAgent.key]?.note || selectedAgent.keteranganDashboard || '')
  }, [selectedAgent, notes])

  const handleUpload = async (file) => {
    if (!file) return
    setUploading(true)
    setMessage('Membaca Data Agen dan Detail Faktur…')
    try {
      const next = await readEmbalaseWorkbook(file)
      dashboardRef.current = next
      setDashboard(next)
      persist(next, notesRef.current)
      pendingDashboardRef.current = next
      setMessage('Workbook terbaca. Menyimpan ke data bersama…')
      setSyncStatus((current) => ({ ...current, state: 'syncing', error: '' }))
      const shared = await replaceSharedDashboard(next)
      pendingDashboardRef.current = null
      applySharedState(shared, true)
      setSyncStatus({ state: 'online', error: '', lastSynced: new Date().toISOString() })
      setMessage(`${file.name} sudah tersimpan dan tersedia otomatis di semua browser.`)
      setActivePage('overview')
    } catch (error) {
      setMessage(`Upload belum selesai: ${error.message}`)
      setSyncStatus((current) => ({ ...current, state: pendingDashboardRef.current ? 'offline' : current.state, error: error.message }))
    } finally {
      setUploading(false)
    }
  }

  const handleSaveNote = async () => {
    if (!selectedAgent) return
    const note = noteDraft.trim()
    const savedAt = new Date().toISOString()
    const nextNotes = { ...notesRef.current, [selectedAgent.key]: { note, savedAt } }
    notesRef.current = nextNotes
    setNotes(nextNotes)
    persist(dashboardRef.current, nextNotes)
    pendingNotesRef.current.set(selectedAgent.key, note)
    setSavingNote(true)
    setSyncStatus((current) => ({ ...current, state: 'syncing', error: '' }))
    try {
      const shared = await saveSharedNote(selectedAgent.key, note)
      pendingNotesRef.current.delete(selectedAgent.key)
      applySharedState(shared, true)
      setSyncStatus({ state: 'online', error: '', lastSynced: new Date().toISOString() })
    } catch (error) {
      setSyncStatus({ state: 'offline', error: error.message, lastSynced: null })
      setMessage(`Keterangan tersimpan lokal dan akan dicoba lagi otomatis: ${error.message}`)
    } finally {
      setSavingNote(false)
    }
  }

  const openAgent = (agent) => setSelectedKey(agent.key)
  const resetFilters = () => { setBranch('Semua cabang'); setCategory('Semua kategori'); setQuery('') }

  const renderFilters = () => <section className="filter-panel">
    <label className="search-field"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari nama atau ID agen…" /></label>
    <label><span>Cabang</span><select value={branch} onChange={(event) => setBranch(event.target.value)}><option>Semua cabang</option>{branches.map((item) => <option key={item}>{item}</option>)}</select></label>
    <label><span>Kategori</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option>Semua kategori</option>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
    <button className="ghost-button" onClick={resetFilters}>Reset</button>
    <div className="result-count"><strong>{number(filteredAgents.length)}</strong><span>agen tampil</span></div>
  </section>

  const renderAgentTable = (items = filteredAgents, compact = false) => <section className="panel table-panel">
    <div className="panel-heading"><div><span className="section-kicker">Per ID Agen</span><h3>{compact ? 'Prioritas Penagihan' : 'Daftar Piutang Agen'}</h3></div><span>{number(items.length)} akun</span></div>
    <div className="table-scroll"><table className="agent-table"><thead><tr>
      <th>ID / Nama Agen</th><th>Cabang</th><th>Surplus</th><th>Dibayar</th><th>Sisa Piutang</th><th>Sisa Botol</th><th>Sisa Krat</th><th>Faktur</th><th>Status</th><th>Keterangan</th><th></th>
    </tr></thead><tbody>
      {items.slice(0, compact ? 10 : PAGE_SIZE).map((agent) => <tr key={agent.key}>
        <td><strong>{agent.namaAgen}</strong><small>{agent.idAgen || 'ID belum tersedia'} • {agent.kategori}</small></td>
        <td>{agent.cabang}</td><td>{currency(agent.surplus)}</td><td>{currency(agent.dibayar)}</td>
        <td className="amount-outstanding">{currency(agent.sisaPiutang)}</td><td className="quantity-outstanding">{number(agent.sisaBotol, 2)}</td><td className="quantity-outstanding">{number(agent.sisaKrat, 2)}</td><td>{number(agent.jumlahFaktur)}</td>
        <td><span className={`status ${agent.sisaPiutang > 0 ? 'open' : 'paid'}`}>{agent.sisaPiutang > 0 ? 'Outstanding' : 'Lunas'}</span></td>
        <td className="note-preview">{notes[agent.key]?.note || agent.keteranganDashboard || <span>Belum ada</span>}</td>
        <td><button className="row-action" onClick={() => openAgent(agent)} aria-label={`Detail ${agent.namaAgen}`}><ChevronRight size={17} /></button></td>
      </tr>)}
      {!items.length && <tr><td colSpan="11" className="empty-row">Tidak ada agen yang cocok dengan filter.</td></tr>}
    </tbody></table></div>
    {!compact && items.length > PAGE_SIZE && <p className="table-footnote">Menampilkan {PAGE_SIZE} baris pertama. Gunakan pencarian atau filter cabang untuk mempersempit hasil.</p>}
  </section>

  const renderOverview = () => <>
    <div className="page-intro"><div><span className="section-kicker">Executive overview</span><h2>Posisi Piutang Embalase</h2><p>KPI mengikuti filter cabang, kategori, dan pencarian aktif.</p></div><div className="period-pill"><ReceiptText size={16} />{dashboard.periodLabel}</div></div>
    {renderFilters()}
    <section className="kpi-grid">
      <KpiCard icon={Boxes} label="Surplus" value={currency(totals.surplus)} note="Total pembentukan piutang" tone="blue" />
      <KpiCard icon={PackageCheck} label="Dibayar" value={currency(totals.dibayar)} note="Telah diselesaikan / dikembalikan" tone="green" />
      <KpiCard icon={CircleDollarSign} label="Sisa Piutang" value={currency(totals.sisa)} note="Saldo yang masih outstanding" tone="red" />
      <KpiCard icon={Boxes} label="Sisa Botol" value={number(totals.sisaBotol, 2)} note="Jumlah botol yang masih outstanding" tone="teal" />
      <KpiCard icon={PackageCheck} label="Sisa Krat" value={number(totals.sisaKrat, 2)} note="Jumlah krat yang masih outstanding" tone="orange" />
      <KpiCard icon={AlertCircle} label="Agen Outstanding" value={number(totals.outstanding)} note={`dari ${number(filteredAgents.length)} agen`} tone="amber" />
      <KpiCard icon={Users} label="Total Agen" value={number(filteredAgents.length)} note={`${number(filteredInvoices.length)} transaksi terfilter`} tone="violet" />
    </section>
    <section className="chart-grid">
      <article className="panel chart-panel"><div className="panel-heading"><div><span className="section-kicker">Top exposure</span><h3>10 Sisa Piutang Terbesar</h3></div></div><div className="chart-body">
        <ResponsiveContainer width="100%" height="100%"><BarChart data={topOutstanding} layout="vertical" margin={{ top: 4, right: 26, bottom: 4, left: 20 }}>
          <CartesianGrid stroke="#233244" horizontal={false} /><XAxis type="number" tickFormatter={shortCurrency} stroke="#7890A5" fontSize={10} /><YAxis type="category" dataKey="name" width={145} tick={{ fill: '#B7C4D1', fontSize: 10 }} axisLine={false} tickLine={false} />
          <Tooltip formatter={(value) => currency(value)} contentStyle={{ background: '#0F1E2C', border: '1px solid #2C4154', borderRadius: 12 }} /><Bar dataKey="value" fill="#F87171" radius={[0, 6, 6, 0]} onClick={(row) => setSelectedKey(row?.payload?.key || row?.key)} /></BarChart></ResponsiveContainer>
      </div></article>
      <article className="panel chart-panel"><div className="panel-heading"><div><span className="section-kicker">Distribusi</span><h3>Sisa Piutang per Cabang</h3></div></div><div className="chart-body pie-layout">
        <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={branchChart} dataKey="value" nameKey="name" innerRadius={62} outerRadius={92} paddingAngle={3}>{branchChart.map((item, index) => <Cell key={item.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}</Pie><Tooltip formatter={(value) => currency(value)} contentStyle={{ background: '#0F1E2C', border: '1px solid #2C4154', borderRadius: 12 }} /></PieChart></ResponsiveContainer>
        <div className="chart-legend">{branchChart.map((item, index) => <div key={item.name}><i style={{ background: PIE_COLORS[index % PIE_COLORS.length] }} /><span>{item.name}</span><strong>{shortCurrency(item.value)}</strong></div>)}</div>
      </div></article>
    </section>
    {renderAgentTable([...filteredAgents].sort((a, b) => b.sisaPiutang - a.sisaPiutang), true)}
  </>

  const renderAgents = () => <><div className="page-intro"><div><span className="section-kicker">Master piutang</span><h2>Piutang per Agen</h2><p>Klik baris untuk melihat faktur, tanggal, dan menyimpan keterangan.</p></div></div>{renderFilters()}{renderAgentTable([...filteredAgents].sort((a, b) => b.sisaPiutang - a.sisaPiutang))}</>

  const renderInvoices = () => <><div className="page-intro"><div><span className="section-kicker">Audit trail</span><h2>Detail Faktur</h2><p>Kode faktur, tanggal faktur, surat jalan, nilai, dan keterangan sumber.</p></div></div>{renderFilters()}<section className="panel table-panel">
    <div className="panel-heading"><div><span className="section-kicker">Transaksi</span><h3>Detail Faktur Terfilter</h3></div><span>{number(filteredInvoices.length)} baris</span></div>
    <div className="table-scroll"><table><thead><tr><th>Tanggal</th><th>Kode Faktur</th><th>ID / Agen</th><th>Cabang</th><th>Surat Jalan</th><th>Botol</th><th>Peti</th><th>Nilai Transaksi</th><th>Keterangan</th></tr></thead><tbody>
      {filteredInvoices.slice(0, PAGE_SIZE).sort((a, b) => b.tanggalFaktur.localeCompare(a.tanggalFaktur)).map((invoice, index) => <tr key={`${invoice.agentKey}-${invoice.kodeFaktur}-${index}`}>
        <td>{formatDate(invoice.tanggalFaktur)}</td><td><strong>{invoice.kodeFaktur || 'Tanpa kode'}</strong></td><td><button className="text-button" onClick={() => setSelectedKey(invoice.agentKey)}>{invoice.namaAgen}<small>{invoice.idAgen || 'ID belum tersedia'}</small></button></td><td>{invoice.cabang}</td><td>{invoice.suratJalan || '—'}</td><td>{number(invoice.jumlahBotol, 2)}</td><td>{number(invoice.jumlahPeti, 2)}</td><td className={invoice.nilaiTransaksi < 0 ? 'negative' : ''}>{currency(invoice.nilaiTransaksi)}</td><td>{invoice.keteranganSumber || '—'}</td>
      </tr>)}
      {!filteredInvoices.length && <tr><td colSpan="9" className="empty-row">Tidak ada faktur yang cocok dengan filter.</td></tr>}
    </tbody></table></div>{filteredInvoices.length > PAGE_SIZE && <p className="table-footnote">Menampilkan {PAGE_SIZE} baris terbaru. Gunakan filter untuk mempersempit hasil.</p>}</section></>

  const renderData = () => <><div className="page-intro"><div><span className="section-kicker">Pusat data</span><h2>Upload & Sinkronisasi</h2><p>Satu kali upload akan mengganti data bersama dan otomatis muncul di browser lain.</p></div></div>
    <section className="data-grid">
      <article className="panel upload-card"><div className="upload-illustration"><FileSpreadsheet size={34} /></div><span className="section-kicker">Workbook terstruktur</span><h3>Unggah ringkasan terbaru</h3><p>Dashboard membaca sheet <strong>Data Agen</strong> dan <strong>Detail Faktur</strong>. Keterangan tersimpan berdasarkan ID Agen sehingga tetap melekat saat data diperbarui.</p><label className={`primary-button ${uploading ? 'disabled' : ''}`}><UploadCloud size={17} />{uploading ? 'Memproses…' : 'Pilih file Excel'}<input type="file" accept=".xlsx,.xls" disabled={uploading} onChange={(event) => handleUpload(event.target.files?.[0])} /></label><a className="secondary-button" href="/Ringkasan_Piutang_Embalase_September_2026.xlsx" download><Download size={16} />Unduh workbook awal</a></article>
      <article className="panel data-status"><div className="status-icon"><CheckCircle2 size={24} /></div><div><span className="section-kicker">Data aktif</span><h3>{dashboard.source}</h3><p>{dashboard.periodLabel}</p></div><dl><div><dt>Agen</dt><dd>{number(dashboard.agents.length)}</dd></div><div><dt>Detail faktur</dt><dd>{number(dashboard.invoices.length)}</dd></div><div><dt>Sisa botol</dt><dd>{number(dashboard.agents.reduce((sum, item) => sum + (Number(item.sisaBotol) || 0), 0), 2)}</dd></div><div><dt>Sisa krat</dt><dd>{number(dashboard.agents.reduce((sum, item) => sum + (Number(item.sisaKrat) || 0), 0), 2)}</dd></div><div><dt>ID perlu dilengkapi</dt><dd>{number(dashboard.agents.filter((item) => !item.idAgen).length)}</dd></div><div><dt>Terakhir diperbarui</dt><dd>{formatDateTime(dashboard.lastUpdated)}</dd></div></dl><button className="secondary-button" onClick={() => syncFromCloud({ notify: true })}><RefreshCcw size={16} />Sinkronkan sekarang</button></article>
    </section>
    <section className="panel workflow-panel"><div><Cloud size={21} /><strong>Cara kerja lintas browser</strong></div><ol><li>Workbook dibaca dan divalidasi di browser.</li><li>Data terstruktur disimpan ke Netlify Blobs dengan strong consistency.</li><li>Semua browser memeriksa revisi terbaru setiap 8 detik dan saat tab aktif kembali.</li><li>Keterangan per ID Agen tersimpan bersama tanggal simpan.</li></ol></section>
  </>

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span><Boxes size={22} /></span><div><strong>EMBALASE</strong><small>Receivables Intelligence</small></div></div>
      <nav>
        <button className={activePage === 'overview' ? 'active' : ''} onClick={() => setActivePage('overview')}><LayoutDashboard size={18} />Overview</button>
        <button className={activePage === 'agents' ? 'active' : ''} onClick={() => setActivePage('agents')}><Users size={18} />Piutang Agen</button>
        <button className={activePage === 'invoices' ? 'active' : ''} onClick={() => setActivePage('invoices')}><ReceiptText size={18} />Detail Faktur</button>
        <button className={activePage === 'data' ? 'active' : ''} onClick={() => setActivePage('data')}><UploadCloud size={18} />Upload Data</button>
      </nav>
      <div className="sidebar-summary"><small>Sisa piutang aktif</small><strong>{shortCurrency(dashboard.agents.reduce((sum, item) => sum + item.sisaPiutang, 0))}</strong><span>{number(dashboard.agents.reduce((sum, item) => sum + (Number(item.sisaBotol) || 0), 0), 2)} botol • {number(dashboard.agents.reduce((sum, item) => sum + (Number(item.sisaKrat) || 0), 0), 2)} krat</span><span>{dashboard.agents.filter((item) => item.sisaPiutang > 0).length} agen outstanding</span></div>
      <div className="sidebar-foot"><Building2 size={14} /> Dashboard operasional</div>
    </aside>
    <main>
      <header className="topbar"><div><span className="section-kicker">Piutang embalase</span><h1>Control Center</h1><p>{dashboard.source}</p></div><div className="top-actions"><SyncBadge status={syncStatus} /><label className={`primary-button compact ${uploading ? 'disabled' : ''}`}><UploadCloud size={16} />{uploading ? 'Memproses' : 'Upload Excel'}<input type="file" accept=".xlsx,.xls" disabled={uploading} onChange={(event) => handleUpload(event.target.files?.[0])} /></label></div></header>
      <div className="content">
        {message && <div className={`message ${syncStatus.state === 'offline' ? 'warning' : ''}`}><span>{message}</span><button onClick={() => setMessage('')}><X size={16} /></button></div>}
        {activePage === 'overview' && renderOverview()}
        {activePage === 'agents' && renderAgents()}
        {activePage === 'invoices' && renderInvoices()}
        {activePage === 'data' && renderData()}
        <footer><span>Embalase Receivables Dashboard</span><span>Revisi bersama: {revisionRef.current} • Auto-refresh 8 detik</span></footer>
      </div>
    </main>

    {selectedAgent && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedKey(null) }}>
      <section className="agent-modal" role="dialog" aria-modal="true" aria-label={`Detail ${selectedAgent.namaAgen}`}>
        <header><div><span className="section-kicker">Detail per ID Agen</span><h2>{selectedAgent.namaAgen}</h2><p>{selectedAgent.idAgen || 'ID belum tersedia'} • {selectedAgent.cabang} • {selectedAgent.kategori}</p></div><button onClick={() => setSelectedKey(null)}><X size={21} /></button></header>
        <div className="modal-kpis"><div><small>Surplus</small><strong>{currency(selectedAgent.surplus)}</strong></div><div><small>Dibayar</small><strong>{currency(selectedAgent.dibayar)}</strong></div><div className="danger"><small>Sisa Piutang</small><strong>{currency(selectedAgent.sisaPiutang)}</strong></div><div className="quantity"><small>Sisa Botol</small><strong>{number(selectedAgent.sisaBotol, 2)}</strong></div><div className="quantity"><small>Sisa Krat</small><strong>{number(selectedAgent.sisaKrat, 2)}</strong></div><div><small>Jumlah Faktur</small><strong>{number(selectedAgent.jumlahFaktur)}</strong></div></div>
        <div className="note-editor"><div><h3>Keterangan khusus</h3><p>Tersimpan lintas browser berdasarkan ID Agen.</p></div><textarea value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} placeholder="Contoh: sudah dihubungi, janji pengembalian 25 September…" maxLength={5000} /><div className="note-meta"><span>Terakhir disimpan: {formatDateTime(notes[selectedAgent.key]?.savedAt)}</span><button className="primary-button compact" onClick={handleSaveNote} disabled={savingNote}><Save size={15} />{savingNote ? 'Menyimpan…' : 'Simpan keterangan'}</button></div></div>
        <div className="modal-table-heading"><div><h3>Riwayat Faktur</h3><p>{selectedInvoices.length} transaksi ditemukan</p></div></div>
        <div className="table-scroll modal-table"><table><thead><tr><th>Tanggal</th><th>Kode Faktur</th><th>Surat Jalan</th><th>Botol</th><th>Peti</th><th>Nilai</th><th>Keterangan</th></tr></thead><tbody>{selectedInvoices.map((invoice, index) => <tr key={`${invoice.kodeFaktur}-${index}`}><td>{formatDate(invoice.tanggalFaktur)}</td><td><strong>{invoice.kodeFaktur || 'Tanpa kode'}</strong></td><td>{invoice.suratJalan || '—'}</td><td>{number(invoice.jumlahBotol, 2)}</td><td>{number(invoice.jumlahPeti, 2)}</td><td className={invoice.nilaiTransaksi < 0 ? 'negative' : ''}>{currency(invoice.nilaiTransaksi)}</td><td>{invoice.keteranganSumber || '—'}</td></tr>)}</tbody></table></div>
      </section>
    </div>}
  </div>
}
