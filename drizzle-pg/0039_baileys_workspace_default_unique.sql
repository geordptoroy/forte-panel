CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_instances_baileys_workspace_default_unique_idx"
  ON "whatsappInstances" ("workspaceId")
  WHERE "provider" = 'baileys'
    AND "active" = 1
    AND "isDefault" = 1;
