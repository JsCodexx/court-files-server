INSERT INTO "app_settings" ("key", "value") VALUES ('rapidgateway_checkout_enabled', 'false')
ON CONFLICT ("key") DO UPDATE SET "value" = 'false', "updated_at" = now();
