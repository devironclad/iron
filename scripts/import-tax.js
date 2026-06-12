/**
 * import-tax.js
 * Lê Carga_Tax.xlsx e insere os registros em ls_asset_tax.
 * Relaciona propriedades via Property_Lookup (= id_prop_old em ls_assets).
 *
 * Regras:
 * - vigency: importado como está na planilha (sem validação de lista)
 * - value: NULL ou vazio → 0
 * - status: não utilizado (inserido como NULL)
 */

const { createClient } = require('@supabase/supabase-js');
const XLSX = require('xlsx');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
);

function cleanString(val) {
  if (val === undefined || val === null) return null;
  const str = val.toString().trim();
  return str === '' || str.toLowerCase() === 'n/a' ? null : str;
}

function cleanNumber(val, defaultVal = null) {
  if (val === undefined || val === null || val === '') return defaultVal;
  const num = parseFloat(val);
  return isNaN(num) ? defaultVal : num;
}

function parseExcelDate(val) {
  if (!val) return null;
  if (typeof val === 'number') {
    return new Date((val - 25569) * 86400 * 1000).toISOString().split('T')[0];
  }
  const str = val.toString().trim();
  if (!str) return null;
  const parsed = Date.parse(str);
  return isNaN(parsed) ? null : new Date(parsed).toISOString().split('T')[0];
}

async function importTax() {
  console.log('=== Importação de Tax ===\n');

  // 1. Ler planilha
  let rows;
  try {
    const wb = XLSX.readFile('Carga_Tax.xlsx');
    rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    console.log(`Planilha lida: ${rows.length} registros encontrados.\n`);
  } catch (err) {
    console.error('Erro ao abrir Carga_Tax.xlsx:', err.message);
    process.exit(1);
  }

  // 2. Carregar mapa id_prop_old → asset.id
  console.log('Carregando mapa de propriedades (id_prop_old → id)...');
  const { data: assets, error: assetsErr } = await supabase
    .from('ls_assets')
    .select('id, id_prop_old')
    .not('id_prop_old', 'is', null);

  if (assetsErr) {
    console.error('Erro ao carregar assets:', assetsErr.message);
    process.exit(1);
  }

  const assetMap = {};
  for (const a of assets) {
    assetMap[a.id_prop_old.trim()] = a.id;
  }
  console.log(`${Object.keys(assetMap).length} propriedades mapeadas.\n`);

  // 3. Processar e inserir
  console.log('Processando registros de tax...\n');
  let success = 0;
  let skipped = 0;
  let errors  = 0;

  for (let i = 0; i < rows.length; i++) {
    const row    = rows[i];
    const rowNum = i + 2;

    const propLookup = row.Property_Lookup?.toString().trim();

    if (!propLookup) {
      console.warn(`[Linha ${rowNum}] Property_Lookup vazio — ignorado.`);
      skipped++;
      continue;
    }

    const assetId = assetMap[propLookup];
    if (!assetId) {
      console.warn(`[Linha ${rowNum}] Property_Lookup "${propLookup}" não encontrado em ls_assets — ignorado.`);
      skipped++;
      continue;
    }

    try {
      const record = {
        asset_id:      assetId,
        due_date:      parseExcelDate(row.due_date),
        pay_date:      parseExcelDate(row.pay_date),
        received_date: parseExcelDate(row.received_date),
        value:         cleanNumber(row.Value, 0),       // NULL → 0
        perc_iron:     cleanNumber(row.Perc_Iron),
        perc_inv:      cleanNumber(row.Perc_Inv),
        vigency:       cleanString(row.Vigency),        // importado como está
        recurrence:    cleanString(row.Recurrence),
        type_tax:      cleanString(row.Type_Tax),
        link_bill:     cleanString(row.link_bill),
        link_proof:    cleanString(row.link_Proof),
        link_advalorem: cleanString(row.Link_Advalorem),
        status:        null,                            // não utilizado por enquanto
      };

      const { error } = await supabase.from('ls_asset_tax').insert(record);
      if (error) throw new Error(error.message);

      success++;
      if (success % 50 === 0) console.log(`[Progresso] ${success}/${rows.length} registros importados...`);
    } catch (err) {
      errors++;
      console.error(`[Erro] Linha ${rowNum} | Property_Lookup=${propLookup} | ${err.message}`);
    }
  }

  console.log('\n=== Importação de Tax Concluída ===');
  console.log(`Sucesso:   ${success}`);
  console.log(`Ignorados: ${skipped}`);
  console.log(`Erros:     ${errors}`);
}

importTax().catch(err => {
  console.error('Erro inesperado:', err.message);
  process.exit(1);
});
