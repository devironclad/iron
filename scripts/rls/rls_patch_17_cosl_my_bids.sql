-- ============================================================
-- PATCH 17 — COSL "My Bids" collector
-- Cria as tabelas que recebem os dados coletados de
-- auction.cosl.org (menu My Auctions -> My Bids) de hora em hora
-- durante o horario comercial do Arkansas.
--
--   cosl_my_bids    -> snapshot atual (substituido inteiro a cada
--                      sincronizacao; SEM historico)
--   cosl_sync_meta  -> 1 linha de status da ultima sincronizacao
--                      (para o selo "atualizado ha X" e visibilidade
--                      de falha na pagina)
--
-- Escrita exclusivamente via service role, dentro da funcao
-- sync_cosl_my_bids() chamada pela route /api/cron/cosl-my-bids.
-- Mesmo padrao de RLS de ls_county_contacts (patch 14): SELECT
-- liberado para autenticado, sem policy de INSERT/UPDATE/DELETE.
-- O gating por pagina e feito no app pela chave de permissao
-- "page:bids" (deny-by-default; ver seed no fim deste patch).
-- ============================================================

BEGIN;

-- ----------------------------------------------------------
-- Tabelas
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS cosl_my_bids (
    auction_listing_id  BIGINT PRIMARY KEY,          -- AuctionListingId
    cosl_property_id    BIGINT,                       -- CoSLPropertyId
    owner               TEXT,                         -- Owner
    county              TEXT,                         -- CoSLCountyName
    parcel_number       TEXT,                         -- CoSLParcelNumber
    acreage             NUMERIC,                      -- Acreage
    listing_start       TIMESTAMPTZ,                  -- ListingStart
    listing_end         TIMESTAMPTZ,                  -- ListingEnd
    start_cst           TEXT,                         -- StartInCST (string exibivel, Central Time)
    end_cst             TEXT,                         -- EndInCST
    max_bid             NUMERIC,                      -- MaxBid (nosso lance maximo / proxy)
    display_max_bid     TEXT,                         -- DisplayMaxBid ("$2,501.00")
    winning_bid_amount  NUMERIC,                      -- WinningBidAmount (lance vencedor atual)
    my_bid_count        INTEGER,                      -- MyBidCount
    total_bids          INTEGER,                      -- TotalBids
    status              TEXT,                         -- Status bruto (ex. "OS")
    display_status      INTEGER,                      -- DisplayStatus (2 = Winning; demais a confirmar)
    standing_label      TEXT,                         -- rotulo derivado ("Winning" / "Outbid" / ...)
    synced_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cosl_my_bids_listing_end ON cosl_my_bids (listing_end);
CREATE INDEX IF NOT EXISTS idx_cosl_my_bids_county      ON cosl_my_bids (county);

CREATE TABLE IF NOT EXISTS cosl_sync_meta (
    id               INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    last_run_at      TIMESTAMPTZ,   -- toda tentativa (ok / error / skipped)
    last_success_at  TIMESTAMPTZ,   -- ultima sincronizacao bem-sucedida
    status           TEXT,          -- 'ok' | 'error' | 'skipped'
    message          TEXT,          -- detalhe do erro, quando houver
    row_count        INTEGER,       -- registros gravados na ultima sync ok
    duration_ms      INTEGER
);

INSERT INTO cosl_sync_meta (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------
-- RLS: leitura para autenticado, escrita so via service role
-- ----------------------------------------------------------
ALTER TABLE cosl_my_bids   ENABLE ROW LEVEL SECURITY;
ALTER TABLE cosl_sync_meta ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_authenticated" ON cosl_my_bids;
DROP POLICY IF EXISTS "select_authenticated" ON cosl_sync_meta;
CREATE POLICY "select_authenticated" ON cosl_my_bids   FOR SELECT TO authenticated USING (true);
CREATE POLICY "select_authenticated" ON cosl_sync_meta FOR SELECT TO authenticated USING (true);

-- ----------------------------------------------------------
-- Funcao de sincronizacao atomica
-- p_replace = true  -> troca todo o conteudo de cosl_my_bids
--                      (DELETE + INSERT numa transacao) e atualiza o meta
-- p_replace = false -> so atualiza cosl_sync_meta (casos 'skipped' / 'error')
-- SECURITY INVOKER: roda como o chamador (service role), que ja
-- ignora RLS. Execucao concedida apenas ao service_role.
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_cosl_my_bids(
    p_replace     BOOLEAN,
    p_rows        JSONB,
    p_status      TEXT,
    p_message     TEXT,
    p_duration_ms INTEGER
) RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    IF p_replace THEN
        -- WHERE true: satisfaz o pg_safeupdate que o Supabase mantem ativo
        -- nas conexoes do PostgREST (bloqueia DELETE/UPDATE sem WHERE).
        DELETE FROM cosl_my_bids WHERE true;

        INSERT INTO cosl_my_bids (
            auction_listing_id, cosl_property_id, owner, county, parcel_number, acreage,
            listing_start, listing_end, start_cst, end_cst, max_bid, display_max_bid,
            winning_bid_amount, my_bid_count, total_bids, status, display_status, standing_label
        )
        SELECT
            x.auction_listing_id, x.cosl_property_id, x.owner, x.county, x.parcel_number, x.acreage,
            x.listing_start, x.listing_end, x.start_cst, x.end_cst, x.max_bid, x.display_max_bid,
            x.winning_bid_amount, x.my_bid_count, x.total_bids, x.status, x.display_status, x.standing_label
        FROM jsonb_to_recordset(COALESCE(p_rows, '[]'::jsonb)) AS x(
            auction_listing_id BIGINT, cosl_property_id BIGINT, owner TEXT, county TEXT,
            parcel_number TEXT, acreage NUMERIC, listing_start TIMESTAMPTZ, listing_end TIMESTAMPTZ,
            start_cst TEXT, end_cst TEXT, max_bid NUMERIC, display_max_bid TEXT,
            winning_bid_amount NUMERIC, my_bid_count INTEGER, total_bids INTEGER,
            status TEXT, display_status INTEGER, standing_label TEXT
        );

        GET DIAGNOSTICS v_count = ROW_COUNT;
    ELSE
        v_count := NULL;
    END IF;

    UPDATE cosl_sync_meta SET
        last_run_at     = now(),
        last_success_at = CASE WHEN p_status = 'ok' THEN now() ELSE last_success_at END,
        status          = p_status,
        message         = p_message,
        row_count       = CASE WHEN p_replace THEN v_count ELSE row_count END,
        duration_ms     = p_duration_ms
    WHERE id = 1;

    RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION sync_cosl_my_bids(BOOLEAN, JSONB, TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION sync_cosl_my_bids(BOOLEAN, JSONB, TEXT, TEXT, INTEGER) TO service_role;

-- ----------------------------------------------------------
-- Seed da permissao "page:bids"
-- Sem linhas => deny-by-default para todo profile (inclusive
-- Administrator), como aprendido no patch 5. Aqui o Administrator
-- ja entra com acesso; os demais profiles ficam explicitamente
-- negados e um admin libera quem precisar pela tela Access.
-- ----------------------------------------------------------
INSERT INTO ls_permissions (profile_id, resource_key, can_view, can_edit)
SELECT id, 'page:bids',
       (name = 'Administrator') AS can_view,
       (name = 'Administrator') AS can_edit
FROM ls_profiles
ON CONFLICT (profile_id, resource_key) DO NOTHING;

COMMIT;
