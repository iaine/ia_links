"""
   Flask front end for the links module
"""
import re

from flask import Flask, request, render_template, Response

from links import Links, LinksError

app = Flask(__name__)

CONTENT_TYPES = {
    "txt": "text/plain; charset=utf-8",
    "csv": "text/csv; charset=utf-8",
}


def sanitize_filename(url):
    """
        Turn a url into a filesystem/header-safe base filename.
        e.g. "https://example.com/foo?bar=1" -> "example.com_foo_bar_1"
    """
    name = re.sub(r"^[a-zA-Z][a-zA-Z0-9+.-]*://", "", url)  # strip scheme
    name = re.sub(r"[^A-Za-z0-9._-]+", "_", name).strip("_")
    return name or "links"


def build_filename(urllist, format):
    if not urllist:
        base = "links"
    elif len(urllist) == 1:
        base = sanitize_filename(urllist[0])
    else:
        base = "{}_and_{}_more".format(sanitize_filename(urllist[0]), len(urllist) - 1)
    return "{}.{}".format(base, format)


@app.route('/', methods=['GET', 'POST'])
def index():
    """
        Index page for the links module
    """
    if request.method == 'GET':
        return render_template('index.html')

    if request.method != 'POST':
        return "Method not allowed", 405

    raw_url = request.form.get('url', '').strip()
    show_dupes = request.form.get('show_dupes', 'false')
    timestamp = request.form.get('timestamp', '')
    format = request.form.get('format', 'txt')

    if not raw_url:
        return render_template('index.html', error="Please enter at least one URL."), 400

    if format not in ("txt", "csv", "html"):
        return render_template('index.html', error="Unknown format: {}".format(format)), 400

    urllist = [u.strip() for u in raw_url.splitlines() if u.strip()]

    links = Links()
    try:
        result, errors = links.rip_links_urls(urllist, show_dupes, timestamp, format)
    except LinksError as exc:
        # only raised here for a bad timestamp option, which applies to
        # every url and isn't worth partial results for
        return render_template('index.html', error=str(exc)), 400

    if result is None:
        # everything failed, or every lookup succeeded but returned zero snapshots
        if errors:
            message = "No results. Errors: " + "; ".join(str(e) for e in errors)
        else:
            message = "No archived snapshots were found for the given URL(s)."
        return render_template('index.html', error=message), 200

    warning = None
    if errors:
        warning = "Some URLs failed and were skipped: " + "; ".join(str(e) for e in errors)

    if format == "html":
        return render_template('links.html', result=result, warning=warning)

    filename = build_filename(urllist, format)
    response = Response(result, mimetype=CONTENT_TYPES[format])
    response.headers["Content-Disposition"] = 'attachment; filename="{}"'.format(filename)
    if warning:
        response.headers["X-Links-Warning"] = warning
    return response


if __name__ == '__main__':
    app.run(debug=True)
