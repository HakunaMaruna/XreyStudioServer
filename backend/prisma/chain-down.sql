-- Reversible down migration for VPN chains (PostgreSQL).
DROP TABLE IF EXISTS "ChainBinding";
DROP TABLE IF EXISTS "ProxyChainHop";
DROP TABLE IF EXISTS "ProxyChain";
