"""
Minimal email utility using Python's standard library (smtplib + email).

We intentionally avoid Flask-Mail to keep dependencies small and reduce
surface area of things that can go wrong during the FYP defense.

Usage:
    from utils.email_utils import send_email
    send_email(to="user@example.com", subject="...", html_body="<p>...</p>")

If MAIL_USERNAME is blank in config, emails print to console instead of sending.
This lets the app work for testing without SMTP setup.
"""
import smtplib
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr

from flask import current_app

log = logging.getLogger(__name__)


def send_email(to: str, subject: str, html_body: str, text_body: str = None) -> bool:
    """
    Send a transactional email. Returns True on success, False on failure.

    In dry-run mode (MAIL_USERNAME blank), logs the message to the console
    instead of sending, and returns True. This lets password reset flows
    work during FYP testing without configuring SMTP.
    """
    cfg = current_app.config

    # Build the message (done in both dry-run and real-send paths)
    from_name = cfg.get("MAIL_FROM_NAME", "Biashara App")
    from_address = cfg.get("MAIL_FROM_ADDRESS") or cfg.get("MAIL_USERNAME") or "no-reply@localhost"

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = formataddr((from_name, from_address))
    msg["To"] = to

    if text_body:
        msg.attach(MIMEText(text_body, "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    # Dry-run mode — print to console instead of sending
    if cfg.get("MAIL_DRY_RUN"):
        print("\n" + "=" * 60)
        print("EMAIL (dry-run — SMTP not configured)")
        print("=" * 60)
        print(f"To:      {to}")
        print(f"Subject: {subject}")
        print("-" * 60)
        # Just show the plain text version for readability
        if text_body:
            print(text_body)
        else:
            # Strip HTML tags for a simple preview
            import re
            preview = re.sub(r"<[^>]+>", "", html_body)
            preview = re.sub(r"\s+", " ", preview).strip()
            print(preview)
        print("=" * 60 + "\n")
        return True

    # Real send via SMTP
    try:
        server = smtplib.SMTP(cfg["MAIL_SERVER"], cfg["MAIL_PORT"], timeout=15)
        if cfg.get("MAIL_USE_TLS"):
            server.starttls()
        if cfg.get("MAIL_USERNAME"):
            server.login(cfg["MAIL_USERNAME"], cfg["MAIL_PASSWORD"])
        server.sendmail(from_address, [to], msg.as_string())
        server.quit()
        return True
    except Exception as e:
        log.error("Failed to send email to %s: %s", to, e)
        return False
