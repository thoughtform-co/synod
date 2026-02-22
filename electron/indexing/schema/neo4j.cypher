// Cloud Mail Intelligence: Neo4j ontology
// Run in Neo4j Browser or cypher-shell.

// Constraints (idempotent)
CREATE CONSTRAINT person_id IF NOT EXISTS FOR (p:Person) REQUIRE p.id IS UNIQUE;
CREATE CONSTRAINT org_id IF NOT EXISTS FOR (o:Organization) REQUIRE o.id IS UNIQUE;
CREATE CONSTRAINT thread_id IF NOT EXISTS FOR (t:Thread) REQUIRE t.id IS UNIQUE;
CREATE CONSTRAINT topic_id IF NOT EXISTS FOR (t:Topic) REQUIRE t.id IS UNIQUE;
CREATE CONSTRAINT project_id IF NOT EXISTS FOR (p:Project) REQUIRE p.id IS UNIQUE;
CREATE CONSTRAINT subscription_id IF NOT EXISTS FOR (s:Subscription) REQUIRE s.id IS UNIQUE;
CREATE CONSTRAINT label_id IF NOT EXISTS FOR (l:Label) REQUIRE l.id IS UNIQUE;
CREATE CONSTRAINT message_id IF NOT EXISTS FOR (m:Message) REQUIRE m.id IS UNIQUE;

// Indexes for common lookups
CREATE INDEX person_email IF NOT EXISTS FOR (p:Person) ON (p.email);
CREATE INDEX thread_account IF NOT EXISTS FOR (t:Thread) ON (t.accountId);
CREATE INDEX message_account IF NOT EXISTS FOR (m:Message) ON (m.accountId);

// Node labels:
// - Person (id, email, displayName)
// - Organization (id, domain, name)
// - Thread (id, accountId, subject, internalDate)
// - Message (id, accountId, threadId, internalDate, subject)
// - Topic (id, name)
// - Project (id, name)
// - Subscription (id, fingerprint, domain, name)
// - Label (id, name, category)

// Relationship types:
// - SENT (Person|Organization)-[:SENT]->(Message)
// - REPLIED_TO (Message)-[:REPLIED_TO]->(Message)
// - IN_THREAD (Message)-[:IN_THREAD]->(Thread)
// - MENTIONS (Message)-[:MENTIONS]->(Person|Organization|Topic|Project)
// - BELONGS_TO (Message)-[:BELONGS_TO]->(Thread)
// - SUBSCRIBED_TO (Person)-[:SUBSCRIBED_TO]->(Subscription)
// - TAGGED_AS (Message)-[:TAGGED_AS]->(Label)
// - THREAD_ABOUT (Thread)-[:THREAD_ABOUT]->(Topic|Project)
