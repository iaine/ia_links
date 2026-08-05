"""
    Flask route tests for app.py

    Run with: python -m pytest tests/test_app.py -v
"""
import os
import sys
from unittest.mock import patch

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app  # noqa: E402
from links import LinksError  # noqa: E402


@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c


def test_get_index(client):
    resp = client.get("/")
    assert resp.status_code == 200
    assert b"linkForm" in resp.data


@patch("app.Links.rip_links_urls")
def test_post_single_url_txt(mock_rip, client):
    mock_rip.return_value = ("http://wayback.archive.org/web/1/https://example.com/", [])
    resp = client.post("/", data={"url": "example.com", "format": "txt"})
    assert resp.status_code == 200
    assert resp.mimetype == "text/plain"
    assert 'filename="example.com.txt"' in resp.headers["Content-Disposition"]
    assert b"wayback.archive.org" in resp.data


@patch("app.Links.rip_links_urls")
def test_post_single_url_csv(mock_rip, client):
    mock_rip.return_value = ("http://wayback.archive.org/web/1/https://example.com/", [])
    resp = client.post("/", data={"url": "example.com", "format": "csv"})
    assert resp.status_code == 200
    assert resp.mimetype == "text/csv"
    assert 'filename="example.com.csv"' in resp.headers["Content-Disposition"]


@patch("app.Links.rip_links_urls")
def test_post_single_url_html(mock_rip, client):
    mock_rip.return_value = ('<a href="http://wayback.archive.org/web/1/https://example.com/">http://wayback.archive.org/web/1/https://example.com/</a>', [])
    resp = client.post("/", data={"url": "example.com", "format": "html"})
    assert resp.status_code == 200
    assert b"<a href=" in resp.data


@patch("app.Links.rip_links_urls")
def test_post_multiple_urls_filename(mock_rip, client):
    mock_rip.return_value = ("link1\nlink2", [])
    resp = client.post("/", data={"url": "example.com\nexample.org", "format": "txt"})
    assert resp.status_code == 200
    assert 'filename="example.com_and_1_more.txt"' in resp.headers["Content-Disposition"]


@patch("app.Links.rip_links_urls")
def test_post_empty_results_shows_message(mock_rip, client):
    mock_rip.return_value = (None, [])
    resp = client.post("/", data={"url": "example.com", "format": "txt"})
    assert resp.status_code == 200
    assert b"No archived snapshots" in resp.data


@patch("app.Links.rip_links_urls")
def test_post_all_errors_shows_message(mock_rip, client):
    mock_rip.return_value = (None, [LinksError("Archive.org returned HTTP 500 for example.com", url="example.com")])
    resp = client.post("/", data={"url": "example.com", "format": "txt"})
    assert resp.status_code == 200
    assert b"Errors" in resp.data


@patch("app.Links.rip_links_urls")
def test_post_partial_errors_still_returns_file_with_warning_header(mock_rip, client):
    mock_rip.return_value = ("link1", [LinksError("boom", url="bad.com")])
    resp = client.post("/", data={"url": "example.com\nbad.com", "format": "txt"})
    assert resp.status_code == 200
    assert "X-Links-Warning" in resp.headers


def test_post_missing_url_field(client):
    resp = client.post("/", data={"format": "txt"})
    assert resp.status_code == 400
    assert b"Please enter" in resp.data


def test_post_unknown_format(client):
    resp = client.post("/", data={"url": "example.com", "format": "xml"})
    assert resp.status_code == 400
    assert b"Unknown format" in resp.data


def test_get_only_other_methods_rejected(client):
    resp = client.delete("/")
    assert resp.status_code == 405
