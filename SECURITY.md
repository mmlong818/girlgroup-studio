# Security Policy

StarForm is designed as a local-first single-user tool.

## Supported Use

- Run the server on `127.0.0.1` for local development and personal use.
- Keep `.env` and the `data/` directory out of git.
- Treat `data/starform.db`, `data/uploads/`, and any legacy `data/settings.json` as private user data.
- Treat exported group backup files as private: they include project content and embedded images, but never model API keys.
- Keep `HOST=127.0.0.1` unless LAN access is intentional. When binding to a LAN address, configure `ALLOWED_HOSTS` explicitly.

## Known Limits

- The app does not include accounts, sessions, or permissions. Write requests are limited to same-origin JSON requests, but this is not a substitute for authentication.
- Public group pages under `/g/:shareId` are intended for local sharing and preview.
- Binding `HOST=0.0.0.0` exposes the API to your network. Add authentication and review every write endpoint before deploying it beyond localhost.

## Reporting

For public forks, please use the issue tracker or the maintainer contact method configured by that fork.
