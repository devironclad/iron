-- ============================================================
-- Consultas de Log de Atividade / Produtividade
-- (tabela activity_log — ver scripts/rls/rls_patch_21_activity_log.sql)
--
-- Rodar no SQL Editor do Supabase (ou psql). RLS sem policy de SELECT,
-- entao NAO e legivel pelo app — so por esses papeis privilegiados.
--
-- Conceitos:
--   Cada linha = 1 acao (INSERT/UPDATE numa tabela de negocio feita
--   direto pelo navegador, OU uma acao administrativa registrada
--   explicitamente por uma rota de servidor — Manager/Access/Users/
--   Bids refresh). NAO guarda valor antigo/novo nem qual linha mudou —
--   e um contador de produtividade, nao uma trilha de auditoria.
--
--   changed_by nulo = escrita automatica (coletores COSL), nao conta
--   como acao de usuario — os JOINs abaixo ja excluem isso sozinhos.
--
--   Ajuste o INTERVAL / a data conforme a janela que quiser.
--   Fuso: America/Sao_Paulo.
-- ============================================================


-- 1) DETALHE — cada acao do dia, com horario -----------------
--    -> usuario | quando | area | tipo
SELECT
  coalesce(u.full_name, au.email)                  AS usuario,
  al.changed_at AT TIME ZONE 'America/Sao_Paulo'   AS quando,
  al.table_name                                    AS area,
  al.operation                                     AS tipo
FROM activity_log al
JOIN auth.users au ON au.id = al.changed_by
LEFT JOIN ls_users_metadata u ON u.id = al.changed_by
WHERE (al.changed_at AT TIME ZONE 'America/Sao_Paulo')::date = current_date
ORDER BY usuario, quando;


-- 2) RESUMO POR AREA — quantas acoes de cada tipo, por usuario -
--    -> usuario | area | tipo | acoes
SELECT
  coalesce(u.full_name, au.email) AS usuario,
  al.table_name                   AS area,
  al.operation                    AS tipo,
  count(*)                        AS acoes
FROM activity_log al
JOIN auth.users au ON au.id = al.changed_by
LEFT JOIN ls_users_metadata u ON u.id = al.changed_by
WHERE (al.changed_at AT TIME ZONE 'America/Sao_Paulo')::date = current_date
GROUP BY 1, 2, 3
ORDER BY usuario, acoes DESC;


-- 3) TOTAL DO DIA POR USUARIO — o numero de produtividade -----
--    -> usuario | total_acoes
SELECT
  coalesce(u.full_name, au.email) AS usuario,
  count(*)                        AS total_acoes
FROM activity_log al
JOIN auth.users au ON au.id = al.changed_by
LEFT JOIN ls_users_metadata u ON u.id = al.changed_by
WHERE (al.changed_at AT TIME ZONE 'America/Sao_Paulo')::date = current_date
GROUP BY 1
ORDER BY total_acoes DESC;


-- 4) POR DIA, NO PERIODO — evolucao de produtividade ----------
--    -> usuario | dia | total_acoes
SELECT
  coalesce(u.full_name, au.email)                        AS usuario,
  (al.changed_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
  count(*)                                                AS total_acoes
FROM activity_log al
JOIN auth.users au ON au.id = al.changed_by
LEFT JOIN ls_users_metadata u ON u.id = al.changed_by
WHERE al.changed_at >= now() - INTERVAL '15 days'
GROUP BY 1, 2
ORDER BY dia DESC, total_acoes DESC;
