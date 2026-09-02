/**
 * import-cosl-listings.js
 * Importa o catalogo "List View" do COSL (https://auction.cosl.org) como
 * novos registros AUCTION em ls_assets.
 *
 * Regras (ver scripts/rls/rls_patch_18_cosl_listings_import.sql):
 *  - so listings com "Added On" >= 2026-08-29
 *  - so se o condado ja existir em ls_county (state = 'AR')
 *  - dedup por ls_assets.cosl_property_id (nao reimporta o que ja entrou;
 *    se o asset foi excluido pelo sistema, volta a ser criado)
 *
 * Mapeamento COSL -> ls_assets:
 *  Owner -> observation | County -> county_id | Parcel# -> parcel_number
 *  Acres -> size | Starting Bid -> open_bid | Listing URL -> link_sources
 *  Added On -> auction_date | origem_id = "Land Tax or OTC" | record_type = AUCTION
 *
 * Uso:
 *   node scripts/import-cosl-listings.js            # dry-run (nao grava)
 *   node scripts/import-cosl-listings.js --apply    # grava de fato
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local', quiet: true });

const COSL_BASE_URL = process.env.COSL_BASE_URL || 'https://auction.cosl.org';
const COSL_LISTINGS_SINCE = '2026-08-29T00:00:00';
const ORIGIN_LAND_TAX_OTC = 'eca8b404-b924-4b77-b122-ed7a238bacb7';

const APPLY = process.argv.includes('--apply');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const normCounty = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Regra: auction_date = "Added On" + 30 dias.
function auctionDateFromAdded(addedIso) {
  if (!addedIso) return null;
  const d = new Date(`${addedIso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + 30);
  return d.toISOString().slice(0, 10);
}

async function fetchListings() {
  const res = await fetch(`${COSL_BASE_URL}/auctions/grid_read`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' },
    body: '',
  });
  if (!res.ok) throw new Error(`grid_read HTTP ${res.status}`);
  const json = await res.json();
  const rows = json.Data || [];
  const cutoff = new Date(COSL_LISTINGS_SINCE).getTime();
  const listings = rows
    .filter((r) => r.Added && new Date(r.Added).getTime() >= cutoff)
    .map((r) => ({
      coslPropertyId: r.CoSLPropertyId,
      owner: r.Owner ? r.Owner.replace(/\s+/g, ' ').trim() : null,
      county: r.CoSLCountyName ? r.CoSLCountyName.trim() : null,
      parcelNumber: r.CoSLParcelNumber ? r.CoSLParcelNumber.trim() : null,
      acreage: r.Acreage ?? null,
      startingBid: r.StartingBid ?? null,
      addedAt: r.Added || null,
      listingUrl: r.ListingToken ? `${COSL_BASE_URL}/auction/listing/${r.ListingToken}` : null,
    }));
  return { catalogTotal: rows.length, listings };
}

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (grava)' : 'DRY-RUN'}`);

  const { catalogTotal, listings } = await fetchListings();
  console.log(`Catalogo COSL: ${catalogTotal} | apos filtro Added>=${COSL_LISTINGS_SINCE.slice(0, 10)}: ${listings.length}`);

  const { data: counties, error: cErr } = await supabase.from('ls_county').select('id, name').eq('state', 'AR');
  if (cErr) throw cErr;
  const countyByName = new Map(counties.map((c) => [normCounty(c.name), c.id]));

  const ids = listings.map((l) => l.coslPropertyId);
  const existing = new Set();
  for (let i = 0; i < ids.length; i += 500) {
    const { data, error } = await supabase
      .from('ls_assets').select('cosl_property_id').in('cosl_property_id', ids.slice(i, i + 500));
    if (error) throw error;
    data.forEach((r) => r.cosl_property_id != null && existing.add(Number(r.cosl_property_id)));
  }

  let inserted = 0, skippedExisting = 0, skippedNoCounty = 0;
  const skippedCounties = {};

  for (const l of listings) {
    if (existing.has(l.coslPropertyId)) { skippedExisting++; continue; }
    const countyId = countyByName.get(normCounty(l.county));
    if (!countyId) {
      skippedNoCounty++;
      skippedCounties[l.county || '(blank)'] = (skippedCounties[l.county || '(blank)'] || 0) + 1;
      continue;
    }

    const row = {
      record_type: 'AUCTION',
      origem_id: ORIGIN_LAND_TAX_OTC,
      observation: l.owner,
      county_id: countyId,
      parcel_number: l.parcelNumber,
      size: l.acreage,
      open_bid: l.startingBid,
      link_sources: l.listingUrl,
      auction_date: auctionDateFromAdded(l.addedAt),
      cosl_property_id: l.coslPropertyId,
    };

    if (!APPLY) {
      console.log(`  + ${l.county} | ${l.parcelNumber} | ${l.owner} | $${l.startingBid}`);
      inserted++;
      continue;
    }

    const { error } = await supabase.from('ls_assets').insert(row);
    if (error) {
      if (error.code === '23505') { skippedExisting++; continue; }
      throw error;
    }
    inserted++;
  }

  console.log('\n--- Resumo ---');
  console.log(`${APPLY ? 'Inseridos' : 'Seriam inseridos'}: ${inserted}`);
  console.log(`Pulados (ja importados): ${skippedExisting}`);
  console.log(`Pulados (condado ausente na base): ${skippedNoCounty}`);
  if (Object.keys(skippedCounties).length) {
    console.log('Condados ignorados:', JSON.stringify(skippedCounties));
  }

  if (APPLY) {
    await supabase.from('cosl_listing_sync_meta').update({
      last_run_at: new Date().toISOString(),
      last_success_at: new Date().toISOString(),
      status: 'ok',
      message: 'manual: scripts/import-cosl-listings.js',
      catalog_total: catalogTotal,
      after_date_filter: listings.length,
      inserted,
      skipped_existing: skippedExisting,
      skipped_no_county: skippedNoCounty,
      skipped_counties: skippedCounties,
      duration_ms: null,
    }).eq('id', 1);
  }
}

main().catch((err) => { console.error('ERRO:', err.message || err); process.exit(1); });
