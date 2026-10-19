-- ============================================================
-- GADU · Migración: corregir montos corruptos de gastos WhatsApp
-- ------------------------------------------------------------
-- Bug original: num() hacía  Number("19813.47".replace(/\./g,""))
--   → "1981347"  (infló el monto ~100x al quitar el punto decimal)
-- Ejemplo: "Gasté 19813.47 en farmacia" se guardó como 1981347.
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- PASO 1 · DIAGNÓSTICO (no modifica nada): listar sospechosos
-- Ejecutá esto PRIMERO y revisá que el "candidato_corregido"
-- tenga sentido antes de correr el PASO 2.
-- ════════════════════════════════════════════════════════════
SELECT
  ad.user_id,
  t.ord                              AS posicion,
  e->>'id'                           AS id_gasto,
  (e->>'amount')::numeric            AS monto_actual,
  round((e->>'amount')::numeric / 100.0, 2) AS candidato_corregido,
  e->>'category'                     AS categoria,
  e->>'description'                  AS descripcion,
  e->>'date'                         AS fecha
FROM app_data ad
CROSS JOIN LATERAL jsonb_array_elements(ad.data->'expenses') WITH ORDINALITY AS t(e, ord)
WHERE e->>'source' = 'whatsapp'
  AND (e->>'amount')::numeric % 100 <> 0        -- termina en "centavos" (posible decimal pisado)
  AND (e->>'amount')::numeric >= 10000          -- lo bastante grande como para ser sospechoso
ORDER BY e->>'date' DESC;


-- ════════════════════════════════════════════════════════════
-- PASO 2 · CORRECCIÓN (divide por 100 los gastos sospechosos)
-- ⚠️ Revisá el PASO 1 antes de ejecutar esto.
--    - Los montos REDONDOS (múltiplos de 100) NO se tocan.
--    - Solo afecta gastos con source='whatsapp'.
-- ════════════════════════════════════════════════════════════
UPDATE app_data ad
SET data = jsonb_set(
  ad.data,
  '{expenses}',
  (
    SELECT COALESCE(jsonb_agg(f.item ORDER BY f.ord), '[]'::jsonb)
    FROM (
      SELECT t.ord,
        CASE
          WHEN e->>'source' = 'whatsapp'
            AND (e->>'amount')::numeric % 100 <> 0
            AND (e->>'amount')::numeric >= 10000
          THEN jsonb_set(e, '{amount}', to_jsonb(round((e->>'amount')::numeric / 100.0, 2)))
          ELSE e
        END AS item
      FROM jsonb_array_elements(ad.data->'expenses') WITH ORDINALITY AS t(e, ord)
    ) f
  )
)
WHERE EXISTS (
  SELECT 1
  FROM jsonb_array_elements(ad.data->'expenses') e
  WHERE e->>'source' = 'whatsapp'
    AND (e->>'amount')::numeric % 100 <> 0
    AND (e->>'amount')::numeric >= 10000
);


-- ════════════════════════════════════════════════════════════
-- PASO 3 · VERIFICACIÓN: no debería quedar ningún sospechoso
-- ════════════════════════════════════════════════════════════
SELECT count(*) AS sospechosos_restantes
FROM app_data ad
CROSS JOIN LATERAL jsonb_array_elements(ad.data->'expenses') AS e
WHERE e->>'source' = 'whatsapp'
  AND (e->>'amount')::numeric % 100 <> 0
  AND (e->>'amount')::numeric >= 10000;
