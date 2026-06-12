/**
 * reimport-failed.js
 * Re-importa apenas as linhas que falharam por legal_description > 255 chars.
 * Rode DEPOIS de executar no Supabase:
 *   ALTER TABLE ls_assets ALTER COLUMN legal_description TYPE TEXT;
 */

const { createClient } = require('@supabase/supabase-js');
const XLSX = require('xlsx');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
);

// Linhas do Excel que falharam (numero da linha no Excel, base 1 com header)
const FAILED_LINES = [238,284,285,291,292,294,298,356,488,504,541,715,740,742,770,889,1144,1216];

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
function parseBoolean(val) {
  if (val === undefined || val === null) return false;
  if (typeof val === 'boolean') return val;
  const str = val.toString().toLowerCase().trim();
  return str === 'true' || str === '1' || str === 'yes' || str === 'sim';
}
function parseExcelDate(val) {
  if (!val) return null;
  if (typeof val === 'number') return new Date((val - 25569) * 86400 * 1000).toISOString();
  const str = val.toString().trim();
  if (!str) return null;
  const parsed = Date.parse(str);
  return isNaN(parsed) ? null : new Date(parsed).toISOString();
}

async function reimport() {
  console.log('=== Re-import das 18 linhas com falha ===\n');

  const wb = XLSX.readFile('import-auctions.xlsx');
  const allRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  const targetRows = FAILED_LINES.map(lineNum => ({ lineNum, row: allRows[lineNum - 2] })).filter(x => x.row);

  console.log(`Linhas a processar: ${targetRows.length}\n`);

  // Carregar lookups
  const [countiesRes, propertyTypesRes, prioritiesRes, origemsRes,
    auctionTypesRes, auctionModelsRes, femasRes, wetlandsRes,
    debitsRes, gismapsRes, propAccessesRes, roadAccessesRes,
    constructionsRes, statusesRes] = await Promise.all([
    supabase.from('ls_county').select('*'),
    supabase.from('ls_property_type').select('*'),
    supabase.from('ls_priority').select('*'),
    supabase.from('ls_origem').select('*'),
    supabase.from('ls_auction_type').select('*'),
    supabase.from('ls_auction_model').select('*'),
    supabase.from('ls_fema').select('*'),
    supabase.from('ls_wetlands').select('*'),
    supabase.from('ls_debit').select('*'),
    supabase.from('ls_gismap').select('*'),
    supabase.from('ls_property_access').select('*'),
    supabase.from('ls_road_access').select('*'),
    supabase.from('ls_ref_construction').select('*'),
    supabase.from('ls_status').select('*'),
  ]);

  const counties = countiesRes.data || [];
  const propertyTypes = propertyTypesRes.data || [];
  const priorities = prioritiesRes.data || [];
  const origems = origemsRes.data || [];
  const auctionTypes = auctionTypesRes.data || [];
  const auctionModels = auctionModelsRes.data || [];
  const femas = femasRes.data || [];
  const wetlands = wetlandsRes.data || [];
  const debits = debitsRes.data || [];
  const gismaps = gismapsRes.data || [];
  const propAccesses = propAccessesRes.data || [];
  const roadAccesses = roadAccessesRes.data || [];
  const constructions = constructionsRes.data || [];
  const statuses = statusesRes.data || [];

  const activeStatus = statuses.find(s =>
    s.name.toLowerCase() === 'active auction' ||
    s.name.toLowerCase() === 'active' ||
    s.name.toLowerCase() === 'active asset'
  );
  const defaultStatusId = activeStatus ? activeStatus.id : null;

  async function getOrCreateLookup(tableName, nameVal, cacheArray) {
    if (!nameVal) return null;
    const trimmed = nameVal.toString().trim();
    if (!trimmed || trimmed.toLowerCase() === 'n/a' || trimmed.toLowerCase() === 'none') return null;
    let record = cacheArray.find(r => r.name.toLowerCase() === trimmed.toLowerCase());
    if (!record) {
      const { data, error } = await supabase.from(tableName).insert({ name: trimmed }).select('id, name').single();
      if (error) { console.error(`Erro ao criar "${trimmed}" em ${tableName}:`, error.message); return null; }
      record = data;
      cacheArray.push(record);
    }
    return record.id;
  }

  let success = 0, errors = 0;

  for (const { lineNum, row } of targetRows) {
    try {
      const countyName = (row.Condado || '').toString().split(',')[0].trim();
      const stateAbbr = cleanString(row.state) || '';
      let countyId = null;
      if (countyName && stateAbbr) {
        let county = counties.find(c =>
          c.name.toLowerCase() === countyName.toLowerCase() &&
          c.state.toLowerCase() === stateAbbr.toLowerCase()
        );
        if (!county) {
          const { data, error } = await supabase.from('ls_county').insert({ name: countyName, state: stateAbbr }).select('id,name,state').single();
          if (!error) { county = data; counties.push(county); }
        }
        countyId = county?.id || null;
      }

      const ref_construction_id = await getOrCreateLookup('ls_ref_construction', row.Ref_Construction_id || row.ref_construction_id, constructions);
      const fema_id             = await getOrCreateLookup('ls_fema',             row.Fema_id || row.fema_id, femas);
      const wetlands_id         = await getOrCreateLookup('ls_wetlands',         row.Wetland_id || row.wetland_id || row.wetlands_id, wetlands);
      const debit_id            = await getOrCreateLookup('ls_debit',            row.Debit_id || row.debit_id, debits);
      const gismap_id           = await getOrCreateLookup('ls_gismap',           row.Gismap_id || row.gismap_id, gismaps);
      const prop_access_id      = await getOrCreateLookup('ls_property_access',  row.Prop_Access_id || row.prop_access_id, propAccesses);
      const property_type_id    = await getOrCreateLookup('ls_property_type',    row.property_type_id || row.Property_Type_id || row.property_type, propertyTypes);
      const road_access_id      = await getOrCreateLookup('ls_road_access',      row.Road_Access_id || row.road_access_id, roadAccesses);
      const priority_id         = await getOrCreateLookup('ls_priority',         row.Priority_id || row.priority_id || row.priority, priorities);
      const auction_model_id    = await getOrCreateLookup('ls_auction_model',    row.Auction_model_id || row.auction_model_id || row.auction_model, auctionModels);
      const auction_type_id     = await getOrCreateLookup('ls_auction_type',     row.Auction_Type || row.auction_type_id || row.auction_type, auctionTypes);
      const origem_id           = await getOrCreateLookup('ls_origem',           row.Origem || row.origem || row.origem_id || row.origin || row.Origin, origems);

      const asset = {
        record_type: 'AUCTION',
        case_number: cleanString(row.case_number),
        parcel_number: cleanString(row.parcel_number),
        address: cleanString(row.address),
        zoning: cleanString(row.zoning),
        coordinates: cleanString(row.coordinates),
        link_regrid: cleanString(row.link_regrid),
        observation: cleanString(row.observation),
        surrounds: cleanString(row.surrounds),
        link_sources: cleanString(row.sources || row.link_sources),
        link_house_sources: cleanString(row.house_sources || row.link_house_sources),
        link_video: cleanString(row.link_video || row.Link_Video),
        legal_description: cleanString(row.legal_description),
        size: cleanNumber(row.size),
        annual_tax: cleanNumber(row.Annual_Tax || row.annual_tax),
        open_bid: cleanNumber(row.Open_Bid || row.open_bid),
        max_bid: cleanNumber(row.Max_Bid || row.max_bid),
        max_bid_internal: cleanNumber(row.Max_Bid_Internal || row.max_bid_internal),
        min_bid: cleanNumber(row.min_bid || row.Min_Bid),
        market_value: cleanNumber(row.Market_Value || row.market_value),
        house_price: cleanNumber(row.house_price || row.house_Price),
        sqft_price_reference: cleanNumber(row.sqft_price_reference || row.Sqft_Price_Reference),
        county_appraisal: cleanNumber(row.County_Apraisal || row.county_appraisal || row.County_Appraisal),
        online_appraisal: cleanNumber(row.Online_Apraisal || row.online_appraisal || row.Online_Appraisal),
        appraisal_min: cleanNumber(row.Appraisal_Min || row.appraisal_min),
        appraisal_avg: cleanNumber(row.Appraisal_Average || row.appraisal_avg),
        appraisal_max: cleanNumber(row.Appraisal_Max || row.appraisal_max),
        inperson_visit: parseBoolean(row.In_Person_Visit || row.inperson_visit),
        corner_lot: parseBoolean(row.Corner_Lot || row.corner_lot),
        utilities: cleanString(row.Utilities || row.utilities),
        tax_deed: cleanString(row.tax_deed || row.Tax_Deed),
        warranty_deed: cleanString(row.warranty_deed || row.Warranty_Deed),
        survey: cleanString(row.Survey || row.survey),
        site_plan: cleanString(row.site_plan || row.Site_Plan),
        owner_type: cleanString(row.owner_type || row.Owner_Type) || 'ironclad',
        auction_date: parseExcelDate(row.auction_date),
        upset_date: parseExcelDate(row.upset_date || row.Upset_Date),
        acquisition_date: parseExcelDate(row.Acquisition_Date || row.acquisition_date),
        improvements: cleanString(row.Improvements || row.improvements) || null,
        mh_allowed: cleanString(row.MH_Allowed || row.mh_allowed) || null,
        county_id: countyId,
        status_id: defaultStatusId,
        origem_id,
        ref_construction_id, fema_id, wetlands_id, debit_id, gismap_id,
        prop_access_id, property_type_id, road_access_id, priority_id,
        auction_model_id, auction_type_id,
      };

      // Antes de inserir, remove registro anterior com mesmo id do Excel (se existir)
      // para evitar duplicatas em caso de re-execução
      const { data: existing } = await supabase
        .from('ls_assets')
        .select('id')
        .eq('case_number', asset.case_number || '')
        .eq('record_type', 'AUCTION')
        .limit(1);
      if (existing && existing.length > 0) {
        await supabase.from('ls_assets').delete().eq('id', existing[0].id);
      }

      const { error } = await supabase.from('ls_assets').insert(asset);
      if (error) throw new Error(error.message);

      success++;
      console.log(`✅ Linha ${lineNum} | Case: ${row.case_number} | legal_description: ${(cleanString(row.legal_description) || '').length} chars`);
    } catch (err) {
      errors++;
      console.error(`❌ Linha ${lineNum} | Case: ${row.case_number} | ${err.message}`);
    }
  }

  console.log(`\n=== Concluido ===`);
  console.log(`Sucesso: ${success} | Erros: ${errors}`);
}

reimport().catch(err => { console.error('Erro inesperado:', err.message); process.exit(1); });
