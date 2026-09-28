CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_instances_baileys_instance_global_unique_idx"
  ON "whatsappInstances" ("instanceId")
  WHERE "provider" NOT IN ('papi', 'meta_cloud_api');
