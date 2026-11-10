-- Optional public display prefixes; preserve existing accounts and selections.
-- Reuse the Phase 2 catalogue and users.name_prefix_id foreign key.
INSERT INTO name_prefixes(id,label,sort_order,created_at,updated_at) VALUES
 ('9b65eb3c-f208-473c-a891-400000000001','Mr.',1,unixepoch(),unixepoch()),
 ('9b65eb3c-f208-473c-a891-400000000002','Mrs.',2,unixepoch(),unixepoch()),
 ('9b65eb3c-f208-473c-a891-400000000003','Apache Helicopter.',3,unixepoch(),unixepoch()),
 ('9b65eb3c-f208-473c-a891-400000000004','Pastafarier.',4,unixepoch(),unixepoch()),
 ('9b65eb3c-f208-473c-a891-400000000005','TechnoViking.',5,unixepoch(),unixepoch()),
 ('9b65eb3c-f208-473c-a891-400000000006','NPC.',6,unixepoch(),unixepoch()),
 ('9b65eb3c-f208-473c-a891-400000000007','LAN Legend',7,unixepoch(),unixepoch()),
 ('9b65eb3c-f208-473c-a891-400000000008','Chaos Goblin',8,unixepoch(),unixepoch());
