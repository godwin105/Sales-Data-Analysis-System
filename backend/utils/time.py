from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


EAT_OFFSET = "+03:00"
try:
    EAT = ZoneInfo("Africa/Nairobi")
except ZoneInfoNotFoundError:
    # Windows often lacks the IANA timezone database unless tzdata is installed.
    # East Africa Time has no daylight saving changes, so UTC+03:00 is equivalent.
    EAT = timezone(timedelta(hours=3), name="EAT")


def eat_now():
    """Current East Africa Time as a naive datetime for existing DB columns."""
    return datetime.now(EAT).replace(tzinfo=None)


def eat_today():
    """Current East Africa Time calendar date."""
    return datetime.now(EAT).date()


def isoformat_eat(value):
    """Serialize a stored naive EAT datetime with an explicit +03:00 offset."""
    if value is None:
        return None
    if value.tzinfo is not None:
        return value.astimezone(EAT).isoformat()
    return f"{value.isoformat()}{EAT_OFFSET}"
