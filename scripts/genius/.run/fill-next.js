async (page) => {
  const sleep = (ms) => page.waitForTimeout(ms);

  // Autocomplete helper: type a name, pick an exact .ac_results match if shown,
  // else commit via Enter (creates the artist token by name).
  async function acFill(sel, name) {
    const input = page.locator(sel);
    await input.click();
    await input.fill('');
    await input.type(name, { delay: 45 });
    await sleep(1400);
    const item = page.locator('.ac_results:visible li').filter({ hasText: name }).first();
    if (await item.count()) await item.click();
    else await input.press('Enter');
    await sleep(350);
  }

  // 1. Land on a fresh form (genius origin -> localStorage queue is readable).
  await page.goto('https://genius.com/songs/new');
  await page.waitForLoadState('domcontentloaded');
  await sleep(800);

  const ctx = await page.evaluate(() => {
    const q = JSON.parse(localStorage.getItem('clQueue') || '[]');
    const c = parseInt(localStorage.getItem('clCursor') || '0', 10);
    return { song: q[c] || null, cursor: c, total: q.length };
  });
  if (!ctx.song) return { done: true, cursor: ctx.cursor, total: ctx.total };
  const song = ctx.song;

  // 2. Primary artist -> existing "Chad Lewine"
  await acFill('#song_primary_artists__name', 'Chad Lewine');

  // 3. Title
  await page.locator('#song_title').fill(song.title);

  // 4. Primary tag: Pop
  const pop = page.locator('input.primary_tag_chooser-input[data-tag-name="Pop"]');
  await pop.check().catch(async () => { await pop.click(); });

  // 5. Writer
  await acFill('#song_writer_artists', song.writer || 'Chad Lewine');

  // 6. Producers (each)
  if (Array.isArray(song.producers) && song.producers.length) {
    const p = page.locator('#song_producer_artists');
    await p.click(); await p.fill('');
    for (const name of song.producers) {
      await p.type(name, { delay: 45 });
      await sleep(1400);
      const item = page.locator('.ac_results:visible li').filter({ hasText: name }).first();
      if (await item.count()) await item.click(); else await p.press('Enter');
      await sleep(350);
    }
  }

  // 7. Release date (selectOption by numeric value)
  if (song.year) await page.locator('select[id$="release_date_1i"]').selectOption({ value: String(song.year) }).catch(() => {});
  if (song.month) await page.locator('select[id$="release_date_2i"]').selectOption({ value: String(song.month) }).catch(() => {});
  if (song.day) await page.locator('select[id$="release_date_3i"]').selectOption({ value: String(song.day) }).catch(() => {});

  // 8. Lyrics
  await page.locator('#song_lyrics').fill(song.lyrics || '');

  // 9. Album -> attach to existing album if it already exists, else create
  if (song.album) {
    const addAlbum = page.locator('a:has-text("Add album"), #add_album').first();
    if (await addAlbum.count()) {
      await addAlbum.click();
      await sleep(500);
      const albumInput = page.locator('input[name*="album"], input[placeholder*="album" i]').first();
      if (await albumInput.count()) {
        await albumInput.click(); await albumInput.fill(''); await albumInput.type(song.album, { delay: 45 });
        await sleep(1500);
        const exact = page.locator('.ac_results:visible li').filter({ hasText: song.album }).first();
        if (await exact.count()) await exact.click();
      }
    }
  }

  // 10. Pre-submit validation -- abort (do NOT submit / advance) on missing required data.
  const state = {
    artist: await page.locator('#song_primary_artists__name').inputValue().catch(() => ''),
    title: await page.locator('#song_title').inputValue().catch(() => ''),
    lyricsLen: (await page.locator('#song_lyrics').inputValue().catch(() => '')).length,
    pop: await pop.isChecked().catch(() => false),
    producers: await page.locator('#song_producer_artists').inputValue().catch(() => ''),
    album: await page.locator('input[name*="album"]').first().inputValue().catch(() => ''),
  };
  if (!state.artist || !state.title || state.lyricsLen < 20 || !state.pop) {
    return { error: 'validation_failed', song: song.title, state, cursor: ctx.cursor };
  }

  // 11. Submit
  const btn = page.locator('form#new_song button[type="submit"], form#new_song input[type="submit"], button:has-text("Submit")').first();
  await btn.scrollIntoViewIfNeeded();
  await btn.click();
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await sleep(2500);

  const url = page.url();
  const ok = /-lyrics(\?|$)/.test(url) && !/songs\/new/.test(url);
  let verify = {};
  if (ok) {
    const body = await page.evaluate(() => document.body.innerText);
    verify = {
      lyricsPresent: (song.lyrics || '').slice(0, 24) ? body.includes((song.lyrics || '').split('\n')[0].slice(0, 18)) : false,
      albumShown: song.album ? body.includes(song.album) : null,
      producersShown: (song.producers && song.producers[0]) ? body.includes(song.producers[0]) : null,
    };
  }

  // 12. If Genius rate-limited us (new-user "1 song / 5 min" throttle) or the
  // submit otherwise failed, DO NOT advance -- report so the caller can wait.
  if (!ok) {
    const body = await page.evaluate(() => document.body.innerText).catch(() => '');
    const throttled = /only allowed to create 1 song/i.test(body) || /moving a little fast/i.test(body);
    return { n: song.n, title: song.title, url, ok: false, throttled, cursor: ctx.cursor, total: ctx.total };
  }

  // Success -> advance cursor + record result.
  await page.evaluate((rec) => {
    const c = parseInt(localStorage.getItem('clCursor') || '0', 10);
    localStorage.setItem('clCursor', String(c + 1));
    const results = JSON.parse(localStorage.getItem('clResults') || '[]');
    results.push(rec);
    localStorage.setItem('clResults', JSON.stringify(results));
  }, { n: song.n, title: song.title, url, ok });

  return { n: song.n, title: song.title, url, ok, verify, cursor: ctx.cursor + 1, total: ctx.total };
}
