const { createClient } = require('@supabase/supabase-js');
const XLSX = require('xlsx');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Erro: NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY nao encontradas no .env.local!');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Clean string helpers
function cleanString(val) {
  if (val === undefined || val === null) return null;
  const str = val.toString().replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  return str === '' ? null : str;
}

// Clean number helpers
function cleanNumber(val) {
  if (val === undefined || val === null) return null;
  const num = parseFloat(val);
  return isNaN(num) ? null : num;
}

// Parse Booleans
function parseBoolean(val) {
  if (val === undefined || val === null) return false;
  if (typeof val === 'boolean') return val;
  const str = val.toString().toLowerCase().trim();
  return str === 'true' || str === '1' || str === 'yes' || str === 'sim';
}

// Robust Excel date parser
function parseExcelDate(val) {
  if (!val) return null;
  if (typeof val === 'number') {
    // Convert Excel serial number date
    const date = new Date((val - 25569) * 86400 * 1000);
    return date.toISOString();
  }
  const str = val.toString().trim();
  if (!str) return null;
  const parsed = Date.parse(str);
  if (isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
}

async function startImport() {
  console.log('=== Iniciando Processamento do Excel ===');
  
  // 1. Read Workbook
  let workbook;
  try {
    workbook = XLSX.readFile('import-auctions.xlsx');
  } catch (err) {
    console.error('Erro ao abrir o arquivo import-auctions.xlsx. Certifique-se de que ele esta na raiz do projeto.');
    console.error(err);
    process.exit(1);
  }
  
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(firstSheet);
  console.log(`Planilha lida com sucesso! Encontradas ${rawRows.length} linhas de dados.`);

  // 2. Fetch lookups in memory for speed
  console.log('Carregando tabelas auxiliares do banco...');
  const [
    countiesRes,
    propertyTypesRes,
    prioritiesRes,
    origemsRes,
    auctionTypesRes,
    auctionModelsRes,
    femasRes,
    wetlandsRes,
    debitsRes,
    gismapsRes,
    propAccessesRes,
    roadAccessesRes,
    constructionsRes,
    statusesRes
  ] = await Promise.all([
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
    supabase.from('ls_status').select('*')
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

  // Setup default active status for auctions
  let activeStatus = statuses.find(s => s.name.toLowerCase() === 'active' || s.name.toLowerCase() === 'active asset');
  if (!activeStatus && statuses.length > 0) {
    activeStatus = statuses[0];
  }
  const defaultStatusId = activeStatus ? activeStatus.id : null;

  // Lookup helper function
  async function getOrCreateLookup(tableName, nameVal, cacheArray) {
    if (nameVal === undefined || nameVal === null) return null;
    const trimmed = nameVal.toString().trim();
    if (!trimmed || trimmed.toLowerCase() === 'n/a' || trimmed.toLowerCase() === 'none') return null;

    let record = cacheArray.find(r => r.name.toLowerCase() === trimmed.toLowerCase());
    if (!record) {
      // Dynamic insert to prevent failures!
      console.log(`[Database] Criando valor "${trimmed}" nao cadastrado na tabela ${tableName}...`);
      const { data, error } = await supabase
        .from(tableName)
        .insert({ name: trimmed })
        .select('id, name')
        .single();
      
      if (error) {
        console.error(`Erro ao criar valor "${trimmed}" em ${tableName}:`, error.message);
        return null;
      }
      record = data;
      cacheArray.push(record);
    }
    return record.id;
  }

  let successCount = 0;
  let errorCount = 0;

  // Limpeza de leiloes anteriores com os mesmos case_numbers
  const caseNumbers = rawRows.map(r => cleanString(r.case_number)).filter(Boolean);
  if (caseNumbers.length > 0) {
    console.log(`[Limpeza] Removendo leiloes anteriores com os mesmos case_numbers (${caseNumbers.length} possiveis)...`);
    const { error: deleteError } = await supabase
      .from('ls_assets')
      .delete()
      .in('case_number', caseNumbers)
      .eq('record_type', 'AUCTION');
    if (deleteError) {
      console.error('Erro ao limpar leiloes anteriores:', deleteError.message);
    } else {
      console.log('Limpeza concluida com sucesso!');
    }
  }

  console.log('\nProcessando e salvando linhas no banco...');

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const rowNum = i + 2; // Excel row numbering starts at 2 (1 is header)
    
    try {
      // 3. Resolve County & State
      let countyId = null;
      const countyRaw = row.Condado || '';
      const stateAbbr = row.state || '';
      const countyName = countyRaw.split(',')[0].trim();
      
      if (countyName && stateAbbr) {
        let county = counties.find(c => c.name.toLowerCase() === countyName.toLowerCase() && c.state.toLowerCase() === stateAbbr.toLowerCase());
        if (!county) {
          console.log(`[Database] Criando Condado "${countyName} (${stateAbbr})"...`);
          const { data, error } = await supabase
            .from('ls_county')
            .insert({ name: countyName, state: stateAbbr })
            .select('id, name, state')
            .single();
          if (error) {
            console.error(`Erro ao cadastrar condado ${countyName} (${stateAbbr}):`, error.message);
          } else {
            county = data;
            counties.push(county);
          }
        }
        countyId = county ? county.id : null;
      }

      // 4. Resolve Relationship text fields to UUIDs
      const ref_construction_id = await getOrCreateLookup('ls_ref_construction', row.Ref_Construction_id || row.ref_construction_id, constructions);
      const fema_id = await getOrCreateLookup('ls_fema', row.Fema_id || row.fema_id, femas);
      const wetlands_id = await getOrCreateLookup('ls_wetlands', row.Wetland_id || row.wetland_id || row.Wetland_id || row.wetlands_id, wetlands);
      const debit_id = await getOrCreateLookup('ls_debit', row.Debit_id || row.debit_id, debits);
      const gismap_id = await getOrCreateLookup('ls_gismap', row.Gismap_id || row.gismap_id, gismaps);
      const prop_access_id = await getOrCreateLookup('ls_property_access', row.Prop_Access_id || row.prop_access_id, propAccesses);
      const property_type_id = await getOrCreateLookup('ls_property_type', row.property_type_id || row.Property_Type_id || row.property_type, propertyTypes);
      const road_access_id = await getOrCreateLookup('ls_road_access', row.Road_Access_id || row.road_access_id, roadAccesses);
      const priority_id = await getOrCreateLookup('ls_priority', row.Priority_id || row.priority_id || row.priority, priorities);
      const auction_model_id = await getOrCreateLookup('ls_auction_model', row.Auction_model_id || row.auction_model_id || row.auction_model, auctionModels);
      const auction_type_id = await getOrCreateLookup('ls_auction_type', row.Auction_Type || row.auction_type_id || row.auction_type, auctionTypes);

      // 5. Construct mapped assets object
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
        legal_description: cleanString(row.legal_description),
        
        size: cleanNumber(row.size),
        annual_tax: cleanNumber(row.Annual_Tax || row.annual_tax),
        open_bid: cleanNumber(row.Open_Bid || row.open_bid),
        max_bid: cleanNumber(row.Max_Bid || row.max_bid),
        max_bid_internal: cleanNumber(row.Max_Bid_Internal || row.max_bid_internal),
        min_bid: cleanNumber(row.min_bid || row.Min_Bid),
        
        market_value: cleanNumber(row.Market_Value || row.market_value),
        house_price: cleanNumber(row.house_Price || row.house_price),
        sqft_price_reference: cleanNumber(row.Sqft_Price_Reference || row.sqft_price_reference),
        county_appraisal: cleanNumber(row.County_Apraisal || row.county_appraisal || row.County_Appraisal || row.county_apraisal),
        online_appraisal: cleanNumber(row.Online_Apraisal || row.online_appraisal || row.Online_Appraisal || row.online_apraisal),
        
        appraisal_min: cleanNumber(row.Appraisal_Min || row.appraisal_min),
        appraisal_avg: cleanNumber(row.Appraisal_Average || row.appraisal_avg),
        appraisal_max: cleanNumber(row.Appraisal_Max || row.appraisal_max),
        
        inperson_visit: parseBoolean(row.In_Person_Visit || row.inperson_visit),
        corner_lot: parseBoolean(row.Corner_Lot || row.corner_lot),
        
        auction_date: parseExcelDate(row.auction_date),
        
        // Relational IDs
        county_id: countyId,
        status_id: defaultStatusId,
        ref_construction_id,
        fema_id,
        wetlands_id,
        debit_id,
        gismap_id,
        prop_access_id,
        property_type_id,
        road_access_id,
        priority_id,
        auction_model_id,
        auction_type_id
      };

      // 6. Insert record in Supabase
      const { error } = await supabase.from('ls_assets').insert(asset);
      
      if (error) {
        throw new Error(error.message);
      }
      
      successCount++;
      if (successCount % 10 === 0 || successCount === rawRows.length) {
        console.log(`[Progresso] Importados com sucesso: ${successCount}/${rawRows.length}`);
      }
    } catch (err) {
      errorCount++;
      console.error(`[Erro] Falha na linha ${rowNum} (Case: ${row.case_number || 'N/A'}):`, err.message);
    }
  }

  console.log('\n=== Carga de Leiloes Concluida! ===');
  console.log(`Sucesso: ${successCount} registros importados.`);
  console.log(`Erros: ${errorCount} falhas encontradas.`);
  
  if (successCount > 0) {
    console.log('\nTodos os dados de leilao ja estao disponiveis no seu sistema local!');
  }
}

startImport();
