-- Reversible down migration for store review records (PostgreSQL).
DROP TABLE IF EXISTS "StoreReview";
DROP TYPE IF EXISTS "StoreReviewStatus";
