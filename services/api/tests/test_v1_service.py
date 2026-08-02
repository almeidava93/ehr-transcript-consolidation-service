import os
from types import SimpleNamespace
from unittest.mock import Mock

import api.routers.v1.service as service_module

from api.settings import TRACES_DB_PATH
from api.routers.v1.service import PredictionService

TEST_SESSION_ID = "test_session_id"
GENERATED_SESSION_ID = "generated_session_id"

TEST_EHR_DATA = {
    "text": "test_ehr_data",
}
TEST_TRANSCRIPT_CHUNK = {
    "t": "00:00:00",
    "speaker": "test_speaker",
    "text": "test_transcript_chunk",
}


def test_resolve_session_reuses_existing_session_id(
    monkeypatch,
) -> None:
    fake_session = SimpleNamespace(session_id=TEST_SESSION_ID)
    session_mock = Mock(return_value=fake_session)

    monkeypatch.setattr(
        service_module.RedisSession,
        "from_url",
        session_mock,
    )

    session = PredictionService.resolve_session(TEST_SESSION_ID)

    assert session.session_id == TEST_SESSION_ID

    session_mock.assert_called_once_with(
        TEST_SESSION_ID,
        url=os.environ.get("REDIS_URL"),
    )


def test_resolve_session_creates_new_session_when_id_is_missing(
    monkeypatch,
) -> None:
    fake_session = SimpleNamespace(session_id=GENERATED_SESSION_ID)
    create_session_mock = Mock(return_value=fake_session)

    monkeypatch.setattr(
        PredictionService,
        "create_session",
        create_session_mock,
    )

    session = PredictionService.resolve_session(None)

    assert session.session_id == GENERATED_SESSION_ID
    create_session_mock.assert_called_once_with()
