/**
 * import-marketing.js
 * Lê carga_marketing.xlsx e insere os registros em ls_asset_marketing.
 * Relaciona propriedades via id_prop_old (= Property_Lookup na planilha).
 * Um registro por propriedade — todos os campos são opcionais (TEXT).
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

async function importMarketing() {
  console.log('=== Importação de Marketing ===\n');

  // 1. Ler planilha
  let rows;
  try {
    const wb = XLSX.readFile('carga_marketing.xlsx');
    rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    console.log(`Planilha lida: ${rows.length} registros encontrados.\n`);
  } catch (err) {
    console.error('Erro ao abrir carga_marketing.xlsx:', err.message);
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
  console.log('Processando registros de marketing...\n');
  let success = 0;
  let skipped = 0;
  let errors  = 0;

  for (let i = 0; i < rows.length; i++) {
    const row    = rows[i];
    const rowNum = i + 2;

    const propLookup = row.id_prop_old?.toString().trim();

    if (!propLookup) {
      console.warn(`[Linha ${rowNum}] id_prop_old vazio — ignorado.`);
      skipped++;
      continue;
    }

    const assetId = assetMap[propLookup];
    if (!assetId) {
      console.warn(`[Linha ${rowNum}] id_prop_old "${propLookup}" não encontrado em ls_assets — ignorado.`);
      skipped++;
      continue;
    }

    try {
      const record = {
        asset_id:          assetId,
        marketing_report:  cleanString(row.marketing_report),
        library:           cleanString(row.library),
        website_video_copy: cleanString(row.website_video_copy),
        short_form_copy:   cleanString(row.short_form_copy),
        product_page:      cleanString(row.product_page),
        zillow_listing:    cleanString(row.zillow_listing),
        facebook_listing:  cleanString(row.facebook_listing),
        website_video:     cleanString(row.website_video),
        short_form_videos: cleanString(row.short_form_videos),
        edited_photos:     cleanString(row.edited_photos),
        // Campos presentes no banco mas não na planilha — inseridos como NULL
        video_3d_copy:     null,
        video_3d:          null,
        before_video:      null,
        after_video:       null,
      };

      const { error } = await supabase.from('ls_asset_marketing')
        .upsert(record, { onConflict: 'asset_id' });
      if (error) throw new Error(error.message);

      success++;
      console.log(`  ✅ Linha ${rowNum} | id_prop_old=${propLookup} | asset_id=${assetId}`);
    } catch (err) {
      errors++;
      console.error(`[Erro] Linha ${rowNum} | id_prop_old=${propLookup} | ${err.message}`);
    }
  }

  console.log('\n=== Importação de Marketing Concluída ===');
  console.log(`Sucesso:   ${success}`);
  console.log(`Ignorados: ${skipped}`);
  console.log(`Erros:     ${errors}`);
}

importMarketing().catch(err => {
  console.error('Erro inesperado:', err.message);
  process.exit(1);
});
