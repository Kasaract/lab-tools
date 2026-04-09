import mimetypes
import os
import smtplib
from datetime import datetime, timezone
from email.message import EmailMessage

from dotenv import load_dotenv
from fastapi import APIRouter, Form, HTTPException, UploadFile, File

load_dotenv()

router = APIRouter()

GMAIL_USER = os.getenv("GMAIL_USER", "garynguyen2018@gmail.com")
GMAIL_APP_PASSWORD = os.getenv("GMAIL_APP_PASSWORD", "")


@router.post("/submit")
async def submit_feedback(
    name: str = Form(...),
    email: str = Form(...),
    type: str = Form(...),
    message: str = Form(...),
    attachments: list[UploadFile] = File(default=[]),
):
    if not GMAIL_APP_PASSWORD:
        raise HTTPException(status_code=500, detail="Email not configured")

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    subject = f"[Lab Tools - {type.capitalize()}] from {name}"

    text = (
        f"Type: {type.capitalize()}\n"
        f"Date: {now}\n"
        f"Name: {name}\n"
        f"Email: {email}\n"
        f"\n"
        f"Message:\n{message}\n"
    )

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = GMAIL_USER
    msg["To"] = GMAIL_USER
    msg["Reply-To"] = email
    msg.set_content(text)

    for attachment in attachments:
        if not attachment.filename:
            continue
        data = await attachment.read()
        ct = attachment.content_type or mimetypes.guess_type(attachment.filename)[0] or "application/octet-stream"
        maintype, subtype = ct.split("/", 1)
        msg.add_attachment(data, maintype=maintype, subtype=subtype, filename=attachment.filename)

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
            smtp.login(GMAIL_USER, GMAIL_APP_PASSWORD)
            smtp.send_message(msg)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to send email: {exc}")

    return {"status": "ok"}
