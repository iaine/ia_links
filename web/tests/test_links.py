"""
    Unit tests for links.Links

    Run with: python -m pytest tests/test_links.py -v
"""
import os
import sys
from unittest.mock import patch, Mock

import pytest
import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from links import Links, LinksError  # noqa: E402


SAMPLE_CDX_TEXT = (
    "com,example)/ 20200101000000 https://example.com/ text/html 200 ABC 1234\n"
    "com,example)/ 20210601000000 https://example.com/ text/html 200 DEF 5678"
)


def make_response(status_code=200, text=""):
    resp = Mock()
    resp.status_code = status_code
    resp.text = text
    return resp


class TestBuildQueryUrl:
    def test_default_params(self):
        links = Links()
        url = links._build_query_url("example.com")
        assert url == "https://web.archive.org/cdx/search/cdx?url=example.com&showDupeCount=false"

    def test_show_dupes_true(self):
        links = Links()
        url = links._build_query_url("example.com", show_dupes="true")
        assert "showDupeCount=true" in url

    @pytest.mark.parametrize("friendly,expected", [
        ("1_day", "timestamp:8"),
        ("10_day", "timestamp:7"),
        ("1_month", "timestamp:6"),
    ])
    def test_timestamp_mapping(self, friendly, expected):
        links = Links()
        url = links._build_query_url("example.com", timestamp=friendly)
        assert "&collapse={}".format(expected) in url

    def test_unknown_timestamp_raises(self):
        links = Links()
        with pytest.raises(LinksError):
            links._build_query_url("example.com", timestamp="not_a_real_option")

    def test_no_state_leak_between_calls(self):
        # Regression test: BASE_URL used to be mutated on self, contaminating
        # later calls on the same instance.
        links = Links()
        first = links._build_query_url("example.com")
        second = links._build_query_url("other.com")
        assert "example.com" not in second
        assert first != second


class TestFetchAndParse:
    @patch("links.requests.get")
    def test_200_with_results(self, mock_get):
        mock_get.return_value = make_response(200, SAMPLE_CDX_TEXT)
        links = Links()
        result = links.rip_links_url("example.com", format="txt")
        assert "http://wayback.archive.org/web/20200101000000/https://example.com/" in result
        assert "http://wayback.archive.org/web/20210601000000/https://example.com/" in result

    @patch("links.requests.get")
    def test_200_empty_body_returns_none(self, mock_get):
        mock_get.return_value = make_response(200, "")
        links = Links()
        result = links.rip_links_url("example.com", format="txt")
        assert result is None

    @patch("links.requests.get")
    def test_non_200_raises_links_error(self, mock_get):
        mock_get.return_value = make_response(404, "")
        links = Links()
        with pytest.raises(LinksError):
            links.rip_links_url("example.com", format="txt")

    @patch("links.requests.get")
    def test_timeout_raises_links_error(self, mock_get):
        mock_get.side_effect = requests.Timeout()
        links = Links()
        with pytest.raises(LinksError):
            links.rip_links_url("example.com", format="txt")

    @patch("links.requests.get")
    def test_connection_error_raises_links_error(self, mock_get):
        mock_get.side_effect = requests.ConnectionError()
        links = Links()
        with pytest.raises(LinksError):
            links.rip_links_url("example.com", format="txt")

    @patch("links.requests.get")
    def test_malformed_line_is_skipped_not_crashed(self, mock_get):
        mock_get.return_value = make_response(200, "junk\ncom,example)/ 20200101000000 https://example.com/ text/html 200 ABC 1234")
        links = Links()
        result = links.rip_links_url("example.com", format="txt")
        assert result.count("wayback.archive.org") == 1


class TestFormats:
    def setup_method(self):
        self.links = Links()
        self.sample_links = [
            "http://wayback.archive.org/web/20200101000000/https://example.com/",
            "http://wayback.archive.org/web/20210601000000/https://example.com/",
        ]

    def test_format_txt(self):
        out = self.links.format_txt(self.sample_links)
        assert out == "\n".join(self.sample_links)

    def test_format_csv(self):
        out = self.links.format_csv(self.sample_links)
        assert out == "\n".join(self.sample_links)

    def test_format_html(self):
        out = self.links.format_html(self.sample_links)
        for link in self.sample_links:
            assert '<a href="{0}">{0}</a>'.format(link) in out

    def test_same_underlying_links_across_formats(self):
        # txt/csv/html must all be built from the exact same link list
        txt = self.links.format_txt(self.sample_links)
        html = self.links.format_html(self.sample_links)
        for link in self.sample_links:
            assert link in txt
            assert link in html

    def test_unknown_format_raises(self):
        with pytest.raises(ValueError):
            self.links._format_links(self.sample_links, "xml")


class TestMultiUrl:
    @patch("links.requests.get")
    def test_merges_without_separator(self, mock_get):
        mock_get.return_value = make_response(200, SAMPLE_CDX_TEXT)
        links = Links()
        result, errors = links.rip_links_urls(["example.com", "example.org"], format="txt")
        assert errors == []
        # two urls x two lines each = 4 link lines, no "# url" header lines mixed in
        lines = result.splitlines()
        assert len(lines) == 4
        assert all(line.startswith("http://wayback.archive.org") for line in lines)

    @patch("links.requests.get")
    def test_one_url_fails_others_still_returned(self, mock_get):
        def side_effect(url, timeout, headers):
            if "bad" in url:
                return make_response(500, "")
            return make_response(200, SAMPLE_CDX_TEXT)

        mock_get.side_effect = side_effect
        links = Links()
        result, errors = links.rip_links_urls(["example.com", "bad.com"], format="txt")
        assert result is not None
        assert len(errors) == 1
        assert errors[0].url == "bad.com"

    @patch("links.requests.get")
    def test_all_fail_returns_none_with_errors(self, mock_get):
        mock_get.return_value = make_response(500, "")
        links = Links()
        result, errors = links.rip_links_urls(["a.com", "b.com"], format="txt")
        assert result is None
        assert len(errors) == 2

    @patch("links.requests.get")
    def test_all_empty_returns_none_no_errors(self, mock_get):
        mock_get.return_value = make_response(200, "")
        links = Links()
        result, errors = links.rip_links_urls(["a.com", "b.com"], format="txt")
        assert result is None
        assert errors == []
