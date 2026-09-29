\set ON_ERROR_STOP on
\set target_id 1
\set target_slug 'forte-workspace'
\set target_name 'Minha empresa'
\set confirm 'REPLACE_WITH_EXACT_CONFIRMATION'

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$
BEGIN
  IF :'confirm' <> 'APAGAR WORKSPACE FORTE 1' THEN
    RAISE EXCEPTION 'Abortado: edite a variável psql confirm para APAGAR WORKSPACE FORTE 1';
  END IF;
END $$;

CREATE TEMP TABLE _forte_target_workspace ON COMMIT DROP AS
SELECT id
  FROM "workspaces"
 WHERE id = :target_id
   AND "slug" = :'target_slug'
   AND "name" = :'target_name'
   AND "active" = 1
FOR UPDATE;

DO $$
DECLARE
  matched integer;
BEGIN
  SELECT count(*) INTO matched FROM _forte_target_workspace;
  IF matched <> 1 THEN
    RAISE EXCEPTION 'Abortado: esperado exatamente um workspace ativo id=%, slug=%, nome=%; encontrados=%',
      :target_id, :'target_slug', :'target_name', matched;
  END IF;
END $$;

-- O relatório não inclui conteúdo nem segredos. A exclusão mantém usuários,
-- platformAdmins e sessões do Console Admin; remove memberships e dados do tenant.
DO $$
DECLARE
  target_ids integer[];
  table_row record;
BEGIN
  SELECT array_agg(id) INTO target_ids FROM _forte_target_workspace;
  FOR table_row IN
    SELECT DISTINCT table_schema, table_name
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND column_name = 'workspaceId'
       AND table_name <> 'workspaces'
     ORDER BY table_name
  LOOP
    EXECUTE format(
      'DELETE FROM %I.%I WHERE "workspaceId" = ANY($1)',
      table_row.table_schema,
      table_row.table_name
    ) USING target_ids;
  END LOOP;
END $$;

DELETE FROM "workspaces"
 WHERE id IN (SELECT id FROM _forte_target_workspace)
   AND "slug" = :'target_slug'
   AND "name" = :'target_name';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "workspaces" WHERE id = :target_id) THEN
    RAISE EXCEPTION 'Abortado: workspace ainda existe após a exclusão';
  END IF;
END $$;

COMMIT;

\echo 'Workspace local removido. Usuários e platformAdmins foram preservados.'
