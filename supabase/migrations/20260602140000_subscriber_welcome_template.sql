-- Welcome / thank-you email for new subscribers. Sent transactionally from
-- the public subscribe path (see src/lib/subscriber-welcome.ts) the first time
-- an email opts in. Fully editable in admin at /admin/email-templates/welcome-01.
--
-- Variables the send call provides:
--   first_name      (optional)  -- used via {{ first_name_clause }}
--   unsubscribe_url (required)  -- footer global block; also usable in body

insert into public.email_templates (slug, name, kind, subject_template, preheader_template, body_blocks)
values (
  'welcome-01',
  'Subscriber welcome',
  'transactional',
  'You''re in.',
  'Thanks for subscribing -- here''s what happens next.',
  jsonb_build_array(
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'type', 'paragraph',
      'html', 'WELCOME',
      'size', 'eyebrow'
    ),
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'type', 'heading',
      'level', 1,
      'text', 'Thanks for subscribing.'
    ),
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'type', 'paragraph',
      'html', '{{ first_name_clause }}I''m not on social media, so this is how we stay connected. When there''s new music, art, or a show worth knowing about, you''ll hear it from me here &mdash; no noise, no filler.'
    ),
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'type', 'separator',
      'height', 16
    ),
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'type', 'button',
      'label', 'Start with the music',
      'url', 'https://chadlewine.com/music'
    ),
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'type', 'separator',
      'height', 24
    ),
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'type', 'paragraph',
      'html', 'Glad you''re here. -- Chad',
      'size', 'small'
    )
  )
)
on conflict (slug) do nothing;
