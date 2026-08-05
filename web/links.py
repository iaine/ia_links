"""
   Link Ripper

   Wraps the Internet Archive CDX API to pull a list of archived
   snapshots for one or more URLs, and format them as plain text,
   CSV, or HTML links.
"""
import requests


class LinksError(Exception):
    """Raised when a CDX lookup fails outright (timeout, bad status, etc)."""

    def __init__(self, message, url=None):
        super().__init__(message)
        self.url = url


class Links():
    BASE_URL = "https://web.archive.org/cdx/search/cdx?url="
    DUPES = "&showDupeCount="
    COLLAPSE = "&collapse="

    # Front-end sends friendly names; CDX API wants timestamp:N granularity.
    # timestamp:8 - every day, timestamp:7 - every 10 days, timestamp:6 - every month
    TIMESTAMP_MAP = {
        "1_day": "timestamp:8",
        "10_day": "timestamp:7",
        "1_month": "timestamp:6",
        # allow passing the raw collapse value straight through too
        "timestamp:8": "timestamp:8",
        "timestamp:7": "timestamp:7",
        "timestamp:6": "timestamp:6",
    }

    HEADERS = {
        "User-Agent": "Link-Ripper/1.0 (+https://example.com; contact admin)"
    }

    def __init__(self):
        pass

    def _build_query_url(self, url, show_dupes="false", timestamp=""):
        """
            Build the CDX query URL for a single target url.
            Kept as a local value (not self.BASE_URL) so repeated calls
            on the same instance never contaminate each other.
        """
        query_url = self.BASE_URL + url
        query_url += self.DUPES + str(show_dupes).lower()

        if timestamp:
            collapse_value = self.TIMESTAMP_MAP.get(timestamp)
            if collapse_value is None:
                raise LinksError(
                    "Unknown timestamp option: {}".format(timestamp), url=url
                )
            query_url += self.COLLAPSE + collapse_value

        return query_url

    def _fetch_cdx(self, url, show_dupes="false", timestamp=""):
        """
            Hit the CDX API for a single url and return the raw response text.
            Raises LinksError on timeout, connection failure, or non-200 status.
        """
        query_url = self._build_query_url(url, show_dupes, timestamp)

        try:
            r = requests.get(query_url, timeout=300, headers=self.HEADERS)
        except requests.Timeout:
            raise LinksError("Timed out contacting archive.org for {}".format(url), url=url)
        except requests.RequestException as exc:
            raise LinksError("Request failed for {}: {}".format(url, exc), url=url)

        if r.status_code != 200:
            raise LinksError(
                "Archive.org returned HTTP {} for {}".format(r.status_code, url),
                url=url,
            )

        return r.text

    def _parse_links(self, text):
        """
            Shared parser: turn raw CDX text into a list of wayback URLs.
            This is the single source of truth for how a link string is
            built, so txt/csv/html all render the exact same URLs -
            they just wrap them differently.
        """
        links = []
        for line in text.splitlines():
            line = line.strip()
            if not line:
                continue
            split_line = line.split(" ")
            if len(split_line) < 3:
                # malformed/unexpected CDX line - skip rather than crash
                continue
            links.append(
                "http://wayback.archive.org/web/{}/{}".format(
                    split_line[1], split_line[2]
                )
            )
        return links

    def rip_links_url(self, url, show_dupes="false", timestamp="", format="txt"):
        """
            Extract links for a single url and return them already
            formatted as a string in the requested format.
            Raises LinksError on failure; raises ValueError for an
            unknown format; returns None (caller should treat as
            "no results") if the CDX API returned nothing.
        """
        text = self._fetch_cdx(url, show_dupes, timestamp)
        links = self._parse_links(text)

        if not links:
            return None

        return self._format_links(links, format)

    def rip_links_urls(self, urllist, show_dupes="false", timestamp="", format="txt"):
        """
            Handle a list of urls. Results for every url are merged into
            a single formatted string (no per-url separator/header line),
            in the same order the urls were given.

            Returns (formatted_string_or_None, list_of_errors).
            formatted_string_or_None is None if there were zero total
            links across every url. errors is a list of LinksError for
            any urls that failed - callers should still show the
            successful results and report which urls failed.
        """
        all_links = []
        errors = []

        for url in urllist:
            url = url.strip()
            if not url:
                continue
            try:
                text = self._fetch_cdx(url, show_dupes, timestamp)
            except LinksError as exc:
                errors.append(exc)
                continue

            links = self._parse_links(text)
            all_links.extend(links)

        if not all_links:
            return None, errors

        return self._format_links(all_links, format), errors

    def _format_links(self, links, format):
        if format == "txt":
            return self.format_txt(links)
        elif format == "csv":
            return self.format_csv(links)
        elif format == "html":
            return self.format_html(links)
        else:
            raise ValueError("Unknown format: {}".format(format))

    def format_txt(self, links):
        """
            Format a list of wayback links as plain text, one per line.
        """
        return "\n".join(links)

    def format_csv(self, links):
        """
            Format a list of wayback links as CSV (single column, one per row).
        """
        return "\n".join(links)

    def format_html(self, links):
        """
            Format a list of wayback links as HTML anchors:
            <a href="url">url</a>, one per line.
        """
        return "\n".join(
            '<a href="{0}">{0}</a>'.format(link) for link in links
        )
