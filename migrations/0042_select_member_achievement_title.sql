-- Keep existing automatic titles until a member explicitly chooses a title or none.
-- Badge selection and its revision/ownership guards remain independent of this value.
ALTER TABLE member_achievement_showcase ADD COLUMN selected_title_code TEXT DEFAULT 'automatic'
 CHECK(selected_title_code IS NULL OR selected_title_code IN ('automatic','first-lan','full-weekend','silver','lan-recruit','legendary'));
