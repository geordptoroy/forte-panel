CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_instances_baileys_instance_global_unique_idx"
  ON "whatsappInstances" ("instanceId")
  WHERE "provider" = 'baileys';
