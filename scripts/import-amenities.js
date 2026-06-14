/**
 * import-amenities.js
 * Lê carga_amenities.xlsx e insere os registros em ls_asset_amenities.
 * Relaciona propriedades via id_prop_old (campo em ls_assets).
 * Cria automaticamente categorias e tipos de amenidade se não existirem.
 */

const { createClient } = require('@supabase/supabase-js');
const XLSX = require('xlsx');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
);

async function importAmenities() {
  console.log('=== Importação de Amenidades ===\n');

  // 1. Ler planilha
  let rows;
  try {
    const wb = XLSX.readFile('carga_amenities.xlsx');
    rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    console.log(`Planilha lida: ${rows.length} registros encontrados.\n`);
  } catch (err) {
    console.error('Erro ao abrir carga_amenities.xlsx:', err.message);
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

  // 3. Carregar categorias e tipos já existentes
  const { data: categories } = await supabase.from('ls_amenity_category').select('id, name');
  const { data: types } = await supabase.from('ls_amenity_type').select('id, name, category_id');

  const categoryCache = categories || [];
  const typeCache = types || [];

  // Helper: lookup category by name (read-only — ls_amenity_category is managed via the UI)
  function lookupCategory(name) {
    const trimmed = name.toString().trim();
    const cat = categoryCache.find(c => c.name.toLowerCase() === trimmed.toLowerCase());
    if (!cat) console.warn(`  [Aviso] Categoria não encontrada: "${trimmed}" — linha ignorada`);
    return cat || null;
  }

  // Helper: lookup type by name within a category (read-only — ls_amenity_type is managed via the UI)
  function lookupType(typeName, categoryId) {
    const trimmed = typeName.toString().trim();
    const type = typeCache.find(t => t.name.toLowerCase() === trimmed.toLowerCase() && t.category_id === categoryId);
    if (!type) console.warn(`  [Aviso] Tipo não encontrado: "${trimmed}" — linha ignorada`);
    return type || null;
  }

  // 4. Processar e inserir
  console.log('Processando amenidades...\n');
  let success = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    const idPropOld = row.id_prop_old?.toString().trim();
    // Note: in the Excel file, amenity_type holds the broad classification (category)
    // and amenity_category holds the specific place name (type/description)
    const categoryName = row.amenity_type?.toString().trim();
    const typeName = row.amenity_category?.toString().trim();
    const distanceMiles = row.distance_miles != null ? parseFloat(row.distance_miles) : null;
    const timeMinutes = row.time_minutes != null ? parseInt(row.time_minutes) : null;

    // Validações
    if (!idPropOld) {
      console.warn(`[Linha ${rowNum}] id_prop_old vazio — ignorado.`);
      skipped++;
      continue;
    }

    const assetId = assetMap[idPropOld];
    if (!assetId) {
      console.warn(`[Linha ${rowNum}] id_prop_old "${idPropOld}" não encontrado em ls_assets — ignorado.`);
      skipped++;
      continue;
    }

    if (!categoryName || !typeName) {
      console.warn(`[Linha ${rowNum}] amenity_category ou amenity_type vazio — ignorado.`);
      skipped++;
      continue;
    }

    try {
      const category = lookupCategory(categoryName);
      if (!category) { skipped++; continue; }

      const type = lookupType(typeName, category.id);
      if (!type) { skipped++; continue; }

      // Skip if this exact (asset, type) combination already exists
      const { data: existing } = await supabase
        .from('ls_asset_amenities')
        .select('id')
        .eq('asset_id', assetId)
        .eq('amenity_type_id', type.id)
        .maybeSingle();
      if (existing) { skipped++; continue; }

      const { error } = await supabase.from('ls_asset_amenities').insert({
        asset_id: assetId,
        amenity_type_id: type.id,
        distance_miles: isNaN(distanceMiles) ? null : distanceMiles,
        time_minutes: isNaN(timeMinutes) ? null : timeMinutes,
      });

      if (error) throw new Error(error.message);

      success++;
      if (success % 100 === 0) console.log(`[Progresso] ${success}/${rows.length} amenidades importadas...`);
    } catch (err) {
      errors++;
      console.error(`[Erro] Linha ${rowNum} | id_prop_old=${idPropOld} | ${err.message}`);
    }
  }

  console.log('\n=== Importação de Amenidades Concluída ===');
  console.log(`Sucesso:  ${success}`);
  console.log(`Ignorados: ${skipped} (id_prop_old não encontrado ou dados vazios)`);
  console.log(`Erros:    ${errors}`);
}

importAmenities().catch(err => {
  console.error('Erro inesperado:', err.message);
  process.exit(1);
});
