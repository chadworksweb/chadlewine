-- Invite email for /for-my-fans-XX. Mirrors the fan-ode template aesthetic:
-- eyebrow + h1 + intro + CTA button + footnote. Variables it expects from
-- the send call: first_name (optional), track_url (required), token (for
-- the URL in the body).

insert into public.email_templates (slug, name, kind, subject_template, preheader_template, body_blocks)
values (
  'for-my-fans-01',
  'For my fans -- invite',
  'transactional',
  'It ain''t about me, it''s about you.',
  'Sign in to listen.',
  jsonb_build_array(
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'type', 'paragraph',
      'html', 'FOR MY FANS',
      'size', 'eyebrow'
    ),
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'type', 'heading',
      'level', 1,
      'text', 'An unreleased track, just for you.'
    ),
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'type', 'paragraph',
      'html', '{{ first_name_clause }}you bought something real &mdash; so you''re in the room for this one. It ain''t about me, it''s about you.'
    ),
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'type', 'separator',
      'height', 16
    ),
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'type', 'button',
      'label', 'Listen now',
      'url', '{{ track_url }}'
    ),
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'type', 'separator',
      'height', 24
    ),
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'type', 'paragraph',
      'html', 'Sign in with your account to play. The track lives at the link and isn''t shareable &mdash; everyone who hears it is here because they earned the seat.',
      'size', 'small'
    )
  )
)
on conflict (slug) do nothing;
