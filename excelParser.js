import * as XLSX from 'xlsx'

const text = (value) => String(value ?? '').trim()
const number = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const isoDate = (value) => {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString().slice(0, 10)
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`
  }
  const cleaned = text(value)
  if (!cleaned) return ''
  const parsed = new Date(cleaned)
  return Number.isNaN(parsed.valueOf()) ? '' : parsed.toISOString().slice(0, 10)
}

const readRows = (workbook, sheetName) => {
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) throw new Error(`Sheet “${sheetName}” tidak ditemukan.`)
  return XLSX.utils.sheet_to_json(sheet, { defval: null, raw: true })
}

const agentKey = (id, name, branch) => {
  const cleanId = text(id)
  return cleanId ? `ID:${cleanId}` : `NOID:${text(name).toLowerCase()}|${text(branch).toLowerCase()}`
}

export const readEmbalaseWorkbook = async (file) => {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
  const agentRows = readRows(workbook, 'Data Agen')
  const detailRows = readRows(workbook, 'Detail Faktur')
  if (!agentRows.length) throw new Error('Sheet Data Agen tidak berisi data.')
  const requiredBalanceColumns = ['Sisa Botol', 'Sisa Krat']
  const missingBalanceColumns = requiredBalanceColumns.filter((column) => !(column in agentRows[0]))
  if (missingBalanceColumns.length) {
    throw new Error(`Kolom ${missingBalanceColumns.join(' dan ')} tidak ditemukan pada sheet Data Agen.`)
  }

  const agents = agentRows.map((row) => {
    const idAgen = text(row['ID Agen'])
    const namaAgen = text(row['Nama Agen'])
    const cabang = text(row.Cabang) || 'Belum ditentukan'
    const key = agentKey(idAgen, namaAgen, cabang)
    return {
      key,
      idAgen,
      namaAgen,
      cabang,
      kategori: text(row.Kategori) || 'Agen',
      pic: text(row.PIC),
      jumlahFaktur: number(row['Jumlah Faktur']),
      surplus: number(row['Surplus (Rp)']),
      dibayar: number(row['Dibayar (Rp)']),
      sisaPiutang: number(row['Sisa Piutang (Rp)']),
      sisaBotol: number(row['Sisa Botol']),
      sisaKrat: number(row['Sisa Krat']),
      kodeFakturTerakhir: text(row['Kode Faktur Terakhir']),
      tanggalFakturTerakhir: isoDate(row['Tanggal Faktur Terakhir']),
      status: text(row.Status) || (number(row['Sisa Piutang (Rp)']) > 0 ? 'Outstanding' : 'Lunas'),
      catatanSumber: text(row['Keterangan Sumber']),
      keteranganDashboard: text(row['Keterangan Dashboard']),
      validasiId: text(row['Validasi ID']),
      sumberBaris: number(row['Sumber Baris']),
    }
  }).filter((row) => row.namaAgen)

  const keyById = new Map(agents.filter((agent) => agent.idAgen).map((agent) => [agent.idAgen, agent.key]))
  const keyByNameBranch = new Map(agents.map((agent) => [`${agent.namaAgen.toLowerCase()}|${agent.cabang.toLowerCase()}`, agent.key]))
  const invoices = detailRows.map((row) => {
    const idAgen = text(row['ID Agen'])
    const namaAgen = text(row['Nama Agen'])
    const cabang = text(row.Cabang) || 'Belum ditentukan'
    return {
      agentKey: keyById.get(idAgen) || keyByNameBranch.get(`${namaAgen.toLowerCase()}|${cabang.toLowerCase()}`) || agentKey(idAgen, namaAgen, cabang),
      idAgen,
      namaAgen,
      cabang,
      kategori: text(row.Kategori),
      pic: text(row.PIC),
      tanggalFaktur: isoDate(row['Tanggal Faktur']),
      kodeFaktur: text(row['Kode Faktur']),
      suratJalan: text(row['Surat Jalan']),
      kratEkuivalen: number(row['Krat Ekuivalen']),
      jumlahBotol: number(row['Jumlah Botol']),
      nilaiBotol: number(row['Nilai Botol (Rp)']),
      jumlahPeti: number(row['Jumlah Peti']),
      nilaiPeti: number(row['Nilai Peti (Rp)']),
      nilaiTransaksi: number(row['Nilai Transaksi (Rp)']),
      keteranganSumber: text(row['Keterangan Sumber']),
      sumberBaris: number(row['Sumber Baris']),
      validasi: text(row.Validasi),
    }
  }).filter((row) => row.tanggalFaktur || row.kodeFaktur)

  const periodCell = workbook.Sheets.Ringkasan?.A2?.v
  return {
    source: file.name,
    lastUpdated: new Date().toISOString(),
    periodLabel: text(periodCell).split('•')[0].trim() || 'Periode sesuai workbook',
    agents,
    invoices,
  }
}
