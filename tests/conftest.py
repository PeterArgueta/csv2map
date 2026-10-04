"""Give each test independent rate state; limits remain active within each test."""
import pytest
import main


@pytest.fixture(autouse=True)
def independent_intake_rate_state():
    limiter = main.app.state.intake_limiter
    fresh = type(limiter)()
    with limiter.lock:
        limiter.clients.clear()
        limiter.global_tokens = fresh.global_tokens
        limiter.global_updated = fresh.global_updated
