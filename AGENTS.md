<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Testing on mobile (LAN)

**`npm run dev` over LAN HTTP does not hydrate React on iPhone.** The HMR WebSocket can't connect from the phone to the PC dev server, hydration silently fails, and `<button>` onClick handlers never fire (Links still work, because they're real navigations). Initial render looks fine, which makes this look like a JS bug.

To test on a real device, build first and serve the production output:

```
npm run build
npx next start -p 8888 -H 0.0.0.0
```

Then visit `http://<PC-LAN-IP>:8888` from the phone (find the IP with `ipconfig`). Always do this before chasing "the button doesn't work on mobile" bugs.
