## Link Ripper

Web-based tool to pull Wayback Machine (Internet Archive CDX) snapshot
links for one or more URLs, and export them as text, CSV, or an HTML
links page.

### Features

- Accepts a single URL or a newline-separated list.
- Optional "show duplicates" toggle and three timestamp granularities
  (1 day / 10 day / 1 month), mapped internally to the CDX API's
  `collapse=timestamp:N` values.
- Same underlying link-building logic is shared across all three output
  formats, so txt/csv/html always agree.
- Multi-URL results are merged into a single file/page with no
  separator line between URLs.
- Timeouts, non-200 responses, and empty results are caught and shown
  as a message on the main page instead of a stack trace. If some URLs
  in a batch fail, the successful ones are still returned with a
  warning.

### Local development

```bash
pip install -r requirements.txt
python app.py          # dev server, http://127.0.0.1:5000
```

### Running tests

```bash
pip install -r requirements.txt pytest
python -m pytest tests/ -v
```

Tests mock `requests.get`, so they don't hit archive.org and run fully
offline.

### Deployment (gunicorn + nginx/Apache)

The app must run behind a real WSGI server, not `python app.py`, and
the CDX lookup is allowed up to 5 minutes (`timeout=300` in
`links.py`) - your WSGI server *and* your reverse proxy both need
matching timeouts, or one of them will kill the connection first.

**1. gunicorn**

```bash
gunicorn --workers 2 --timeout 300 --bind 127.0.0.1:8000 wsgi:application
```

`--timeout 300` is gunicorn's worker timeout; it must be >= the
`requests.get(..., timeout=300)` value in `links.py`.

**2. nginx** (reverse proxy in front of gunicorn)

```nginx
location / {
    proxy_pass http://127.0.0.1:8000;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
    proxy_connect_timeout 300s;
}
```

**3. Apache** (mod_proxy in front of gunicorn)

```apache
ProxyPass "/" "http://127.0.0.1:8000/" timeout=300
ProxyPassReverse "/" "http://127.0.0.1:8000/"
ProxyTimeout 300
```

If you use `mod_wsgi` to embed the app directly in Apache instead of
proxying to gunicorn, set `WSGIApplicationGroup %{GLOBAL}` and increase
`Timeout` (and `ProxyTimeout` if any proxy sits in front of Apache) to
300 as well.

### Project layout

```
links.py            # Links class: CDX queries + txt/csv/html formatting
app.py               # Flask routes
wsgi.py              # WSGI entry point (gunicorn/mod_wsgi target)
templates/index.html # form + error/warning banner
templates/links.html # HTML links output page
tests/test_links.py  # Links class unit tests
tests/test_app.py    # Flask route tests
requirements.txt
```
