# Security Policy

StarForm is designed as a local-first single-user tool.

## Supported Use

- Run the server on `127.0.0.1` for local development and personal use.
- Keep `.env` and the `data/` directory out of git.
- Treat `data/settings.json`, `data/starform.db`, and `data/uploads/` as private user data.

## Known Limits

- The app does not include accounts, sessions, permissions, or CSRF protection.
- Public group pages under `/g/:shareId` are intended for local sharing and preview.
- Binding `HOST=0.0.0.0` exposes the API to your network. Add authentication and review every write endpoint before deploying it beyond localhost.

## Reporting

For public forks, please use the issue tracker or the maintainer contact method configured by that fork.
