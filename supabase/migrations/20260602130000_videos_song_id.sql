-- Link a music video to the catalog song it is a video OF.
-- Powers the VideoObject -> MusicRecording (about/subjectOf) JSON-LD on
-- /music-videos -- a strong "this video is of this song" entity signal for
-- the Song Visibility Plan (Phase 1 leftover: video -> song linkage).
-- ON DELETE SET NULL: removing a song must not delete its videos.
ALTER TABLE videos ADD COLUMN song_id uuid REFERENCES songs(id) ON DELETE SET NULL;
CREATE INDEX idx_videos_song ON videos(song_id);
