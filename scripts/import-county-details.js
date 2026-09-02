/**
 * import-county-details.js
 * Lê a planilha COUNTY_DETAIL.xlsx (aba "County Contacts") e atualiza
 * ls_county com Main Website, Tax Sale, Property Appraiser, Clerk
 * Recording Office e Zoning Planning (texto + link + telefone),
 * casando cada linha por State + nome do condado.
 *
 * Por padrão roda em modo dry-run (só mostra o que seria alterado).
 * Use --apply para gravar de fato no banco.
 *
 * Uso:
 *   node scripts/import-county-details.js "<caminho_da_planilha.xlsx>"
 *   node scripts/import-county-details.js "<caminho_da_planilha.xlsx>" --apply
 */

const { createClient } = require('@supabase/supabase-js');
const XLSX = require('xlsx');
require('dotenv').config({ path: '.env.local', quiet: true });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const COLUMN_MAP = {
  'Main Website': 'main_website',
  'Tax Sale': 'tax_sale',
  'Tax Sale Link': 'tax_sale_link',
  'Tax Sale Phone': 'tax_sale_phone',
  'Property Appraiser': 'property_appraiser',
  'Appraiser Link': 'property_appraiser_link',
  'Appraiser Phone': 'property_appraiser_phone',
  'Clerk Recording Office': 'clerk_recording_office',
  'Clerk Recording Link': 'clerk_recording_link',
  'Clerk Recording Phone': 'clerk_recording_phone',
  'Zoning Planning': 'zoning_planning',
  'Zoning Planning Link': 'zoning_planning_link',
  'Zoning Planning Phone': 'zoning_planning_phone',
};

function cleanString(val) {
  if (val === undefined || val === null) return null;
  const str = val.toString().trim();
  return str === '' ? null : str;
}

// Aliases para nomes que existem em ls_county com grafia diferente da
// planilha (typo de cadastro ou variação de pontuação/hífen).
const NAME_ALIASES = {
  'fl|glades': 'fl|galdes',
};

function normKey(name, state) {
  const norm = (name || '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[.\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const key = `${(state || '').toString().trim().toLowerCase()}|${norm}`;
  return NAME_ALIASES[key] || key;
}

async function run() {
  const apply = process.argv.includes('--apply');
  const filePath = process.argv[2] && !process.argv[2].startsWith('--')
    ? process.argv[2]
    : 'COUNTY_DETAIL.xlsx';

  console.log(`=== Importação de County Details (${apply ? 'APPLY' : 'DRY-RUN'}) ===\n`);
  console.log(`Planilha: ${filePath}\n`);

  let rows;
  try {
    const wb = XLSX.readFile(filePath);
    const sheetName = wb.SheetNames.includes('County Contacts') ? 'County Contacts' : wb.SheetNames[0];
    rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]);
    console.log(`Linhas lidas: ${rows.length}\n`);
  } catch (err) {
    console.error('Erro ao abrir a planilha:', err.message);
    process.exit(1);
  }

  const { data: counties, error: countiesErr } = await supabase.from('ls_county').select('id, name, state');
  if (countiesErr) {
    console.error('Erro ao carregar ls_county:', countiesErr.message);
    process.exit(1);
  }

  const countyMap = new Map();
  for (const c of counties) countyMap.set(normKey(c.name, c.state), c);

  const matched = [];
  const unmatched = [];

  for (const row of rows) {
    const state = cleanString(row['State']);
    const name = cleanString(row['CONDADO']);
    if (!name) continue;

    const county = countyMap.get(normKey(name, state));
    if (!county) {
      unmatched.push({ state, name });
      continue;
    }

    const payload = {};
    for (const [xlsxCol, dbCol] of Object.entries(COLUMN_MAP)) {
      payload[dbCol] = cleanString(row[xlsxCol]);
    }

    matched.push({ county, payload, source: { state, name } });
  }

  console.log(`Casados: ${matched.length} / ${rows.length}`);
  console.log(`Não casados: ${unmatched.length}`);
  if (unmatched.length) {
    console.log('\nLinhas da planilha sem correspondência em ls_county:');
    unmatched.forEach(u => console.log(`  - [${u.state}] ${u.name}`));
  }

  if (!apply) {
    console.log('\nDry-run: nenhuma alteração foi gravada. Rode novamente com --apply para gravar.');
    console.log('\nAmostra do que seria gravado (3 primeiros):');
    matched.slice(0, 3).forEach(m => {
      console.log(`  [${m.county.state}] ${m.county.name} ->`, m.payload);
    });
    return;
  }

  console.log('\nGravando alterações...');
  let ok = 0, fail = 0;
  for (const m of matched) {
    const { error } = await supabase.from('ls_county').update(m.payload).eq('id', m.county.id);
    if (error) {
      fail++;
      console.error(`  Falhou [${m.county.state}] ${m.county.name}:`, error.message);
    } else {
      ok++;
    }
  }
  console.log(`\nConcluído: ${ok} atualizados, ${fail} falharam.`);
}

run();
