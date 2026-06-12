/**
 * dry-run.js
 * Lê o Excel, resolve todos os lookups no banco (somente leitura)
 * e reporta problemas sem inserir nenhum dado.
 */

const { createClient } = require('@supabase/supabase-js');
const XLSX = require('xlsx');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Erro: variaveis de ambiente Supabase nao encontradas no .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

function cleanString(val) {
  if (val === undefined || val === null) return null;
  const str = val.toString().replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  return str === '' ? null : str;
}

function cleanNumber(val) {
  if (val === undefined || val === null) return null;
  const num = parseFloat(val);
  return isNaN(num) ? null : num;
}

function parseExcelDate(val) {
  if (!val) return null;
  if (typeof val === 'number') {
    return new Date((val - 25569) * 86400 * 1000).toISOString();
  }
  const str = val.toString().trim();
  if (!str) return null;
  const parsed = Date.parse(str);
  return isNaN(parsed) ? null : new Date(parsed).toISOString();
}

const VALID_OWNER_TYPES = ['ironclad', 'partner'];

async function dryRun() {
  console.log('=== DRY RUN — Nenhum dado sera inserido ===\n');

  // 1. Ler Excel
  let workbook;
  try {
    workbook = XLSX.readFile('import-auctions.xlsx');
  } catch (err) {
    console.error('Erro ao abrir import-auctions.xlsx:', err.message);
    process.exit(1);
  }

  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(firstSheet);
  console.log(`Planilha: ${rawRows.length} registros encontrados.\n`);

  // 2. Carregar lookups do banco (somente leitura)
  console.log('Carregando lookups do banco (somente leitura)...');
  const [
    countiesRes, propertyTypesRes, prioritiesRes, origemsRes,
    auctionTypesRes, auctionModelsRes, femasRes, wetlandsRes,
    debitsRes, gismapsRes, propAccessesRes, roadAccessesRes,
    constructionsRes, statusesRes
  ] = await Promise.all([
    supabase.from('ls_county').select('id, name, state'),
    supabase.from('ls_property_type').select('id, name'),
    supabase.from('ls_priority').select('id, name'),
    supabase.from('ls_origem').select('id, name'),
    supabase.from('ls_auction_type').select('id, name'),
    supabase.from('ls_auction_model').select('id, name'),
    supabase.from('ls_fema').select('id, name'),
    supabase.from('ls_wetlands').select('id, name'),
    supabase.from('ls_debit').select('id, name'),
    supabase.from('ls_gismap').select('id, name'),
    supabase.from('ls_property_access').select('id, name'),
    supabase.from('ls_road_access').select('id, name'),
    supabase.from('ls_ref_construction').select('id, name'),
    supabase.from('ls_status').select('id, name'),
  ]);

  const lookupErrors = [countiesRes, propertyTypesRes, prioritiesRes, origemsRes,
    auctionTypesRes, auctionModelsRes, femasRes, wetlandsRes, debitsRes,
    gismapsRes, propAccessesRes, roadAccessesRes, constructionsRes, statusesRes
  ].filter(r => r.error);

  if (lookupErrors.length > 0) {
    console.error('ERRO ao carregar lookups do banco:');
    lookupErrors.forEach(r => console.error(' -', r.error.message));
    process.exit(1);
  }

  const counties       = countiesRes.data || [];
  const propertyTypes  = propertyTypesRes.data || [];
  const priorities     = prioritiesRes.data || [];
  const origems        = origemsRes.data || [];
  const auctionTypes   = auctionTypesRes.data || [];
  const auctionModels  = auctionModelsRes.data || [];
  const femas          = femasRes.data || [];
  const wetlands       = wetlandsRes.data || [];
  const debits         = debitsRes.data || [];
  const gismaps        = gismapsRes.data || [];
  const propAccesses   = propAccessesRes.data || [];
  const roadAccesses   = roadAccessesRes.data || [];
  const constructions  = constructionsRes.data || [];
  const statuses       = statusesRes.data || [];

  const activeStatus = statuses.find(s =>
    s.name.toLowerCase() === 'active auction' ||
    s.name.toLowerCase() === 'active' ||
    s.name.toLowerCase() === 'active asset'
  );
  if (!activeStatus) {
    console.warn('⚠️  AVISO CRITICO: Nenhum status "Active Auction" encontrado no banco. status_id ficara NULL.\n');
  } else {
    console.log(`Status padrao: "${activeStatus.name}" ✅\n`);
  }

  console.log('Lookups carregados com sucesso.\n');

  // Lookup resolve (somente leitura — NAO cria valores novos, apenas reporta)
  const missingLookupValues = {}; // { tableName: Set<name> }

  function resolveLookup(tableName, nameVal, cacheArray) {
    if (!nameVal) return { id: null, missing: false };
    const trimmed = nameVal.toString().trim();
    if (!trimmed || trimmed.toLowerCase() === 'n/a' || trimmed.toLowerCase() === 'none') return { id: null, missing: false };
    const record = cacheArray.find(r => r.name.toLowerCase() === trimmed.toLowerCase());
    if (!record) {
      if (!missingLookupValues[tableName]) missingLookupValues[tableName] = new Set();
      missingLookupValues[tableName].add(trimmed);
      return { id: null, missing: true, value: trimmed };
    }
    return { id: record.id, missing: false };
  }

  // 3. Validar cada linha
  const issues = [];      // { row, type, message }
  const warnings = [];    // { row, type, message }
  let okCount = 0;

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const rowNum = i + 2;
    const caseNum = cleanString(row.case_number) || `(sem case_number, linha ${rowNum})`;
    const rowIssues = [];
    const rowWarnings = [];

    // --- auction_date ---
    if (!parseExcelDate(row.auction_date)) {
      rowWarnings.push('auction_date invalido ou vazio');
    }

    // --- County ---
    const countyRaw = row.Condado || '';
    const stateAbbr = cleanString(row.state) || '';
    const countyName = countyRaw.toString().split(',')[0].trim();
    if (countyName && stateAbbr) {
      const found = counties.find(c =>
        c.name.toLowerCase() === countyName.toLowerCase() &&
        c.state.toLowerCase() === stateAbbr.toLowerCase()
      );
      if (!found) {
        if (!missingLookupValues['ls_county']) missingLookupValues['ls_county'] = new Set();
        missingLookupValues['ls_county'].add(`${countyName} (${stateAbbr})`);
        rowIssues.push(`Condado nao encontrado no banco: "${countyName}, ${stateAbbr}" — cadastre antes de importar`);
      }
    } else {
      rowWarnings.push('Condado ou State vazio — county_id ficara NULL');
    }

    // --- Lookups de referencia (erro critico se nao existir) ---
    const lookupChecks = [
      { table: 'ls_ref_construction', val: row.Ref_Construction_id || row.ref_construction_id, cache: constructions },
      { table: 'ls_fema',             val: row.Fema_id || row.fema_id,                         cache: femas },
      { table: 'ls_wetlands',         val: row.Wetland_id || row.wetland_id || row.wetlands_id, cache: wetlands },
      { table: 'ls_debit',            val: row.Debit_id || row.debit_id,                       cache: debits },
      { table: 'ls_gismap',           val: row.Gismap_id || row.gismap_id,                     cache: gismaps },
      { table: 'ls_property_access',  val: row.Prop_Access_id || row.prop_access_id,           cache: propAccesses },
      { table: 'ls_property_type',    val: row.property_type_id || row.Property_Type_id || row.property_type, cache: propertyTypes },
      { table: 'ls_road_access',      val: row.Road_Access_id || row.road_access_id,           cache: roadAccesses },
      { table: 'ls_priority',         val: row.Priority_id || row.priority_id || row.priority, cache: priorities },
      { table: 'ls_auction_model',    val: row.Auction_model_id || row.auction_model_id || row.auction_model, cache: auctionModels },
      { table: 'ls_auction_type',     val: row.Auction_Type || row.auction_type_id || row.auction_type, cache: auctionTypes },
      { table: 'ls_origem',           val: row.Origem || row.origem || row.origem_id || row.origin || row.Origin, cache: origems },
    ];

    for (const check of lookupChecks) {
      const result = resolveLookup(check.table, check.val, check.cache);
      if (result.missing) {
        rowIssues.push(`Valor "${result.value}" nao encontrado em ${check.table} — cadastre antes de importar`);
      }
    }

    // --- owner_type ---
    const ownerTypeRaw = cleanString(row.owner_type || row.Owner_Type);
    if (ownerTypeRaw && !VALID_OWNER_TYPES.includes(ownerTypeRaw.toLowerCase())) {
      rowIssues.push(`owner_type invalido: "${ownerTypeRaw}" (validos: ironclad, partner)`);
    }

    // --- Numericos suspeitos ---
    const numericFields = [
      { key: 'size',        val: row.size },
      { key: 'open_bid',    val: row.Open_Bid || row.open_bid },
      { key: 'max_bid',     val: row.Max_Bid  || row.max_bid },
      { key: 'house_price', val: row.house_price || row.house_Price },
    ];
    for (const f of numericFields) {
      const n = cleanNumber(f.val);
      if (f.val !== undefined && f.val !== null && f.val !== '' && n === null) {
        rowWarnings.push(`Campo numerico invalido: ${f.key} = "${f.val}"`);
      }
    }

    if (rowIssues.length > 0) {
      issues.push({ rowNum, caseNum, messages: rowIssues });
    }
    if (rowWarnings.length > 0) {
      warnings.push({ rowNum, caseNum, messages: rowWarnings });
    }
    if (rowIssues.length === 0) okCount++;
  }

  // 4. Relatório final
  console.log('='.repeat(60));
  console.log('RESULTADO DA VALIDACAO');
  console.log('='.repeat(60));
  console.log(`Total de linhas:    ${rawRows.length}`);
  console.log(`Sem erros criticos: ${okCount}`);
  console.log(`Com erros criticos: ${issues.length}`);
  console.log(`Com avisos:         ${warnings.length}`);
  console.log('');

  if (Object.keys(missingLookupValues).length > 0) {
    console.log('--- VALORES AUSENTES NOS LOOKUPS (cadastre no banco antes de importar) ---');
    for (const [table, vals] of Object.entries(missingLookupValues)) {
      console.log(`\n  Tabela: ${table}`);
      for (const v of vals) console.log(`    ✗ "${v}"`);
    }
    console.log('');
  }

  if (issues.length > 0) {
    console.log('--- ERROS CRITICOS (linhas que falharao no insert) ---');
    for (const issue of issues) {
      console.log(`\n  Linha ${issue.rowNum} | Case: ${issue.caseNum}`);
      issue.messages.forEach(m => console.log(`    ✗ ${m}`));
    }
    console.log('');
  }

  if (warnings.length > 0) {
    console.log('--- AVISOS (linhas que serao inseridas mas merecem atencao) ---');
    // Agrupa avisos semelhantes para nao poluir o output
    const grouped = {};
    for (const w of warnings) {
      for (const m of w.messages) {
        if (!grouped[m]) grouped[m] = [];
        grouped[m].push(w.rowNum);
      }
    }
    for (const [msg, rows] of Object.entries(grouped)) {
      const sample = rows.slice(0, 5).join(', ');
      const extra = rows.length > 5 ? ` ... (+${rows.length - 5} mais)` : '';
      console.log(`  ⚠  ${msg}`);
      console.log(`     Linhas: ${sample}${extra}`);
    }
    console.log('');
  }

  if (issues.length === 0) {
    console.log('✅ Nenhum erro critico encontrado. O import pode ser executado.');
  } else {
    console.log(`❌ ${issues.length} erro(s) critico(s) encontrado(s). Corrija o Excel antes de importar.`);
  }
}

dryRun().catch(err => {
  console.error('Erro inesperado:', err.message);
  process.exit(1);
});
