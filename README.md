# Miro Retrospective Generator

Preview a sprint retrospective and add it to an existing Miro board as editable frames, shapes, text boxes, and sticky notes. The default is **Autumn RETRO — Sprint 3.15**. Music and Movie have their own prompts, palettes, and activities.

Each retrospective has a themed check-in, four reflection frames, an action-items frame, and a closing activity. Replace placeholders such as `[Team members]`, `[Start date]`, `[End date]`, and `[Retrospective note]` directly in Miro.

## Run locally

Use Node.js 22 or later. The app has no runtime dependencies to install.

```sh
cp .env.example .env
npm start
```

Open [http://localhost:3000](http://localhost:3000). With empty credentials, you can change themes and sprint numbers and preview the layout.

## Connect Miro

1. Create a developer team and a developer app in Miro. In the app settings, enable the `boards:read` and `boards:write` scopes and expiring access tokens.
2. Add `http://localhost:3000/oauth/callback` to the app's redirect URIs. Use the exact origin and port you use to open the app.
3. Set `MIRO_CLIENT_ID` and `MIRO_CLIENT_SECRET` in `.env`, then restart the app.
4. Select **Connect to Miro**, authorize the app for the team whose board you want to use, and choose a board you can edit. Adjust the theme and sprint if needed, then select **Generate in Miro**.
5. Open the result link to jump to the first frame. Move any frame with its child items, edit the prompts, and duplicate sticky notes as needed.

Miro developer documentation covers [developer teams](https://developers.miro.com/docs/create-a-developer-team), [OAuth setup](https://developers.miro.com/docs/getting-started-with-oauth), and [REST API scopes](https://developers.miro.com/reference/scopes).

## Environment variables

| Variable | Purpose | Local example |
| --- | --- | --- |
| `PORT` | Port the Node server listens on | `3000` |
| `APP_ORIGIN` | Browser-facing origin, without a path. The callback is `/oauth/callback` at this origin. | `http://localhost:3000` |
| `MIRO_CLIENT_ID` | Miro developer app client ID | From Miro app settings |
| `MIRO_CLIENT_SECRET` | Miro developer app client secret | From Miro app settings |

Production must use HTTPS. The server stores access and refresh tokens in memory and gives the browser an opaque, HTTP-only, SameSite session cookie. The cookie is marked Secure on HTTPS. Disconnect clears the application session. You can remove the app's grant in Miro.

## Deploy

1. Create a Node web service from this repository on a host such as Render or Railway. Select Node 22 or newer and use `npm start` as its start command. The app has no build step.
2. Set `APP_ORIGIN` to the service's final HTTPS origin, such as `https://retro.example.com`. Set the Miro credentials using the host's environment variables or secret settings. Use the host-provided `PORT`.
3. Register the HTTPS callback in Miro, for example `https://retro.example.com/oauth/callback`. Configure the host to forward `/oauth/callback` and `/api/generate` to the app and allow at least 120 seconds for a generation request.
4. Deploy a single long-running instance. Sessions last up to eight hours and are cleared when the process restarts. Board-generation locks also live in that process.
5. Use `GET /health` for a health check. Test **Connect to Miro** and generate on a board where you have edit access.

## Board behavior

The app reads Miro's paginated item list and places the new layout to the right of items with available geometry. Its write requests only create items. Each successful run appends another retrospective. The app blocks concurrent runs targeting the same board through the same server.

Miro creates the frames and their contents with separate requests. If one fails, the app stops, reports the partial result, and links to the board. Inspect the generated frames before retrying to avoid duplicate content.

## Tests and templates

```sh
npm test
```

The tests cover the three themes, placeholders, frame bounds, item placement and payloads, partial writes, and the OAuth and board-generation routes with a mocked Miro API. A live smoke test requires your Miro app credentials and an editable board.

The shared template definitions in `public/template.js` drive both the preview and the generated items. To add a theme, add a definition to `themes` with a check-in, four reflection prompts, an action heading, a closing prompt, and palette. The preview picker uses the exported theme list.
