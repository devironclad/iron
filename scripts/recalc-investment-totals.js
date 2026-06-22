/**
 * recalc-investment-totals.js
 *
 * Recalcula e persiste investment_total e investment_total_inv para todas
 * as propriedades (record_type = 'PROPERTY'), aplicando as mesmas regras
 * do applyAssetAccumulation do frontend.
 *
 * Campos recalculados:
 *   doc_fees           = Σ (value × perc_iron/100) — taxas não-Closing Fees com pay_date
 *   doc_fees_inv       = Σ (value × perc_inv/100)  — taxas não-Closing Fees com pay_date
 *   closing_fess_inv   = Σ (value × perc_inv/100)  — taxas Closing Fees com pay_date
 *   investment_total     = paid_bid + dev_toggles_ativos + doc_fees
 *   investment_total_inv = paid_bid_inv + strategy_toggles_ativos + doc_fees_inv + closing_fess_inv
 *
 * Uso:
 *   node scripts/recalc-investment-totals.js           (dry-run, só mostra divergências)
 *   node scripts/recalc-investment-totals.js --apply   (aplica as atualizações no banco)
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DRY_RUN = !process.argv.includes('--apply');

const DEV_COST_ITEMS = [
  { cost: 'warrantydeedtransfer', toggle: 'tg_warrantydeedtransfer' },
  { cost: 'titleclaim_action',    toggle: 'tg_titleclaim_action' },
  { cost: 'surveyor',             toggle: 'tg_surveyor' },
  { cost: 'land_clearing',        toggle: 'tg_land_clearing' },
  { cost: 'fencing_gate',         toggle: 'tg_fencing_gate' },
  { cost: 'preapproval_review',   toggle: 'tg_preapproval_review' },
];

const STRATEGY_ITEMS = [
  { cost: 'warrantydeedtransfer_stg', toggle: 'tg_warrantydeedtransfer_stg' },
  { cost: 'titleclaim_action_stg',    toggle: 'tg_titleclaim_action_stg' },
  { cost: 'surveyor_stg',             toggle: 'tg_surveyor_stg' },
  { cost: 'land_clearing_stg',        toggle: 'tg_land_clearing_stg' },
  { cost: 'fencing_gate_stg',         toggle: 'tg_fencing_gate_stg' },
  { cost: 'preapproval_review_stg',   toggle: 'tg_preapproval_review_stg' },
];

function round2(val) {
  return Math.round(val * 100) / 100;
}

function calcTaxAccumulation(taxes) {
  const eligible = taxes.filter(t => t.pay_date && t.value !== null);

  const doc_fees = eligible
    .filter(t => t.type_tax !== 'Closing Fees' && t.perc_iron !== null)
    .reduce((acc, t) => acc + (Number(t.value) * (Number(t.perc_iron) / 100)), 0);

  const doc_fees_inv = eligible
    .filter(t => t.type_tax !== 'Closing Fees' && t.perc_inv !== null)
    .reduce((acc, t) => acc + (Number(t.value) * (Number(t.perc_inv) / 100)), 0);

  const closing_fess_inv = eligible
    .filter(t => t.type_tax === 'Closing Fees' && t.perc_inv !== null)
    .reduce((acc, t) => acc + (Number(t.value) * (Number(t.perc_inv) / 100)), 0);

  return {
    doc_fees:         round2(doc_fees),
    doc_fees_inv:     round2(doc_fees_inv),
    closing_fess_inv: round2(closing_fess_inv),
  };
}

function calcInvestmentTotals(prop, taxAccum) {
  const { doc_fees, doc_fees_inv, closing_fess_inv } = taxAccum;

  const devToggleSum = DEV_COST_ITEMS.reduce((acc, { cost, toggle }) =>
    acc + (prop[toggle] ? (Number(prop[cost]) || 0) : 0), 0);

  const strategySum = STRATEGY_ITEMS.reduce((acc, { cost, toggle }) =>
    acc + (prop[toggle] ? (Number(prop[cost]) || 0) : 0), 0);

  const investment_total = round2(
    (Number(prop.paid_bid) || 0) + devToggleSum + doc_fees
  );

  const investment_total_inv = round2(
    (Number(prop.paid_bid_inv) || 0) + strategySum + doc_fees_inv + closing_fess_inv
  );

  return { investment_total, investment_total_inv };
}

async function fetchAllProperties() {
  const PAGE = 1000;
  let all = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('ls_assets')
      .select(`
        id, ref_id, paid_bid, paid_bid_inv,
        doc_fees, doc_fees_inv, closing_fess_inv,
        investment_total, investment_total_inv,
        warrantydeedtransfer, tg_warrantydeedtransfer,
        titleclaim_action,    tg_titleclaim_action,
        surveyor,             tg_surveyor,
        land_clearing,        tg_land_clearing,
        fencing_gate,         tg_fencing_gate,
        preapproval_review,   tg_preapproval_review,
        warrantydeedtransfer_stg, tg_warrantydeedtransfer_stg,
        titleclaim_action_stg,    tg_titleclaim_action_stg,
        surveyor_stg,             tg_surveyor_stg,
        land_clearing_stg,        tg_land_clearing_stg,
        fencing_gate_stg,         tg_fencing_gate_stg,
        preapproval_review_stg,   tg_preapproval_review_stg
      `)
      .eq('record_type', 'PROPERTY')
      .range(from, from + PAGE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

async function fetchTaxesForProperties(propertyIds) {
  const PAGE = 5000;
  let all = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('ls_asset_tax')
      .select('asset_id, type_tax, pay_date, value, perc_iron, perc_inv')
      .in('asset_id', propertyIds)
      .range(from, from + PAGE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

async function run() {
  console.log(`\n=== recalc-investment-totals — ${DRY_RUN ? 'DRY RUN' : 'APPLY'} ===\n`);

  const properties = await fetchAllProperties();
  console.log(`Properties loaded: ${properties.length}`);

  const taxMap = {};
  if (properties.length > 0) {
    const ids = properties.map(p => p.id);
    const taxes = await fetchTaxesForProperties(ids);
    console.log(`Tax records loaded: ${taxes.length}`);
    for (const t of taxes) {
      if (!taxMap[t.asset_id]) taxMap[t.asset_id] = [];
      taxMap[t.asset_id].push(t);
    }
  }

  let diverged = 0;
  let updated  = 0;
  const updates = [];

  for (const prop of properties) {
    const taxes    = taxMap[prop.id] || [];
    const taxAccum = calcTaxAccumulation(taxes);
    const { investment_total, investment_total_inv } = calcInvestmentTotals(prop, taxAccum);

    const dbTotal    = round2(Number(prop.investment_total)     || 0);
    const dbTotalInv = round2(Number(prop.investment_total_inv) || 0);
    const dbDocFees       = round2(Number(prop.doc_fees)         || 0);
    const dbDocFeesInv    = round2(Number(prop.doc_fees_inv)     || 0);
    const dbClosingInv    = round2(Number(prop.closing_fess_inv) || 0);

    const hasDiv =
      investment_total          !== dbTotal        ||
      investment_total_inv      !== dbTotalInv     ||
      taxAccum.doc_fees         !== dbDocFees      ||
      taxAccum.doc_fees_inv     !== dbDocFeesInv   ||
      taxAccum.closing_fess_inv !== dbClosingInv;

    if (hasDiv) {
      diverged++;
      console.log(`  PRP-${String(prop.ref_id).padStart(4,'0')} (id=${prop.id})`);
      if (taxAccum.doc_fees !== dbDocFees)
        console.log(`    doc_fees:           ${dbDocFees}  →  ${taxAccum.doc_fees}`);
      if (taxAccum.doc_fees_inv !== dbDocFeesInv)
        console.log(`    doc_fees_inv:       ${dbDocFeesInv}  →  ${taxAccum.doc_fees_inv}`);
      if (taxAccum.closing_fess_inv !== dbClosingInv)
        console.log(`    closing_fess_inv:   ${dbClosingInv}  →  ${taxAccum.closing_fess_inv}`);
      if (investment_total !== dbTotal)
        console.log(`    investment_total:   ${dbTotal}  →  ${investment_total}`);
      if (investment_total_inv !== dbTotalInv)
        console.log(`    investment_total_inv: ${dbTotalInv}  →  ${investment_total_inv}`);

      updates.push({
        id: prop.id,
        ...taxAccum,
        investment_total,
        investment_total_inv,
      });
    }
  }

  console.log(`\nDivergências encontradas: ${diverged} / ${properties.length}`);

  if (DRY_RUN) {
    console.log('\nDry-run concluído. Execute com --apply para aplicar as correções.');
    return;
  }

  if (updates.length === 0) {
    console.log('Nenhuma atualização necessária.');
    return;
  }

  console.log(`\nAplicando ${updates.length} atualizações...`);
  for (const upd of updates) {
    const { id, ...payload } = upd;
    const { error } = await supabase.from('ls_assets').update(payload).eq('id', id);
    if (error) {
      console.error(`  ERRO ao atualizar id=${id}: ${error.message}`);
    } else {
      updated++;
      console.log(`  ✓ id=${id} atualizado`);
    }
  }

  console.log(`\nConcluído: ${updated} / ${updates.length} propriedades atualizadas.`);
}

run().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
