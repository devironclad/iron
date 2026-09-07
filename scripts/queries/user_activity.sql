-- ============================================================
-- Consultas de Rastreamento de Atividade do Usuario
-- (tabela user_activity — ver scripts/rls/rls_patch_19_user_activity.sql)
--
-- Rodar no SQL Editor do Supabase (ou psql). A tabela tem RLS sem policy,
-- entao NAO e legivel pelo app — so por esses papeis privilegiados.
--
-- Conceitos:
--   bloco  = periodo continuo de trabalho (pings sem gap > 10 min)
--   horas  = soma da duracao dos blocos + 1 min por bloco
--   pausa de ate 10 min conta; ausencia de 10 min+ quebra o bloco
--   fuso do "dia" e do corte de data: America/Sao_Paulo
--   ajuste o INTERVAL '15 days' para a janela que quiser
-- ============================================================


-- 1) RESUMO — quanto cada usuario trabalhou no periodo -------
--    -> usuario | horas_total | dias_ativos | media_horas_por_dia | visto_por_ultimo
SELECT
  coalesce(u.full_name, au.email)                                                     AS usuario,
  round((sum(extract(epoch FROM (a.last_ping_at - a.started_at)) + 60) / 3600.0)::numeric, 1) AS horas_total,
  count(DISTINCT (a.started_at AT TIME ZONE 'America/Sao_Paulo')::date)                AS dias_ativos,
  round((
    sum(extract(epoch FROM (a.last_ping_at - a.started_at)) + 60) / 3600.0
    / nullif(count(DISTINCT (a.started_at AT TIME ZONE 'America/Sao_Paulo')::date), 0)
  )::numeric, 1)                                                                      AS media_horas_por_dia,
  (max(a.last_ping_at) AT TIME ZONE 'America/Sao_Paulo')                              AS visto_por_ultimo
FROM user_activity a
JOIN auth.users au ON au.id = a.user_id
LEFT JOIN ls_users_metadata u ON u.id = a.user_id
WHERE a.started_at >= now() - INTERVAL '15 days'
GROUP BY 1
ORDER BY horas_total DESC;


-- 2) POR DIA — horas de cada usuario, dia a dia --------------
--    -> usuario | dia | horas | blocos | primeiro | ultimo
SELECT
  coalesce(u.full_name, au.email)                                             AS usuario,
  (a.started_at AT TIME ZONE 'America/Sao_Paulo')::date                       AS dia,
  round((sum(extract(epoch FROM (a.last_ping_at - a.started_at)) + 60) / 3600.0)::numeric, 2) AS horas,
  count(*)                                                                    AS blocos,
  (min(a.started_at)   AT TIME ZONE 'America/Sao_Paulo')::time(0)             AS primeiro,
  (max(a.last_ping_at) AT TIME ZONE 'America/Sao_Paulo')::time(0)             AS ultimo
FROM user_activity a
JOIN auth.users au ON au.id = a.user_id
LEFT JOIN ls_users_metadata u ON u.id = a.user_id
WHERE a.started_at >= now() - INTERVAL '15 days'
GROUP BY 1, 2
ORDER BY dia DESC, horas DESC;


-- 3) DETALHE — cada bloco de um dia especifico (conferencia) -
--    -> usuario | inicio | fim | minutos | ping_count   (minutos ~= ping_count)
SELECT
  coalesce(u.full_name, au.email)                          AS usuario,
  (a.started_at   AT TIME ZONE 'America/Sao_Paulo')        AS inicio,
  (a.last_ping_at AT TIME ZONE 'America/Sao_Paulo')        AS fim,
  round((extract(epoch FROM (a.last_ping_at - a.started_at)) / 60.0 + 1)::numeric) AS minutos,
  a.ping_count
FROM user_activity a
JOIN auth.users au ON au.id = a.user_id
LEFT JOIN ls_users_metadata u ON u.id = a.user_id
WHERE (a.started_at AT TIME ZONE 'America/Sao_Paulo')::date = DATE '2026-09-02'
ORDER BY usuario, inicio;
