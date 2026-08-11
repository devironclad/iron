-- ============================================================
-- PATCH 15 — Sync link_video -> ls_asset_marketing.before_video
-- Quando um Auction vira Property (record_type muda para
-- 'PROPERTY'), o valor cadastrado em ls_assets.link_video
-- ("Video Link", preenchido só na tela de Auctions) passa a ser
-- copiado automaticamente para ls_asset_marketing.before_video
-- ("Before Video", editado na aba Marketing de Properties).
--
-- O trigger só age no momento da transição para PROPERTY (INSERT
-- direto como PROPERTY, ou UPDATE que muda o record_type). Depois
-- disso, before_video volta a ser um campo livre, editável sem
-- interferência automática (link_video não é mais editável depois
-- que o registro vira Property).
--
-- Também inclui um backfill único para os registros que já foram
-- convertidos no passado e ficaram órfãos: preenche before_video
-- somente onde está vazio, sem sobrescrever edição manual já feita.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION sync_link_video_to_marketing()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.record_type = 'PROPERTY'
     AND NEW.link_video IS NOT NULL
     AND (OLD IS NULL OR OLD.record_type IS DISTINCT FROM 'PROPERTY') THEN

    UPDATE ls_asset_marketing
       SET before_video = NEW.link_video,
           updated_at   = now()
     WHERE asset_id = NEW.id;

    IF NOT FOUND THEN
      INSERT INTO ls_asset_marketing (asset_id, before_video)
      VALUES (NEW.id, NEW.link_video);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_link_video_to_marketing ON ls_assets;
CREATE TRIGGER trg_sync_link_video_to_marketing
AFTER INSERT OR UPDATE ON ls_assets
FOR EACH ROW EXECUTE FUNCTION sync_link_video_to_marketing();

-- Backfill 1: properties já convertidas que nunca tiveram linha em
-- ls_asset_marketing (nunca abriram a aba Marketing).
INSERT INTO ls_asset_marketing (asset_id, before_video)
SELECT a.id, a.link_video
  FROM ls_assets a
 WHERE a.record_type = 'PROPERTY'
   AND a.link_video IS NOT NULL
   AND a.link_video <> ''
   AND NOT EXISTS (
     SELECT 1 FROM ls_asset_marketing m WHERE m.asset_id = a.id
   );

-- Backfill 2: properties já convertidas com linha em
-- ls_asset_marketing, mas before_video vazio (nunca preenchido à mão).
UPDATE ls_asset_marketing m
   SET before_video = a.link_video,
       updated_at   = now()
  FROM ls_assets a
 WHERE m.asset_id = a.id
   AND a.record_type = 'PROPERTY'
   AND a.link_video IS NOT NULL
   AND a.link_video <> ''
   AND (m.before_video IS NULL OR m.before_video = '');

COMMIT;
