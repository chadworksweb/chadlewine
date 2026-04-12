ALTER TABLE songs ADD COLUMN focus_keyphrase varchar(80);
ALTER TABLE songs ADD COLUMN secondary_keyphrases jsonb DEFAULT '[]';
ALTER TABLE songs ADD COLUMN search_intent varchar(20) DEFAULT 'informational';
ALTER TABLE songs ADD COLUMN citation_summary varchar(300);
ALTER TABLE songs ADD COLUMN paa_pairs jsonb DEFAULT '[]';
ALTER TABLE songs ADD COLUMN entity_tags jsonb DEFAULT '[]';
ALTER TABLE songs ADD COLUMN seo_title text;
ALTER TABLE songs ADD COLUMN seo_description text;
