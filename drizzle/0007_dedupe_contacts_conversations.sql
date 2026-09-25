BEGIN;

-- Escolhe o menor ID como registro canônico por workspace e telefone.
CREATE TEMP TABLE _forte_contact_merge ON COMMIT DROP AS
SELECT c.id AS duplicate_id, MIN(c2.id) AS canonical_id
FROM "contacts" c
JOIN "contacts" c2
  ON c2."workspaceId" IS NOT DISTINCT FROM c."workspaceId"
 AND c2."externalPhone" = c."externalPhone"
WHERE c."workspaceId" IS NOT NULL
GROUP BY c.id
HAVING c.id <> MIN(c2.id);

UPDATE "contactNotes" n SET "contactId" = m.canonical_id
FROM _forte_contact_merge m WHERE n."contactId" = m.duplicate_id;
UPDATE "appointments" a SET "contactId" = m.canonical_id
FROM _forte_contact_merge m WHERE a."contactId" = m.duplicate_id;
UPDATE "quotes" q SET "contactId" = m.canonical_id
FROM _forte_contact_merge m WHERE q."contactId" = m.duplicate_id;
UPDATE "auditLogs" a SET "contactId" = m.canonical_id
FROM _forte_contact_merge m WHERE a."contactId" = m.duplicate_id;
UPDATE "domainEvents" e SET "aggregateId" = m.canonical_id
FROM _forte_contact_merge m WHERE e."aggregateType" = 'contact' AND e."aggregateId" = m.duplicate_id;

UPDATE "contacts" canonical SET
  "unreadCount" = canonical."unreadCount" + COALESCE(s.extra_unread, 0),
  "lastMessageAt" = GREATEST(canonical."lastMessageAt", s.latest_message),
  "updatedAt" = GREATEST(canonical."updatedAt", s.latest_updated)
FROM (
  SELECT m.canonical_id,
    SUM(d."unreadCount") AS extra_unread,
    MAX(d."lastMessageAt") AS latest_message,
    MAX(d."updatedAt") AS latest_updated
  FROM _forte_contact_merge m JOIN "contacts" d ON d.id = m.duplicate_id
  GROUP BY m.canonical_id
) s WHERE canonical.id = s.canonical_id;

UPDATE "conversations" c SET "contactId" = m.canonical_id
FROM _forte_contact_merge m WHERE c."contactId" = m.duplicate_id;
DELETE FROM "contacts" c USING _forte_contact_merge m WHERE c.id = m.duplicate_id;

-- Consolida conversas repetidas que apontam para o mesmo contato.
CREATE TEMP TABLE _forte_conversation_merge ON COMMIT DROP AS
SELECT c.id AS duplicate_id, MIN(c2.id) AS canonical_id
FROM "conversations" c
JOIN "conversations" c2 ON c2."contactId" = c."contactId"
GROUP BY c.id
HAVING c.id <> MIN(c2.id);

UPDATE "messages" m SET "conversationId" = x.canonical_id
FROM _forte_conversation_merge x WHERE m."conversationId" = x.duplicate_id;
UPDATE "conversations" canonical SET
  "unreadCount" = canonical."unreadCount" + COALESCE(s.extra_unread, 0),
  "lastMessageAt" = GREATEST(canonical."lastMessageAt", s.latest_message),
  "updatedAt" = GREATEST(canonical."updatedAt", s.latest_updated),
  "humanControlled" = GREATEST(canonical."humanControlled", s.human_controlled),
  "status" = CASE WHEN s.has_open THEN 'open' ELSE canonical."status" END
FROM (
  SELECT x.canonical_id,
    SUM(d."unreadCount") AS extra_unread,
    MAX(d."lastMessageAt") AS latest_message,
    MAX(d."updatedAt") AS latest_updated,
    MAX(d."humanControlled") AS human_controlled,
    BOOL_OR(d."status" = 'open') AS has_open
  FROM _forte_conversation_merge x JOIN "conversations" d ON d.id = x.duplicate_id
  GROUP BY x.canonical_id
) s WHERE canonical.id = s.canonical_id;
DELETE FROM "conversations" c USING _forte_conversation_merge m WHERE c.id = m.duplicate_id;

CREATE UNIQUE INDEX IF NOT EXISTS "contacts_workspace_phone_unique_idx"
  ON "contacts" ("workspaceId", "externalPhone") WHERE "workspaceId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "conversations_contact_unique_idx"
  ON "conversations" ("contactId");

COMMIT;
