# Miro Retrospective Generator

Preview a sprint retrospective and add it to an existing Miro board as editable frames, shapes, text boxes, and sticky notes. The default is **Autumn RETRO — Sprint 3.15**. Music and Movie have their own prompts, palettes, and activities.

Each retrospective has a themed check-in, four reflection frames, an action-items frame, and a closing activity. Replace placeholders such as `[Team members]`, `[Start date]`, `[End date]`, and `[Retrospective note]` directly in Miro.

## Customize your retrospective

- Choose an illustrated theme card, or select **Create a theme** and choose a name, emoji, and color palette. Expand **Customize activities and prompts** to personalize the check-in, four reflection sections, action heading, and closing. Draft themes are saved in the current browser and can be edited from the theme list.
- In **Board images**, choose or drop up to six PNG or JPEG files, up to 5 MB each. The preview includes a **Sprint gallery** frame. The browser keeps draft attachments on this device, including while you sign in to Miro. When you generate, the service sends the images to the selected Miro board as individual image items. Use the remove button next to a file to remove it from the draft.
- Use the zoom buttons and the section picker to inspect the layout before generating. All text, shapes, names, and notes are editable in Miro. Images are separate items you can move and resize.

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

## Deploy on Render

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2FDanielaSocol-RBL%2Fmiro-retro-generator)

1. Open the deployment link, sign in or create a Render account, and select **Deploy Blueprint**. The Blueprint provisions a free Node web service and runs the application tests during the build.
2. When the service is live, copy its `https://…onrender.com` address from the Render dashboard. The web app can preview retrospectives immediately.
3. Create a developer app from the **Your apps** tab in Miro settings. Select **Expire user authorization token** when you create the app. Enable the `boards:read` and `boards:write` scopes. In **Redirect URI for OAuth 2.0**, paste your Render address followed by `/oauth/callback`.
4. In the Render service, open **Environment** and add `MIRO_CLIENT_ID` and `MIRO_CLIENT_SECRET`, using the values from the Miro developer app. Add both before selecting **Save, rebuild, and deploy**. Keep the secret in the Render dashboard.
5. Reopen the app, select **Connect to Miro**, and authorize the team containing the destination board. Choose an editable test board and select **Generate in Miro**.

Render supplies the HTTPS origin automatically. The free service can take about a minute to wake up after being idle and a restart ends active Miro sessions. Reconnect in the app if needed.

## Other hosting providers

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
