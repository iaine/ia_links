"""
   WSGI entry point.

   Run with e.g.:
       gunicorn --workers 2 --timeout 300 --bind 0.0.0.0:8000 wsgi:application

   --timeout 300 matches the 5 minute upstream CDX request timeout used in
   links.py. Your reverse proxy (nginx/Apache) must be configured with a
   matching read timeout, or it will kill the connection first - see
   README.md "Deployment" section.
"""
from app import app as application

if __name__ == "__main__":
    application.run()
